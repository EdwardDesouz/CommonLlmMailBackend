require('dotenv').config();

const MAILBOXES = [
  {
    id: 'linex',
    host: process.env.LINEX_EMAIL_HOST,
    user: process.env.LINEX_EMAIL_USERNAME,
    password: process.env.LINEX_EMAIL_PASSWORD,
    port: 993,
    tls: true,
    mode: 'fixed',
    touchUsername: 'LNXADMIN',
    accountId: 'LINEHAUL',
  },
  {
    id: 'nnr_export',
    host: process.env.NNR_EXPORT_EMAIL_HOST,
    user: process.env.NNR_EXPORT_EMAIL_USERNAME,
    password: process.env.NNR_EXPORT_EMAIL_PASSWORD,
    port: 993,
    tls: true,
    mode: 'fixed',
    touchUsername: 'NNREXPAdmin',
    accountId: 'NNR',
  },
    {
    id: 'nnr_import',
    host: process.env.NNR_IMPORT_EMAIL_HOST,
    user: process.env.NNR_IMPORT_EMAIL_USERNAME,
    password: process.env.NNR_IMPORT_EMAIL_PASSWORD,
    port: 993,
    tls: true,
    mode: 'fixed',
    touchUsername: 'NNRIMPAdmin',
    accountId: 'NNR',
  },
  {
    id: 'test_agent',
    host: process.env.TEST_AGENT_EMAIL_HOST,
    user: process.env.TEST_AGENT_EMAIL_USERNAME,
    password: process.env.TEST_AGENT_EMAIL_PASSWORD,
    port: 993,
    tls: true,
    mode: 'fixed',
    touchUsername: 'ADMIN',
    accountId: 'KAIZEN',
  },
];

module.exports = { MAILBOXES };