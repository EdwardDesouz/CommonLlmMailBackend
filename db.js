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

// UIDs already stored for a mailbox, so only new mails are downloaded
function getUidsByMailbox(mailboxId) {
  return new Set(
    emails.filter((e) => e.mailbox_id === mailboxId).map((e) => e.uid),
  );
}

// allUids   = every UID currently in the webmail Inbox
// newRecords = full records, only for mails we have not stored yet
function syncMailboxEmails(mailboxId, allUids, newRecords) {
  const live = new Set(allUids);

  // Mail that left the Inbox -> remove from the app
  const removed = emails.filter(
    (e) => e.mailbox_id === mailboxId && !live.has(e.uid),
  );
  if (removed.length > 0) {
    const removedIds = new Set(removed.map((e) => e.id));
    emails = emails.filter((e) => !removedIds.has(e.id));
  }

  // New mail -> add
  const existing = getUidsByMailbox(mailboxId);
  const added = newRecords
    .filter((r) => !existing.has(r.uid))
    .map((r) => saveEmail(r));

  return { added, removed };
}

module.exports = {
  saveEmail,
  getEmails,
  getEmailById,
  updateEmail,
  syncMailboxEmails,
  getUidsByMailbox,
};