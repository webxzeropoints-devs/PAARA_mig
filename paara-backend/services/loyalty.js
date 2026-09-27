const db = require('../db/database.pg');
const publicImageUrl = require('../utils/publicImageUrl');
const { formatOrderNumber } = require('../utils/orderNumber');
const { hashClaimToken } = require('./loyaltyRewardClaimEmails');

const DEFAULT_THRESHOLD = 19;
const CARD_SIZE = 6;
const VALIDITY_MONTHS = 6;
const QUALIFYING_PAYMENT_STATUSES = new Set([
  'paid',
  'verified',
  'auto-confirmed - unverified',
]);

const addMonths = (date, months) => {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.toISOString();
};

const isExpiredIncompleteCard = (card, at = new Date()) =>
  Boolean(
    card?.expires_at &&
    !card.completed_at &&
    new Date(card.expires_at).getTime() <= at.getTime()
  );

const serializeCard = (card, threshold = DEFAULT_THRESHOLD) => ({
  stampCount: Number(card?.stamp_count || 0),
  totalStamps: Number(card?.total_stamps || 0),
  cardsCompleted: Number(card?.cards_completed || 0),
  firstStampAt: card?.first_stamp_at || null,
  expiresAt: card?.expires_at || null,
  completedAt: card?.completed_at || null,
  rewardEligible: Boolean(card?.completed_at && !card?.reward_redeemed_at),
  rewardProduct: card?.reward_product || null,
  rewardClaimStatus: card?.reward_claim_status || null,
  threshold,
  cardSize: CARD_SIZE,
  history: card?.history || [],
  rewardHistory: card?.reward_history || [],
});

async function getLoyaltyThreshold(client = db) {
  const result = await client.query(
    'SELECT reward_threshold FROM loyalty_settings WHERE id = 1'
  );
  const threshold = Number(result.rows[0]?.reward_threshold);
  return Number.isFinite(threshold) && threshold > 0
    ? threshold
    : DEFAULT_THRESHOLD;
}

async function getLoyaltyRewardProduct(customerId, client = db) {
  const result = await client.query(`
    SELECT p.id, p.name, p.price, p.stock, p.is_active,
           (
             SELECT pi.image_url
             FROM product_images pi
             WHERE pi.product_id = p.id
             ORDER BY pi.sort_order ASC, pi.id ASC
             LIMIT 1
           ) AS image_url
    FROM loyalty_cards lc
    JOIN products p
      ON p.id = NULLIF(to_jsonb(lc)->>'reward_product_id', '')::integer
    WHERE lc.customer_id = $1
      AND lc.completed_at IS NOT NULL
      AND lc.reward_redeemed_at IS NULL
      AND p.is_active = TRUE
      AND EXISTS (
        SELECT 1
        FROM loyalty_reward_claims claim
        WHERE claim.customer_id = lc.customer_id
          AND claim.eligibility_completed_at = lc.completed_at
          AND claim.status = 'email_sent'
          AND claim.email_status = 'sent'
          AND claim.token_status = 'active'
          AND claim.token_expires_at > CURRENT_TIMESTAMP
      )
  `, [customerId]);
  const product = result.rows[0];
  return product
    ? { ...product, image_url: publicImageUrl(product.image_url) }
    : null;
}

async function getLoyaltyRewardClaimStatus(customerId, completedAt, client = db) {
  if (!completedAt) return null;
  const result = await client.query(`
    SELECT status, email_status
    FROM loyalty_reward_claims
    WHERE customer_id = $1 AND eligibility_completed_at = $2
  `, [customerId, completedAt]);
  return result.rows[0]
    ? { status: result.rows[0].status, emailStatus: result.rows[0].email_status }
    : null;
}

async function ensureLoyaltyCard(client, customerId) {
  await client.query(
    'INSERT INTO loyalty_cards (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING',
    [customerId]
  );
}

async function resetExpiredIncompleteCard(customerId, client = db) {
  const hasRewardColumn = await hasCustomerRewardColumn(client);
  return client.query(`
    UPDATE loyalty_cards
    SET stamp_count = 0,
        first_stamp_at = NULL,
        expires_at = NULL,
        completed_at = NULL,
        ${hasRewardColumn ? 'reward_product_id = NULL,' : ''}
        updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    WHERE customer_id = $1
      AND completed_at IS NULL
      AND NULLIF(BTRIM(expires_at), '')::timestamptz <= CURRENT_TIMESTAMP
    RETURNING customer_id
  `, [customerId]);
}

async function getLoyaltyState(customerId, client = db) {
  await ensureLoyaltyCard(client, customerId);
  await resetExpiredIncompleteCard(customerId, client);

  const cardResult = await client.query(`
    SELECT lc.*, COALESCE(total.total_stamps, 0) AS total_stamps,
           COALESCE(completed.cards_completed, 0) AS cards_completed
    FROM loyalty_cards lc
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS total_stamps
      FROM loyalty_stamps
      GROUP BY customer_id
    ) total ON total.customer_id = lc.customer_id
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS cards_completed
      FROM (
        SELECT customer_id
        FROM loyalty_cards
        WHERE completed_at IS NOT NULL
        UNION ALL
        SELECT customer_id
        FROM loyalty_reward_redemptions
      ) completed_cards
      GROUP BY customer_id
    ) completed ON completed.customer_id = lc.customer_id
    WHERE lc.customer_id = $1
  `, [customerId]);

  const card = cardResult.rows[0];

  const historyResult = await client.query(`
    SELECT ls.id, ls.order_id, ls.awarded_at, ls.animation_shown_at,
           o.order_number
    FROM loyalty_stamps ls
    JOIN orders o ON o.id = ls.order_id
    WHERE ls.customer_id = $1
    ORDER BY ls.awarded_at DESC
  `, [customerId]);

  const rewardHistoryResult = await client.query(`
    SELECT r.id, r.redeemed_at,
           NULLIF(to_jsonb(r)->>'product_id', '')::integer AS product_id,
           NULLIF(to_jsonb(r)->>'order_id', '')::integer AS order_id,
           o.order_number, o.status AS order_status, p.name AS product_name
    FROM loyalty_reward_redemptions r
    LEFT JOIN orders o
      ON o.id = NULLIF(to_jsonb(r)->>'order_id', '')::integer
    LEFT JOIN products p
      ON p.id = NULLIF(to_jsonb(r)->>'product_id', '')::integer
    WHERE r.customer_id = $1
    ORDER BY r.redeemed_at DESC, r.id DESC
  `, [customerId]);

  return serializeCard({
    ...card,
    reward_product: await getLoyaltyRewardProduct(customerId, client),
    history: historyResult.rows,
    reward_history: rewardHistoryResult.rows,
    reward_claim_status: (await getLoyaltyRewardClaimStatus(
      customerId,
      card?.completed_at,
      client
    ))?.status || null,
  }, await getLoyaltyThreshold(client));
}

async function hasCustomerRewardColumn(client) {
  const result = await client.query(`
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'loyalty_cards'
          AND column_name = 'reward_product_id'
      ) AS ready
  `);
  return Boolean(result.rows[0]?.ready);
}

async function hasLoyaltyClaimSchema(client) {
  const cardColumn = await hasCustomerRewardColumn(client);
  const redemptions = await client.query(`
    SELECT COUNT(DISTINCT column_name) = 2 AS ready
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'loyalty_reward_redemptions'
      AND column_name IN ('product_id', 'order_id')
  `);
  return cardColumn && Boolean(redemptions.rows[0]?.ready);
}

function isQualifyingLoyaltyOrder(order, threshold) {
  const paymentStatus = String(order?.payment_status || '').trim().toLowerCase();
  const paymentMethod = String(order?.payment_method || '').trim().toLowerCase();
  return paymentMethod !== 'cod' &&
    paymentMethod !== 'loyalty_reward' &&
    QUALIFYING_PAYMENT_STATUSES.has(paymentStatus) &&
    Number(order?.subtotal) >= threshold;
}

async function syncRecentPaidLoyaltyOrders(customerId) {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await ensureLoyaltyCard(client, customerId);
    const hasRewardColumn = await hasCustomerRewardColumn(client);

    let cardResult = await client.query(
      'SELECT * FROM loyalty_cards WHERE customer_id = $1 FOR UPDATE',
      [customerId]
    );
    let card = cardResult.rows[0];
    const now = new Date();

    if (card.completed_at && !card.reward_redeemed_at) {
      await client.query('COMMIT');
      return;
    }

    if (isExpiredIncompleteCard(card, now)) {
      await resetExpiredIncompleteCard(customerId, client);
      cardResult = await client.query(
        'SELECT * FROM loyalty_cards WHERE customer_id = $1 FOR UPDATE',
        [customerId]
      );
      card = cardResult.rows[0];
    }

    const threshold = await getLoyaltyThreshold(client);
    const orders = await client.query(`
      SELECT o.id, o.subtotal, o.payment_status, o.payment_method,
             COALESCE(NULLIF(o.payment_verified_at, ''), o.created_at)::timestamp
               AT TIME ZONE 'UTC' AS paid_at
      FROM orders o
      WHERE o.customer_id = $1
        AND LOWER(BTRIM(COALESCE(o.payment_method, ''))) NOT IN ('cod', 'loyalty_reward')
        AND LOWER(BTRIM(COALESCE(o.payment_status, ''))) = ANY($2::text[])
        AND o.subtotal >= $3
        AND COALESCE(NULLIF(o.payment_verified_at, ''), o.created_at)::timestamp
              >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '6 months'
        AND COALESCE(NULLIF(o.payment_verified_at, ''), o.created_at)::timestamp
              <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        AND NOT EXISTS (
          SELECT 1 FROM loyalty_stamps ls WHERE ls.order_id = o.id
        )
        AND (
          $4::timestamp IS NULL OR
          COALESCE(NULLIF(o.payment_verified_at, ''), o.created_at)::timestamp > $4::timestamp
        )
      ORDER BY COALESCE(NULLIF(o.payment_verified_at, ''), o.created_at)::timestamp,
               o.id
      FOR UPDATE OF o
    `, [
      customerId,
      [...QUALIFYING_PAYMENT_STATUSES],
      threshold,
      card.reward_redeemed_at || null,
    ]);
    const redemptionCutoff = card.reward_redeemed_at
      ? new Date(card.reward_redeemed_at)
      : null;

    for (const order of orders.rows) {
      const paidAt = order.paid_at instanceof Date
        ? order.paid_at
        : new Date(order.paid_at);
      if (Number.isNaN(paidAt.getTime())) {
        throw new Error(`Invalid paid timestamp for order ${order.id}.`);
      }

      if (card.completed_at && card.reward_redeemed_at) {
        if (redemptionCutoff && paidAt <= redemptionCutoff) continue;
        card = {
          ...card,
          stamp_count: 0,
          first_stamp_at: null,
          expires_at: null,
          completed_at: null,
          reward_redeemed_at: null,
          reward_product_id: null,
        };
      }

      if (isExpiredIncompleteCard(card, paidAt)) {
        card = {
          ...card,
          stamp_count: 0,
          first_stamp_at: null,
          expires_at: null,
          completed_at: null,
          reward_product_id: null,
        };
      }

      if (card.completed_at) break;

      const firstStampAt = card.first_stamp_at || paidAt.toISOString();
      const nextCount = Number(card.stamp_count || 0) + 1;
      const completedAt = nextCount >= CARD_SIZE ? paidAt.toISOString() : null;
      const expiresAt = card.expires_at || addMonths(firstStampAt, VALIDITY_MONTHS);

      const stamp = await client.query(`
        INSERT INTO loyalty_stamps (customer_id, order_id, awarded_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (order_id) DO NOTHING
        RETURNING id
      `, [customerId, order.id, paidAt.toISOString()]);
      if (stamp.rowCount !== 1) continue;

      const customerParameter = hasRewardColumn ? '$6' : '$5';
      const rewardAssignment = hasRewardColumn
        ? 'reward_product_id = CASE WHEN $5 = 1 THEN NULL ELSE reward_product_id END,'
        : '';
      const updateParameters = hasRewardColumn
        ? [
            Math.min(nextCount, CARD_SIZE),
            firstStampAt,
            expiresAt,
            completedAt,
            Number(card.stamp_count || 0),
            customerId,
          ]
        : [
            Math.min(nextCount, CARD_SIZE),
            firstStampAt,
            expiresAt,
            completedAt,
            customerId,
          ];
      await client.query(`
        UPDATE loyalty_cards
        SET stamp_count = $1,
            first_stamp_at = $2,
            expires_at = $3,
            completed_at = $4,
            reward_redeemed_at = NULL,
            ${rewardAssignment}
            updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
        WHERE customer_id = ${customerParameter}
      `, updateParameters);

      card = {
        ...card,
        stamp_count: Math.min(nextCount, CARD_SIZE),
        first_stamp_at: firstStampAt,
        expires_at: expiresAt,
        completed_at: completedAt,
        reward_redeemed_at: null,
        reward_product_id: Number(card.stamp_count || 0) === 0 ? null : card.reward_product_id,
      };
    }

    if (isExpiredIncompleteCard(card, now)) {
      await resetExpiredIncompleteCard(customerId, client);
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[LOYALTY_SYNC_ROLLBACK_FAILED]', {
        customerId,
        message: rollbackError.message,
        name: rollbackError.name,
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function redeemLoyaltyReward(customerId, addressId, claimToken = null) {
  const client = await db.pool.connect();

  try {
    if (!await hasLoyaltyClaimSchema(client)) {
      throw Object.assign(
        new Error('Loyalty gift claiming is temporarily unavailable while the loyalty database update is pending.'),
        { statusCode: 503 }
      );
    }
    await client.query('BEGIN');

    const normalizedAddressId = Number(addressId);
    if (!Number.isSafeInteger(normalizedAddressId) || normalizedAddressId < 1) {
      throw Object.assign(new Error('Choose a saved delivery address.'), { statusCode: 400 });
    }

    const cardResult = await client.query(
      'SELECT * FROM loyalty_cards WHERE customer_id = $1 FOR UPDATE',
      [customerId]
    );
    const card = cardResult.rows[0];

    if (!card || !card.completed_at || card.reward_redeemed_at) {
      throw Object.assign(new Error('A completed loyalty reward is required.'), { statusCode: 409 });
    }

    const tokenHash = claimToken ? hashClaimToken(claimToken) : null;
    const claimResult = await client.query(`
      SELECT id
      FROM loyalty_reward_claims
      WHERE customer_id = $1
        AND eligibility_completed_at = $2
        AND status = 'email_sent'
        AND email_status = 'sent'
        AND token_status = 'active'
        AND token_expires_at > CURRENT_TIMESTAMP
        AND ($3::text IS NULL OR token_hash = $3)
      FOR UPDATE
    `, [customerId, card.completed_at, tokenHash]);
    const rewardClaim = claimResult.rows[0];
    if (!rewardClaim) {
      throw Object.assign(
        new Error('Your reward must be confirmed and its claim email delivered before it can be claimed.'),
        { statusCode: 409 }
      );
    }

    const rewardProductId = Number(card.reward_product_id);
    if (!Number.isSafeInteger(rewardProductId) || rewardProductId < 1) {
      throw Object.assign(new Error('PAARA has not selected your jewellery gift yet.'), { statusCode: 409 });
    }

    const productResult = await client.query(`
      SELECT id, name, stock
      FROM products
      WHERE id = $1 AND is_active = TRUE
      FOR UPDATE
    `, [rewardProductId]);
    const product = productResult.rows[0];
    if (!product) {
      throw Object.assign(new Error('The selected reward product is unavailable.'), { statusCode: 409 });
    }
    if (Number(product.stock) < 1) {
      throw Object.assign(new Error('The selected reward product is out of stock.'), { statusCode: 409 });
    }

    const addressResult = await client.query(`
      SELECT a.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
      FROM addresses a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.id = $1 AND a.customer_id = $2
    `, [normalizedAddressId, customerId]);
    const delivery = addressResult.rows[0];
    if (!delivery) {
      throw Object.assign(new Error('Choose one of your saved delivery addresses.'), { statusCode: 400 });
    }

    const redeemedAt = new Date().toISOString();
    const orderResult = await client.query(`
      INSERT INTO orders (
        customer_id, address_id, subtotal, gst_amount, shipping_amount,
        total_amount, status, payment_status, payment_method,
        payment_verified_at
      )
      VALUES ($1, $2, 0, 0, 0, 0, 'Order Confirmed', 'paid', 'loyalty_reward', $3)
      RETURNING id, created_at
    `, [customerId, normalizedAddressId, redeemedAt]);
    const orderId = orderResult.rows[0].id;
    const orderNumber = formatOrderNumber(orderResult.rows[0].created_at, orderId);

    await client.query(
      'UPDATE orders SET order_number = $1 WHERE id = $2',
      [orderNumber, orderId]
    );
    await client.query(`
      INSERT INTO order_items
        (order_id, product_id, product_name, unit_price, quantity, line_total)
      VALUES ($1, $2, $3, 0, 1, 0)
    `, [orderId, product.id, `Loyalty reward: ${product.name}`]);
    await client.query(`
      INSERT INTO customer_order_details (
        order_id, customer_id, full_name, email, phone,
        shipping_line1, shipping_line2, shipping_city, shipping_state,
        shipping_pincode, shipping_country, submitted_fields
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      orderId,
      customerId,
      delivery.customer_name,
      delivery.customer_email,
      delivery.customer_phone || null,
      delivery.line1,
      delivery.line2,
      delivery.city,
      delivery.state,
      delivery.pincode,
      'India',
      JSON.stringify({
        items: [{ product_id: product.id, quantity: 1, loyalty_reward: true }],
        address_id: normalizedAddressId,
        loyalty_reward: true,
      }),
    ]);
    const stockUpdate = await client.query(
      'UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0',
      [product.id]
    );
    if (stockUpdate.rowCount !== 1) {
      throw Object.assign(new Error('The selected reward product is out of stock.'), { statusCode: 409 });
    }
    await client.query(`
      INSERT INTO loyalty_reward_redemptions
        (customer_id, redeemed_at, product_id, order_id)
      VALUES ($1, $2, $3, $4)
    `, [customerId, redeemedAt, product.id, orderId]);
    await client.query(`
      UPDATE loyalty_reward_claims
      SET status = 'claimed',
          token_status = 'claimed',
          claimed_at = $2,
          claimed_order_id = $3,
          encrypted_token = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [rewardClaim.id, redeemedAt, orderId]);
    await client.query(`
      UPDATE loyalty_cards
      SET stamp_count = 0,
          first_stamp_at = NULL,
          expires_at = NULL,
          completed_at = NULL,
          reward_redeemed_at = $1,
          reward_product_id = NULL,
          updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      WHERE customer_id = $2
    `, [redeemedAt, customerId]);

    const state = await getLoyaltyState(customerId, client);
    await client.query('COMMIT');
    return {
      state,
      redeemedAt,
      order: {
        id: orderId,
        order_number: orderNumber,
        status: 'Order Confirmed',
        payment_method: 'loyalty_reward',
        total_amount: 0,
      },
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[LOYALTY_REDEEM_ROLLBACK_FAILED]', {
        message: rollbackError.message,
        name: rollbackError.name,
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function processLoyaltyOrder(orderId, customerId) {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(`
      SELECT id, customer_id, subtotal, payment_status, payment_method
      FROM orders
      WHERE id = $1 AND customer_id = $2
    `, [orderId, customerId]);

    const order = orderResult.rows[0];

    if (!order) {
      throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
    }

    const existingResult = await client.query(
      'SELECT awarded_at, animation_shown_at FROM loyalty_stamps WHERE order_id = $1',
      [orderId]
    );

    const existing = existingResult.rows[0];

    if (existing) {
      const state = await getLoyaltyState(customerId, client);

      await client.query('COMMIT');

      return {
        state,
        order: {
          orderId,
          awarded: true,
          eligible: true,
          animationShown: Boolean(existing.animation_shown_at),
          newlyAwarded: false,
        },
      };
    }

    const threshold = await getLoyaltyThreshold(client);
    const qualifies = isQualifyingLoyaltyOrder(order, threshold);

    if (!qualifies) {
      const state = await getLoyaltyState(customerId, client);

      await client.query('COMMIT');

      return {
        state,
        order: {
          orderId,
          awarded: false,
          eligible: false,
          animationShown: false,
          newlyAwarded: false,
        },
      };
    }

    const now = new Date();

    await ensureLoyaltyCard(client, customerId);

    let cardResult = await client.query(
      'SELECT * FROM loyalty_cards WHERE customer_id = $1 FOR UPDATE',
      [customerId]
    );

    let card = cardResult.rows[0];

    const lockedExistingResult = await client.query(
      'SELECT awarded_at, animation_shown_at FROM loyalty_stamps WHERE order_id = $1',
      [orderId]
    );

    const lockedExisting = lockedExistingResult.rows[0];

    if (lockedExisting) {
      const state = await getLoyaltyState(customerId, client);

      await client.query('COMMIT');

      return {
        state,
        order: {
          orderId,
          awarded: true,
          eligible: true,
          animationShown: Boolean(lockedExisting.animation_shown_at),
          newlyAwarded: false,
        },
      };
    }

    const expired = isExpiredIncompleteCard(card, now);

    if (expired) {
      await client.query(`
        UPDATE loyalty_cards
        SET stamp_count = 0,
            first_stamp_at = NULL,
            expires_at = NULL,
            completed_at = NULL,
            reward_redeemed_at = NULL,
            updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
        WHERE customer_id = $1
      `, [customerId]);

      cardResult = await client.query(
        'SELECT * FROM loyalty_cards WHERE customer_id = $1 FOR UPDATE',
        [customerId]
      );

      card = cardResult.rows[0];
    }

    if (card.completed_at) {
      const state = await getLoyaltyState(customerId, client);

      await client.query('COMMIT');

      return {
        state,
        order: {
          orderId,
          awarded: false,
          eligible: false,
          animationShown: false,
          newlyAwarded: false,
        },
      };
    }

    const firstStampAt = card.first_stamp_at || now.toISOString();
    const nextCount = Number(card.stamp_count || 0) + 1;
    const completedAt = nextCount >= CARD_SIZE ? now.toISOString() : null;

    await client.query(`
      UPDATE loyalty_cards
      SET stamp_count = $1,
          first_stamp_at = $2,
          expires_at = $3,
          completed_at = $4,
          reward_redeemed_at = NULL,
          updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      WHERE customer_id = $5
    `, [
      Math.min(nextCount, CARD_SIZE),
      firstStampAt,
      card.expires_at || addMonths(firstStampAt, VALIDITY_MONTHS),
      completedAt,
      customerId,
    ]);

    const stampResult = await client.query(
      'INSERT INTO loyalty_stamps (customer_id, order_id) VALUES ($1, $2) RETURNING id',
      [customerId, orderId]
    );
    const stampId = stampResult.rows[0].id;

    await client.query(`
      INSERT INTO loyalty_stamp_email_notifications
        (stamp_id, stamp_count)
      VALUES ($1, $2)
      ON CONFLICT (stamp_id) DO NOTHING
    `, [stampId, Math.min(nextCount, CARD_SIZE)]);

    if (completedAt) {
      await client.query(`
        INSERT INTO loyalty_reward_claims (
          customer_id, eligibility_completed_at, status,
          token_status, email_status, next_attempt_at
        )
        VALUES ($1, $2, 'eligible', 'not_generated', 'not_sent', CURRENT_TIMESTAMP)
        ON CONFLICT (customer_id, eligibility_completed_at) DO NOTHING
      `, [customerId, completedAt]);
    }

    const state = await getLoyaltyState(customerId, client);

    await client.query('COMMIT');

    return {
      state,
      order: {
        orderId,
        awarded: true,
        eligible: true,
        animationShown: false,
        newlyAwarded: true,
      },
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  CARD_SIZE,
  QUALIFYING_PAYMENT_STATUSES,
  addMonths,
  isExpiredIncompleteCard,
  isQualifyingLoyaltyOrder,
  getLoyaltyThreshold,
  getLoyaltyRewardProduct,
  resetExpiredIncompleteCard,
  getLoyaltyState,
  hasCustomerRewardColumn,
  hasLoyaltyClaimSchema,
  syncRecentPaidLoyaltyOrders,
  processLoyaltyOrder,
  redeemLoyaltyReward,
};
