const nodemailer = require('nodemailer');
const { maskSensitiveText } = require('./validate');

const smtpConfig = {
  user: String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim(),
  pass: String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || '').trim(),
  host: String(process.env.SMTP_HOST || process.env.EMAIL_HOST || '').trim(),
  port: Number(String(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587').trim()),
  from: String(process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim(),
};

const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.port === 465,
  auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

async function sendEmail({ to, subject, text, attachments = [] }) {
  if (!smtpConfig.user || !smtpConfig.pass || !smtpConfig.host) {
    const error = new Error('Email service is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  console.info('[EMAIL_SEND_START]', { recipient: maskSensitiveText(to), subject: maskSensitiveText(subject) });
  return transporter.sendMail({
    from: smtpConfig.from || smtpConfig.user,
    to,
    subject,
    text,
    attachments,
  });
}

async function trySendEmail(options, context) {
  try {
    const result = await sendEmail(options);
    console.log('[EMAIL_SEND_SUCCESS]', { context: maskSensitiveText(context), messageId: result.messageId });
    return { success: true, result };
  } catch (error) {
    console.error('[EMAIL_SEND_FAILED]', { context: maskSensitiveText(context), message: maskSensitiveText(error.message), name: error.name, code: error.code });
    return { success: false, error };
  }
}

function getEmailConfigurationStatus() {
  return {
    configured: Boolean(smtpConfig.host && smtpConfig.user && smtpConfig.pass),
    hostConfigured: Boolean(smtpConfig.host),
    portConfigured: Number.isInteger(smtpConfig.port) && smtpConfig.port > 0,
    userConfigured: Boolean(smtpConfig.user),
    passwordConfigured: Boolean(smtpConfig.pass),
    fromConfigured: Boolean(smtpConfig.from),
    secure: smtpConfig.port === 465,
  };
}

module.exports = { sendEmail, trySendEmail, getEmailConfigurationStatus };
