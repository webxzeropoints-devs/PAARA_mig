-- Reconcile product filter fields for PostgreSQL databases that are missing
-- the columns despite the original filter-field migration being recorded or
-- skipped during deployment.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "shop_for" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "features" TEXT NOT NULL DEFAULT '[]';
