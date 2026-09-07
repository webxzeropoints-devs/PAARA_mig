const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getLoyaltyState,
  processLoyaltyOrder,
} = require('../services/loyalty');
const db = require('../db/database.pg');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const state = await getLoyaltyState(req.customer.id);

    return res.json(state);
  } catch (error) {
    console.error('[LOYALTY_STATE_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load loyalty information.',
    });
  }
});

router.get('/order/:orderId', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        o.id,
        o.customer_id,
        ls.awarded_at,
        ls.animation_shown_at
      FROM orders o
      LEFT JOIN loyalty_stamps ls
        ON ls.order_id = o.id
      WHERE o.id = $1
        AND o.customer_id = $2
    `, [req.params.orderId, req.customer.id]);

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({
        error: 'Order not found.',
      });
    }

    res.set('Cache-Control', 'no-store');

    return res.json({
      orderId: order.id,
      awarded: Boolean(order.awarded_at),
      animationShown: Boolean(order.animation_shown_at),
      awardedAt: order.awarded_at || null,
    });
  } catch (error) {
    console.error('[LOYALTY_ORDER_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load loyalty order information.',
    });
  }
});

router.post('/process-order', requireAuth, async (req, res) => {
  const orderId = Number.parseInt(req.body?.order_id, 10);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({
      error: 'A valid order ID is required.',
    });
  }

  try {
    const result = await processLoyaltyOrder(
      orderId,
      req.customer.id
    );

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    console.error('[LOYALTY_PROCESS_FAILED]', {
      message: error.message,
      name: error.name,
    });

    return res.status(500).json({
      error: 'Could not process this order for rewards.',
    });
  }
});

router.post('/mark-animation-shown', requireAuth, async (req, res) => {
  const orderId = Number.parseInt(req.body?.order_id, 10);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({
      error: 'A valid order ID is required.',
    });
  }

  try {
    const updated = await db.query(`
      UPDATE loyalty_stamps
      SET animation_shown_at = COALESCE(
        animation_shown_at,
        to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      )
      WHERE order_id = $1
        AND customer_id = $2
      RETURNING id
    `, [orderId, req.customer.id]);

    if (updated.rowCount === 0) {
      return res.status(404).json({
        error: 'No loyalty stamp found for this order.',
      });
    }

    return res.json({
      success: true,
      orderId,
      animationShown: true,
    });
  } catch (error) {
    console.error('[LOYALTY_ANIMATION_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not update loyalty animation status.',
    });
  }
});

module.exports = router;
