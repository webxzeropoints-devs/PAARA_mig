const db = require('../db/database.pg');
const { trySendEmail } = require('./email');
const crypto = require('crypto');

function normalizeEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function issueEmailOtp(email, context) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('A valid email address is required.');
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();

  await db.query(
    'UPDATE email_otps SET verified = TRUE WHERE email = $1 AND verified = FALSE',
    [normalizedEmail]
  );

  await db.query(
    `INSERT INTO email_otps
      (email, code, expires_at, verified, attempts)
     VALUES ($1, $2, $3, FALSE, 0)`,
    [normalizedEmail, hashOtp(code), expiresAt]
  );

  const result = await trySendEmail({
    to: normalizedEmail,
    subject: 'Your Paara verification code',
    text: `Your Paara verification code is ${code}. It expires in 10 minutes.`,
  }, context || 'email OTP');

  if (!result.success) {
    await db.query(
      'UPDATE email_otps SET verified = TRUE WHERE email = $1 AND code = $2 AND verified = FALSE',
      [normalizedEmail, hashOtp(code)]
    );
    throw result.error || new Error('Verification email could not be sent.');
  }

  console.log('[AUTH_OTP_SENT]', { channel: 'email' });

  return normalizedEmail;
}

async function consumeEmailOtp(email, code) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || '').trim();

  if (!normalizedEmail || !/^\d{6}$/.test(normalizedCode)) {
    return null;
  }

  const result = await db.query(`
    SELECT *
    FROM email_otps
    WHERE email = $1 AND verified = FALSE
    ORDER BY id DESC
    LIMIT 1
  `, [normalizedEmail]);

  const record = result.rows[0];

  if (!record) {
    return null;
  }

  if (
    new Date(record.expires_at).getTime() <= Date.now() ||
    record.attempts >= 5
  ) {
    await db.query(
      'UPDATE email_otps SET verified = TRUE WHERE id = $1',
      [record.id]
    );

    return null;
  }

  const expected = Buffer.from(record.code);
  const supplied = Buffer.from(hashOtp(normalizedCode));

  const matches =
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied);

  if (!matches) {
    const nextAttempts = record.attempts + 1;

    await db.query(
      `UPDATE email_otps
       SET attempts = $1,
           verified = $2
       WHERE id = $3`,
      [nextAttempts, nextAttempts >= 5, record.id]
    );

    return null;
  }

  await db.query(
    'UPDATE email_otps SET verified = TRUE WHERE id = $1',
    [record.id]
  );

  return record;
}

module.exports = {
  normalizeEmail,
  issueEmailOtp,
  consumeEmailOtp
};
