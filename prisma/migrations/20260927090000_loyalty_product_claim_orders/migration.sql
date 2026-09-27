ALTER TABLE "loyalty_settings"
ADD COLUMN "reward_product_id" INTEGER;

CREATE UNIQUE INDEX "loyalty_settings_reward_product_id_key"
ON "loyalty_settings"("reward_product_id");

ALTER TABLE "loyalty_settings"
ADD CONSTRAINT "loyalty_settings_reward_product_id_fkey"
FOREIGN KEY ("reward_product_id") REFERENCES "products"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loyalty_reward_redemptions"
ADD COLUMN "product_id" INTEGER,
ADD COLUMN "order_id" INTEGER;

CREATE UNIQUE INDEX "loyalty_reward_redemptions_order_id_key"
ON "loyalty_reward_redemptions"("order_id");

ALTER TABLE "loyalty_reward_redemptions"
ADD CONSTRAINT "loyalty_reward_redemptions_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loyalty_reward_redemptions"
ADD CONSTRAINT "loyalty_reward_redemptions_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
