const crypto = require('node:crypto');
const { maskSensitiveText } = require('../utils/validate');

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 15000;
const CLAIM_TIMEOUT_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 60000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

function getEncryptionKey() {
  const secret = String(process.env.JWT_SECRET || '');
  if (!secret) throw new Error('Reward claim encryption is unavailable.');
  return crypto.createHash('sha256').update(secret).digest();
}

function generateClaimToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashClaimToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function encryptClaimToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(token), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decryptClaimToken(value) {
  const packed = Buffer.from(String(value), 'base64');
  if (packed.length < 29) throw new Error('Stored reward claim token is invalid.');
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

function retryDelayMs(attempt) {
  return Math.min(
    BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    MAX_RETRY_DELAY_MS
  );
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getFrontendOrigin() {
  const configured = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  if (!configured) throw new Error('Frontend URL is not configured for reward claims.');
  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Frontend URL is invalid for reward claims.');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Reward claim links must use HTTPS in production.');
  }
  return parsed.origin;
}

function buildRewardClaimEmail({ name, productName, token, expiresAt }) {
  const greeting = String(name || '').trim() || 'there';
  const claimUrl = new URL(
    `/rewards/claim/${encodeURIComponent(token)}`,
    getFrontendOrigin()
  ).toString();
  const expiry = new Date(expiresAt).toLocaleDateString('en-IN', {
    dateStyle: 'long',
    timeZone: 'Asia/Kolkata',
  });
  const safeName = escapeHtml(greeting);
  const safeProduct = escapeHtml(productName);
  const safeUrl = escapeHtml(claimUrl);

  return {
    subject: 'Your PAARA Jewellery loyalty reward is ready',
    text: [
      `Hi ${greeting},`,
      '',
      `Your PAARA Jewellery six-stamp reward is ready: ${productName}.`,
      'Use the secure link below to view your reward and claim instructions:',
      claimUrl,
      '',
      `Please claim your reward by ${expiry}.`,
      'The jewellery gift and standard delivery are complimentary. The reward is subject to the terms and validity displayed on the claim page.',
      '',
      'With love,',
      'PAARA Jewellery',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f7f3ed;color:#34251e;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdf9;border:1px solid #e8ddca">
          <tr><td style="padding:32px 28px;text-align:center;border-bottom:1px solid #eadfcf">
            <p style="margin:0;color:#a77b36;font-size:11px;letter-spacing:4px;text-transform:uppercase">PAARA Jewellery</p>
            <h1 style="margin:18px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:400">Your reward is ready</h1>
          </td></tr>
          <tr><td style="padding:28px">
            <p style="margin:0 0 16px;font-size:16px">Dear ${safeName},</p>
            <p style="margin:0 0 20px;color:#63564e;line-height:1.7">You have completed all six stamps on your PAARA Loyalty Card. Your complimentary jewellery reward has been selected for you.</p>
            <div style="margin:0 0 24px;padding:18px;background:#f7f3ed;border:1px solid #eadfcf;text-align:center">
              <p style="margin:0 0 8px;color:#a77b36;font-size:10px;letter-spacing:2px;text-transform:uppercase">Your selected reward</p>
              <p style="margin:0;font-family:Georgia,serif;font-size:20px">${safeProduct}</p>
            </div>
            <p style="margin:0 0 24px;color:#63564e;line-height:1.7">Choose “Claim Yours” to view the reward and follow the secure claim instructions. You may be asked to sign in to your PAARA account to confirm your delivery address.</p>
            <p style="margin:0 0 26px;text-align:center">
              <a href="${safeUrl}" style="display:inline-block;padding:14px 32px;background:#a77b36;color:#fff;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">Claim Yours</a>
            </p>
            <p style="margin:0;color:#75685e;font-size:12px;line-height:1.7">Please claim by <strong>${escapeHtml(expiry)}</strong>. The gift and standard delivery are complimentary. Your reward is subject to the terms and validity displayed on the claim page.</p>
          </td></tr>
          <tr><td style="padding:20px 28px;border-top:1px solid #eadfcf;text-align:center;color:#8b7b6f;font-size:12px">With love, PAARA Jewellery</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

function createLoyaltyRewardClaimEmailWorker({
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
        SELECT claim.id, claim.email_attempts, claim.encrypted_token,
               claim.token_expires_at, customer.name, customer.email,
               product.name AS product_name
        FROM loyalty_reward_claims claim
        JOIN customers customer ON customer.id = claim.customer_id
        JOIN products product ON product.id = claim.reward_product_id
        WHERE (
          (claim.status = 'email_pending'
            AND claim.email_status = 'pending'
            AND claim.next_attempt_at <= CURRENT_TIMESTAMP)
          OR
          (claim.status = 'email_pending'
            AND claim.email_status = 'sending'
            AND claim.email_claimed_at <= CURRENT_TIMESTAMP - INTERVAL '${CLAIM_TIMEOUT_MINUTES} minutes')
        )
        ORDER BY claim.created_at, claim.id
        LIMIT $1
        FOR UPDATE OF claim SKIP LOCKED
      `, [BATCH_SIZE]);

      const notifications = [];
      for (const claim of due.rows) {
        if (new Date(claim.token_expires_at).getTime() <= Date.now()) {
          await client.query(`
            UPDATE loyalty_reward_claims
            SET email_status = 'failed',
                token_status = 'expired',
                last_error = 'Claim link expired before email delivery.',
                email_claimed_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [claim.id]);
          continue;
        }
        await client.query(`
          UPDATE loyalty_reward_claims
          SET email_status = 'sending',
              email_attempts = email_attempts + 1,
              email_claimed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [claim.id]);
        claim.email_attempts = Number(claim.email_attempts || 0) + 1;
        notifications.push(claim);
      }
      await client.query('COMMIT');
      return notifications;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('[LOYALTY_REWARD_EMAIL_ROLLBACK_FAILED]', {
          message: maskSensitiveText(rollbackError.message),
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function updateDelivery(claim, result) {
    if (result.success) {
      await pool.query(`
        UPDATE loyalty_reward_claims
        SET status = 'email_sent',
            email_status = 'sent',
            token_status = 'active',
            encrypted_token = NULL,
            email_sent_at = CURRENT_TIMESTAMP,
            email_claimed_at = NULL,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'email_pending' AND email_status = 'sending'
      `, [claim.id]);
      return;
    }

    const message = maskSensitiveText(
      result.error?.message || 'Email provider did not accept the message.'
    ).slice(0, 1000);
    const finalFailure = Number(claim.email_attempts) >= MAX_ATTEMPTS;
    await pool.query(`
      UPDATE loyalty_reward_claims
      SET email_status = $2,
          next_attempt_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
          email_claimed_at = NULL,
          last_error = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'email_pending' AND email_status = 'sending'
    `, [
      claim.id,
      finalFailure ? 'failed' : 'pending',
      retryDelayMs(claim.email_attempts),
      message,
    ]);
  }

  async function processPending() {
    if (processing) return;
    processing = true;
    try {
      const claims = await claimBatch();
      for (const claim of claims) {
        let delivery;
        try {
          const token = decryptClaimToken(claim.encrypted_token);
          const recipient = String(claim.email || '').trim();
          if (!recipient) {
            delivery = {
              success: false,
              error: new Error('Customer has no registered email address.'),
            };
          } else {
            delivery = await trySendEmail({
              to: recipient,
              ...buildRewardClaimEmail({
                name: claim.name,
                productName: claim.product_name,
                token,
                expiresAt: claim.token_expires_at,
              }),
            }, `loyalty reward claim ${claim.id}`);
          }
          await updateDelivery(claim, delivery);
        } catch (error) {
          logger.error('[LOYALTY_REWARD_EMAIL_DELIVERY_FAILED]', {
            claimId: claim.id,
            message: maskSensitiveText(error.message),
            name: error.name,
          });
          await updateDelivery(claim, { success: false, error });
        }
      }
    } catch (error) {
      logger.error('[LOYALTY_REWARD_EMAIL_OUTBOX_FAILED]', {
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
  buildRewardClaimEmail,
  createLoyaltyRewardClaimEmailWorker,
  decryptClaimToken,
  encryptClaimToken,
  generateClaimToken,
  hashClaimToken,
  retryDelayMs,
};
