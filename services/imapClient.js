const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");

async function fetchUnreadFromMailbox(mailbox, knownUids = new Set()) {
  const { host, user, password, port, tls } = mailbox;

  const connection = await imaps.connect({
    imap: { user, password, host, port, tls, authTimeout: 10000 },
  });

  try {
    await connection.openBox("INBOX");

    // 1) Cheap: get the UID of every mail currently in the Inbox
    const headers = await connection.search(["ALL"], {
      bodies: ["HEADER.FIELDS (SUBJECT)"],
      markSeen: false,
    });
    const allUids = headers.map((h) => h.attributes.uid);
    const newUids = allUids.filter((u) => !knownUids.has(u));

    // 2) Heavy: download full body + attachments only for new mails
    const messages = [];
    if (newUids.length > 0) {
      const results = await connection.search([["UID", newUids.join(",")]], {
        bodies: [""],
        markSeen: false,
      });

      for (const item of results) {
        const raw = item.parts.find((p) => p.which === "")?.body;
        if (!raw) continue;

        const parsed = await simpleParser(raw);

        messages.push({
          uid: item.attributes.uid,
          subject: parsed.subject || "(no subject)",
          from: parsed.from?.value?.[0]?.address || "Unknown sender",
          date: parsed.date || new Date(),
          body: parsed.text || parsed.html || "",
          attachments: (parsed.attachments || []).map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            content: a.content,
          })),
        });
      }
    }

    return { allUids, messages };
  } finally {
    connection.end();
  }
}

module.exports = { fetchUnreadFromMailbox };