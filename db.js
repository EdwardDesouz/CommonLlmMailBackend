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
  const currentUids = new Set(currentMessages.map((m) => m.uid));

  const removed = emails.filter(
    (e) => e.mailbox_id === mailboxId && !currentUids.has(e.uid),
  );
  if (removed.length > 0) {
    const removedIds = new Set(removed.map((e) => e.id));
    emails = emails.filter((e) => !removedIds.has(e.id));
  }

  const existingUids = new Set(
    emails.filter((e) => e.mailbox_id === mailboxId).map((e) => e.uid),
  );

  const added = [];
  for (const msg of currentMessages) {
    if (!existingUids.has(msg.uid)) {
      added.push(saveEmail(msg));
    }
  }

  return { added, removed };
}

module.exports = {
  saveEmail,
  getEmails,
  getEmailById,
  updateEmail,
  syncMailboxEmails,
};