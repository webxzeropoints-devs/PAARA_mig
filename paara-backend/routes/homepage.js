const express = require('express');
const db = require('../db/database.pg');
const publicImageUrl = require('../utils/publicImageUrl');

const router = express.Router();

router.get('/collection-tiles', async (req, res) => {
  try {
    const tilesResult = await db.query(`
      SELECT
        tile_key,
        label,
        subtitle,
        image_url,
        link_path
      FROM collection_tiles
      ORDER BY id
    `);

    const productResult = await db.query(`
      SELECT
        p.id,
        p.name,
        p.slug,
        tp.tile_key,
        tp.sort_order,
        tp.id AS tile_product_id,
        COALESCE(
          primary_image.image_url,
          first_image.image_url
        ) AS image_url
      FROM tile_products tp
      JOIN products p
        ON p.id = tp.product_id
      LEFT JOIN product_images primary_image
        ON primary_image.product_id = p.id
       AND primary_image.is_primary = TRUE
      LEFT JOIN product_images first_image
        ON first_image.id = (
          SELECT pi.id
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.id ASC
          LIMIT 1
        )
      ORDER BY tp.tile_key, tp.sort_order, tp.id
    `);

    const productsByTile = new Map();

    for (const product of productResult.rows) {
      if (!productsByTile.has(product.tile_key)) {
        productsByTile.set(product.tile_key, []);
      }

      productsByTile.get(product.tile_key).push({
        ...product,
        image_url: publicImageUrl(product.image_url),
      });
    }

    const tiles = tilesResult.rows.map((tile) => {
      const products = productsByTile.get(tile.tile_key) || [];

      return {
        ...tile,
        products,
        image_url: publicImageUrl(
          products[0]?.image_url || tile.image_url
        ),
      };
    });

    return res.json(tiles);
  } catch (error) {
    console.error('[HOMEPAGE_TILES_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load collection tiles.',
    });
  }
});

router.get('/paara-irl', async (req, res) => {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, max-age=0'
  );

  try {
    const result = await db.query(`
      SELECT
        id,
        image_url,
        owner_image_url,
        caption,
        updated_at
      FROM paara_irl
      WHERE id = 1
    `);

    const row = result.rows[0] || null;

    return res.json(
      row
        ? {
            ...row,
            image_url: publicImageUrl(row.image_url),
            owner_image_url: publicImageUrl(
              row.owner_image_url
            ),
          }
        : null
    );
  } catch (error) {
    console.error('[HOMEPAGE_PAARA_IRL_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load Paara IRL data.',
    });
  }
});

router.get('/worn-by-you', async (req, res) => {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, max-age=0'
  );

  try {
    const result = await db.query(`
      SELECT
        id,
        instagram_post_url,
        image_url,
        caption,
        likes,
        sort_order,
        cached_at,
        updated_at
      FROM instagram_reviews
      WHERE product_id IS NULL
        AND sort_order BETWEEN 0 AND 2
      ORDER BY sort_order ASC, id ASC
      LIMIT 3
    `);

    return res.json(
      result.rows.map((row) => ({
        ...row,
        image_url: publicImageUrl(row.image_url),
      }))
    );
  } catch (error) {
    console.error('[HOMEPAGE_WORN_BY_YOU_FAILED]', error.message);

    return res.status(500).json({
      error: 'Could not load Worn By You entries.',
    });
  }
});

module.exports = router;
