CREATE TABLE "order_confirmation_email_notifications" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_confirmation_email_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_confirmation_email_notifications_status_check"
    CHECK ("status" IN ('pending', 'sending', 'sent'))
);

CREATE UNIQUE INDEX "order_confirmation_email_notifications_order_id_key"
ON "order_confirmation_email_notifications"("order_id");

CREATE INDEX "idx_order_confirmation_email_due"
ON "order_confirmation_email_notifications"("status", "next_attempt_at");

ALTER TABLE "order_confirmation_email_notifications"
ADD CONSTRAINT "order_confirmation_email_notifications_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
