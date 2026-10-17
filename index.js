require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");
const { MAILBOXES } = require("./mailboxes");
const { pollAllMailboxes } = require("./services/mailPoller");
const { processEmail } = require("./services/n8nProcessor");

const app = express();
app.use(cors());
app.use(express.json());

const VALID_MAILBOX_IDS = new Set(MAILBOXES.map((m) => m.id));

function serializeEmail(e) {
  const mailbox = MAILBOXES.find((m) => m.id === e.mailbox_id);
  return {
    id: e.id,
    message_key: e.message_key,
    subject: e.subject,
    sender: e.sender,
    status: e.status,
    n8n_status: e.n8n_status,
    attachment_count: e.attachment_count,
    received_date: e.received_date,
    mailbox_id: e.mailbox_id,
    mailbox_username: mailbox ? mailbox.user : null,
    account_id: mailbox ? mailbox.accountId : null,
    touch_username: mailbox ? mailbox.touchUsername : null,
    module_type: e.module_type,
    module_type_needs_confirmation: e.module_type_needs_confirmation,
    allowed_modules: e.allowed_modules,
  };
}

function getFileType(filename, contentType) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (ext === "pdf" || contentType?.includes("pdf")) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["doc", "docx"].includes(ext)) return "word";
  return "other";
}

app.get("/api/emails", (req, res) => {
  const emails = db.getEmails({ dismissed: false });

  const grouped = {};
  for (const mailbox of MAILBOXES) {
    grouped[mailbox.user] = {
      mailbox_id: mailbox.id,
      username: mailbox.user,
      account_id: mailbox.accountId,
      touch_username: mailbox.touchUsername,
      count: 0,
      emails: [],
    };
  }

  for (const e of emails) {
    const mailbox = MAILBOXES.find((m) => m.id === e.mailbox_id);
    const key = mailbox ? mailbox.user : e.mailbox_id;
    if (!grouped[key]) {
      grouped[key] = {
        mailbox_id: e.mailbox_id,
        username: key,
        account_id: mailbox ? mailbox.accountId : null,
        touch_username: mailbox ? mailbox.touchUsername : null,
        count: 0,
        emails: [],
      };
    }
    grouped[key].emails.push(serializeEmail(e));
    grouped[key].count += 1;
  }

  res.json({ results: Object.values(grouped) });
});

app.get("/api/:mailboxId/emails", (req, res) => {
  const { mailboxId } = req.params;
  if (!VALID_MAILBOX_IDS.has(mailboxId)) {
    return res.status(404).json({ error: `Unknown mailbox "${mailboxId}"` });
  }
  const emails = db.getEmails({ dismissed: false, mailboxId });
  res.json({ results: emails.map(serializeEmail) });
});

app.get("/api/email/:id", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  const mailbox = MAILBOXES.find((m) => m.id === email.mailbox_id);
  res.json({
    ...email,
    mailbox_username: mailbox ? mailbox.user : null,
    account_id: mailbox ? mailbox.accountId : null,
    touch_username: mailbox ? mailbox.touchUsername : null,
  });
});

app.get("/api/email/:id/attachments", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  const attachments = (email.attachments || []).map((att, i) => ({
    id: String(i),
    filename: att.filename || `attachment-${i}`,
    type: getFileType(att.filename, att.contentType),
    size: att.content?.length || 0,
    url: `http://localhost:${process.env.PORT || 4000}/api/email/${req.params.id}/attachments/${i}`,
  }));

  res.json(attachments);
});

app.get("/api/email/:id/attachments/:attId", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).send("Not found");

  const att = (email.attachments || [])[Number(req.params.attId)];
  if (!att) return res.status(404).send("Not found");

  res.set("Content-Type", att.contentType || "application/octet-stream");
  res.set(
    "Content-Disposition",
    `inline; filename="${att.filename || "file"}"`,
  );
  res.send(att.content);
});

// Lightweight status check: the UI can poll this while n8n is still working.
app.get("/api/email/:id/n8n-result", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  res.json({
    id: email.id,
    n8n_status: email.n8n_status, // pending | processing | done | failed | skipped
    n8n_response: email.n8n_response,
    n8n_error: email.n8n_error,
  });
});

// Called when the user clicks a mail.
// - already processed in the background -> returns the saved response instantly
// - still processing -> waits for that same run (no duplicate n8n call)
// - pending / failed -> processes now
// Add ?force=true to re-run n8n even if a saved response exists.
app.post("/api/email/:id/notify-n8n", async (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  const force = req.query.force === "true";

  if (email.n8n_status === "done" && !force) {
    return res.json({ n8n_response: email.n8n_response, cached: true });
  }

  try {
    const data = await processEmail(email.id, { force });
    res.json({ n8n_response: data, cached: false });
  } catch (err) {
    if (err.code === "NO_PDF") {
      return res
        .status(400)
        .json({ error: "No PDF attachments to process", code: "NO_PDF" });
    }
    console.error(
      "notify-n8n failed:",
      err.code,
      err.message,
      err.response?.status,
      err.response?.data,
    );
    res.status(502).json({
      error: "n8n request failed",
      code: err.code,
      status: err.response?.status,
      detail: err.response?.data || err.message,
    });
  }
});

app.post("/api/email/:id/complete", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  const updated = db.updateEmail(req.params.id, {
    dismissed: true,
    status: "saved",
  });
  res.json({
    success: true,
    id: updated.id,
    dismissed: updated.dismissed,
    status: updated.status,
  });
});

app.post("/api/email/:id/dismiss", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  const updated = db.updateEmail(req.params.id, { dismissed: true });
  res.json({ success: true, id: updated.id, dismissed: updated.dismissed });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  pollAllMailboxes();
  setInterval(pollAllMailboxes, 30_000);
});