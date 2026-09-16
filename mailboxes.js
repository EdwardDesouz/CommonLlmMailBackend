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
    defaultModuleType: process.env.LINEX_EMAIL_MODULE,
    allowedModules: [process.env.LINEX_EMAIL_MODULE],
  },
  {
    id: 'nnr_export',
    host: process.env.NNR_EXPORT_EMAIL_HOST,
    user: process.env.NNR_EXPORT_EMAIL_USERNAME,
    password: process.env.NNR_EXPORT_EMAIL_PASSWORD,
    port: 993,
    tls: true,
    mode: 'fixed',
    defaultModuleType: process.env.NNR_EXPORT_EMAIL_MODULE,
    allowedModules: [process.env.NNR_EXPORT_EMAIL_MODULE],
  },
  {
    id: 'test_agent',
    host: process.env.TEST_AGENT_EMAIL_HOST,
    user: process.env.TEST_AGENT_EMAIL_USERNAME,
    password: process.env.TEST_AGENT_EMAIL_PASSWORD,
    port: 993,
    tls: true,
    mode: 'fixed',
    defaultModuleType: process.env.TEST_AGENT_EMAIL_MODULE,
    allowedModules: [process.env.TEST_AGENT_EMAIL_MODULE],
  },
];

module.exports = { MAILBOXES };