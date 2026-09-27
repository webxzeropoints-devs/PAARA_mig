process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const { hasLoyaltyClaimSchema, isQualifyingLoyaltyOrder } = require('../services/loyalty');

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
