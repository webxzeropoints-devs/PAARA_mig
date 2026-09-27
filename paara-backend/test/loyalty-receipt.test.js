const assert = require('node:assert/strict');
const test = require('node:test');
const { buildLoyaltyReceipt, getOrderLoyaltyReceipt } = require('../utils/loyaltyReceipt');
const { createInvoicePdf } = require('../utils/invoice');

test('builds receipt progress from an awarded loyalty result', () => {
  assert.deepEqual(buildLoyaltyReceipt({
    order: { awarded: true },
    state: {
      stampCount: 6,
      totalStamps: 18,
      rewardEligible: true,
      rewardProduct: { name: 'Silver Pendant' },
      threshold: 750,
    },
  }), {
    stampsEarned: 1,
    stampCount: 6,
    totalStamps: 18,
    cardSize: 6,
    remainingStamps: 0,
    stampMessage: 'You earned 1 loyalty stamp from this order.',
    progressMessage: 'Your loyalty reward is unlocked.',
    threshold: 750,
    rewardEligible: true,
    rewardProductName: 'Silver Pendant',
    rewardStatus: 'Gift ready to claim',
  });
});

test('does not claim a stamp when loyalty did not award one', () => {
  assert.equal(buildLoyaltyReceipt({
    order: { awarded: false },
    state: { stampCount: 2, threshold: 750 },
  }), null);
  assert.equal(buildLoyaltyReceipt(null), null);
});

test('does not imply a gift is claimable while product selection is pending', () => {
  const summary = buildLoyaltyReceipt({
    order: { awarded: true },
    state: {
      stampCount: 6,
      totalStamps: 6,
      rewardEligible: true,
      rewardProduct: null,
    },
  });
  assert.equal(summary.rewardEligible, true);
  assert.equal(summary.rewardStatus, 'Eligible; gift selection pending');
});

test('clearly reports remaining stamps needed to unlock the reward', () => {
  const summary = buildLoyaltyReceipt({
    order: { awarded: true },
    state: {
      stampCount: 4,
      totalStamps: 10,
      rewardEligible: false,
      threshold: 750,
    },
  });
  assert.equal(summary.stampMessage, 'You earned 1 loyalty stamp from this order.');
  assert.equal(summary.remainingStamps, 2);
  assert.equal(summary.progressMessage, 'Earn 2 more stamps to unlock your reward.');
});

test('uses singular wording when one stamp remains', () => {
  const summary = buildLoyaltyReceipt({
    order: { awarded: true },
    state: {
      stampCount: 5,
      totalStamps: 11,
      rewardEligible: false,
      threshold: 750,
    },
  });
  assert.equal(summary.progressMessage, 'Earn 1 more stamp to unlock your reward.');
});

test('reads existing order stamp and progress without modifying loyalty records', async () => {
  let queryText = '';
  const db = {
    async query(sql, params) {
      queryText = sql;
      assert.deepEqual(params, [34, 12, 19]);
      return {
        rows: [{
          awarded: true,
          stamp_count: 3,
          total_stamps: 15,
          reward_eligible: false,
          threshold: 800,
        }],
      };
    },
  };

  const summary = await getOrderLoyaltyReceipt(db, 34, 12);
  assert.equal(summary.stampsEarned, 1);
  assert.equal(summary.stampCount, 3);
  assert.equal(summary.totalStamps, 15);
  assert.equal(summary.remainingStamps, 3);
  assert.equal(summary.threshold, 800);
  assert.equal(summary.rewardStatus, 'In progress');
  assert.doesNotMatch(queryText, /\b(INSERT|UPDATE|DELETE)\b/i);
});

test('omits a loyalty section if the order has no recorded stamp', async () => {
  const db = {
    async query() {
      return { rows: [{ awarded: false, stamp_count: 3 }] };
    },
  };
  assert.equal(await getOrderLoyaltyReceipt(db, 34, 12), null);
});

test('generates a PDF invoice with a loyalty summary', async () => {
  const receipt = buildLoyaltyReceipt({
    order: { awarded: true },
    state: {
      stampCount: 2,
      totalStamps: 8,
      rewardEligible: false,
      threshold: 750,
    },
  });
  const pdf = await createInvoicePdf({
    id: 34,
    order_number: 'PAARA-34',
    created_at: '2026-10-02T10:00:00.000Z',
    payment_status: 'paid',
    payment_method: 'payu',
    subtotal: 1000,
    gst_amount: 50,
    shipping_amount: 0,
    total_amount: 1050,
    customer_name: 'Test Customer',
    customer_email: 'customer@example.test',
  }, [{
    product_name: 'Test Pendant',
    unit_price: 1000,
    quantity: 1,
    line_total: 1000,
  }], {
    line1: '1 Test Street',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
  }, receipt);

  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});
