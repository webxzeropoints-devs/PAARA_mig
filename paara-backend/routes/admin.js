const express = require('express');
const db = require('../db/database.pg');
const { requireAdmin } = require('../middleware/admin');
const { processLoyaltyOrder } = require('../services/loyalty');
const publicImageUrl = require('../utils/publicImageUrl');
const publicHomepageImageUrl = require('../utils/publicHomepageImageUrl');
const mediaStore = require('../utils/mediaStore');
const { getEmailConfigurationStatus } = require('../utils/email');

const router = express.Router();

router.use(requireAdmin);
router.use((q, s, next) => {
  s.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  next();
});

const normalizeFormBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const normalizeFilterOptions = (value) => {
  if (Array.isArray(value)) return value.map((option) => String(option).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((option) => String(option).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const cleanImages = (images) => (Array.isArray(images)
  ? images.map((image) => String(image || '').trim()).filter(Boolean)
  : []);

const imageError = (message, code = 'INVALID_IMAGE_REQUEST') =>
  Object.assign(new Error(message), { code });

const parseReplacementFlag = (value) => {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  throw imageError(
    'replace_images must be a boolean value.',
    'INVALID_IMAGE_REPLACEMENT_FLAG'
  );
};

const parseProductBoolean = (value, fieldName) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  throw imageError(`${fieldName} must be a boolean value.`, 'INVALID_PRODUCT_FIELDS');
};

const parseImageList = (value, fieldName) => {
  if (value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  if (items.some((item) => typeof item !== 'string' || !item.trim())) {
    throw imageError(`${fieldName} contains an invalid image reference.`);
  }
  return items.map((item) => item.trim());
};

const normalizeImageReferences = (images, req) =>
  images.map((image) => {
    const reference = mediaStore.toStorageReference(image, req);
    if (
      !mediaStore.isStratusReference(reference) &&
      !mediaStore.isCatalystReference(reference) &&
      !mediaStore.isSafeExternalImageReference(reference)
    ) {
      throw imageError('The image reference is invalid.', 'INVALID_IMAGE_REFERENCE');
    }
    return reference;
  });

const parseImageSlots = (value, expectedCount, fieldName) => {
  if (value === undefined) return null;
  const values = Array.isArray(value) ? value : [value];
  if (values.length !== expectedCount) {
    throw imageError(`${fieldName} must match the number of images.`);
  }

  const slots = values.map((value) => {
    const text = String(value);
    if (!/^(0|[1-9]\d*)$/.test(text)) {
      throw imageError(`${fieldName} must contain non-negative integer slots.`);
    }
    const slot = Number(text);
    if (!Number.isSafeInteger(slot)) {
      throw imageError(`${fieldName} contains an invalid slot.`);
    }
    return slot;
  });

  if (new Set(slots).size !== slots.length) {
    throw imageError(`${fieldName} cannot contain duplicate slots.`);
  }
  return slots;
};

const ensureManagedImagesExist = async (images, req) => {
  for (const image of images) {
    if (
      mediaStore.isStratusReference(image) ||
      mediaStore.isCatalystReference(image)
    ) {
      if (!await mediaStore.referenceExists(image, req)) {
        throw imageError(
          'A retained image is missing from storage.',
          'IMAGE_REFERENCE_NOT_FOUND'
        );
      }
    }
  }
};

const sameImageSnapshot = (left, right) =>
  left.length === right.length &&
  left.every((row, index) =>
    Number(row.id) === Number(right[index].id) &&
    row.image_url === right[index].image_url &&
    Number(row.sort_order) === Number(right[index].sort_order)
  );

const safeUploadError = (error) => ({
  message: error?.message || 'Image storage failed.',
  code: error?.code || 'MEDIA_STORAGE_FAILED',
  meta: error?.meta,
});

const deleteIfUnreferenced = async (references, req) => {
  const isManagedReference = (reference) =>
    (
      typeof mediaStore.isStratusReference === 'function' &&
      mediaStore.isStratusReference(reference)
    ) ||
    (
      typeof mediaStore.isCatalystReference === 'function' &&
      mediaStore.isCatalystReference(reference)
    );

  for (
    const reference of new Set(
      references.filter(isManagedReference)
    )
  ) {
    const candidates = mediaStore.publicUrlsForReference(reference, req);
    const result = await db.query(`
      SELECT 1 FROM product_images WHERE image_url = ANY($1::text[])
      UNION ALL SELECT 1 FROM products
        WHERE EXISTS (
          SELECT 1
          FROM unnest($1::text[]) AS image_reference(value)
          WHERE strpos(products.images_json, to_json(image_reference.value)::text) > 0
        )
      UNION ALL SELECT 1 FROM instagram_reviews WHERE image_url = ANY($1::text[])
      UNION ALL SELECT 1 FROM paara_irl
        WHERE image_url = ANY($1::text[])
           OR owner_image_url = ANY($1::text[])
      UNION ALL SELECT 1 FROM collection_tiles WHERE image_url = ANY($1::text[])
      UNION ALL SELECT 1 FROM admins WHERE profile_image_url = ANY($1::text[])
      LIMIT 1
    `, [candidates]);

    if (result.rowCount === 0) {
      await mediaStore.deleteReference(reference, req);
    }
  }
};

const decorate = async (rows) => {
  if (!rows.length) return [];

  const productIds = rows.map((row) => row.id);

  const result = await db.query(
    `SELECT product_id, image_url
     FROM product_images
     WHERE product_id = ANY($1::int[])
     ORDER BY sort_order ASC, id ASC`,
    [productIds]
  );

  const imagesByProduct = new Map();

  for (const row of result.rows) {
    if (!imagesByProduct.has(row.product_id)) {
      imagesByProduct.set(row.product_id, []);
    }
    imagesByProduct.get(row.product_id).push(publicImageUrl(row.image_url));
  }

  return rows.map((product) => ({
    ...product,
    images: imagesByProduct.get(product.id) || [],
  }));
};

const writeImages = async (id, images, client = db) => {
  const clean = cleanImages(images);

  await client.query(
    'DELETE FROM product_images WHERE product_id = $1',
    [id]
  );

  for (const [index, url] of clean.entries()) {
    await client.query(
      'INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
      [id, url, index]
    );
  }
};
const asFiles = (files) => (Array.isArray(files) ? files : files ? [files] : []);

const orderedImageUrls = ({ uploadedImages, existingImages, uploadSlots, existingSlots }) => {
  const slots = new Map();
  const add = (slot, image) => {
    if (!Number.isSafeInteger(slot) || slot < 0 || slots.has(slot)) {
      throw imageError('Image slots must be unique non-negative integers.');
    }
    slots.set(slot, image);
  };

  uploadedImages.forEach((url, index) => {
    const slot = uploadSlots ? uploadSlots[index] : index;
    add(slot, url);
  });
  existingImages.forEach((url, index) => {
    const slot = existingSlots
      ? existingSlots[index]
      : uploadedImages.length + index;
    add(slot, url);
  });

  const ordered = [...slots.entries()].sort(([left], [right]) => left - right);
  if (ordered.some(([slot], index) => slot !== index)) {
    throw imageError('Image slots must form a continuous sequence starting at zero.');
  }
  return ordered.map(([, url]) => url);
};

const saveUploadedImages = async (files, req) => {
  if (!files || files.length === 0) return [];

  const uploaded = [];

  try {
    for (const file of files) {
      uploaded.push(
        await mediaStore.uploadImage(file, 'product', req)
      );
    }

    return uploaded.map((item) => item.reference);
  } catch (error) {
    const cleanupResults = await Promise.allSettled(
      uploaded.map((item) =>
        mediaStore.deleteReference(item.reference, req)
      )
    );
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        mediaStore.safeCleanupDiagnostic(
          uploaded[index].reference,
          result.reason
        );
      }
    });

    throw error;
  }
};

const cleanupReferences = async (references, req) => {
  for (const reference of new Set(references)) {
    try {
      await deleteIfUnreferenced([reference], req);
    } catch (error) {
      mediaStore.safeCleanupDiagnostic(reference, error);
    }
  }
};


const saveUploadedImage = async (file, prefix, req) => {
  if (!file) return null;
  const uploaded = await mediaStore.uploadImage(file, prefix, req);
  return uploaded.reference;
};

router.get('/products', async (q, s) => {
  try {
    const result = await db.query(`
      SELECT p.*, c.name AS category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `);

    return s.json(await decorate(result.rows));
  } catch (error) {
    console.error('[ADMIN_PRODUCTS_FAILED]', error.message);
    return s.status(500).json({ error: 'Could not load products.' });
  }
});

// Safe operational diagnostic: values and credentials are never returned.
router.get('/email-status', (q, s) => {
  s.json(getEmailConfigurationStatus());
});

router.get('/categories', async (q, s) => {
  try {
    const result = await db.query(
      'SELECT id, name, slug, gender, vibe, material FROM categories ORDER BY gender, name'
    );

    return s.json(result.rows);
  } catch (error) {
    console.error('[ADMIN_CATEGORIES_FAILED]', error.message);
    return s.status(500).json({ error: 'Could not load categories.' });
  }
});

router.post('/categories', async (q, s) => {
  const { name, slug, gender, vibe = null, material = null } = q.body || {};
  const cleanName = String(name || '').trim();
  const cleanSlug = String(slug || '').trim();
  const cleanGender = String(gender || '').trim().toLowerCase();

  if (!cleanName || !cleanSlug || !['men', 'women', 'unisex'].includes(cleanGender)) {
    return s.status(400).json({
      error: 'Category name, slug, and gender are required.',
    });
  }

  const normalizedSlug = cleanSlug.replace(/\s+/g, '-').toLowerCase();

  try {
    const result = await db.query(`
      INSERT INTO categories (name, slug, gender, vibe, material)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      cleanName,
      normalizedSlug,
      cleanGender,
      vibe || null,
      material || null,
    ]);

    return s.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return s.status(409).json({
        error: 'A category with this slug already exists.',
      });
    }

    console.error('[ADMIN_CATEGORY_CREATE_FAILED]', err.message);
    return s.status(400).json({
      error: 'Could not create the category.',
    });
  }
});

router.put('/categories/:id', async (q, s) => {
  const { name, slug, gender, vibe = null, material = null } = q.body || {};
  const cleanName = String(name || '').trim();
  const cleanSlug = String(slug || '').trim();
  const cleanGender = String(gender || '').trim().toLowerCase();

  if (!cleanName || !cleanSlug || !['men', 'women', 'unisex'].includes(cleanGender)) {
    return s.status(400).json({
      error: 'Category name, slug, and gender are required.',
    });
  }

  const normalizedSlug = cleanSlug.replace(/\s+/g, '-').toLowerCase();

  try {
    const result = await db.query(`
      UPDATE categories
      SET name = $1,
          slug = $2,
          gender = $3,
          vibe = $4,
          material = $5
      WHERE id = $6
      RETURNING *
    `, [
      cleanName,
      normalizedSlug,
      cleanGender,
      vibe || null,
      material || null,
      q.params.id,
    ]);

    if (result.rowCount === 0) {
      return s.status(404).json({ error: 'Category not found.' });
    }

    return s.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return s.status(409).json({
        error: 'A category with this slug already exists.',
      });
    }

    console.error('[ADMIN_CATEGORY_UPDATE_FAILED]', err.message);
    return s.status(400).json({
      error: 'Could not update the category.',
    });
  }
});

router.delete('/categories/:id', async (q, s) => {
  try {
    const assignedProducts = await db.query(
      'SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1',
      [q.params.id]
    );

    if (assignedProducts.rows[0]?.count > 0) {
      return s.status(409).json({
        error: 'Category cannot be deleted while products are assigned to it.',
      });
    }

    const result = await db.query(
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [q.params.id]
    );

    if (result.rowCount === 0) {
      return s.status(404).json({ error: 'Category not found.' });
    }

    return s.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_CATEGORY_DELETE_FAILED]', error.message);
    return s.status(400).json({
      error: 'Could not delete the category.',
    });
  }
});

// -----------------------------
// Shipping Charges
// -----------------------------

router.get('/shipping', async (q, s) => {
  try {
    const result = await db.query(`
      SELECT id, name, flat_shipping_rate
      FROM cities
      ORDER BY LOWER(name) ASC
    `);

    return s.json(result.rows);
  } catch (error) {
    console.error('[ADMIN_SHIPPING_LIST_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not load shipping charges.',
    });
  }
});

router.post('/shipping', async (q, s) => {
  try {
    const name = String(q.body?.name || '').trim();
    const rate = Number(q.body?.flat_shipping_rate);

    if (!name) {
      return s.status(400).json({
        error: 'District or city name is required.',
      });
    }

    if (!Number.isFinite(rate) || rate < 0) {
      return s.status(400).json({
        error: 'Delivery charge must be a valid non-negative number.',
      });
    }

    const result = await db.query(
      `
        INSERT INTO cities (name, flat_shipping_rate)
        VALUES ($1, $2)
        RETURNING id, name, flat_shipping_rate
      `,
      [name, rate]
    );

    return s.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'A shipping charge for this district or city already exists.',
      });
    }

    console.error('[ADMIN_SHIPPING_CREATE_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not create shipping charge.',
    });
  }
});

router.put('/shipping/:id', async (q, s) => {
  try {
    const name = String(q.body?.name || '').trim();
    const rate = Number(q.body?.flat_shipping_rate);

    if (!name) {
      return s.status(400).json({
        error: 'District or city name is required.',
      });
    }

    if (!Number.isFinite(rate) || rate < 0) {
      return s.status(400).json({
        error: 'Delivery charge must be a valid non-negative number.',
      });
    }

    const result = await db.query(
      `
        UPDATE cities
        SET name = $1,
            flat_shipping_rate = $2
        WHERE id = $3
        RETURNING id, name, flat_shipping_rate
      `,
      [name, rate, q.params.id]
    );

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Shipping charge not found.',
      });
    }

    return s.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'A shipping charge for this district or city already exists.',
      });
    }

    console.error('[ADMIN_SHIPPING_UPDATE_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not update shipping charge.',
    });
  }
});

router.delete('/shipping/:id', async (q, s) => {
  try {
    const result = await db.query(
      `
        DELETE FROM cities
        WHERE id = $1
        RETURNING id
      `,
      [q.params.id]
    );

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Shipping charge not found.',
      });
    }

    return s.json({
      success: true,
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error('[ADMIN_SHIPPING_DELETE_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not delete shipping charge.',
    });
  }
});

router.get('/customers', async (q, s) => {
  try {
    const result = await db.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.created_at,
        COUNT(DISTINCT o.id)::int AS order_count,
        COALESCE(
          SUM(
            CASE
              WHEN o.payment_status = 'paid'
              THEN o.total_amount
              ELSE 0
            END
          ),
          0
        ) AS paid_total
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    return s.json(result.rows);
  } catch (error) {
    console.error('[ADMIN_CUSTOMERS_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not load customers.',
    });
  }
});

router.get('/customers/:id', async (q, s) => {
  try {
    const customerResult = await db.query(
      'SELECT id, name, email, phone, created_at FROM customers WHERE id = $1',
      [q.params.id]
    );

    const customer = customerResult.rows[0];

    if (!customer) {
      return s.status(404).json({ error: 'Customer not found.' });
    }

    const ordersResult = await db.query(
      'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC',
      [customer.id]
    );

    const addressesResult = await db.query(
      'SELECT * FROM addresses WHERE customer_id = $1 ORDER BY is_default DESC, id DESC',
      [customer.id]
    );

    const submissionsResult = await db.query(`
      SELECT
        d.*,
        o.order_number,
        o.status,
        o.payment_status
      FROM customer_order_details d
      JOIN orders o ON o.id = d.order_id
      WHERE d.customer_id = $1
      ORDER BY d.created_at DESC
    `, [customer.id]);

    customer.orders = ordersResult.rows;
    customer.addresses = addressesResult.rows;
    customer.submissions = submissionsResult.rows.map((detail) => ({
      ...detail,
      submitted_fields: JSON.parse(detail.submitted_fields || '{}'),
    }));

    return s.json(customer);
  } catch (error) {
    console.error('[ADMIN_CUSTOMER_DETAIL_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not load customer details.',
    });
  }
});
router.delete('/customers/:id', async (q, s) => {
  const customerResult = await db.query(
    'SELECT id, email, phone FROM customers WHERE id = $1',
    [q.params.id]
  );

  const customer = customerResult.rows[0];

  if (!customer) {
    return s.status(404).json({ error: 'Customer not found.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT id FROM orders WHERE customer_id = $1',
      [customer.id]
    );

    const orderIds = orderResult.rows.map((row) => row.id);

    if (orderIds.length > 0) {
      await client.query(
        'DELETE FROM customer_order_details WHERE order_id = ANY($1::int[])',
        [orderIds]
      );

      await client.query(
        'DELETE FROM order_items WHERE order_id = ANY($1::int[])',
        [orderIds]
      );

      await client.query(
        'DELETE FROM orders WHERE customer_id = $1',
        [customer.id]
      );
    }

    await client.query(
      'DELETE FROM email_otps WHERE email = $1',
      [customer.email]
    );

    // phone_otps is intentionally excluded from the PostgreSQL migration.
    await client.query(
      'DELETE FROM addresses WHERE customer_id = $1',
      [customer.id]
    );

    await client.query(
      'DELETE FROM wishlist WHERE customer_id = $1',
      [customer.id]
    );

    await client.query(
      'DELETE FROM customers WHERE id = $1',
      [customer.id]
    );

    await client.query('COMMIT');

    return s.json({
      success: true,
      customer_id: customer.id,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[ADMIN_CUSTOMER_DELETE_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not delete the customer.',
    });
  } finally {
    client.release();
  }
});

router.post('/vault', async (q, s) => {
  const rawIds = q.body.product_ids;

  if (
    !Array.isArray(rawIds) ||
    rawIds.length !== 3
  ) {
    return s.status(400).json({
      error: 'Select exactly three distinct products for the vault.',
    });
  }

  const ids = rawIds.map((id) => Number(id));
  if (
    ids.some((id) => !Number.isInteger(id) || id < 1) ||
    new Set(ids).size !== 3
  ) {
    return s.status(400).json({
      error: 'Select exactly three distinct products for the vault.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const existingProducts = await client.query(
      'SELECT id FROM products WHERE id = ANY($1::int[])',
      [ids]
    );
    if (existingProducts.rowCount !== ids.length) {
      await client.query('ROLLBACK');
      return s.status(404).json({
        error: 'One or more selected products no longer exist.',
      });
    }

    await client.query(
      'UPDATE products SET is_vault = FALSE, vault_sort_order = 0'
    );

    await client.query(
      'DELETE FROM vault_products'
    );

    for (const [index, id] of ids.entries()) {
      await client.query(
        'UPDATE products SET is_vault = TRUE, vault_sort_order = $1 WHERE id = $2',
        [index, id]
      );
      await client.query(
        `INSERT INTO vault_products (product_id, sort_order)
         VALUES ($1, $2)
         ON CONFLICT (product_id)
         DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [id, index]
      );
    }

    await client.query('COMMIT');

    return s.json({ success: true });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[ADMIN_VAULT_UPDATE_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not update the vault.',
    });
  } finally {
    client.release();
  }
});
router.post('/products', async (q, s) => {
  let uploadedImages = [];
  let committed = false;
  try {
    const {
      category_id,
      name,
      slug,
      description = null,
      price,
      material = null,
      subcategory = null,
      shop_for = '[]',
      features = '[]',
      stock = 0,
      is_exclusive = false,
      is_bestseller = false,
      is_active = true,
      is_vault = false,
      release_date,
    } = q.body || {};

    const normalizedCategoryId = Number(category_id);
    const normalizedPrice = Number(price);
    const normalizedStock = Number(stock);
    const normalizedIsExclusive = parseProductBoolean(is_exclusive, 'is_exclusive');
    const normalizedIsBestseller = parseProductBoolean(is_bestseller, 'is_bestseller');
    const normalizedIsActive = parseProductBoolean(is_active, 'is_active');
    const normalizedIsVault = parseProductBoolean(is_vault, 'is_vault');

    if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId < 1) {
      return s.status(400).json({
        error: 'A valid category is required.',
        code: 'INVALID_CATEGORY_ID',
      });
    }

    const categoryResult = await db.query(
      'SELECT 1 FROM categories WHERE id = $1',
      [normalizedCategoryId]
    );

    if (categoryResult.rowCount === 0) {
      return s.status(400).json({
        error: 'A valid category is required.',
        code: 'INVALID_CATEGORY_ID',
      });
    }

    if (!String(name || '').trim() || !String(slug || '').trim()) {
      return s.status(400).json({
        error: 'Product name and slug are required.',
        code: 'INVALID_PRODUCT_FIELDS',
      });
    }

    if (
      !Number.isFinite(normalizedPrice) ||
      normalizedPrice < 0 ||
      !Number.isFinite(normalizedStock) ||
      normalizedStock < 0
    ) {
      return s.status(400).json({
        error: 'Product price and stock must be valid non-negative numbers.',
        code: 'INVALID_PRODUCT_NUMBERS',
      });
    }

    const filesArray = asFiles(q.files);
    if (filesArray.length > 3) {
      return s.status(400).json({
        error: 'No more than 3 image files can be uploaded at once.',
        code: 'TOO_MANY_IMAGE_FILES',
      });
    }

    parseReplacementFlag(q.body?.replace_images);
    const existingImages = normalizeImageReferences(
      parseImageList(
        Object.prototype.hasOwnProperty.call(q.body || {}, 'existingImages')
          ? q.body.existingImages
          : undefined,
        'existingImages'
      ),
      q
    );
    const uploadSlots = parseImageSlots(
      q.body?.upload_slots,
      filesArray.length,
      'upload_slots'
    );
    const existingSlots = parseImageSlots(
      q.body?.existing_slots,
      existingImages.length,
      'existing_slots'
    );
    const placeholderImages = filesArray.map((_, index) => `upload:${index}`);
    const imageSlots = orderedImageUrls({
      uploadedImages: placeholderImages,
      existingImages,
      uploadSlots,
      existingSlots,
    });
    await ensureManagedImagesExist(existingImages, q);

    uploadedImages = await saveUploadedImages(filesArray, q);

    const allImages = orderedImageUrls({
      uploadedImages,
      existingImages,
      uploadSlots,
      existingSlots,
    });
    if (allImages.length !== imageSlots.length) {
      throw imageError('The submitted image list is inconsistent.');
    }

    const client = await db.pool.connect();
    let product;
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        INSERT INTO products (
          category_id,
          name,
          slug,
          description,
          price,
          material,
          subcategory,
          shop_for,
          features,
          stock,
          is_exclusive,
          is_bestseller,
          is_active,
          is_vault,
          release_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        normalizedCategoryId,
        String(name).trim(),
        String(slug).trim(),
        description,
        normalizedPrice,
        material,
        subcategory,
        JSON.stringify(normalizeFilterOptions(shop_for)),
        JSON.stringify(normalizeFilterOptions(features)),
        normalizedStock,
        normalizedIsExclusive,
        normalizedIsBestseller,
        normalizedIsActive,
        normalizedIsVault,
        release_date || new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
      ]);

      product = result.rows[0];
      await writeImages(product.id, allImages, client);
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[ADMIN_PRODUCT_CREATE_ROLLBACK_FAILED]', {
          code: rollbackError.code || 'DATABASE_ROLLBACK_FAILED',
        });
      }
      throw error;
    } finally {
      client.release();
    }

    const decorated = await decorate([product]);
    return s.status(201).json(decorated[0]);
  } catch (err) {
    if (!committed && uploadedImages.length) {
      await cleanupReferences(uploadedImages, q);
    }
    const productError = safeUploadError(err);
    console.error('[ADMIN_CRUD_ERROR]', productError);

    return s.status(400).json({
      error: `Could not create the product: ${productError.message}`,
      code: productError.code,
    });
  }
});

router.put('/products/:id', async (q, s) => {
  let uploadedImages = [];
  let committed = false;
  try {
    const currentResult = await db.query(
      'SELECT * FROM products WHERE id = $1',
      [q.params.id]
    );

    const current = currentResult.rows[0];

    if (!current) {
      return s.status(404).json({ error: 'Product not found.' });
    }

    const previousImages = await db.query(
      `SELECT id, image_url, sort_order
       FROM product_images
       WHERE product_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [q.params.id]
    );

    const replaceImages = parseReplacementFlag(q.body?.replace_images);
    const hasExistingImages = Object.prototype.hasOwnProperty.call(
      q.body || {},
      'existingImages'
    );
    const filesArray = asFiles(q.files);
    if (filesArray.length > 3) {
      throw imageError(
        'No more than 3 image files can be uploaded at once.',
        'TOO_MANY_IMAGE_FILES'
      );
    }
    const existingImages = normalizeImageReferences(
      hasExistingImages
        ? parseImageList(q.body.existingImages, 'existingImages')
        : [],
      q
    );
    const uploadSlots = parseImageSlots(
      q.body?.upload_slots,
      filesArray.length,
      'upload_slots'
    );
    const existingSlots = parseImageSlots(
      q.body?.existing_slots,
      existingImages.length,
      'existing_slots'
    );
    const replacementRequested =
      replaceImages || hasExistingImages || filesArray.length > 0;
    if (
      !replacementRequested &&
      (q.body?.upload_slots !== undefined || q.body?.existing_slots !== undefined)
    ) {
      throw imageError('Image slots were submitted without an image replacement.');
    }

    const previousReferences = previousImages.rows.map((row) => row.image_url);
    const previousReferenceSet = new Set(previousReferences);
    for (const image of existingImages) {
      if (
        (mediaStore.isStratusReference(image) ||
          mediaStore.isCatalystReference(image)) &&
        !previousReferenceSet.has(image)
      ) {
        throw imageError(
          'Only images already assigned to this product can be retained.',
          'INVALID_IMAGE_REFERENCE'
        );
      }
    }
    await ensureManagedImagesExist(existingImages, q);

    const updates = { ...q.body };
    delete updates.existingImages;
    delete updates.images;
    delete updates.upload_slots;
    delete updates.existing_slots;
    delete updates.replace_images;

    if (updates.shop_for !== undefined) updates.shop_for = JSON.stringify(normalizeFilterOptions(updates.shop_for));
    if (updates.features !== undefined) updates.features = JSON.stringify(normalizeFilterOptions(updates.features));

    const productColumns = new Set([
      'category_id',
      'name',
      'slug',
      'description',
      'price',
      'material',
      'subcategory',
      'shop_for',
      'features',
      'stock',
      'is_exclusive',
      'is_bestseller',
      'is_active',
      'is_vault',
      'release_date',
    ]);

    Object.keys(updates).forEach((key) => {
      if (!productColumns.has(key)) {
        delete updates[key];
      }
    });

    if (updates.category_id !== undefined) {
      const normalizedCategoryId = Number(updates.category_id);

      if (
        !Number.isInteger(normalizedCategoryId) ||
        normalizedCategoryId < 1
      ) {
        return s.status(400).json({
          error: 'A valid category is required.',
          code: 'INVALID_CATEGORY_ID',
        });
      }

      const categoryResult = await db.query(
        'SELECT 1 FROM categories WHERE id = $1',
        [normalizedCategoryId]
      );

      if (categoryResult.rowCount === 0) {
        return s.status(400).json({
          error: 'A valid category is required.',
          code: 'INVALID_CATEGORY_ID',
        });
      }

      updates.category_id = normalizedCategoryId;
    }

    if (
      updates.name !== undefined &&
      !String(updates.name || '').trim()
    ) {
      return s.status(400).json({
        error: 'Product name cannot be empty.',
        code: 'INVALID_PRODUCT_FIELDS',
      });
    }

    if (
      updates.slug !== undefined &&
      !String(updates.slug || '').trim()
    ) {
      return s.status(400).json({
        error: 'Product slug cannot be empty.',
        code: 'INVALID_PRODUCT_FIELDS',
      });
    }

    ['is_exclusive', 'is_bestseller', 'is_active', 'is_vault'].forEach(
      (key) => {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          updates[key] = parseProductBoolean(updates[key], key);
        }
      }
    );

    if (updates.price !== undefined) {
      if (typeof updates.price === 'string' && !updates.price.trim()) {
        return s.status(400).json({
          error: 'Product price must be a valid non-negative number.',
          code: 'INVALID_PRODUCT_NUMBERS',
        });
      }
      updates.price = Number(updates.price);
    }

    if (updates.stock !== undefined) {
      if (typeof updates.stock === 'string' && !updates.stock.trim()) {
        return s.status(400).json({
          error: 'Product stock must be a valid non-negative number.',
          code: 'INVALID_PRODUCT_NUMBERS',
        });
      }
      updates.stock = Number(updates.stock);
    }

    if (
      updates.price !== undefined &&
      (!Number.isFinite(updates.price) || updates.price < 0)
    ) {
      return s.status(400).json({
        error: 'Product price must be a valid non-negative number.',
        code: 'INVALID_PRODUCT_NUMBERS',
      });
    }

    if (
      updates.stock !== undefined &&
      (!Number.isFinite(updates.stock) || updates.stock < 0)
    ) {
      return s.status(400).json({
        error: 'Product stock must be a valid non-negative number.',
        code: 'INVALID_PRODUCT_NUMBERS',
      });
    }

    const placeholders = filesArray.map((_, index) => `upload:${index}`);
    const plannedImages = replacementRequested
      ? orderedImageUrls({
          uploadedImages: placeholders,
          existingImages,
          uploadSlots,
          existingSlots,
        })
      : null;

    uploadedImages = await saveUploadedImages(filesArray, q);
    const allImages = replacementRequested
      ? orderedImageUrls({
          uploadedImages,
          existingImages,
          uploadSlots,
          existingSlots,
        })
      : null;
    if (plannedImages && allImages && plannedImages.length !== allImages.length) {
      throw imageError('The submitted image list is inconsistent.');
    }

    const client = await db.pool.connect();
    let updatedProduct;
    try {
      await client.query('BEGIN');
      const lockedProduct = await client.query(
        'SELECT id FROM products WHERE id = $1 FOR UPDATE',
        [q.params.id]
      );
      if (lockedProduct.rowCount === 0) {
        throw imageError('Product not found.', 'PRODUCT_NOT_FOUND');
      }
      const lockedImages = await client.query(
        `SELECT id, image_url, sort_order
         FROM product_images
         WHERE product_id = $1
         ORDER BY sort_order ASC, id ASC
         FOR UPDATE`,
        [q.params.id]
      );
      if (!sameImageSnapshot(previousImages.rows, lockedImages.rows)) {
        throw imageError(
          'Product images changed while this update was being prepared. Reload and try again.',
          'IMAGE_LIST_CHANGED'
        );
      }

    const updateKeys = Object.keys(updates);

    if (updateKeys.length > 0) {
      const values = updateKeys.map((key) => updates[key]);
      const setClause = updateKeys
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      values.push(q.params.id);

      await client.query(
        `UPDATE products SET ${setClause} WHERE id = $${values.length}`,
        values
      );
    }

      if (replacementRequested) {
        await writeImages(q.params.id, allImages, client);
      }

      const updatedResult = await client.query(
        'SELECT * FROM products WHERE id = $1',
        [q.params.id]
      );
      updatedProduct = updatedResult.rows[0];
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[ADMIN_PRODUCT_UPDATE_ROLLBACK_FAILED]', {
          code: rollbackError.code || 'DATABASE_ROLLBACK_FAILED',
        });
      }
      throw error;
    } finally {
      client.release();
    }

    if (replacementRequested) {
      await cleanupReferences(
        previousReferences.filter((image) => !allImages.includes(image)),
        q
      );
    }

    const decorated = await decorate([updatedProduct]);

    return s.json(decorated[0]);
  } catch (err) {
    if (!committed && uploadedImages.length) {
      await cleanupReferences(uploadedImages, q);
    }
    const productError = safeUploadError(err);
    console.error('[ADMIN_CRUD_ERROR]', productError);

    return s.status(err.status || (err.code === 'PRODUCT_NOT_FOUND' ? 404 : err.code === 'IMAGE_LIST_CHANGED' ? 409 : 400)).json({
      error: `Could not update the product: ${productError.message}`,
      code: productError.code,
    });
  }
});
router.delete('/products/:id', async (q, s) => {
  let client;
  let images = [];
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const product = await client.query(
      'SELECT id FROM products WHERE id = $1 FOR UPDATE',
      [q.params.id]
    );
    if (product.rowCount === 0) {
      await client.query('ROLLBACK');
      return s.status(404).json({
        error: 'Product not found.',
      });
    }

    const orderReference = await client.query(
      'SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1',
      [q.params.id]
    );

    if (orderReference.rowCount > 0) {
      await client.query('ROLLBACK');
      return s.status(409).json({
        error: 'This product is referenced by an order and cannot be deleted.',
      });
    }

    const imageResult = await client.query(
      'SELECT image_url FROM product_images WHERE product_id = $1',
      [q.params.id]
    );
    images = imageResult.rows.map((row) => row.image_url);
    const result = await client.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [q.params.id]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return s.status(404).json({
        error: 'Product not found.',
      });
    }

    await client.query('COMMIT');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[ADMIN_PRODUCT_DELETE_ROLLBACK_FAILED]', {
          code: rollbackError.code || 'DATABASE_ROLLBACK_FAILED',
        });
      }
    }
    console.error('[ADMIN_PRODUCT_DELETE_FAILED]', error.message);

    return s.status(400).json({
      error: 'Could not delete the product.',
    });
  } finally {
    if (client) client.release();
  }

  await cleanupReferences(images, q);
  return s.json({ success: true });
});

const keys = ['pearls', 'gold', 'ocean'];

router.get('/collection-tiles', async (q, s) => {
  try {
    const result = await db.query(`
      SELECT tile_key, label, subtitle, image_url, link_path
      FROM collection_tiles
      ORDER BY id
    `);

    return s.json(result.rows);
  } catch (error) {
    console.error('[ADMIN_COLLECTION_TILES_LIST_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not load collection tiles.',
    });
  }
});

router.put('/collection-tiles/:tile_key', async (q, s) => {
  const { label } = q.body || {};
  const cleanLabel = String(label || '').trim();

  if (!keys.includes(q.params.tile_key)) {
    return s.status(400).json({ error: 'Invalid tile key.' });
  }

  if (!cleanLabel) {
    return s.status(400).json({ error: 'label is required.' });
  }

  try {
    const result = await db.query(`
      UPDATE collection_tiles
      SET label = $1
      WHERE tile_key = $2
      RETURNING tile_key, label, subtitle, image_url, link_path
    `, [cleanLabel, q.params.tile_key]);

    if (result.rowCount === 0) {
      return s.status(404).json({ error: 'Collection tile not found.' });
    }

    return s.json(result.rows[0]);
  } catch (error) {
    console.error('[ADMIN_COLLECTION_TILE_UPDATE_FAILED]', error.message);
    return s.status(400).json({
      error: 'Could not update the collection tile label.',
    });
  }
});

router.get('/tile-products/:tile_key', async (q, s) => {
  if (!keys.includes(q.params.tile_key)) {
    return s.status(400).json({
      error: 'Invalid tile key.',
    });
  }

  try {
    const result = await db.query(`
      SELECT
        p.*,
        tp.id AS tile_product_id
      FROM products p
      JOIN tile_products tp ON tp.product_id = p.id
      WHERE tp.tile_key = $1
      ORDER BY tp.sort_order, tp.id
    `, [q.params.tile_key]);

    return s.json(await decorate(result.rows));
  } catch (error) {
    console.error('[ADMIN_TILE_PRODUCTS_LIST_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not load tile products.',
    });
  }
});

router.post('/tile-products', async (q, s) => {
  const {
    tile_key,
    product_id,
    sort_order = 0,
  } = q.body || {};

  if (!keys.includes(tile_key) || !product_id) {
    return s.status(400).json({
      error: 'tile_key and product_id are required.',
    });
  }

  try {
    const result = await db.query(`
      INSERT INTO tile_products (
        tile_key,
        product_id,
        sort_order
      )
      VALUES ($1, $2, $3)
      RETURNING *
    `, [
      tile_key,
      product_id,
      sort_order,
    ]);

    return s.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'This product is already assigned to that tile.',
      });
    }

    console.error('[ADMIN_TILE_PRODUCT_CREATE_FAILED]', error.message);

    return s.status(400).json({
      error: 'Could not assign the product to the tile.',
    });
  }
});

router.delete('/tile-products/:id', async (q, s) => {
  try {
    const result = await db.query(
      'DELETE FROM tile_products WHERE id = $1 RETURNING id',
      [q.params.id]
    );

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Tile product not found.',
      });
    }

    return s.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_TILE_PRODUCT_DELETE_FAILED]', error.message);

    return s.status(400).json({
      error: 'Could not remove the product from the tile.',
    });
  }
});
router.get('/paara-irl', async (q, s) => {
  try {
    const result = await db.query(
      'SELECT * FROM paara_irl WHERE id = 1'
    );

    const row = result.rows[0] || null;

    return s.json(
      row
        ? {
            ...row,
            image_url: publicHomepageImageUrl(row.image_url),
            owner_image_url: publicHomepageImageUrl(row.owner_image_url),
          }
        : null
    );
  } catch (error) {
    console.error('[ADMIN_PAARA_IRL_GET_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not load Paara IRL data.',
    });
  }
});

router.put('/paara-irl', async (q, s) => {
  try {
    const {
      image_url,
      owner_image_url,
      caption,
    } = q.body || {};

    const uploadSlots = Array.isArray(q.body?.upload_slots)
      ? q.body.upload_slots
      : [q.body?.upload_slots].filter(Boolean);

    const files = asFiles(q.files);
    const previousResult = await db.query(
      'SELECT image_url, owner_image_url FROM paara_irl WHERE id = 1'
    );
    const previousImages = previousResult.rows[0] || {};

    const uploadedImages = await Promise.all(
      files.map((file, index) =>
        saveUploadedImage(
          file,
          uploadSlots[index] === 'owner'
            ? 'owner'
            : 'paara-irl',
          q
        )
      )
    );

    const uploadedBySlot = Object.fromEntries(
      files.map((file, index) => [
        uploadSlots[index] || 'image',
        uploadedImages[index],
      ])
    );

    const nextImageUrl =
      uploadedBySlot.image || mediaStore.toStorageReference(image_url, q);

    const nextOwnerImageUrl =
      uploadedBySlot.owner || mediaStore.toStorageReference(owner_image_url, q);

    if (
      String(image_url || '').startsWith('data:') &&
      !uploadedBySlot.image
    ) {
      throw Object.assign(
        new Error(
          'Upload the image file instead of pasting image data.'
        ),
        { code: 'BASE64_IMAGE_NOT_ALLOWED' }
      );
    }

    if (
      String(owner_image_url || '').startsWith('data:') &&
      !uploadedBySlot.owner
    ) {
      throw Object.assign(
        new Error(
          'Upload the image file instead of pasting image data.'
        ),
        { code: 'BASE64_IMAGE_NOT_ALLOWED' }
      );
    }

    await db.query(`
      INSERT INTO paara_irl (
        id,
        image_url,
        owner_image_url,
        caption,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        1,
        $1,
        $2,
        $3,
        0,
        TRUE,
        to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
        to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      )
      ON CONFLICT (id) DO UPDATE SET
        image_url = EXCLUDED.image_url,
        owner_image_url = EXCLUDED.owner_image_url,
        caption = EXCLUDED.caption,
        updated_at = to_char(
          CURRENT_TIMESTAMP,
          'YYYY-MM-DD HH24:MI:SS'
        )
    `, [
      nextImageUrl || '',
      nextOwnerImageUrl || null,
      caption || null,
    ]);

    const result = await db.query(
      'SELECT * FROM paara_irl WHERE id = 1'
    );

    const row = result.rows[0];
    await deleteIfUnreferenced(
      [
        previousImages.image_url,
        previousImages.owner_image_url,
      ].filter(
        (image) =>
          image &&
          ![nextImageUrl, nextOwnerImageUrl].includes(image)
      ),
      q
    );

    return s.json({
      ...row,
      image_url: publicImageUrl(row.image_url),
      owner_image_url: publicImageUrl(row.owner_image_url),
    });
  } catch (error) {
    const uploadError = safeUploadError(error);

    console.error(
      'Paara IRL image update failed:',
      error
    );

    const clientErrorCodes = new Set([
      'BASE64_IMAGE_NOT_ALLOWED',
      'INVALID_IMAGE_UPLOAD',
      'BLOB_STORAGE_NOT_CONFIGURED',
      'BLOB_URL_MISSING',
    ]);

    return s
      .status(clientErrorCodes.has(uploadError.code) ? 400 : 500)
      .json({
        error: uploadError.message,
        code: uploadError.code,
      });
  }
});

router.get('/paara-story', async (q, s) => {
  try {
    const result = await db.query(
      'SELECT * FROM paara_story WHERE id = 1'
    );

    const row = result.rows[0];

    return s.json(row || {
      id: 1,
      title: 'A dream shaped by fashion. A brand built with purpose.',
      description: '',
    });
  } catch (error) {
  if (error.code === '42P01') {
    console.warn(
      '[PAARA_STORY_TABLE_MISSING] Serving default story content.'
    );

    return s.json({
      id: 1,
      title: 'A dream shaped by fashion. A brand built with purpose.',
      description: '',
    });
  }

  console.error(
    '[ADMIN_PAARA_STORY_GET_FAILED]',
    error.message
  );

  return s.status(500).json({
    error: 'Could not load Paara Story.',
  });
}
});

router.put('/paara-story', async (q, s) => {
  try {
    const { title, description } = q.body || {};

    if (!title || !description) {
      return s.status(400).json({
        error: 'Title and description are required.',
      });
    }

    await db.query(`
      INSERT INTO paara_story (
        id,
        title,
        description,
        created_at,
        updated_at
      )
      VALUES (
        1,
        $1,
        $2,
        to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
        to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at = to_char(
          CURRENT_TIMESTAMP,
          'YYYY-MM-DD HH24:MI:SS'
        )
    `, [
      title || '',
      description || '',
    ]);

    const result = await db.query(
      'SELECT * FROM paara_story WHERE id = 1'
    );

    return s.json(result.rows[0]);
  } catch (error) {
    console.error('[ADMIN_PAARA_STORY_PUT_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not save Paara Story.',
    });
  }
});

router.get('/worn-by-you', async (q, s) => {
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
    `);

    return s.json(result.rows.map((row) => ({
      ...row,
      image_url: publicHomepageImageUrl(row.image_url),
    })));
  } catch (error) {
    console.error('[ADMIN_WORN_BY_YOU_GET_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not load Worn By You entries.',
    });
  }
});

router.put('/worn-by-you', async (q, s) => {
  let slots = q.body?.slots;

  if (typeof slots === 'string') {
    try {
      slots = JSON.parse(slots);
    } catch {
      slots = null;
    }
  }

  if (!Array.isArray(slots) || slots.length !== 3) {
    return s.status(400).json({
      error: 'Exactly 3 Worn By You slots are required.',
    });
  }

  try {
    const uploadSlots = Array.isArray(q.body?.upload_slots)
      ? q.body.upload_slots
      : [q.body?.upload_slots].filter(Boolean);

    const files = asFiles(q.files);
    const previousResult = await db.query(`
      SELECT id, image_url
      FROM instagram_reviews
      WHERE product_id IS NULL
        AND sort_order BETWEEN 0 AND 2
    `);
    const previousImages = new Map(
      previousResult.rows.map((row) => [Number(row.id), row.image_url])
    );

    const uploadedImages = await Promise.all(
      files.map((file) =>
        saveUploadedImage(file, 'worn-by-you', q)
      )
    );

    const uploadedBySlot = Object.fromEntries(
      files.map((file, index) => [
        uploadSlots[index],
        uploadedImages[index],
      ])
    );

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const saved = [];

      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const slot = slots[slotIndex] || {};

        const imageUrl =
          uploadedBySlot[String(slotIndex)] ||
          mediaStore.toStorageReference(slot.image_url, q) ||
          '';

        const caption = slot.caption || null;
        const instagramPostUrl = slot.instagram_post_url || '';
        const likes = Number(slot.likes) || 0;

        const targetId = Number(slot.id);

        if (Number.isInteger(targetId) && targetId > 0) {
          const result = await client.query(`
            UPDATE instagram_reviews
            SET image_url = $1,
                caption = $2,
                instagram_post_url = $3,
                likes = $4,
                sort_order = $5,
                cached_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
                updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
            WHERE id = $6
              AND product_id IS NULL
            RETURNING *
          `, [
            imageUrl,
            caption,
            instagramPostUrl,
            likes,
            slotIndex,
            targetId,
          ]);

          if (result.rowCount !== 1) {
            throw new Error(
              `Worn By You slot ${targetId} could not be updated.`
            );
          }

          saved.push(result.rows[0]);
        } else {
          const result = await client.query(`
            INSERT INTO instagram_reviews (
              product_id,
              instagram_post_url,
              image_url,
              caption,
              likes,
              sort_order,
              cached_at,
              updated_at
            )
            VALUES (
              NULL,
              $1,
              $2,
              $3,
              $4,
              $5,
              to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
              to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
            )
            RETURNING *
          `, [
            instagramPostUrl,
            imageUrl,
            caption,
            likes,
            slotIndex,
          ]);

          saved.push(result.rows[0]);
        }
      }

      await client.query('COMMIT');
      await deleteIfUnreferenced(
        [...previousImages.entries()]
          .filter(
            ([id, image]) =>
              image &&
              !saved.some(
                (row) =>
                  Number(row.id) === id &&
                  row.image_url === image
              )
          )
          .map(([, image]) => image),
        q
      );

      return s.json({
        success: true,
        slots: saved.map((row) => ({
          ...row,
          image_url: publicHomepageImageUrl(row.image_url),
        })),
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const uploadError = safeUploadError(error);

    console.error('Worn By You image update failed:', error);

    return s.status(400).json({
      error: uploadError.message,
      code: uploadError.code,
    });
  }
});
router.delete('/worn-by-you/:id', async (q, s) => {
  try {
    const existing = await db.query(
      'SELECT image_url FROM instagram_reviews WHERE id = $1 AND product_id IS NULL',
      [q.params.id]
    );
    const result = await db.query(`
      UPDATE instagram_reviews
      SET image_url = '',
          caption = NULL,
          instagram_post_url = '',
          likes = 0,
          updated_at = to_char(
            CURRENT_TIMESTAMP,
            'YYYY-MM-DD HH24:MI:SS'
          )
      WHERE id = $1
        AND product_id IS NULL
        AND sort_order BETWEEN 0 AND 2
      RETURNING id
    `, [q.params.id]);

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Worn By You entry not found.',
      });
    }

    await deleteIfUnreferenced(
      existing.rows.map((row) => row.image_url),
      q
    );
    return s.json({
      success: true,
      id: Number(q.params.id),
    });
  } catch (error) {
    console.error('[ADMIN_WORN_BY_YOU_DELETE_FAILED]', error.message);

    return s.status(400).json({
      error: 'Could not delete the Worn By You entry.',
    });
  }
});

router.get('/coupons', async (q, s) => {
  try {
    const result = await db.query(
      'SELECT * FROM coupons ORDER BY created_at DESC'
    );

    return s.json(result.rows);
  } catch (error) {
    console.error('[ADMIN_COUPONS_GET_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not load coupons.',
    });
  }
});
router.post('/coupons', async (q, s) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    deadline,
    is_active,
  } = q.body || {};

  if (
    !code ||
    !['percent', 'flat'].includes(discount_type) ||
    !discount_value ||
    !deadline
  ) {
    return s.status(400).json({
      error: 'Invalid coupon data.',
    });
  }

  try {
    const result = await db.query(`
      INSERT INTO coupons (
        code,
        description,
        discount_type,
        discount_value,
        deadline,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      String(code).trim().toUpperCase(),
      description || null,
      discount_type,
      Number(discount_value),
      deadline,
      normalizeFormBoolean(is_active, false),
    ]);

    return s.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'A coupon with this code already exists.',
      });
    }

    console.error('[ADMIN_COUPON_CREATE_FAILED]', error.message);

    return s.status(400).json({
      error: 'Could not create the coupon.',
    });
  }
});

router.put('/coupons/:id', async (q, s) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    deadline,
    is_active,
  } = q.body || {};

  if (
    !code ||
    !['percent', 'flat'].includes(discount_type) ||
    discount_value === undefined ||
    !deadline
  ) {
    return s.status(400).json({
      error: 'Invalid coupon data.',
    });
  }

  try {
    const result = await db.query(`
      UPDATE coupons
      SET code = $1,
          description = $2,
          discount_type = $3,
          discount_value = $4,
          deadline = $5,
          is_active = $6
      WHERE id = $7
      RETURNING *
    `, [
      String(code).trim().toUpperCase(),
      description || null,
      discount_type,
      Number(discount_value),
      deadline,
      normalizeFormBoolean(is_active, false),
      q.params.id,
    ]);

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Coupon not found.',
      });
    }

    return s.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'A coupon with this code already exists.',
      });
    }

    console.error('[ADMIN_COUPON_UPDATE_FAILED]', error.message);

    return s.status(400).json({
      error: 'Could not update the coupon.',
    });
  }
});
router.delete('/coupons/:id', async (q, s) => {
  try {
    const result = await db.query(
      'DELETE FROM coupons WHERE id = $1 RETURNING id',
      [q.params.id]
    );

    if (result.rowCount === 0) {
      return s.status(404).json({ error: 'Coupon not found.' });
    }

    return s.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_COUPON_DELETE_FAILED]', error.message);
    return s.status(400).json({
      error: 'Could not delete the coupon.',
    });
  }
});

router.get('/gift-card-rules', async (q, s) => {
  try {
    const result = await db.query(`
      SELECT
        r.*,
        p.name AS product_name,
        p.price AS product_price
      FROM gift_card_rules r
      JOIN products p ON p.id = r.product_id
      ORDER BY r.created_at DESC
    `);

    return s.json(result.rows);
  } catch (error) {
    console.error('[ADMIN_GIFT_CARD_RULES_GET_FAILED]', error.message);
    return s.status(500).json({
      error: 'Could not load gift card rules.',
    });
  }
});

router.post('/gift-card-rules', async (q, s) => {
  const {
    product_id,
    gift_card_value,
    is_active = true,
  } = q.body || {};

  if (
    !product_id ||
    !Number.isFinite(Number(gift_card_value)) ||
    Number(gift_card_value) <= 0
  ) {
    return s.status(400).json({
      error: 'Invalid gift card rule data.',
    });
  }

  try {
    const result = await db.query(`
      INSERT INTO gift_card_rules (
        product_id,
        gift_card_value,
        is_active
      )
      VALUES ($1, $2, $3)
      RETURNING *
    `, [
      product_id,
      Number(gift_card_value),
      normalizeFormBoolean(is_active, true),
    ]);

    return s.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'A loyalty rule already exists for this product.',
      });
    }

    console.error('[ADMIN_GIFT_CARD_RULE_CREATE_FAILED]', error.message);
    return s.status(400).json({
      error: 'Could not create the loyalty rule.',
    });
  }
});

router.put('/gift-card-rules/:id', async (q, s) => {
  const {
    product_id,
    gift_card_value,
    is_active,
  } = q.body || {};

  if (
    !product_id ||
    !Number.isFinite(Number(gift_card_value)) ||
    Number(gift_card_value) <= 0
  ) {
    return s.status(400).json({
      error: 'Invalid gift card rule data.',
    });
  }

  try {
    const result = await db.query(`
      UPDATE gift_card_rules
      SET product_id = $1,
          gift_card_value = $2,
          is_active = $3,
          updated_at = to_char(
            CURRENT_TIMESTAMP,
            'YYYY-MM-DD HH24:MI:SS'
          )
      WHERE id = $4
      RETURNING *
    `, [
      product_id,
      Number(gift_card_value),
      normalizeFormBoolean(is_active, false),
      q.params.id,
    ]);

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Gift card rule not found.',
      });
    }

    return s.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return s.status(409).json({
        error: 'A loyalty rule already exists for this product.',
      });
    }

    console.error('[ADMIN_GIFT_CARD_RULE_UPDATE_FAILED]', error.message);
    return s.status(400).json({
      error: 'Could not update the loyalty rule.',
    });
  }
});

router.delete('/gift-card-rules/:id', async (q, s) => {
  try {
    const result = await db.query(
      'DELETE FROM gift_card_rules WHERE id = $1 RETURNING id',
      [q.params.id]
    );

    if (result.rowCount === 0) {
      return s.status(404).json({
        error: 'Gift card rule not found.',
      });
    }

    return s.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_GIFT_CARD_RULE_DELETE_FAILED]', error.message);
    return s.status(400).json({
      error: 'Could not delete the gift card rule.',
    });
  }
});

router.get('/loyalty-settings', async (q, s) => {
  try {
    const result = await db.query(
      'SELECT reward_threshold FROM loyalty_settings WHERE id = 1'
    );
    return s.json({ reward_threshold: Number(result.rows[0]?.reward_threshold || 19) });
  } catch (error) {
    console.error('[ADMIN_LOYALTY_SETTINGS_GET_FAILED]', error.message);
    return s.status(500).json({ error: 'Could not load loyalty settings.' });
  }
});

router.put('/loyalty-settings', async (q, s) => {
  const threshold = Number(q.body?.reward_threshold);

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return s.status(400).json({ error: 'Enter a valid loyalty threshold.' });
  }

  try {
    const result = await db.query(`
      INSERT INTO loyalty_settings (id, reward_threshold, updated_at)
      VALUES (1, $1, to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
      ON CONFLICT (id) DO UPDATE
      SET reward_threshold = EXCLUDED.reward_threshold,
          updated_at = EXCLUDED.updated_at
      RETURNING reward_threshold
    `, [threshold]);
    return s.json({ reward_threshold: Number(result.rows[0].reward_threshold) });
  } catch (error) {
    console.error('[ADMIN_LOYALTY_SETTINGS_UPDATE_FAILED]', error.message);
    return s.status(400).json({ error: 'Could not save loyalty settings.' });
  }
});
router.get('/orders', async (q, s) => {
  try {
    const result = await db.query(`
      SELECT
        o.*,
        c.name AS customer_name,
        c.email AS customer_email,
        d.shipping_line1,
        d.shipping_line2,
        d.shipping_city,
        d.shipping_state,
        d.shipping_pincode,
        d.shipping_country
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN customer_order_details d ON d.order_id = o.id
      ORDER BY o.created_at DESC
    `);

    const orders = result.rows;
    if (orders.length > 0) {
      const { rows: items } = await db.query(
        'SELECT order_id, product_name, quantity FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id ASC',
        [orders.map((order) => order.id)]
      );
      const itemsByOrderId = new Map();
      for (const item of items) {
        const orderItems = itemsByOrderId.get(item.order_id) || [];
        orderItems.push(item);
        itemsByOrderId.set(item.order_id, orderItems);
      }
      for (const order of orders) order.items = itemsByOrderId.get(order.id) || [];
    }

    return s.json(orders);
  } catch (error) {
    console.error('[ADMIN_ORDERS_GET_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not load orders.',
    });
  }
});

const ORDER_STAGES = [
  'Order Confirmed',
  'Packed',
  'Shipped',
  'Delivered',
];

router.patch('/orders/:id/status', async (q, s) => {
  const orderId = Number.parseInt(q.params.id, 10);
  const requestedStatus = String(q.body?.status || '').trim();

  if (!Number.isInteger(orderId) || orderId < 1) {
    return s.status(400).json({
      error: 'A valid order ID is required.',
    });
  }

  if (!ORDER_STAGES.includes(requestedStatus)) {
    return s.status(400).json({
      error: 'Invalid order status.',
    });
  }

  try {
    const existingResult = await db.query(`
      SELECT
        id,
        status,
        payment_method,
        payment_status,
        payment_reference
      FROM orders
      WHERE id = $1
    `, [orderId]);

    const existing = existingResult.rows[0];

    if (!existing) {
      return s.status(404).json({
        error: 'Order not found.',
      });
    }

    const currentIndex =
      ORDER_STAGES.indexOf(
        String(existing.status || '').trim()
      ) >= 0
        ? ORDER_STAGES.indexOf(
            String(existing.status || '').trim()
          )
        : 0;

    const nextIndex = ORDER_STAGES.indexOf(requestedStatus);

    if (nextIndex < currentIndex) {
      return s.status(400).json({
        error: 'Order statuses can only move forward.',
      });
    }

    if (
      requestedStatus === 'Packed' &&
      existing.payment_method === 'manual_upi' &&
      existing.payment_status !== 'verified'
    ) {
      return s.status(400).json({
        error: 'Payment must be verified before this order can be packed.',
      });
    }

    await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      [requestedStatus, orderId]
    );

    return s.json({
      success: true,
      order_id: orderId,
      status: requestedStatus,
    });
  } catch (error) {
    console.error('[ADMIN_ORDER_STATUS_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not update the order status.',
    });
  }
});
router.post('/orders/:id/verify-manual-payment', async (q, s) => {
  const orderId = Number.parseInt(q.params.id, 10);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return s.status(400).json({
      error: 'A valid order ID is required.',
    });
  }

  try {
    const orderResult = await db.query(`
      SELECT
        o.id,
        o.customer_id,
        o.order_number,
        o.payment_method,
        o.payment_status,
        o.payment_reference,
        o.total_amount,
        c.email,
        c.name
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1
    `, [orderId]);

    const order = orderResult.rows[0];

    if (!order) {
      return s.status(404).json({ error: 'Order not found.' });
    }

    if (order.payment_method !== 'manual_upi') {
      return s.status(400).json({
        error: 'This order is not a manual UPI order.',
      });
    }

    if (q.body?.confirmed !== true) {
      return s.status(400).json({
        error: 'Confirm that you verified this payment in your UPI or bank app before unlocking packing.',
      });
    }

    if (order.payment_status === 'verified') {
      const loyalty = await processLoyaltyOrder(
        orderId,
        order.customer_id
      );

      return s.json({
        success: true,
        order_id: orderId,
        payment_status: 'verified',
        loyalty,
        message: 'Manual UPI payment was already verified.',
      });
    }

    const updated = await db.query(`
      UPDATE orders
      SET payment_status = 'verified',
          payment_verified_at = to_char(
            CURRENT_TIMESTAMP,
            'YYYY-MM-DD HH24:MI:SS'
          ),
          payment_rejected_at = NULL
      WHERE id = $1
      RETURNING id
    `, [orderId]);

    if (updated.rowCount !== 1) {
      return s.status(409).json({
        error: 'The payment could not be verified. Refresh the order and try again.',
      });
    }

    if (order.email) {
      const { trySendEmail } = require('../utils/email');

      await trySendEmail({
        to: order.email,
        subject: `Order confirmed � ${order.order_number || `Order ${order.id}`}`,
        text: `Hi ${order.name || 'Customer'},

Your payment has been verified and your Paara Jewellery order is confirmed.
Order: ${order.order_number || order.id}
Amount: ?${Number(order.total_amount || 0).toLocaleString('en-IN')}

Thank you for shopping with Paara Jewellery.`,
      }, `manual UPI confirmation email for order ${order.order_number || order.id}`);
    } else {
      console.error(
        `[Email failed] manual UPI confirmation email for order ${order.order_number || order.id}`,
        {
          message: 'Customer email address is missing.',
        }
      );
    }

    const loyalty = await processLoyaltyOrder(
      orderId,
      order.customer_id
    );

    return s.json({
      success: true,
      order_id: orderId,
      payment_status: 'verified',
      loyalty,
      message: 'Manual UPI payment verified.',
    });
  } catch (error) {
    console.error('[ADMIN_MANUAL_PAYMENT_VERIFY_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not verify the manual payment.',
    });
  }
});

router.post('/orders/:id/reject-manual-payment', async (q, s) => {
  const orderId = Number.parseInt(q.params.id, 10);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return s.status(400).json({
      error: 'A valid order ID is required.',
    });
  }

  try {
    const orderResult = await db.query(`
      SELECT
        o.id,
        o.payment_method,
        o.payment_reference,
        o.total_amount,
        c.email,
        c.name
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1
    `, [orderId]);

    const order = orderResult.rows[0];

    if (!order) {
      return s.status(404).json({
        error: 'Order not found.',
      });
    }

    if (order.payment_method !== 'manual_upi') {
      return s.status(400).json({
        error: 'This order is not a manual UPI order.',
      });
    }

    await db.query(`
      UPDATE orders
      SET payment_status = 'rejected',
          payment_rejected_at = to_char(
            CURRENT_TIMESTAMP,
            'YYYY-MM-DD HH24:MI:SS'
          ),
          payment_verified_at = NULL,
          status = 'Rejected'
      WHERE id = $1
    `, [orderId]);

    if (order.email) {
      const { trySendEmail } = require('../utils/email');

      await trySendEmail({
        to: order.email,
        subject: `Payment verification update for order ${order.id}`,
        text: `Hi ${order.name || 'Customer'},

We could not verify the UPI payment reference for your order.
Order amount: ?${Number(order.total_amount || 0).toLocaleString('en-IN')}
UTR submitted: ${order.payment_reference || 'Not provided'}

Please contact customer support so we can resolve this quickly and confirm your order.`,
      }, `manual UPI rejection email for order ${order.id}`);
    }

    return s.json({
      success: true,
      order_id: orderId,
      payment_status: 'rejected',
      status: 'Rejected',
      message: 'Manual UPI payment rejected for follow-up.',
    });
  } catch (error) {
    console.error('[ADMIN_MANUAL_PAYMENT_REJECT_FAILED]', error.message);

    return s.status(500).json({
      error: 'Could not reject the manual payment.',
    });
  }
});
router.post('/orders/:id/grant-gift-card', async (q, s) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(`
      SELECT
        id,
        customer_id,
        gift_card_eligible_amount,
        gift_card_granted_at
      FROM orders
      WHERE id = $1
      FOR UPDATE
    `, [q.params.id]);

    const order = orderResult.rows[0];

    if (!order) {
      throw new Error('Order not found.');
    }

    if (order.gift_card_granted_at) {
      throw new Error('Gift card already granted for this order.');
    }

    const adminId = q.body?.admin_id || 1;

    await client.query(`
      UPDATE orders
      SET gift_card_granted_at = to_char(
            CURRENT_TIMESTAMP,
            'YYYY-MM-DD HH24:MI:SS'
          ),
          gift_card_granted_by = $1
      WHERE id = $2
    `, [adminId, q.params.id]);

    await client.query(`
      UPDATE customers
      SET gift_card_balance =
        gift_card_balance + $1
      WHERE id = $2
    `, [
      Number(order.gift_card_eligible_amount || 0),
      order.customer_id,
    ]);

    await client.query('COMMIT');

    return s.json({
      success: true,
      amount: order.gift_card_eligible_amount,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    const message = error.message || 'Could not grant gift card.';

    if (message === 'Order not found.') {
      return s.status(404).json({ error: message });
    }

    if (message === 'Gift card already granted for this order.') {
      return s.status(409).json({ error: message });
    }

    console.error('[ADMIN_GIFT_CARD_GRANT_FAILED]', message);

    return s.status(500).json({
      error: 'Could not grant gift card.',
    });
  } finally {
    client.release();
  }
});
module.exports = router;
module.exports.normalizeFormBoolean = normalizeFormBoolean;
module.exports.parseReplacementFlag = parseReplacementFlag;
module.exports.parseImageSlots = parseImageSlots;
module.exports.orderedImageUrls = orderedImageUrls;
