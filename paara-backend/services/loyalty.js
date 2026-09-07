const db = require('../db/database.pg');

const THRESHOLD = 599;
const CARD_SIZE = 6;
const VALIDITY_MONTHS = 6;

const QUALIFYING_PAYMENT_STATUSES = new Set([
  'paid',
  'verified',
  'auto-confirmed - unverified',
]);

const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result.toISOString();
};

const serializeCard = (card) => ({
  stampCount: Number(card?.stamp_count || 0),
  totalStamps: Number(card?.total_stamps || 0),
  cardsCompleted: Number(card?.cards_completed || 0),
  firstStampAt: card?.first_stamp_at || null,
  expiresAt: card?.expires_at || null,
  completedAt: card?.completed_at || null,
  rewardEligible: Boolean(card?.completed_at && !card?.reward_redeemed_at),
  threshold: THRESHOLD,
  cardSize: CARD_SIZE,
  history: card?.history || [],
});

async function ensureLoyaltyCard(client, customerId) {
  await client.query(
    'INSERT INTO loyalty_cards (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING',
    [customerId]
  );
}

async function getLoyaltyState(customerId, client = db) {
  await ensureLoyaltyCard(client, customerId);

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
      FROM loyalty_cards
      WHERE completed_at IS NOT NULL
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

  return serializeCard({
    ...card,
    history: historyResult.rows,
  });
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
          animationShown: Boolean(existing.animation_shown_at),
          newlyAwarded: !existing.animation_shown_at,
        },
      };
    }

    const paymentStatus = String(order.payment_status || '').trim().toLowerCase();
    const paymentMethod = String(order.payment_method || '').trim().toLowerCase();

    const qualifies =
      paymentMethod !== 'cod' &&
      QUALIFYING_PAYMENT_STATUSES.has(paymentStatus) &&
      Number(order.subtotal) >= THRESHOLD;

    if (!qualifies) {
      const state = await getLoyaltyState(customerId, client);

      await client.query('COMMIT');

      return {
        state,
        order: {
          orderId,
          awarded: false,
          animationShown: false,
          newlyAwarded: false,
        },
      };
    }

    const now = new Date();

    await ensureLoyaltyCard(client, customerId);

    let cardResult = await client.query(
      'SELECT * FROM loyalty_cards WHERE customer_id = $1',
      [customerId]
    );

    let card = cardResult.rows[0];

    const expired =
      card?.expires_at &&
      new Date(card.expires_at) <= now &&
      !card.completed_at;

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
        'SELECT * FROM loyalty_cards WHERE customer_id = $1',
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
          updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      WHERE customer_id = $5
    `, [
      Math.min(nextCount, CARD_SIZE),
      firstStampAt,
      card.expires_at || addMonths(firstStampAt, VALIDITY_MONTHS),
      completedAt,
      customerId,
    ]);

    await client.query(
      'INSERT INTO loyalty_stamps (customer_id, order_id) VALUES ($1, $2)',
      [customerId, orderId]
    );

    const state = await getLoyaltyState(customerId, client);

    await client.query('COMMIT');

    return {
      state,
      order: {
        orderId,
        awarded: true,
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
  getLoyaltyState,
  processLoyaltyOrder,
};
