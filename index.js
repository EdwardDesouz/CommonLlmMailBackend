require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const { MAILBOXES } = require("./mailboxes");
const { pollAllMailboxes } = require("./services/mailPoller");

const app = express();
app.use(cors());
app.use(express.json());

const VALID_MAILBOX_IDS = new Set(MAILBOXES.map((m) => m.id));

function serializeEmail(e) {
  const mailbox = MAILBOXES.find((m) => m.id === e.mailbox_id);
  return {
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    status: e.status,
    attachment_count: e.attachment_count,
    received_date: e.received_date,
    mailbox_id: e.mailbox_id,
    mailbox_username: mailbox ? mailbox.user : null,
    account_id: mailbox ? mailbox.accountId : null,
    touch_username: mailbox ? mailbox.touchUsername : null,
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

app.post("/api/email/:id/notify-n8n", async (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  try {
    const pdfAttachments = (email.attachments || []).filter(
      (att) => getFileType(att.filename, att.contentType) === "pdf",
    );

    const toBase64 = (content) => {
      if (Buffer.isBuffer(content)) return content.toString("base64");
      if (content && content.type === "Buffer" && Array.isArray(content.data)) {
        return Buffer.from(content.data).toString("base64");
      }
      if (typeof content === "string") return content; // already base64
      return "";
    };

    const payload = {
      id: email.id,
      sender: email.sender,
      subject: email.subject,
      received_date: email.received_date,
      body: email.body || "",
      attachments: pdfAttachments.map((att) => ({
        filename: att.filename || "attachment.pdf",
        contentType: att.contentType,
        content_base64: toBase64(att.content),
      })),
    };

    console.log(
      `[n8n] sending ${payload.attachments.length} PDF(s) for email ${email.id}, base64 lengths:`,
      payload.attachments.map((a) => a.content_base64.length),
    );

    const n8nResponse = await axios.post(process.env.N8N_WEBHOOK_URL, payload);
    res.json({ n8n_response: n8nResponse.data });
  } catch (err) {
    console.error("n8n call failed:", err.message);
    res.status(500).json({ error: "n8n request failed" });
  }
});

// server.js — new endpoint
app.post("/api/email/:id/complete", (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: "Not found" });

  const updated = db.updateEmail(req.params.id, { dismissed: true, status: "saved" });
  res.json({ success: true, id: updated.id, dismissed: updated.dismissed, status: updated.status });
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
  setInterval(pollAllMailboxes, 15_000);
});
