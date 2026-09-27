process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  addMonths,
  hasLoyaltyClaimSchema,
  isExpiredIncompleteCard,
  isQualifyingLoyaltyOrder,
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
