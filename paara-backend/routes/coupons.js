const express = require('express');
const db = require('../db/database.pg');
const { requireAuth } = require('../middleware/auth');
const { round2 } = require('../utils/pricing');

const router = express.Router();

const isCouponExpired = (deadline) => {
  if (!deadline) return true;

  const normalized = String(deadline).replace(' ', 'T');
  const candidate = normalized.includes('Z')
    ? normalized
    : `${normalized}Z`;

  return new Date(candidate) <= new Date();
};

const getCouponValidation = async (code) => {
  const result = await db.query(
    'SELECT * FROM coupons WHERE code = $1',
    [code]
  );

  const coupon = result.rows[0];

  if (!coupon) {
    return { error: 'Invalid coupon code.', status: 404 };
  }

  if (!coupon.is_active) {
    return { error: 'This coupon is inactive.', status: 400 };
  }

  if (isCouponExpired(coupon.deadline)) {
    return { error: 'This coupon has expired.', status: 400 };
  }

  return { coupon };
};

// GET /api/coupons/active
router.get('/active', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const result = await db.query(`
      SELECT
        id,
        code,
        description,
        discount_type,
        discount_value,
        deadline
      FROM coupons
      WHERE is_active = TRUE
        AND redeemed_at IS NULL
        AND deadline > to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      ORDER BY deadline ASC
    `);

    return res.json(result.rows);
  } catch (error) {
    console.error('[COUPONS_ACTIVE_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load active coupons.',
    });
  }
});

router.post('/validate', async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const subtotal = Number(req.body?.subtotal ?? 0);

  if (!code) {
    return res.status(400).json({
      error: 'A coupon code is required.',
    });
  }

  try {
    const validation = await getCouponValidation(code);

    if (validation.error) {
      return res.status(validation.status).json({
        error: validation.error,
      });
    }

    const { coupon } = validation;

    const discountAmount =
      coupon.discount_type === 'percent'
        ? round2(
            subtotal *
              (Number(coupon.discount_value) / 100)
          )
        : round2(Number(coupon.discount_value));

    const totalAfterDiscount = round2(
      Math.max(0, subtotal - discountAmount)
    );

    return res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        deadline: coupon.deadline,
      },
      discount_amount: discountAmount,
      subtotal,
      total_after_discount: totalAfterDiscount,
    });
  } catch (error) {
    console.error('[COUPON_VALIDATE_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not validate the coupon.',
    });
  }
});

router.post('/redeem-gift-card', requireAuth, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();

  if (!code) {
    return res.status(400).json({
      error: 'A gift card code is required.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const couponResult = await client.query(
      'SELECT * FROM coupons WHERE code = $1 FOR UPDATE',
      [code]
    );

    const coupon = couponResult.rows[0];

    if (!coupon) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Invalid gift card code.',
      });
    }

    if (coupon.discount_type !== 'flat') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'This code is not eligible for gift card redemption.',
      });
    }

    if (coupon.redeemed_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This gift card code has already been used.',
      });
    }

    if (!coupon.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'This gift card code is inactive.',
      });
    }

    if (isCouponExpired(coupon.deadline)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'This gift card code has expired.',
      });
    }

    const consumed = await client.query(`
      UPDATE coupons
      SET redeemed_at = to_char(
        CURRENT_TIMESTAMP,
        'YYYY-MM-DD HH24:MI:SS'
      )
      WHERE id = $1
        AND redeemed_at IS NULL
      RETURNING id
    `, [coupon.id]);

    if (consumed.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This gift card code has already been used.',
      });
    }

    const updated = await client.query(`
      UPDATE customers
      SET gift_card_balance = gift_card_balance + $1
      WHERE id = $2
      RETURNING gift_card_balance
    `, [
      Number(coupon.discount_value),
      req.customer.id,
    ]);

    if (updated.rowCount === 0) {
      throw new Error('Customer account not found.');
    }

    await client.query('COMMIT');

    return res.json({
      amount: Number(coupon.discount_value),
      balance: Number(updated.rows[0].gift_card_balance),
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[GIFT_CARD_REDEEM_FAILED]', error.message);

    return res.status(500).json({
      error:
        error.message === 'Customer account not found.'
          ? error.message
          : 'Could not redeem this gift card code.',
    });
  } finally {
    client.release();
  }
});

router.get('/balance', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT gift_card_balance FROM customers WHERE id = $1',
      [req.customer.id]
    );

    const customer = result.rows[0];

    if (!customer) {
      return res.status(404).json({
        error: 'Customer account not found.',
      });
    }

    return res.json({
      balance: Number(customer.gift_card_balance),
    });
  } catch (error) {
    console.error('[GIFT_CARD_BALANCE_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load gift card balance.',
    });
  }
});

module.exports = router;
