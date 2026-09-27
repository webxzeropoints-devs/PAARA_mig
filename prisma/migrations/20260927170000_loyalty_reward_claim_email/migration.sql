CREATE TABLE "loyalty_reward_claims" (
  "id" SERIAL NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "eligibility_completed_at" TEXT NOT NULL,
  "reward_product_id" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'eligible',
  "token_hash" TEXT,
  "token_status" TEXT NOT NULL DEFAULT 'not_generated',
  "token_expires_at" TIMESTAMPTZ,
  "encrypted_token" TEXT,
  "email_status" TEXT NOT NULL DEFAULT 'not_sent',
  "email_attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email_claimed_at" TIMESTAMPTZ,
  "email_sent_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "claimed_at" TIMESTAMPTZ,
  "claimed_order_id" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "loyalty_reward_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loyalty_reward_claims_status_check"
    CHECK ("status" IN ('eligible', 'reward_selected', 'email_pending', 'email_sent', 'claimed')),
  CONSTRAINT "loyalty_reward_claims_token_status_check"
    CHECK ("token_status" IN ('not_generated', 'pending', 'active', 'claimed', 'expired')),
  CONSTRAINT "loyalty_reward_claims_email_status_check"
    CHECK ("email_status" IN ('not_sent', 'pending', 'sending', 'sent', 'failed'))
);

CREATE UNIQUE INDEX "loyalty_reward_claims_customer_eligibility_key"
ON "loyalty_reward_claims"("customer_id", "eligibility_completed_at");

CREATE UNIQUE INDEX "loyalty_reward_claims_token_hash_key"
ON "loyalty_reward_claims"("token_hash");

CREATE UNIQUE INDEX "loyalty_reward_claims_claimed_order_id_key"
ON "loyalty_reward_claims"("claimed_order_id");

CREATE INDEX "idx_loyalty_reward_claims_email_due"
ON "loyalty_reward_claims"("status", "email_status", "next_attempt_at");

ALTER TABLE "loyalty_reward_claims"
ADD CONSTRAINT "loyalty_reward_claims_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loyalty_reward_claims"
ADD CONSTRAINT "loyalty_reward_claims_reward_product_id_fkey"
FOREIGN KEY ("reward_product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loyalty_reward_claims"
ADD CONSTRAINT "loyalty_reward_claims_claimed_order_id_fkey"
FOREIGN KEY ("claimed_order_id") REFERENCES "orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
