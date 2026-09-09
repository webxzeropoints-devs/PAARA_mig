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

router.put('/:id', requireAuth, async (req, res) => {
  const addressId = Number.parseInt(req.params.id, 10);
  const { line1, line2, city, state, pincode, lat, lng, is_default } = req.body || {};

  if (!Number.isInteger(addressId) || addressId < 1) {
    return res.status(400).json({ error: 'A valid address ID is required.' });
  }
  if (![line1, city, state, pincode].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'line1, city, state and pincode are required.' });
  }

  const latitude = lat == null || lat === '' ? null : Number(lat);
  const longitude = lng == null || lng === '' ? null : Number(lng);
  if ((latitude != null && !Number.isFinite(latitude)) || (longitude != null && !Number.isFinite(longitude))) {
    return res.status(400).json({ error: 'lat and lng must be valid numbers.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM addresses WHERE id = $1 AND customer_id = $2',
      [addressId, req.customer.id]
    );
    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Address not found.' });
    }
    if (Boolean(is_default)) {
      await client.query('UPDATE addresses SET is_default = FALSE WHERE customer_id = $1', [req.customer.id]);
    }
    const result = await client.query(`
      UPDATE addresses
      SET line1 = $1, line2 = $2, city = $3, state = $4, pincode = $5,
          lat = $6, lng = $7, is_default = $8
      WHERE id = $9 AND customer_id = $10
      RETURNING *
    `, [
      line1.trim(), line2?.trim() || null, city.trim(), state.trim(), pincode.trim(),
      latitude, longitude, Boolean(is_default), addressId, req.customer.id,
    ]);
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ADDRESS_UPDATE_FAILED]', error.message);
    return res.status(500).json({ error: 'Address could not be updated. Please try again.' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const addressId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(addressId) || addressId < 1) {
    return res.status(400).json({ error: 'A valid address ID is required.' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const deleted = await client.query(`
      DELETE FROM addresses
      WHERE id = $1 AND customer_id = $2
      RETURNING is_default
    `, [addressId, req.customer.id]);
    if (deleted.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Address not found.' });
    }
    if (deleted.rows[0].is_default) {
      await client.query(`
        UPDATE addresses
        SET is_default = TRUE
        WHERE id = (
          SELECT id FROM addresses
          WHERE customer_id = $1
          ORDER BY id DESC
          LIMIT 1
        )
      `, [req.customer.id]);
    }
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ADDRESS_DELETE_FAILED]', error.message);
    return res.status(500).json({ error: 'Address could not be deleted. Please try again.' });
  } finally {
    client.release();
  }
});

module.exports = router;
