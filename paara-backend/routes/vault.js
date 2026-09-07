const express = require('express');
const db = require('../db/database.pg');
const publicImageUrl = require('../utils/publicImageUrl');

const router = express.Router();

// GET /api/vault/today
router.get('/today', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, c.name AS category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = TRUE
        AND p.is_vault = TRUE
      ORDER BY p.created_at DESC
    `);

    const products = result.rows;

    if (products.length > 0) {
      const productIds = products.map((product) => product.id);

      const imageResult = await db.query(`
        SELECT product_id, image_url
        FROM product_images
        WHERE product_id = ANY($1::int[])
        ORDER BY sort_order ASC, id ASC
      `, [productIds]);

      const imagesByProduct = new Map();

      for (const image of imageResult.rows) {
        if (!imagesByProduct.has(image.product_id)) {
          imagesByProduct.set(image.product_id, []);
        }

        imagesByProduct.get(image.product_id).push(
          publicImageUrl(image.image_url)
        );
      }

      for (const product of products) {
        product.images = (imagesByProduct.get(product.id) || [])
          .filter(Boolean);
      }
    }

    return res.json(products);
  } catch (error) {
    console.error('[VAULT_TODAY_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load today\'s vault products.',
    });
  }
});

// GET /api/vault/selected
router.get('/selected', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, c.name AS category_name
      FROM vault_products vp
      JOIN products p ON p.id = vp.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = TRUE
      ORDER BY vp.sort_order ASC
    `);

    const products = result.rows;

    if (products.length > 0) {
      const productIds = products.map((product) => product.id);

      const imageResult = await db.query(`
        SELECT product_id, image_url
        FROM product_images
        WHERE product_id = ANY($1::int[])
        ORDER BY sort_order ASC, id ASC
      `, [productIds]);

      const imagesByProduct = new Map();

      for (const image of imageResult.rows) {
        if (!imagesByProduct.has(image.product_id)) {
          imagesByProduct.set(image.product_id, []);
        }

        imagesByProduct.get(image.product_id).push(
          publicImageUrl(image.image_url)
        );
      }

      for (const product of products) {
        product.images = (imagesByProduct.get(product.id) || [])
          .filter(Boolean);
      }
    }

    return res.json(products);
  } catch (error) {
    console.error('[VAULT_SELECTED_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load selected vault products.',
    });
  }
});

// GET /api/vault/archive
router.get('/archive', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        split_part(release_date, ' ', 1) AS drop_date,
        COUNT(*)::int AS item_count
      FROM products
      WHERE is_active = TRUE
        AND release_date IS NOT NULL
        AND release_date < to_char(
          CURRENT_TIMESTAMP,
          'YYYY-MM-DD HH24:MI:SS'
        )
      GROUP BY split_part(release_date, ' ', 1)
      ORDER BY drop_date DESC
      LIMIT 30
    `);

    return res.json(result.rows);
  } catch (error) {
    console.error('[VAULT_ARCHIVE_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load vault archive.',
    });
  }
});

// GET /api/vault/next
router.get('/next', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT MIN(release_date) AS next_drop
      FROM products
      WHERE is_active = TRUE
        AND release_date IS NOT NULL
        AND release_date > to_char(
          CURRENT_TIMESTAMP,
          'YYYY-MM-DD HH24:MI:SS'
        )
    `);

    return res.json({
      next_drop: result.rows[0]?.next_drop || null,
    });
  } catch (error) {
    console.error('[VAULT_NEXT_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load the next vault release.',
    });
  }
});

module.exports = router;
