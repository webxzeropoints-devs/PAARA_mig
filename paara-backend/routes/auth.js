const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database.pg');
const { issueEmailOtp, normalizeEmail } = require('../utils/emailOtp');
const { issuePasswordResetOtp, consumePasswordResetOtp, markPasswordResetOtpUsed } = require('../utils/passwordReset');
const { normalizePhone, validatePassword, PASSWORD_ERROR, PHONE_ERROR, maskEmail } = require('../utils/validate');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  if (!name || !normalizedEmail || !password) {
    return res.status(400).json({ ok: false, code: 'INVALID_REQUEST', message: 'name, email and password are required.' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ ok: false, code: 'WEAK_PASSWORD', message: PASSWORD_ERROR });
  }
  if (!normalizedPhone) {
    return res.status(400).json({ ok: false, code: 'INVALID_PHONE', message: PHONE_ERROR });
  }

  try {
    const { rows: existingRows } = await db.query(
      'SELECT id FROM customers WHERE email = $1 OR lower(email) = $1',
      [normalizedEmail]
    );

    if (existingRows[0]) {
      return res.status(409).json({
        ok: false,
        code: 'ACCOUNT_EXISTS',
        message: 'An account with this email already exists.'
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    console.log('[AUTH_REGISTER]', { email: maskEmail(normalizedEmail) });

    const { rows } = await db.query(`
      INSERT INTO customers (name, email, phone, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [name.trim(), normalizedEmail, normalizedPhone, passwordHash]);

    const customerId = rows[0].id;

    try {
      await issueEmailOtp(normalizedEmail, 'Signup OTP');
    } catch (error) {
      console.error('[AUTH_REGISTER_OTP_ERROR]', {
        email: maskEmail(normalizedEmail),
        error: error.message,
        name: error.name,
        code: error.code
      });

      await db.query(
        'DELETE FROM email_otps WHERE email = $1 AND verified = FALSE',
        [normalizedEmail]
      );
      await db.query('DELETE FROM customers WHERE id = $1', [customerId]);

      return res.status(503).json({
        ok: false,
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: 'Verification email could not be sent. Please try again.'
      });
    }

    return res.status(201).json({
      ok: true,
      success: true,
      requires_otp: true,
      requiresOtp: true,
      email: normalizedEmail,
      customer: {
        id: customerId,
        name,
        email: normalizedEmail
      }
    });
  } catch (error) {
    console.error('[AUTH_REGISTER_DB_ERROR]', {
      email: maskEmail(normalizedEmail),
      error: error.message,
      name: error.name,
      code: error.code
    });

    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        code: 'ACCOUNT_EXISTS',
        message: 'An account with this email already exists.'
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'REGISTRATION_FAILED',
      message: 'We could not create your account. Please try again.'
    });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'email and password are required.'
    });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const { rows } = await db.query(
      'SELECT id, name, email, phone, password_hash FROM customers WHERE lower(email) = $1',
      [normalizedEmail]
    );

    const customer = rows[0];
    const passwordMatches =
      !!customer && bcrypt.compareSync(password, customer.password_hash);

    console.log('[AUTH_LOGIN]', {
      email: maskEmail(normalizedEmail),
      customerFound: !!customer,
      passwordMatches
    });

    if (!customer || !passwordMatches) {
      return res.status(401).json({
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      });
    }

    let token;

    try {
      token = jwt.sign(
        { id: customer.id, email: customer.email },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
    } catch (error) {
      console.error('[JWT_SIGN_ERROR]', error.message);
      return res.status(500).json({
        ok: false,
        code: 'CONFIGURATION_ERROR',
        message: 'Server configuration error. Contact support.'
      });
    }

    return res.json({
      ok: true,
      success: true,
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email
      }
    });
  } catch (error) {
    console.error('[AUTH_LOGIN_DB_ERROR]', error);
    return res.status(500).json({
      ok: false,
      code: 'LOGIN_FAILED',
      message: 'Unable to log in right now.'
    });
  }
});

router.post('/forgot-password/request', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({
      error: 'A valid email address is required.'
    });
  }

  try {
    const { rows } = await db.query(
      'SELECT id FROM customers WHERE lower(email) = $1',
      [email]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'No customer account was found for that email.'
      });
    }

    await issuePasswordResetOtp(email, 'customer');

    return res.json({
      success: true,
      message: 'Password reset code sent to your email.'
    });
  } catch (error) {
    console.error('[FORGOT_PASSWORD_REQUEST_ERROR]', error);
    return res.status(503).json({
      error: 'Unable to send the password reset email right now.'
    });
  }
});

router.post('/forgot-password/reset', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  const newPassword = req.body.password;

  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: 'A valid email and 6-digit reset code are required.'
    });
  }

  if (!validatePassword(newPassword)) {
    return res.status(400).json({ error: PASSWORD_ERROR });
  }

  try {
    const validation = await consumePasswordResetOtp(email, code, 'customer');

    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    const { rows } = await db.query(
      'SELECT id FROM customers WHERE lower(email) = $1',
      [email]
    );

    const customer = rows[0];

    if (!customer) {
      return res.status(404).json({
        error: 'Customer account not found.'
      });
    }

    await db.query(
      'UPDATE customers SET password_hash = $1 WHERE id = $2',
      [bcrypt.hashSync(newPassword, 10), customer.id]
    );

    await markPasswordResetOtpUsed(validation.record.id);

    return res.json({
      success: true,
      message: 'Password reset successful.'
    });
  } catch (error) {
    console.error('[PASSWORD_RESET_ERROR]', error);
    return res.status(500).json({
      error: 'Unable to reset the password right now.'
    });
  }
});

module.exports = router;
