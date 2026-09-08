CREATE TABLE "loyalty_reward_redemptions" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "redeemed_at" TEXT NOT NULL,

    CONSTRAINT "loyalty_reward_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_loyalty_rewards_customer"
ON "loyalty_reward_redemptions"("customer_id", "redeemed_at");

ALTER TABLE "loyalty_reward_redemptions"
ADD CONSTRAINT "loyalty_reward_redemptions_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
