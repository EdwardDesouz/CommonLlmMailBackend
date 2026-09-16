const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

async function fetchUnreadFromMailbox({ host, user, password, port, tls }) {
   console.log('DEBUG →', { host, user, port, tls, passwordLength: password?.length, password });
  const config = {
    imap: {
      user,
      password,
      host,
      port,
      tls,
      authTimeout: 10000,
    },
  };

  const connection = await imaps.connect(config);
  await connection.openBox('INBOX');

  const searchCriteria = ['UNSEEN'];
  const fetchOptions = { bodies: [''], markSeen: false };

  const results = await connection.search(searchCriteria, fetchOptions);

  const messages = [];
  for (const item of results) {
    const raw = item.parts.find((p) => p.which === '')?.body;
    if (!raw) continue;

    const parsed = await simpleParser(raw);

    messages.push({
      uid: item.attributes.uid, 
      subject: parsed.subject || '(no subject)',
      from: parsed.from?.value?.[0]?.address || 'Unknown sender',
      date: parsed.date || new Date(),
      body: parsed.text || parsed.html || '',
      attachments: (parsed.attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content,
      })),
    });
  }

  connection.end();
  return messages;
}

module.exports = { fetchUnreadFromMailbox };