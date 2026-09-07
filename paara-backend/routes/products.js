const express = require('express');
const db = require('../db/database.pg');
const publicImageUrl = require('../utils/publicImageUrl');

const router = express.Router();

async function getDailyBestsellers(limit) {
  const { rows: allActive } = await db.query(`
    SELECT p.*, c.name AS category_name, c.gender
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = TRUE
      AND p.release_date <= to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    ORDER BY p.id ASC
  `);

  if (allActive.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
  }

  const offset = hash % allActive.length;
  const result = [];

  for (let i = 0; i < Math.min(limit, allActive.length); i++) {
    result.push(allActive[(offset + i) % allActive.length]);
  }

  return result;
}

async function addProductImages(products) {
  return Promise.all(products.map(async (product) => {
    const { rows: images } = await db.query(
      'SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC',
      [product.id]
    );

    product.images = images
      .map((image) => publicImageUrl(image.image_url))
      .filter(Boolean);

    return product;
  }));
}

// GET /api/products?gender=men&material=gold&vibe=minimal&category=necklaces&subcategory=pendant-necklaces&sort=newest
router.get('/', async (req, res) => {
  try {
    if (req.query.bestseller === 'true') {
      const products = await getDailyBestsellers(parseInt(req.query.limit, 10) || 9);
      return res.json(await addProductImages(products));
    }

    const { gender, material, vibe, category, subcategory, sort } = req.query;

    let sql = `
      SELECT p.*, c.name AS category_name, c.gender,
             c.material AS category_material, c.vibe
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = TRUE
        AND p.release_date <= to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    `;

    const params = [];

    if (gender) {
      sql += ' AND c.gender = $' + (params.length + 1);
      params.push(gender);
    }

    if (material) {
      sql += ' AND c.material = $' + (params.length + 1);
      params.push(material);
    }

    if (vibe) {
      sql += ' AND c.vibe = $' + (params.length + 1);
      params.push(vibe);
    }

    if (category) {
      sql += ' AND (c.slug = $' + (params.length + 1) +
        ' OR lower(c.name) LIKE $' + (params.length + 2) + ')';
      params.push(category, `%${String(category).toLowerCase()}%`);
    }

    if (subcategory) {
      sql += ' AND p.subcategory = $' + (params.length + 1);
      params.push(subcategory);
    }

    sql += sort === 'popularity'
      ? ' ORDER BY p.is_bestseller DESC, p.id ASC'
      : sort === 'price_asc'
        ? ' ORDER BY p.price ASC'
        : sort === 'price_desc'
          ? ' ORDER BY p.price DESC'
          : ' ORDER BY p.release_date DESC';

    if (req.query.limit) {
      const limit = parseInt(req.query.limit, 10) || 9;
      sql += ` LIMIT ${limit}`;
    }

    const { rows: products } = await db.query(sql, params);
    res.json(await addProductImages(products));
  } catch (error) {
    console.error('[PRODUCTS] Error:', error);
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    const { rows } = await db.query(
      'SELECT id, name, slug, gender, vibe, material FROM categories ORDER BY gender, name'
    );

    res.json(rows);
  } catch (error) {
    console.error('[PRODUCTS] Categories error:', error);
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

// GET /api/products/:slug — full detail + gallery images for the flip-card marquee
router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, c.name AS category_name, c.gender
      FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1 AND p.is_active = TRUE
    `, [req.params.slug]);

    const product = rows[0];

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const { rows: images } = await db.query(
      'SELECT image_url, is_primary FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC',
      [product.id]
    );

    product.images = images
      .map((image) => publicImageUrl(image.image_url))
      .filter(Boolean);

    const { rows: instagram } = await db.query(
      'SELECT instagram_post_url, image_url, caption, likes FROM instagram_reviews WHERE product_id = $1 ORDER BY cached_at DESC LIMIT 8',
      [product.id]
    );

    product.instagram = instagram;

    res.json(product);
  } catch (error) {
    console.error('[PRODUCTS] Product detail error:', error);
    res.status(500).json({ error: 'Failed to load product.' });
  }
});

module.exports = router;
