CREATE TABLE "loyalty_stamp_email_notifications" (
  "id" SERIAL NOT NULL,
  "stamp_id" INTEGER NOT NULL,
  "stamp_count" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  "claimed_at" TEXT,
  "sent_at" TEXT,
  "last_error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  "updated_at" TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),

  CONSTRAINT "loyalty_stamp_email_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loyalty_stamp_email_notifications_stamp_count_check"
    CHECK ("stamp_count" BETWEEN 1 AND 6),
  CONSTRAINT "loyalty_stamp_email_notifications_status_check"
    CHECK ("status" IN ('pending', 'sending', 'sent'))
);

CREATE UNIQUE INDEX "loyalty_stamp_email_notifications_stamp_id_key"
ON "loyalty_stamp_email_notifications"("stamp_id");

CREATE INDEX "idx_loyalty_stamp_email_due"
ON "loyalty_stamp_email_notifications"("status", "next_attempt_at");

ALTER TABLE "loyalty_stamp_email_notifications"
ADD CONSTRAINT "loyalty_stamp_email_notifications_stamp_id_fkey"
FOREIGN KEY ("stamp_id") REFERENCES "loyalty_stamps"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
