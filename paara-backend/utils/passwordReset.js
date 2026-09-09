const db = require('../db/database.pg');
const { sendEmail } = require('./email');
const crypto = require('crypto');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function issuePasswordResetOtp(email, userType = 'customer') {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('A valid email address is required.');
  }

  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.query(
    'DELETE FROM password_reset_otps WHERE email = $1 AND user_type = $2',
    [normalizedEmail, userType]
  );

  await db.query(
    `INSERT INTO password_reset_otps
      (email, code, user_type, expires_at, used, attempts)
     VALUES ($1, $2, $3, $4, FALSE, 0)`,
    [normalizedEmail, hashResetCode(code), userType, expiresAt]
  );

  const subject = userType === 'admin'
    ? 'Paara admin password reset code'
    : 'Paara password reset code';

  const replyText = userType === 'admin'
    ? `Your Paara admin password reset code is ${code}. This code expires in 10 minutes.`
    : `Your Paara password reset code is ${code}. This code expires in 10 minutes.`;

  try {
    await sendEmail({
      to: normalizedEmail,
      subject,
      text: `${replyText}\n\nIf you did not request this, you can ignore this email.`
    });
  } catch (error) {
    await db.query(
      'DELETE FROM password_reset_otps WHERE email = $1 AND user_type = $2 AND code = $3',
      [normalizedEmail, userType, hashResetCode(code)]
    );
    throw error;
  }

  return {
    email: normalizedEmail,
    code,
    expires_at: expiresAt
  };
}

async function consumePasswordResetOtp(email, code, userType = 'customer') {
  const normalizedEmail = normalizeEmail(email);
  const digitCode = String(code || '').trim();

  if (!normalizedEmail || !/^\d{6}$/.test(digitCode)) {
    return {
      valid: false,
      reason: 'A valid 6-digit code is required.'
    };
  }

  const result = await db.query(`
    SELECT *
    FROM password_reset_otps
    WHERE email = $1 AND user_type = $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [normalizedEmail, userType]);

  const record = result.rows[0];

  if (!record) {
    return {
      valid: false,
      reason: 'Incorrect reset code.'
    };
  }

  if (record.used === true) {
    return {
      valid: false,
      reason: 'This reset code has already been used.'
    };
  }

  if (record.attempts >= 5) {
    await db.query(
      'UPDATE password_reset_otps SET used = TRUE WHERE id = $1',
      [record.id]
    );

    return {
      valid: false,
      reason: 'Too many incorrect attempts. Please request a new code.'
    };
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await db.query(
      'UPDATE password_reset_otps SET used = TRUE WHERE id = $1',
      [record.id]
    );

    return {
      valid: false,
      reason: 'This reset code has expired. Please request a new one.'
    };
  }

  const expected = Buffer.from(record.code);
  const supplied = Buffer.from(hashResetCode(digitCode));

  const matches =
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied);

  if (!matches) {
    const nextAttempts = record.attempts + 1;

    await db.query(
      `UPDATE password_reset_otps
       SET attempts = $1,
           used = $2
       WHERE id = $3`,
      [nextAttempts, nextAttempts >= 5, record.id]
    );

    return {
      valid: false,
      reason: 'Incorrect reset code.'
    };
  }

  return {
    valid: true,
    record
  };
}

async function markPasswordResetOtpUsed(id) {
  await db.query(
    'UPDATE password_reset_otps SET used = TRUE WHERE id = $1',
    [id]
  );
}

module.exports = {
  normalizeEmail,
  issuePasswordResetOtp,
  consumePasswordResetOtp,
  markPasswordResetOtpUsed,
};
