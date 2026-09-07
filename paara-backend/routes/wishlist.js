const express = require('express');
const db = require('../db/database.pg');
const { requireAuth } = require('../middleware/auth');
const { isPositiveInt } = require('../utils/validate');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        w.id AS wishlist_id,
        p.*
      FROM wishlist w
      JOIN products p ON p.id = w.product_id
      WHERE w.customer_id = $1
      ORDER BY w.added_at DESC
    `, [req.customer.id]);

    return res.json(result.rows);
  } catch (error) {
    console.error('[WISHLIST_GET_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load your wishlist.',
    });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { product_id } = req.body || {};

  if (!isPositiveInt(product_id)) {
    return res.status(400).json({
      error: 'A valid product_id is required.',
    });
  }

  try {
    const productResult = await db.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productResult.rowCount === 0) {
      return res.status(404).json({
        error: 'Product not found.',
      });
    }

    await db.query(`
      INSERT INTO wishlist (customer_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [req.customer.id, product_id]);

    return res.status(201).json({
      success: true,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Already in wishlist.',
      });
    }

    console.error('[WISHLIST_ADD_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not add item to wishlist.',
    });
  }
});

router.delete('/:product_id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      DELETE FROM wishlist
      WHERE customer_id = $1
        AND product_id = $2
      RETURNING id
    `, [
      req.customer.id,
      req.params.product_id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Not in wishlist.',
      });
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error('[WISHLIST_DELETE_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not remove item from wishlist.',
    });
  }
});

module.exports = router;
