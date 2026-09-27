const CARD_SIZE = 6;
const DEFAULT_THRESHOLD = 19;

function buildLoyaltyReceipt(awardResult) {
  if (!awardResult?.order?.awarded || !awardResult.state) return null;

  const stampCount = Math.max(
    0,
    Math.min(CARD_SIZE, Number(awardResult.state.stampCount) || 0)
  );
  const rewardEligible = Boolean(awardResult.state.rewardEligible);
  const rewardProductName = String(awardResult.state.rewardProduct?.name || '').trim() || null;
  const remainingStamps = Math.max(0, CARD_SIZE - stampCount);

  return {
    stampsEarned: 1,
    stampCount,
    totalStamps: Math.max(0, Number(awardResult.state.totalStamps) || 0),
    cardSize: CARD_SIZE,
    remainingStamps,
    stampMessage: 'You earned 1 loyalty stamp from this order.',
    progressMessage: remainingStamps > 0
      ? `Earn ${remainingStamps} more stamp${remainingStamps === 1 ? '' : 's'} to unlock your reward.`
      : 'Your loyalty reward is unlocked.',
    threshold: Number(awardResult.state.threshold) > 0
      ? Number(awardResult.state.threshold)
      : DEFAULT_THRESHOLD,
    rewardEligible,
    rewardProductName,
    rewardStatus: rewardEligible
      ? rewardProductName
        ? 'Gift ready to claim'
        : 'Eligible; gift selection pending'
      : 'In progress',
  };
}

async function getOrderLoyaltyReceipt(db, orderId, customerId) {
  const result = await db.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM loyalty_stamps ls
        WHERE ls.order_id = $1
          AND ls.customer_id = $2
      ) AS awarded,
      lc.stamp_count,
      (
        SELECT COUNT(*)
        FROM loyalty_stamps ls
        WHERE ls.customer_id = $2
      ) AS total_stamps,
      lc.completed_at IS NOT NULL
        AND lc.reward_redeemed_at IS NULL AS reward_eligible,
      (
        SELECT p.name
        FROM products p
        WHERE p.id = NULLIF(to_jsonb(lc)->>'reward_product_id', '')::integer
          AND p.is_active = TRUE
      ) AS reward_product_name,
      COALESCE(
        (SELECT reward_threshold FROM loyalty_settings WHERE id = 1),
        $3
      ) AS threshold
    FROM loyalty_cards lc
    WHERE lc.customer_id = $2
  `, [orderId, customerId, DEFAULT_THRESHOLD]);

  const row = result.rows[0];
  if (!row?.awarded) return null;

  return buildLoyaltyReceipt({
    order: { awarded: true },
    state: {
      stampCount: row.stamp_count,
      totalStamps: row.total_stamps,
      rewardEligible: row.reward_eligible,
      rewardProduct: row.reward_product_name ? { name: row.reward_product_name } : null,
      threshold: row.threshold,
    },
  });
}

module.exports = { buildLoyaltyReceipt, getOrderLoyaltyReceipt };
