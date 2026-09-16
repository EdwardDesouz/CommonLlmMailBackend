require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const db = require('./db');
const { MAILBOXES } = require('./mailboxes');
const { pollAllMailboxes } = require('./services/mailPoller');

const app = express();
app.use(cors());
app.use(express.json());

const VALID_MAILBOX_IDS = new Set(MAILBOXES.map((m) => m.id));

function serializeEmail(e) {
  return {
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    status: e.status,
    attachment_count: e.attachment_count,
    received_date: e.received_date,
    module_type: e.module_type,
    module_type_needs_confirmation: e.module_type_needs_confirmation,
    allowed_modules: e.allowed_modules,
    mailbox_id: e.mailbox_id,
  };
}


app.get('/api/emails', (req, res) => {
  const emails = db.getEmails({ dismissed: false });
  res.json({ results: emails.map(serializeEmail) });
});


app.get('/api/:mailboxId/emails', (req, res) => {
  const { mailboxId } = req.params;
  if (!VALID_MAILBOX_IDS.has(mailboxId)) {
    return res.status(404).json({ error: `Unknown mailbox "${mailboxId}"` });
  }
  const emails = db.getEmails({ dismissed: false, mailboxId });
  res.json({ results: emails.map(serializeEmail) });
});

app.get('/email/:id', (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  res.json(email);
});

app.get('/email/:id/attachments', (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  res.json(email.attachments || []);
});

app.post('/email/:id/notify-n8n', async (req, res) => {
  const email = db.getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });

  try {
    const n8nResponse = await axios.post(process.env.N8N_WEBHOOK_URL, {
      email_id: email.id,
      attachments: email.attachments,
      module_type: email.module_type,
      allowed_modules: email.allowed_modules,
    });
    res.json({ n8n_response: n8nResponse.data });
  } catch (err) {
    console.error('n8n call failed:', err.message);
    res.status(500).json({ error: 'n8n request failed' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  pollAllMailboxes();
  setInterval(pollAllMailboxes, 60_000);
});