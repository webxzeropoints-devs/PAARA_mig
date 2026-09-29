process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db/database.pg');
const {
  addMonths,
  hasLoyaltyClaimSchema,
  isExpiredIncompleteCard,
  isQualifyingLoyaltyOrder,
  getLoyaltyState,
  processLoyaltyOrder,
  resetExpiredIncompleteCard,
} = require('../services/loyalty');

test('adds six calendar months without rolling a month-end expiry forward', () => {
  assert.equal(
    addMonths(new Date('2026-08-31T12:30:00.000Z'), 6),
    '2027-02-28T12:30:00.000Z'
  );
  assert.equal(
    addMonths(new Date('2024-08-31T12:30:00.000Z'), 6),
    '2025-02-28T12:30:00.000Z'
  );
});

test('expires incomplete cards at the deadline but preserves completed rewards', () => {
  const expiresAt = '2026-09-27T10:00:00.000Z';
  const deadline = new Date(expiresAt);
  assert.equal(isExpiredIncompleteCard({ expires_at: expiresAt }, deadline), true);
  assert.equal(
    isExpiredIncompleteCard({ expires_at: expiresAt }, new Date(deadline.getTime() - 1)),
    false
  );
  assert.equal(
    isExpiredIncompleteCard({
      expires_at: expiresAt,
      completed_at: '2026-09-26T10:00:00.000Z',
    }, deadline),
    false
  );
});

test('database expiry reset only targets incomplete cards past their deadline', async () => {
  let updateSql = '';
  const client = {
    async query(sql, params) {
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ ready: true }] };
      }
      updateSql = sql;
      assert.deepEqual(params, [42]);
      return { rows: [] };
    },
  };

  await resetExpiredIncompleteCard(42, client);

  assert.match(updateSql, /UPDATE loyalty_cards/);
  assert.match(updateSql, /completed_at IS NULL/);
  assert.match(updateSql, /expires_at.*<= CURRENT_TIMESTAMP/s);
  assert.match(updateSql, /reward_product_id = NULL/);
});

test('qualifies paid PayU orders at the configured threshold', () => {
  assert.equal(isQualifyingLoyaltyOrder({
    payment_method: 'payu',
    payment_status: 'paid',
    subtotal: 599,
  }, 599), true);
});

test('qualifies verified manual payments', () => {
  assert.equal(isQualifyingLoyaltyOrder({
    payment_method: 'manual_upi',
    payment_status: 'verified',
    subtotal: 600,
  }, 599), true);
});

test('rejects unpaid, COD, loyalty reward, and below-threshold orders', () => {
  const cases = [
    { payment_method: 'payu', payment_status: 'pending', subtotal: 1000 },
    { payment_method: 'cod', payment_status: 'paid', subtotal: 1000 },
    { payment_method: 'loyalty_reward', payment_status: 'paid', subtotal: 1000 },
    { payment_method: 'payu', payment_status: 'paid', subtotal: 598.99 },
  ];
  for (const order of cases) {
    assert.equal(isQualifyingLoyaltyOrder(order, 599), false);
  }
});

test('recognizes when the per-customer reward migration is ready', async () => {
  const client = {
    async query(sql) {
      if (sql.includes("table_name = 'loyalty_cards'")) {
        return { rows: [{ ready: true }] };
      }
      return { rows: [{ ready: true }] };
    },
  };

  assert.equal(await hasLoyaltyClaimSchema(client), true);
});

test('reports an unapplied reward migration without requiring reward columns', async () => {
  const client = {
    async query(sql) {
      if (sql.includes("table_name = 'loyalty_cards'")) {
        return { rows: [{ ready: false }] };
      }
      return { rows: [{ ready: false }] };
    },
  };

  assert.equal(await hasLoyaltyClaimSchema(client), false);
});

test('shows an assigned reward while its claim email is pending or failed', async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ ready: true }] };
      }
      if (sql.includes('SELECT lc.*, COALESCE')) {
        return {
          rows: [{
            customer_id: 42,
            stamp_count: 6,
            completed_at: '2026-09-27 12:00:00',
            reward_redeemed_at: null,
            reward_product_id: 91,
          }],
        };
      }
      if (sql.includes('JOIN products p')) {
        return {
          rows: [{
            id: 91,
            name: 'Pearl Gift',
            is_active: true,
            image_url: null,
          }],
        };
      }
      if (sql.includes('FROM loyalty_reward_claims')) {
        return {
          rows: [{
            status: 'email_pending',
            email_status: 'failed',
            token_status: 'pending',
            token_expires_at: new Date(Date.now() + 86400000),
          }],
        };
      }
      if (sql.includes('SELECT reward_threshold')) {
        return { rows: [{ reward_threshold: 599 }] };
      }
      return { rows: [] };
    },
  };

  const state = await getLoyaltyState(42, client);

  assert.equal(state.rewardEligible, true);
  assert.equal(state.rewardProduct.name, 'Pearl Gift');
  assert.equal(state.rewardClaimStatus, 'email_pending');
  assert.equal(state.rewardClaimEmailStatus, 'failed');
  assert.equal(state.rewardClaimReady, false);
  assert.match(statements.find((sql) => sql.includes('FROM loyalty_cards lc') && sql.includes('JOIN products p')), /claim\.status IN \('reward_selected', 'email_pending', 'email_sent'\)/);
});

test('reprocessing a paid order returns its existing stamp without awarding another', async () => {
  const originalConnect = db.pool.connect;
  const customerId = 42;
  const orderId = 901;
  const order = {
    id: orderId,
    customer_id: customerId,
    subtotal: 500,
    payment_status: 'paid',
    payment_method: 'payu',
  };
  const card = {
    customer_id: customerId,
    stamp_count: 2,
    first_stamp_at: '2026-09-20T12:00:00.000Z',
    expires_at: '2027-03-20T12:00:00.000Z',
    completed_at: null,
    reward_redeemed_at: null,
    reward_product_id: null,
  };
  const stamps = [];
  let nextStampId = 1;

  db.pool.connect = async () => ({
    async query(sql, params = []) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM information_schema.columns')) {
        return { rows: [{ ready: true }], rowCount: 1 };
      }
      if (sql.includes('FROM orders') && sql.includes('WHERE id = $1 AND customer_id = $2')) {
        return { rows: [order], rowCount: 1 };
      }
      if (sql.includes('FROM loyalty_stamps WHERE order_id = $1')) {
        return {
          rows: stamps.filter((stamp) => stamp.order_id === params[0]),
          rowCount: stamps.some((stamp) => stamp.order_id === params[0]) ? 1 : 0,
        };
      }
      if (sql.includes('SELECT reward_threshold FROM loyalty_settings')) {
        return { rows: [{ reward_threshold: 100 }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_cards')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT * FROM loyalty_cards')) {
        return { rows: [{ ...card }], rowCount: 1 };
      }
      if (sql.includes('UPDATE loyalty_cards') && sql.includes('SET stamp_count = 0')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('UPDATE loyalty_cards') && sql.includes('SET stamp_count = $1')) {
        [card.stamp_count, card.first_stamp_at, card.expires_at, card.completed_at] = params;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_stamps')) {
        const stamp = { id: nextStampId++, customer_id: params[0], order_id: params[1] };
        stamps.push(stamp);
        return { rows: [{ id: stamp.id }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_stamp_email_notifications')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM loyalty_cards lc')) {
        return {
          rows: [{
            ...card,
            total_stamps: stamps.length,
            cards_completed: 0,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM loyalty_stamps ls')) {
        return { rows: stamps.map((stamp) => ({ ...stamp, awarded_at: new Date().toISOString(), order_number: 'ORD-901' })), rowCount: stamps.length };
      }
      if (sql.includes('FROM loyalty_reward_redemptions')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM loyalty_reward_claims')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM products p') && sql.includes('product_images')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected loyalty test query: ${sql}`);
    },
    release() {},
  });

  try {
    const first = await processLoyaltyOrder(orderId, customerId);
    const retry = await processLoyaltyOrder(orderId, customerId);

    assert.equal(first.order.awarded, true);
    assert.equal(first.order.eligible, true);
    assert.equal(first.order.newlyAwarded, true);
    assert.equal(retry.order.awarded, true);
    assert.equal(retry.order.newlyAwarded, false);
    assert.equal(retry.state.stampCount, 3);
    assert.equal(stamps.length, 1);
  } finally {
    db.pool.connect = originalConnect;
  }
});
