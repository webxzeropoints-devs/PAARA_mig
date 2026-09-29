const { maskSensitiveText } = require('../utils/validate');

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 15000;
const CLAIM_TIMEOUT_MINUTES = 5;
const BASE_RETRY_DELAY_MS = 60000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

function retryDelayMs(attempt) {
  return Math.min(
    BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    MAX_RETRY_DELAY_MS
  );
}

function createOrderConfirmationEmailWorker({
  pool = require('../db/database.pg').pool,
  sendOrderEmail,
  logger = console,
} = {}) {
  if (typeof sendOrderEmail !== 'function') {
    throw new Error('An order confirmation email sender is required.');
  }

  let timer = null;
  let processing = false;

  async function claimBatch() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const due = await client.query(`
        SELECT notification.id, notification.order_id, notification.attempts
        FROM order_confirmation_email_notifications notification
        WHERE (
          (notification.status = 'pending'
            AND notification.next_attempt_at <= CURRENT_TIMESTAMP)
          OR
          (notification.status = 'sending'
            AND notification.claimed_at <= CURRENT_TIMESTAMP - INTERVAL '${CLAIM_TIMEOUT_MINUTES} minutes')
        )
        ORDER BY notification.created_at, notification.id
        LIMIT $1
        FOR UPDATE OF notification SKIP LOCKED
      `, [BATCH_SIZE]);

      for (const notification of due.rows) {
        await client.query(`
          UPDATE order_confirmation_email_notifications
          SET status = 'sending',
              attempts = attempts + 1,
              claimed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [notification.id]);
        notification.attempts = Number(notification.attempts || 0) + 1;
      }

      await client.query('COMMIT');
      return due.rows;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('[ORDER_CONFIRMATION_EMAIL_ROLLBACK_FAILED]', {
          message: maskSensitiveText(rollbackError.message),
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function updateDelivery(notification, error = null) {
    if (!error) {
      await pool.query(`
        UPDATE order_confirmation_email_notifications
        SET status = 'sent',
            sent_at = CURRENT_TIMESTAMP,
            claimed_at = NULL,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'sending'
      `, [notification.id]);
      return;
    }

    const message = maskSensitiveText(
      error.message || 'Email provider did not accept the message.'
    ).slice(0, 1000);
    await pool.query(`
      UPDATE order_confirmation_email_notifications
      SET status = 'pending',
          next_attempt_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
          claimed_at = NULL,
          last_error = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'sending'
    `, [
      notification.id,
      retryDelayMs(notification.attempts),
      message,
    ]);
  }

  async function processPending() {
    if (processing) return;
    processing = true;
    try {
      const notifications = await claimBatch();
      for (const notification of notifications) {
        try {
          const result = await sendOrderEmail(notification.order_id);
          if (!result?.success) {
            throw new Error('Order confirmation email was not delivered.');
          }
          await updateDelivery(notification);
        } catch (error) {
          logger.error('[ORDER_CONFIRMATION_EMAIL_DELIVERY_FAILED]', {
            orderId: notification.order_id,
            message: maskSensitiveText(error.message),
            name: error.name,
          });
          await updateDelivery(notification, error);
        }
      }
    } catch (error) {
      logger.error('[ORDER_CONFIRMATION_EMAIL_OUTBOX_FAILED]', {
        message: maskSensitiveText(error.message),
        name: error.name,
      });
    } finally {
      processing = false;
    }
  }

  function start() {
    if (timer) return stop;
    timer = setInterval(() => void processPending(), POLL_INTERVAL_MS);
    timer.unref?.();
    void processPending();
    return stop;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { processPending, start, stop };
}

module.exports = {
  createOrderConfirmationEmailWorker,
  retryDelayMs,
};
