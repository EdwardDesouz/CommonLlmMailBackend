const axios = require("axios");
const db = require("../db");

const CONCURRENCY = 1; 

const queue = [];
const inFlight = new Map(); 
let active = 0;

function getFileType(filename, contentType) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (ext === "pdf" || contentType?.includes("pdf")) return "pdf";
  return "other";
}

function toBase64(content) {
  if (Buffer.isBuffer(content)) return content.toString("base64");
  if (content && content.type === "Buffer" && Array.isArray(content.data)) {
    return Buffer.from(content.data).toString("base64");
  }
  if (typeof content === "string") return content;
  return "";
}

async function run(id, { force = false } = {}) {
  const email = db.getEmailById(id);
  if (!email) return null; 

  if (email.n8n_status === "done" && !force) return email.n8n_response;

  const pdfs = (email.attachments || []).filter(
    (att) => getFileType(att.filename, att.contentType) === "pdf",
  );

  if (pdfs.length === 0) {
    db.updateEmail(id, { n8n_status: "skipped", n8n_error: "NO_PDF" });
    const err = new Error("No PDF attachments to process");
    err.code = "NO_PDF";
    throw err;
  }

  db.updateEmail(id, { n8n_status: "processing", n8n_error: null });

  const payload = {
    id: email.id,
    message_key: email.message_key,
    sender: email.sender,
    subject: email.subject,
    received_date: email.received_date,
    body: email.body || "",
    attachments: pdfs.map((att) => ({
      filename: att.filename || "attachment.pdf",
      contentType: att.contentType,
      content_base64: toBase64(att.content),
    })),
  };

  try {
    console.log(`[n8n] processing email ${id} "${email.subject}"`);
    const resp = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 300000,
    });
    db.updateEmail(id, {
      n8n_status: "done",
      n8n_response: resp.data,
      n8n_error: null,
    });
    console.log(`[n8n] done for email ${id}`);
    return resp.data;
  } catch (err) {
    db.updateEmail(id, {
      n8n_status: "failed",
      n8n_error: err.response?.data || err.message,
    });
    throw err;
  }
}


function processEmail(id, opts = {}) {
  if (inFlight.has(id)) return inFlight.get(id);
  const p = run(id, opts).finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

function drain() {
  while (active < CONCURRENCY && queue.length > 0) {
    const id = queue.shift();
    active++;
    processEmail(id)
      .catch((err) =>
        console.error(`[n8n] background processing failed for ${id}:`, err.code || err.message),
      )
      .finally(() => {
        active--;
        drain();
      });
  }
}


function enqueue(id) {
  if (!queue.includes(id)) queue.push(id);

  const time = (qid) => {
    const e = db.getEmailById(qid);
    return (e && new Date(e.received_date).getTime()) || 0;
  };
  queue.sort((a, b) => time(a) - time(b));

  drain();
}

module.exports = { enqueue, processEmail };