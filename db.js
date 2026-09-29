let emails = [];
let nextId = 1;

function saveEmail(email) {
  const record = { id: nextId++, dismissed: false, ...email };
  emails.push(record);
  return record;
}

function getEmails({ dismissed = false, mailboxId = null } = {}) {
  return emails.filter(
    (e) =>
      e.dismissed === dismissed &&
      (mailboxId === null || e.mailbox_id === mailboxId),
  );
}

function getEmailById(id) {
  return emails.find((e) => e.id === Number(id));
}

function updateEmail(id, updates) {
  const email = getEmailById(id);
  if (!email) return null;
  Object.assign(email, updates);
  return email;
}


function syncMailboxEmails(mailboxId, currentMessages) {
  const existingUids = new Set(
    emails.filter((e) => e.mailbox_id === mailboxId).map((e) => e.uid),
  );

  const added = [];
  for (const msg of currentMessages) {
    if (!existingUids.has(msg.uid)) {
      added.push(saveEmail(msg));
    }
  }
  return added;
}

module.exports = {
  saveEmail,
  getEmails,
  getEmailById,
  updateEmail,
  syncMailboxEmails,
};
