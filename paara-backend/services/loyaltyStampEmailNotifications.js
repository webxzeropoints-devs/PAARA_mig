const { maskSensitiveText } = require('../utils/validate');

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 15000;
const CLAIM_TIMEOUT_MINUTES = 5;
const BASE_RETRY_DELAY_MS = 60000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

function buildLoyaltyStampEmail({ name, stampCount }) {
  const count = Number(stampCount);
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw new Error('Loyalty notification stamp count must be between 1 and 6.');
  }

  const greetingName = String(name || '').trim() || 'there';
  let update;

  if (count === 1) {
    update = 'Congratulations! You earned your first PAARA loyalty stamp.';
  } else if (count === 6) {
    update = 'Congratulations! Your PAARA loyalty card is complete. Your reward is unlocked!';
  } else {
    update = `Your PAARA loyalty card now has ${count} out of 6 stamps. Keep shopping to unlock your reward!`;
  }

  return {
    subject: `Your PAARA Jewellery Loyalty Card — ${count} of 6 stamps`,
    text: [
      `Hi ${greetingName},`,
      '',
      update,
      `Your current progress is ${count} out of 6 stamps (${Math.round((count / 6) * 100)}%).`,
      '',
      'Thank you for being part of PAARA Jewellery.',
      'With love,',
      'PAARA Jewellery',
    ].join('\n'),
  };
}

function retryDelayMs(attempt) {
  return Math.min(
    BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    MAX_RETRY_DELAY_MS
  );
}

function createLoyaltyStampEmailWorker({
  pool = require('../db/database.pg').pool,
  trySendEmail = require('../utils/email').trySendEmail,
  logger = console,
} = {}) {
  let timer = null;
  let processing = false;

  async function claimBatch() {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const due = await client.query(`
        SELECT notification.id, notification.stamp_count, notification.attempts,
               customer.name, customer.email
        FROM loyalty_stamp_email_notifications notification
        JOIN loyalty_stamps stamp ON stamp.id = notification.stamp_id
        JOIN customers customer ON customer.id = stamp.customer_id
        WHERE (
          (notification.status = 'pending'
            AND notification.next_attempt_at <= to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
          OR
          (notification.status = 'sending'
            AND notification.claimed_at <= to_char(
              CURRENT_TIMESTAMP - INTERVAL '${CLAIM_TIMEOUT_MINUTES} minutes',
              'YYYY-MM-DD HH24:MI:SS'
            ))
        )
        ORDER BY notification.created_at, notification.id
        LIMIT $1
        FOR UPDATE OF notification SKIP LOCKED
      `, [BATCH_SIZE]);

      for (const notification of due.rows) {
        await client.query(`
          UPDATE loyalty_stamp_email_notifications
          SET status = 'sending',
              attempts = attempts + 1,
              claimed_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
              updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
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
        logger.error('[LOYALTY_EMAIL_OUTBOX_ROLLBACK_FAILED]', {
          message: maskSensitiveText(rollbackError.message),
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function updateDelivery(notification, result) {
    if (result.success) {
      await pool.query(`
        UPDATE loyalty_stamp_email_notifications
        SET status = 'sent',
            sent_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
            claimed_at = NULL,
            last_error = NULL,
            updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
        WHERE id = $1 AND status = 'sending'
      `, [notification.id]);
      return;
    }

    const errorMessage = maskSensitiveText(
      result.error?.message || 'Email provider did not accept the message.'
    ).slice(0, 1000);

    await pool.query(`
      UPDATE loyalty_stamp_email_notifications
      SET status = 'pending',
          next_attempt_at = to_char(
            CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
            'YYYY-MM-DD HH24:MI:SS'
          ),
          claimed_at = NULL,
          last_error = $2,
          updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      WHERE id = $1 AND status = 'sending'
    `, [notification.id, errorMessage, retryDelayMs(notification.attempts)]);
  }

  async function processPending() {
    if (processing) return;
    processing = true;

    try {
      const notifications = await claimBatch();

      for (const notification of notifications) {
        let result;
        try {
          const recipient = String(notification.email || '').trim();
          if (!recipient) {
            result = {
              success: false,
              error: new Error('Customer has no registered email address.'),
            };
          } else {
            result = await trySendEmail({
              to: recipient,
              ...buildLoyaltyStampEmail(notification),
            }, `loyalty stamp notification ${notification.id}`);
          }
          await updateDelivery(notification, result);
        } catch (error) {
          logger.error('[LOYALTY_EMAIL_OUTBOX_DELIVERY_FAILED]', {
            notificationId: notification.id,
            message: maskSensitiveText(error.message),
            name: error.name,
          });

          if (result) {
            await updateDelivery(notification, {
              success: false,
              error,
            });
          } else {
            await updateDelivery(notification, {
              success: false,
              error,
            });
          }
        }
      }
    } catch (error) {
      logger.error('[LOYALTY_EMAIL_OUTBOX_PROCESS_FAILED]', {
        message: maskSensitiveText(error.message),
        name: error.name,
      });
    } finally {
      processing = false;
    }
  }

  function start() {
    if (timer) return stop;
    timer = setInterval(() => {
      void processPending();
    }, POLL_INTERVAL_MS);
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
  buildLoyaltyStampEmail,
  createLoyaltyStampEmailWorker,
  retryDelayMs,
};
