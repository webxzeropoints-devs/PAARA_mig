const express = require('express');
const { calculateShipping } = require('../utils/shipping');
const db = require('../db/database.pg');

const router = express.Router();

// GET /api/shipping/cities
router.get('/cities', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT name, flat_shipping_rate FROM cities ORDER BY name'
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('[SHIPPING_CITIES_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load shipping cities.',
    });
  }
});

// POST /api/shipping/quote
router.post('/quote', (req, res) => {
  const {
    city,
    state,
    payment_method = 'payu',
    total_weight_kg = 0.1,
  } = req.body || {};

  try {
    if (String(payment_method).trim().toLowerCase() !== 'payu') {
      return res.status(400).json({
        error: 'PayU is the only available payment method.',
      });
    }
    return res.json(
      calculateShipping({
        city,
        state,
        paymentMethod: payment_method,
        totalWeightKg: total_weight_kg,
      })
    );
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
});

module.exports = router;
