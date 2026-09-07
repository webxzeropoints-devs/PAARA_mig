const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db/database.pg');
const { issueEmailOtp, consumeEmailOtp, normalizeEmail } = require('../utils/emailOtp');
const { maskEmail } = require('../utils/validate');

const router = express.Router();

router.post('/request-otp', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'A valid email address is required.'
    });
  }

  try {
    await issueEmailOtp(email, 'Email OTP');
  } catch (error) {
    return res.status(503).json({
      ok: false,
      code: 'OTP_DELIVERY_UNAVAILABLE',
      message: 'Verification email could not be sent. Please try again.'
    });
  }

  res.json({
    ok: true,
    success: true,
    message: 'OTP sent.'
  });
});

router.post('/verify-otp', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();

  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'email and a 6-digit code are required.'
    });
  }

  const record = await consumeEmailOtp(email, code);

  if (!record) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_OTP',
      message: 'Invalid or expired OTP.'
    });
  }

  console.log('[AUTH_OTP_VERIFY]', {
    channel: 'email',
    email: maskEmail(email),
    success: true
  });

  let result = await db.query(
    'SELECT id, name, email FROM customers WHERE email = $1 LIMIT 1',
    [email]
  );

  let customer = result.rows[0];

  if (!customer) {
    result = await db.query(
      'SELECT id, name, email FROM customers WHERE lower(email) = $1 LIMIT 1',
      [email]
    );

    customer = result.rows[0];
  }

  if (!customer) {
    return res.status(404).json({
      ok: false,
      code: 'ACCOUNT_NOT_FOUND',
      message: 'No customer account was found for this email.'
    });
  }

  if (customer.email !== email) {
    await db.query(
      'UPDATE customers SET email = $1 WHERE id = $2',
      [email, customer.id]
    );

    customer.email = email;
  }

  let token;

  try {
    token = jwt.sign(
      {
        id: customer.id,
        email: customer.email
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '30d'
      }
    );
  } catch (err) {
    console.error('[JWT_SIGN_ERROR]', err.message);

    return res.status(500).json({
      ok: false,
      code: 'CONFIGURATION_ERROR',
      message: 'Server configuration error. Contact support.'
    });
  }

  res.json({
    ok: true,
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email
    }
  });
});

module.exports = router;