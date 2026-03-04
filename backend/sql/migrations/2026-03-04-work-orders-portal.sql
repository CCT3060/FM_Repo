
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS company_id    BIGINT       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flag_id       BIGINT       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_note TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ  DEFAULT NULL;

-- Widen issue_source to support 'checklist' and 'flag' origins
-- (For Supabase / PostgreSQL – alter the check constraint)
ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS work_orders_issue_source_check;

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_issue_source_check
    CHECK (issue_source IN ('logsheet','checklist','manual','flag'));

-- Backfill company_id from asset for existing rows
UPDATE work_orders wo
SET    company_id = a.company_id
FROM   assets a
WHERE  a.id = wo.asset_id
  AND  wo.company_id IS NULL;

-- Company-portal assignee/creator columns (separate from admin-side FK columns)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS cp_assigned_to BIGINT DEFAULT NULL
    REFERENCES company_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cp_created_by  BIGINT DEFAULT NULL
    REFERENCES company_users(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wo_company  ON work_orders (company_id);
CREATE INDEX IF NOT EXISTS idx_wo_flag     ON work_orders (flag_id);
CREATE INDEX IF NOT EXISTS idx_wo_assign   ON work_orders (assigned_to);
CREATE INDEX IF NOT EXISTS idx_wo_cp_asgn  ON work_orders (cp_assigned_to);
