const assert = require('node:assert/strict');
const test = require('node:test');
const { trySendEmail, verifyEmailTransport } = require('../utils/email');

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

test('SMTP diagnostics report auth failure without returning credentials', async () => {
  const keys = [
    'SMTP_HOST',
    'EMAIL_HOST',
    'SMTP_PORT',
    'EMAIL_PORT',
    'SMTP_USER',
    'EMAIL_USER',
    'SMTP_PASS',
    'SMTP_PASSWORD',
    'EMAIL_PASSWORD',
  ];
  const originalValues = new Map(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EMAIL_HOST: 'smtp.example.test',
    EMAIL_PORT: '587',
    EMAIL_USER: 'diagnostic-user',
    EMAIL_PASSWORD: 'diagnostic-secret',
  });
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_PASSWORD;

  try {
    const result = await verifyEmailTransport({
      createTransport(options) {
        assert.equal(options.auth.user, 'diagnostic-user');
        assert.equal(options.auth.pass, 'diagnostic-secret');
        return {
          async verify() {
            const error = new Error('Authentication rejected.');
            error.code = 'EAUTH';
            error.responseCode = 535;
            error.command = 'AUTH PLAIN';
            throw error;
          },
          close() {},
        };
      },
    });

    assert.deepEqual(result, {
      configured: true,
      verified: false,
      errorCode: 'EAUTH',
      responseCode: 535,
      command: 'AUTH PLAIN',
    });
    assert.equal(JSON.stringify(result).includes('diagnostic-secret'), false);
  } finally {
    for (const [key, value] of originalValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
