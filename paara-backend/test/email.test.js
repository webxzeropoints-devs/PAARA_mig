const assert = require('node:assert/strict');
const test = require('node:test');
const { trySendEmail } = require('../utils/email');

test('email delivery failure is returned without throwing', async () => {
  const smtpKeys = [
    'SMTP_HOST',
    'EMAIL_HOST',
    'SMTP_USER',
    'EMAIL_USER',
    'SMTP_PASS',
    'SMTP_PASSWORD',
    'EMAIL_PASSWORD',
    'SMTP_FROM',
    'EMAIL_FROM',
  ];
  const originalValues = new Map(
    smtpKeys.map((key) => [key, process.env[key]])
  );
  smtpKeys.forEach((key) => {
    process.env[key] = '';
  });

  try {
    const result = await trySendEmail({
      to: 'customer@example.test',
      subject: 'Order confirmation',
      text: 'Test message',
    }, 'email failure test');

    assert.equal(result.success, false);
    assert.equal(result.error.code, 'EMAIL_NOT_CONFIGURED');
  } finally {
    for (const [key, value] of originalValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
