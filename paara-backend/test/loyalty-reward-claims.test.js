const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db/database.pg');
const {
  processLoyaltyOrder,
  redeemLoyaltyReward,
} = require('../services/loyalty');
const {
  confirmLoyaltyReward,
  retryLoyaltyRewardEmail,
  selectLoyaltyReward,
} = require('../services/loyaltyRewardClaims');
const {
  buildRewardClaimEmail,
  createLoyaltyRewardClaimEmailWorker,
  decryptClaimToken,
  encryptClaimToken,
  generateClaimToken,
  hashClaimToken,
  retryDelayMs,
} = require('../services/loyaltyRewardClaimEmails');
const { buildLoyaltyStampEmail } = require('../services/loyaltyStampEmailNotifications');

function withEnvironment(values, callback) {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('claim tokens are unique, hashed for lookup, and encrypted for retryable delivery', async () => {
  await withEnvironment({ JWT_SECRET: 'local-test-secret-only' }, async () => {
    const token = generateClaimToken();
    const ciphertext = encryptClaimToken(token);
    assert.notEqual(generateClaimToken(), token);
    assert.notEqual(ciphertext, token);
    assert.equal(decryptClaimToken(ciphertext), token);
    assert.equal(hashClaimToken(token), hashClaimToken(token));
    assert.notEqual(hashClaimToken(token), token);
  });
});

test('builds a branded claim email with an escaped button URL and validity', async () => {
  await withEnvironment({ FRONTEND_URL: 'http://localhost:5173', JWT_SECRET: 'test-key' }, async () => {
    const email = buildRewardClaimEmail({
      name: '<Customer>',
      productName: 'Pearl & Gold Set',
      token: 'abc_DEF-123',
      expiresAt: '2026-10-27T00:00:00.000Z',
    });
    assert.match(email.subject, /reward is ready/i);
    assert.match(email.text, /Pearl & Gold Set/);
    assert.match(email.html, /Claim Yours/);
    assert.match(email.html, /rewards\/claim\/abc_DEF-123/);
    assert.match(email.html, /&lt;Customer&gt;/);
    assert.match(email.html, /27 October 2026/);
    assert.equal(retryDelayMs(1), 60000);
    assert.equal(retryDelayMs(16), 6 * 60 * 60 * 1000);
  });
});

test('sixth-stamp notification explains that gift email follows owner confirmation', () => {
  const email = buildLoyaltyStampEmail({ name: 'Customer', stampCount: 6 });
  assert.match(email.text, /PAARA will select and confirm/i);
  assert.match(email.text, /secure claim link/i);
  assert.doesNotMatch(email.text, /Claim Yours/);
});

function createWorkerPool({ emailAttempts = 0 } = {}) {
  const database = {
    sentUpdate: null,
    failureUpdate: null,
    deliveries: 0,
    claimed: false,
    async connect() {
      return {
        async query(sql) {
          if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) {
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes('FROM loyalty_reward_claims claim')) {
            if (database.claimed) return { rows: [], rowCount: 0 };
            database.claimed = true;
            return {
              rows: [{
                id: 9,
                email_attempts: emailAttempts,
                encrypted_token: encryptClaimToken('secure-test-token'),
                token_expires_at: new Date(Date.now() + 86400000),
                name: 'PAARA Customer',
                email: 'customer@example.test',
                product_name: 'Gold Pendant',
              }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
    async query(sql, params) {
      if (sql.includes("SET status = 'email_sent'")) {
        database.sentUpdate = { sql, params };
      } else {
        database.failureUpdate = { sql, params };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return database;
}

test('worker sends the selected reward email and records delivery once', async () => {
  await withEnvironment({
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'worker-test-secret',
  }, async () => {
    const pool = createWorkerPool();
    let message;
    const worker = createLoyaltyRewardClaimEmailWorker({
      pool,
      trySendEmail: async (payload) => {
        pool.deliveries += 1;
        message = payload;
        return { success: true };
      },
      logger: { error() {} },
    });

    await worker.processPending();
    assert.equal(pool.deliveries, 1);
    assert.equal(message.to, 'customer@example.test');
    assert.match(message.subject, /reward is ready/i);
    assert.match(message.html, /Gold Pendant/);
    assert.match(message.html, /Claim Yours/);
    assert.match(message.html, /secure-test-token/);
    assert.match(pool.sentUpdate.sql, /status = 'email_sent'/);
    assert.match(pool.sentUpdate.sql, /encrypted_token = NULL/);
  });
});

test('worker records terminal delivery failure for the admin retry action', async () => {
  await withEnvironment({
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'worker-test-secret',
  }, async () => {
    const pool = createWorkerPool({ emailAttempts: 4 });
    const worker = createLoyaltyRewardClaimEmailWorker({
      pool,
      trySendEmail: async () => ({
        success: false,
        error: new Error('SMTP temporarily unavailable'),
      }),
      logger: { error() {} },
    });

    await worker.processPending();
    assert.match(pool.failureUpdate.sql, /email_status = \$2/);
    assert.equal(pool.failureUpdate.params[1], 'failed');
    assert.match(pool.failureUpdate.params[3], /SMTP temporarily unavailable/);
  });
});

test('repeated owner confirmation queues only one reward email and token', async () => {
  await withEnvironment({ JWT_SECRET: 'confirm-test-secret' }, async () => {
    const originalConnect = db.pool.connect;
    const card = {
      customer_id: 17,
      completed_at: '2026-09-27 12:00:00',
      reward_redeemed_at: null,
      reward_product_id: 88,
    };
    let claimStatus = null;
    let queuedParams = null;
    let insertCount = 0;
    db.pool.connect = async () => ({
      async query(sql, params = []) {
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM loyalty_cards') && sql.includes('FOR UPDATE')) {
          return { rows: [{ ...card }], rowCount: 1 };
        }
        if (sql.includes('FROM loyalty_reward_claims') && sql.includes('FOR UPDATE')) {
          return {
            rows: claimStatus
              ? [{ id: 5, status: claimStatus, email_status: 'pending' }]
              : [],
            rowCount: claimStatus ? 1 : 0,
          };
        }
        if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: card.reward_product_id }], rowCount: 1 };
        }
        if (sql.includes('SELECT email FROM customers')) {
          return { rows: [{ email: 'registered@example.test' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO loyalty_reward_claims')) {
          insertCount += 1;
          queuedParams = params;
          claimStatus = 'email_pending';
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected confirmation query: ${sql}`);
      },
      release() {},
    });

    try {
      const first = await confirmLoyaltyReward(card.customer_id);
      const replay = await confirmLoyaltyReward(card.customer_id);
      assert.equal(first.status, 'email_pending');
      assert.equal(first.email_status, 'pending');
      assert.equal(replay.already_confirmed, true);
      assert.equal(insertCount, 1);
      assert.notEqual(queuedParams[3], queuedParams[5]);
      assert.equal(decryptClaimToken(queuedParams[5]).length, 43);
      assert.equal(queuedParams[4], 30);
    } finally {
      db.pool.connect = originalConnect;
    }
  });
});

test('selecting a gift records selection but does not queue or send an email', async () => {
  const originalConnect = db.pool.connect;
  let selection = null;
  let notificationQueued = false;
  db.pool.connect = async () => ({
    async query(sql, params = []) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM loyalty_cards') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            customer_id: 22,
            completed_at: '2026-09-27 12:00:00',
            reward_redeemed_at: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM loyalty_reward_claims') && sql.includes('FOR UPDATE')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM products') && sql.includes('is_active')) {
        return { rows: [{ id: 91 }], rowCount: 1 };
      }
      if (sql.includes('UPDATE loyalty_cards')) {
        assert.equal(params[1], 91);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_reward_claims')) {
        selection = params;
        notificationQueued = /'pending'/.test(sql);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected selection query: ${sql}`);
    },
    release() {},
  });

  try {
    const result = await selectLoyaltyReward(22, 91);
    assert.deepEqual(result, { customer_id: 22, reward_product_id: 91 });
    assert.equal(selection[3], 'reward_selected');
    assert.equal(notificationQueued, false);
  } finally {
    db.pool.connect = originalConnect;
  }
});

test('an expired claim link can be renewed without allowing repeated resend requests', async () => {
  const originalConnect = db.pool.connect;
  let claimStatus = 'email_sent';
  let renewalCount = 0;
  db.pool.connect = async () => ({
    async query(sql, params = []) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM loyalty_cards') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            customer_id: 31,
            completed_at: '2026-09-27 12:00:00',
            reward_redeemed_at: null,
            reward_product_id: 95,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM loyalty_reward_claims') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            status: claimStatus,
            email_status: claimStatus === 'email_sent' ? 'sent' : 'pending',
            token_expires_at: new Date(Date.now() - 1000),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 95 }], rowCount: 1 };
      }
      if (sql.includes('SELECT email FROM customers')) {
        return { rows: [{ email: 'registered@example.test' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_reward_claims')) {
        renewalCount += 1;
        claimStatus = 'email_pending';
        assert.equal(params[2], 95);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected renewal query: ${sql}`);
    },
    release() {},
  });

  try {
    const result = await retryLoyaltyRewardEmail(31);
    assert.equal(result.status, 'email_pending');
    assert.equal(renewalCount, 1);
    await assert.rejects(
      retryLoyaltyRewardEmail(31),
      { statusCode: 409 }
    );
    assert.equal(renewalCount, 1);
  } finally {
    db.pool.connect = originalConnect;
  }
});

test('legacy redemption cannot bypass owner confirmation and delivered email', async () => {
  const originalConnect = db.pool.connect;
  const statements = [];
  db.pool.connect = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql.includes('FROM information_schema.columns') && sql.includes('column_name =')) {
        return { rows: [{ ready: true }], rowCount: 1 };
      }
      if (sql.includes('FROM information_schema.columns')) {
        return { rows: [{ ready: true }], rowCount: 1 };
      }
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM loyalty_cards') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            customer_id: 44,
            completed_at: '2026-09-27 12:00:00',
            reward_redeemed_at: null,
            reward_product_id: 101,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM loyalty_reward_claims')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected redemption query: ${sql}`);
    },
    release() {},
  });

  try {
    await assert.rejects(
      redeemLoyaltyReward(44, 5),
      { statusCode: 409 }
    );
    assert.equal(statements.some((sql) => sql.includes('INSERT INTO orders')), false);
    assert.equal(statements.includes('ROLLBACK'), true);
  } finally {
    db.pool.connect = originalConnect;
  }
});

test('the sixth stamp persists eligibility without queuing the reward claim email', async () => {
  const originalConnect = db.pool.connect;
  const customerId = 56;
  const orderId = 701;
  const card = {
    customer_id: customerId,
    stamp_count: 5,
    first_stamp_at: '2026-09-01T12:00:00.000Z',
    expires_at: '2027-03-01T12:00:00.000Z',
    completed_at: null,
    reward_redeemed_at: null,
    reward_product_id: null,
  };
  let eligibilityRows = 0;
  let stampNotificationRows = 0;
  db.pool.connect = async () => ({
    async query(sql, params = []) {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM information_schema.columns')) {
        return { rows: [{ ready: true }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_cards')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM orders') && sql.includes('WHERE id = $1 AND customer_id = $2')) {
        return {
          rows: [{
            id: orderId,
            customer_id: customerId,
            subtotal: 500,
            payment_status: 'paid',
            payment_method: 'payu',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM loyalty_stamps WHERE order_id = $1')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT reward_threshold FROM loyalty_settings')) {
        return { rows: [{ reward_threshold: 100 }], rowCount: 1 };
      }
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
        return { rows: [{ id: 3001 }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_stamp_email_notifications')) {
        stampNotificationRows += 1;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO loyalty_reward_claims')) {
        eligibilityRows += 1;
        assert.match(sql, /'eligible'/);
        assert.match(sql, /'not_sent'/);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM loyalty_cards lc')) {
        return {
          rows: [{
            ...card,
            total_stamps: 6,
            cards_completed: 1,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM loyalty_stamps ls')) {
        return { rows: [{ id: 3001, order_id: orderId, order_number: 'PAARA-701' }], rowCount: 1 };
      }
      if (sql.includes('FROM loyalty_reward_redemptions')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM products p')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM loyalty_reward_claims')) {
        return { rows: [{ status: 'eligible', email_status: 'not_sent' }], rowCount: 1 };
      }
      throw new Error(`Unexpected sixth-stamp query: ${sql}`);
    },
    release() {},
  });

  try {
    const result = await processLoyaltyOrder(orderId, customerId);
    assert.equal(result.order.awarded, true);
    assert.equal(result.state.stampCount, 6);
    assert.equal(result.state.rewardEligible, true);
    assert.equal(result.state.rewardClaimStatus, 'eligible');
    assert.equal(eligibilityRows, 1);
    assert.equal(stampNotificationRows, 1);
  } finally {
    db.pool.connect = originalConnect;
  }
});
