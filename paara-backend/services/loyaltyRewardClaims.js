const db = require('../db/database.pg');
const publicImageUrl = require('../utils/publicImageUrl');
const {
  encryptClaimToken,
  generateClaimToken,
  hashClaimToken,
} = require('./loyaltyRewardClaimEmails');

const TOKEN_VALIDITY_DAYS = 30;

async function inTransaction(work) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[LOYALTY_REWARD_CLAIM_ROLLBACK_FAILED]', {
        message: rollbackError.message,
        name: rollbackError.name,
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function selectLoyaltyReward(customerId, productId) {
  return inTransaction(async (client) => {
    const cardResult = await client.query(`
      SELECT customer_id, completed_at, reward_redeemed_at
      FROM loyalty_cards
      WHERE customer_id = $1
      FOR UPDATE
    `, [customerId]);
    const card = cardResult.rows[0];
    if (!card?.completed_at || card.reward_redeemed_at) {
      throw Object.assign(
        new Error('This customer is not currently eligible for a gift.'),
        { statusCode: 409 }
      );
    }

    const previous = await client.query(`
      SELECT status
      FROM loyalty_reward_claims
      WHERE customer_id = $1 AND eligibility_completed_at = $2
      FOR UPDATE
    `, [customerId, card.completed_at]);
    if (['email_pending', 'email_sent', 'claimed'].includes(previous.rows[0]?.status)) {
      throw Object.assign(
        new Error('A confirmed reward cannot be changed.'),
        { statusCode: 409 }
      );
    }

    if (productId !== null) {
      const product = await client.query(
        'SELECT 1 FROM products WHERE id = $1 AND is_active = TRUE AND stock > 0',
        [productId]
      );
      if (product.rowCount === 0) {
        throw Object.assign(new Error('Choose an active jewellery gift that is in stock.'), { statusCode: 400 });
      }
    }

    await client.query(`
      UPDATE loyalty_cards
      SET reward_product_id = $2,
          updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
      WHERE customer_id = $1
    `, [customerId, productId]);
    if (productId !== null) {
      const notification = await queueRewardClaimEmail(
        client,
        customerId,
        card.completed_at,
        productId
      );
      return {
        customer_id: customerId,
        reward_product_id: productId,
        ...notification,
      };
    }

    await client.query(`
      INSERT INTO loyalty_reward_claims (
        customer_id, eligibility_completed_at, reward_product_id, status,
        token_status, email_status, next_attempt_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, 'not_generated', 'not_sent',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (customer_id, eligibility_completed_at) DO UPDATE
      SET reward_product_id = EXCLUDED.reward_product_id,
          status = EXCLUDED.status,
          token_hash = NULL,
          token_status = 'not_generated',
          token_expires_at = NULL,
          encrypted_token = NULL,
          email_status = 'not_sent',
          email_attempts = 0,
          email_claimed_at = NULL,
          email_sent_at = NULL,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
    `, [
      customerId,
      card.completed_at,
      productId,
      productId === null ? 'eligible' : 'reward_selected',
    ]);

    return { customer_id: customerId, reward_product_id: productId };
  });
}

async function queueRewardClaimEmail(client, customerId, completedAt, productId) {
  const customer = await client.query(
    'SELECT email FROM customers WHERE id = $1',
    [customerId]
  );
  if (!String(customer.rows[0]?.email || '').trim()) {
    throw Object.assign(
      new Error('This customer does not have a registered email address.'),
      { statusCode: 409 }
    );
  }

  const token = generateClaimToken();
  await client.query(`
    INSERT INTO loyalty_reward_claims (
      customer_id, eligibility_completed_at, reward_product_id, status,
      token_hash, token_status, token_expires_at, encrypted_token,
      email_status, email_attempts, next_attempt_at, email_claimed_at,
      email_sent_at, last_error, claimed_at, claimed_order_id,
      updated_at
    )
    VALUES (
      $1, $2, $3, 'email_pending', $4, 'pending',
      CURRENT_TIMESTAMP + ($5 * INTERVAL '1 day'), $6,
      'pending', 0, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (customer_id, eligibility_completed_at) DO UPDATE
    SET reward_product_id = EXCLUDED.reward_product_id,
        status = 'email_pending',
        token_hash = EXCLUDED.token_hash,
        token_status = 'pending',
        token_expires_at = EXCLUDED.token_expires_at,
        encrypted_token = EXCLUDED.encrypted_token,
        email_status = 'pending',
        email_attempts = 0,
        next_attempt_at = CURRENT_TIMESTAMP,
        email_claimed_at = NULL,
        email_sent_at = NULL,
        last_error = NULL,
        claimed_at = NULL,
        claimed_order_id = NULL,
        updated_at = CURRENT_TIMESTAMP
  `, [
    customerId,
    completedAt,
    productId,
    hashClaimToken(token),
    TOKEN_VALIDITY_DAYS,
    encryptClaimToken(token),
  ]);
  return { status: 'email_pending', email_status: 'pending' };
}

async function confirmLoyaltyReward(customerId) {
  return inTransaction(async (client) => {
    const cardResult = await client.query(`
      SELECT customer_id, completed_at, reward_redeemed_at, reward_product_id
      FROM loyalty_cards
      WHERE customer_id = $1
      FOR UPDATE
    `, [customerId]);
    const card = cardResult.rows[0];
    if (!card?.completed_at || card.reward_redeemed_at) {
      throw Object.assign(
        new Error('This customer is not currently eligible for a reward.'),
        { statusCode: 409 }
      );
    }

    const claimResult = await client.query(`
      SELECT id, status, email_status
      FROM loyalty_reward_claims
      WHERE customer_id = $1 AND eligibility_completed_at = $2
      FOR UPDATE
    `, [customerId, card.completed_at]);
    const claim = claimResult.rows[0];
    if (claim && ['email_pending', 'email_sent'].includes(claim.status)) {
      return { status: claim.status, email_status: claim.email_status, already_confirmed: true };
    }
    if (claim?.status === 'claimed') {
      throw Object.assign(new Error('This reward has already been claimed.'), { statusCode: 409 });
    }

    const productId = Number(card.reward_product_id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      throw Object.assign(new Error('Choose a jewellery gift before confirming the reward.'), { statusCode: 409 });
    }
    const product = await client.query(
      'SELECT 1 FROM products WHERE id = $1 AND is_active = TRUE AND stock > 0 FOR UPDATE',
      [productId]
    );
    if (product.rowCount === 0) {
      throw Object.assign(new Error('The selected jewellery gift is no longer available in stock.'), { statusCode: 409 });
    }
    return queueRewardClaimEmail(client, customerId, card.completed_at, productId);
  });
}

async function retryLoyaltyRewardEmail(customerId) {
  return inTransaction(async (client) => {
    const cardResult = await client.query(`
      SELECT customer_id, completed_at, reward_redeemed_at, reward_product_id
      FROM loyalty_cards
      WHERE customer_id = $1
      FOR UPDATE
    `, [customerId]);
    const card = cardResult.rows[0];
    if (!card?.completed_at || card.reward_redeemed_at) {
      throw Object.assign(
        new Error('This customer is not currently eligible for a reward.'),
        { statusCode: 409 }
      );
    }
    const claimResult = await client.query(`
      SELECT status, email_status, token_expires_at
      FROM loyalty_reward_claims
      WHERE customer_id = $1 AND eligibility_completed_at = $2
      FOR UPDATE
    `, [customerId, card.completed_at]);
    const claim = claimResult.rows[0];
    const deliveryFailed = claim?.status === 'email_pending' && claim.email_status === 'failed';
    const claimLinkExpired = claim?.status === 'email_sent'
      && new Date(claim.token_expires_at).getTime() <= Date.now();
    if (!deliveryFailed && !claimLinkExpired) {
      throw Object.assign(
        new Error('Only a failed email or an expired claim link can be retried.'),
        { statusCode: 409 }
      );
    }
    const productId = Number(card.reward_product_id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      throw Object.assign(new Error('Choose a jewellery gift before retrying the claim email.'), { statusCode: 409 });
    }
    const product = await client.query(
      'SELECT 1 FROM products WHERE id = $1 AND is_active = TRUE AND stock > 0 FOR UPDATE',
      [productId]
    );
    if (product.rowCount === 0) {
      throw Object.assign(new Error('The selected jewellery gift is no longer available in stock.'), { statusCode: 409 });
    }
    return queueRewardClaimEmail(
      client,
      customerId,
      card.completed_at,
      productId
    );
  });
}

async function getRewardClaim(token) {
  const value = String(token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) return null;
  const result = await db.query(`
    SELECT product.name AS reward_name,
           (
             SELECT image.image_url
             FROM product_images image
             WHERE image.product_id = product.id
             ORDER BY image.sort_order, image.id
             LIMIT 1
           ) AS image_url,
           claim.token_expires_at, claim.status,
           order_record.order_number, order_record.status AS order_status
    FROM loyalty_reward_claims claim
    JOIN products product ON product.id = claim.reward_product_id
    LEFT JOIN orders order_record ON order_record.id = claim.claimed_order_id
    WHERE claim.token_hash = $1
      AND (
        (
          claim.status = 'email_sent'
          AND claim.email_status = 'sent'
          AND claim.token_status = 'active'
          AND claim.token_expires_at > CURRENT_TIMESTAMP
        )
        OR (
          claim.status = 'claimed'
          AND claim.token_status = 'claimed'
        )
      )
      AND (claim.status = 'claimed' OR product.is_active = TRUE)
  `, [hashClaimToken(value)]);
  const claim = result.rows[0];
  if (!claim) return null;
  return {
    rewardName: claim.reward_name,
    imageUrl: publicImageUrl(claim.image_url),
    expiresAt: claim.token_expires_at,
    claimed: claim.status === 'claimed',
    orderNumber: claim.order_number || null,
    orderStatus: claim.order_status || null,
    deliveryIsComplimentary: true,
    terms: 'The selected jewellery gift and standard delivery are complimentary. Claim within the displayed validity period. The reward is not exchangeable for cash and is subject to PAARA Jewellery terms.',
  };
}

module.exports = {
  TOKEN_VALIDITY_DAYS,
  confirmLoyaltyReward,
  getRewardClaim,
  retryLoyaltyRewardEmail,
  selectLoyaltyReward,
};
