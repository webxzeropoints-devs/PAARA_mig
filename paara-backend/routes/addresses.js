const express = require('express');
const db = require('../db/database.pg');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM addresses WHERE customer_id = $1 ORDER BY is_default DESC, id DESC',
      [req.customer.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[ADDRESS_LIST_FAILED]', {
      customerId: req.customer.id,
      error: error.message,
      name: error.name,
      code: error.code,
    });

    return res.status(500).json({
      error: 'Could not load addresses. Please try again.',
    });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const {
    line1,
    line2,
    city,
    state,
    pincode,
    lat,
    lng,
    is_default,
  } = req.body || {};

  if (
    ![line1, city, state, pincode].every(
      (value) => typeof value === 'string' && value.trim()
    )
  ) {
    return res.status(400).json({
      error: 'line1, city, state and pincode are required.',
    });
  }

  const latitude = lat == null || lat === '' ? null : Number(lat);
  const longitude = lng == null || lng === '' ? null : Number(lng);

  if (
    (latitude != null && !Number.isFinite(latitude)) ||
    (longitude != null && !Number.isFinite(longitude))
  ) {
    return res.status(400).json({
      error: 'lat and lng must be valid numbers.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT 1 FROM addresses WHERE customer_id = $1 LIMIT 1',
      [req.customer.id]
    );

    const hasExistingAddress = existingResult.rowCount > 0;
    const makeDefault = Boolean(is_default) || !hasExistingAddress;

    if (makeDefault) {
      await client.query(
        'UPDATE addresses SET is_default = FALSE WHERE customer_id = $1',
        [req.customer.id]
      );
    }

    const result = await client.query(`
      INSERT INTO addresses (
        customer_id,
        line1,
        line2,
        city,
        state,
        pincode,
        lat,
        lng,
        is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      req.customer.id,
      line1.trim(),
      line2?.trim() || null,
      city.trim(),
      state.trim(),
      pincode.trim(),
      latitude,
      longitude,
      makeDefault,
    ]);

    await client.query('COMMIT');

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[ADDRESS_CREATE_FAILED]', {
      customerId: req.customer.id,
      error: error.message,
      name: error.name,
      code: error.code,
    });

    if (error.code === '23503') {
      return res.status(400).json({
        error: 'Your customer session is no longer valid. Please sign in again.',
      });
    }

    return res.status(500).json({
      error: 'Address could not be saved. Please try again.',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
