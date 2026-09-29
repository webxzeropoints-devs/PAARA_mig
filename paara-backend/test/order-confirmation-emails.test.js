const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createOrderConfirmationEmailWorker,
  retryDelayMs,
} = require('../services/orderConfirmationEmails');

function createOutboxPool() {
  const state = {
    available: true,
    updateSql: '',
    updateParams: null,
  };
  const pool = {
    state,
    async connect() {
      return {
        async query(sql) {
          if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) {
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes('SELECT notification.id')) {
            if (!state.available) return { rows: [], rowCount: 0 };
            state.available = false;
            return {
              rows: [{ id: 5, order_id: 77, attempts: 0 }],
              rowCount: 1,
            };
          }
          if (sql.includes('UPDATE order_confirmation_email_notifications')) {
            state.updateSql = sql;
            return { rows: [], rowCount: 1 };
          }
          throw new Error(`Unexpected outbox claim query: ${sql}`);
        },
        release() {},
      };
    },
    async query(sql, params) {
      state.updateSql = sql;
      state.updateParams = params;
      return { rows: [], rowCount: 1 };
    },
  };
  return pool;
}

test('sends and marks a queued order confirmation exactly once', async () => {
  const pool = createOutboxPool();
  const deliveredOrders = [];
  const worker = createOrderConfirmationEmailWorker({
    pool,
    sendOrderEmail: async (orderId) => {
      deliveredOrders.push(orderId);
      return { success: true };
    },
    logger: { error() {} },
  });

  await worker.processPending();
  await worker.processPending();

  assert.deepEqual(deliveredOrders, [77]);
  assert.match(pool.state.updateSql, /SET status = 'sent'/);
});

test('requeues failed order emails with a backoff and sanitized error', async () => {
  const pool = createOutboxPool();
  const worker = createOrderConfirmationEmailWorker({
    pool,
    sendOrderEmail: async () => {
      throw new Error('Temporary SMTP delivery failure.');
    },
    logger: { error() {} },
  });

  await worker.processPending();

  assert.match(pool.state.updateSql, /SET status = 'pending'/);
  assert.equal(pool.state.updateParams[1], 60000);
  assert.equal(pool.state.updateParams[2], 'Temporary SMTP delivery failure.');
});

test('caps order email retry delays', () => {
  assert.equal(retryDelayMs(1), 60000);
  assert.equal(retryDelayMs(16), 6 * 60 * 60 * 1000);
});
