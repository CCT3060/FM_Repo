-- Work Orders table fixes (PostgreSQL / Supabase)
-- 1. Make asset_id nullable (work orders can exist without a linked asset)
-- 2. Add updated_at and closed_at columns

-- Make asset_id nullable
ALTER TABLE work_orders
  ALTER COLUMN asset_id DROP NOT NULL;

-- Add updated_at (no ON UPDATE trigger in PG; app sets it explicitly)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NULL;

-- Add closed_at (may already exist from the work-orders-portal migration)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT NULL;

-- Drop the old FK that required asset_id to be non-null / CASCADE delete
ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS fk_work_orders_asset;

-- Re-create FK with SET NULL so deleting an asset doesn't remove the work order
ALTER TABLE work_orders
  ADD CONSTRAINT fk_work_orders_asset
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;

-- ─── asset_details: ensure one row per asset (required for ON CONFLICT upsert) ─
-- Drop the plain index first so we can replace it with a unique one
DROP INDEX IF EXISTS idx_asset_details_asset;
ALTER TABLE asset_details
  DROP CONSTRAINT IF EXISTS uq_asset_details_asset;
ALTER TABLE asset_details
  ADD CONSTRAINT uq_asset_details_asset UNIQUE (asset_id);
