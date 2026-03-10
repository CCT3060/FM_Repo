-- Logsheet template: add frequency type and direct asset binding

-- Add frequency field (daily, weekly, monthly, quarterly, half-yearly, yearly)
ALTER TABLE logsheet_templates
  ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) NOT NULL DEFAULT 'daily';

-- Add direct asset binding (optional - template can be pre-bound to a specific asset)
ALTER TABLE logsheet_templates
  ADD COLUMN IF NOT EXISTS asset_id INTEGER NULL;

-- Index for asset binding
CREATE INDEX IF NOT EXISTS idx_logsheet_templates_asset ON logsheet_templates(asset_id);

-- Add FK for asset binding (ON DELETE SET NULL so template survives if asset removed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_logsheet_templates_asset'
      AND table_name = 'logsheet_templates'
  ) THEN
    ALTER TABLE logsheet_templates
      ADD CONSTRAINT fk_logsheet_templates_asset
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Backfill: for existing templates that have an assignment, set asset_id from that assignment
UPDATE logsheet_templates lt
SET asset_id = lta.asset_id
FROM (
  SELECT template_id, MIN(asset_id) AS asset_id
  FROM logsheet_template_assignments
  GROUP BY template_id
) lta
WHERE lta.template_id = lt.id
  AND lt.asset_id IS NULL;
