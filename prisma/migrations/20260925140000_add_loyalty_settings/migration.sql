CREATE TABLE "loyalty_settings" (
  "id" INTEGER PRIMARY KEY,
  "reward_threshold" DECIMAL(12, 2) NOT NULL CHECK ("reward_threshold" > 0),
  "updated_at" TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  CONSTRAINT "loyalty_settings_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "loyalty_settings" ("id", "reward_threshold")
VALUES (1, 19)
ON CONFLICT ("id") DO NOTHING;
