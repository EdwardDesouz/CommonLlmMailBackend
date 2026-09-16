const { MAILBOXES } = require("../mailboxes");
const { fetchUnreadFromMailbox } = require("./imapClient");
const db = require("../db");

async function pollAllMailboxes() {
  const results = await Promise.allSettled(
    MAILBOXES.map((mailbox) => pollOneMailbox(mailbox)),
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`Poll failed for ${MAILBOXES[i].id}:`, result.reason);
    }
  });
}

async function pollOneMailbox(mailbox) {
  const messages = await fetchUnreadFromMailbox(mailbox);
  console.log(
    `Mailbox ${mailbox.id}: found ${messages.length} unread message(s)`,
  );

  const records = messages.map((msg) => ({
    uid: msg.uid,
    subject: msg.subject,
    sender: msg.from,
    received_date: msg.date,
    body: msg.body,
    attachments: msg.attachments,
    attachment_count: msg.attachments.length,
    module_type: mailbox.defaultModuleType,
    module_type_needs_confirmation: mailbox.mode !== "fixed",
    allowed_modules: mailbox.allowedModules,
    mailbox_id: mailbox.id,
    status: "unread",
  }));

  const added = db.syncMailboxEmails(mailbox.id, records);

  added.forEach((rec) =>
    console.log(`Saved email "${rec.subject}" from ${mailbox.id}`),
  );
}

module.exports = { pollAllMailboxes };
