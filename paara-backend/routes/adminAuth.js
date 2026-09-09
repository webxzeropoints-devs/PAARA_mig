const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database.pg');
const { requireAdminSession } = require('../middleware/adminAuth');
const { issuePasswordResetOtp, consumePasswordResetOtp, markPasswordResetOtpUsed } = require('../utils/passwordReset');
const { normalizeEmail } = require('../utils/emailOtp');
const { validatePassword, PASSWORD_ERROR, maskEmail } = require('../utils/validate');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });

  const normalizedEmail = normalizeEmail(email);

  let result = await db.query(
    'SELECT id, name, email, password_hash, profile_image_url, must_change_password FROM admins WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  let admin = result.rows[0];

  if (!admin) {
    result = await db.query(
      'SELECT id, name, email, password_hash, profile_image_url, must_change_password FROM admins WHERE lower(email) = $1 LIMIT 1',
      [normalizedEmail]
    );
    admin = result.rows[0];
  }

  const passwordMatches = !!admin && await bcrypt.compare(password, admin.password_hash);

  console.log('[AUTH_LOGIN]', {
    actor: 'admin',
    email: maskEmail(normalizedEmail),
    adminFound: !!admin,
    passwordMatches
  });

  if (!admin || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  let token;
  try {
    token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
  } catch (err) {
    console.error('[JWT_SIGN_ERROR]', err.message);
    return res.status(500).json({ error: 'Server configuration error. Contact support.' });
  }

  return res.json({
    success: true,
    token,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      profile_image_url: admin.profile_image_url
    },
    admin_id: admin.id,
    email: admin.email,
    needs_setup: Boolean(admin.must_change_password),
    message: Boolean(admin.must_change_password)
      ? 'Temporary admin access granted. Update your email and password from profile settings.'
      : 'Admin login successful.'
  });
});

router.post('/set-password', requireAdminSession, async (req, res) => {
  if (String(req.admin.id) !== String(req.body?.admin_id)) {
    return res.status(403).json({ error: 'You can only update your own admin account.' });
  }
  const { admin_id, new_password, new_email } = req.body;
  const normalizedEmail = normalizeEmail(new_email);

  if (!admin_id || !new_password || !normalizedEmail) {
    return res.status(400).json({ error: 'admin_id, new_password and new_email are required.' });
  }

  const result = await db.query(
    'SELECT id, name, email, password_hash, profile_image_url, must_change_password FROM admins WHERE id = $1 LIMIT 1',
    [admin_id]
  );
  const admin = result.rows[0];

  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  if (!validatePassword(new_password)) {
    return res.status(400).json({ error: PASSWORD_ERROR });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const password_hash = await bcrypt.hash(new_password, 10);

  console.log('[AUTH_PROFILE_UPDATE]', {
    actor: 'admin',
    action: 'set-password'
  });

  try {
    await db.query(
      'UPDATE admins SET password_hash = $1, email = $2, must_change_password = FALSE WHERE id = $3',
      [password_hash, normalizedEmail, admin.id]
    );

    res.json({
      success: true,
      message: 'Password and email updated successfully.'
    });
  } catch (error) {
    return res.status(409).json({ error: 'That email is already in use.' });
  }
});

router.post('/forgot-password/request', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({
      error: 'A valid email address is required.'
    });
  }

  let result = await db.query(
    'SELECT id FROM admins WHERE email = $1 LIMIT 1',
    [email]
  );
  let admin = result.rows[0];

  if (!admin) {
    result = await db.query(
      'SELECT id FROM admins WHERE lower(email) = $1 LIMIT 1',
      [email]
    );
    admin = result.rows[0];
  }

  if (!admin) {
    return res.status(404).json({
      error: 'No admin account was found for that email.'
    });
  }

  try {
    await issuePasswordResetOtp(email, 'admin');

    return res.json({
      success: true,
      message: 'Password reset code sent to your admin email.'
    });
  } catch (error) {
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
    return res.status(400).json({
      error: PASSWORD_ERROR
    });
  }

  const validation = await consumePasswordResetOtp(email, code, 'admin');

  if (!validation.valid) {
    return res.status(400).json({
      error: validation.reason
    });
  }

  let result = await db.query(
    'SELECT id FROM admins WHERE email = $1 LIMIT 1',
    [email]
  );
  let admin = result.rows[0];

  if (!admin) {
    result = await db.query(
      'SELECT id FROM admins WHERE lower(email) = $1 LIMIT 1',
      [email]
    );
    admin = result.rows[0];
  }

  if (!admin) {
    return res.status(404).json({
      error: 'Admin account not found.'
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.query(
    'UPDATE admins SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
    [passwordHash, admin.id]
  );

  await markPasswordResetOtpUsed(validation.record.id);

  return res.json({
    success: true,
    message: 'Password reset successful.'
  });
});

router.get('/me', requireAdminSession, async (req, res) => {
  const result = await db.query(
    'SELECT id, name, email, profile_image_url, must_change_password FROM admins WHERE id = $1 LIMIT 1',
    [req.admin.id]
  );

  res.json(result.rows[0]);
});

router.put('/change-password', requireAdminSession, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const result = await db.query(
    'SELECT id, name, email, password_hash FROM admins WHERE id = $1 LIMIT 1',
    [req.admin.id]
  );
  const admin = result.rows[0];

  if (!admin) {
    return res.status(404).json({ error: 'Admin not found.' });
  }

  if (!await bcrypt.compare(currentPassword, admin.password_hash)) {
    return res.status(401).json({
      error: 'Current password is incorrect.'
    });
  }

  if (!validatePassword(newPassword)) {
    return res.status(400).json({
      error: PASSWORD_ERROR
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.query(
    'UPDATE admins SET password_hash = $1 WHERE id = $2',
    [passwordHash, admin.id]
  );

  res.json({ success: true });
});

router.put('/change-email', requireAdminSession, async (req, res) => {
  const { newEmail, currentPassword } = req.body;

  const result = await db.query(
    'SELECT id, name, email, password_hash FROM admins WHERE id = $1 LIMIT 1',
    [req.admin.id]
  );
  const admin = result.rows[0];

  if (!admin) {
    return res.status(404).json({ error: 'Admin not found.' });
  }

  if (!await bcrypt.compare(currentPassword, admin.password_hash)) {
    return res.status(401).json({
      error: 'Current password is incorrect.'
    });
  }

  try {
    const normalizedEmail = normalizeEmail(newEmail);

    if (!normalizedEmail) {
      return res.status(400).json({
        error: 'A valid email address is required.'
      });
    }

    await db.query(
      'UPDATE admins SET email = $1 WHERE id = $2',
      [normalizedEmail, admin.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(409).json({
      error: 'That email is already in use.'
    });
  }
});

router.put('/profile-picture', requireAdminSession, async (req, res) => {
  const { image_url } = req.body;

  if (!image_url) {
    return res.status(400).json({
      error: 'image_url is required.'
    });
  }

  await db.query(
    'UPDATE admins SET profile_image_url = $1 WHERE id = $2',
    [image_url, req.admin.id]
  );

  res.json({ success: true });
});

module.exports = router;
