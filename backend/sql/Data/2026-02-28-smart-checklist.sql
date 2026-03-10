-- ─── Smart Checklist Engine ────────────────────────────────────────────────────
-- Adds enterprise-grade execution tracking to the asset-based checklist system.
--
-- Changes:
--   1. Extend asset_checklist_items with per-item behaviour flags
--   2. Create asset_checklist_submissions   (per-execution lifecycle)
--   3. Create asset_checklist_item_responses (per-item answer store)

-- ── 1. Smart behaviour flags on checklist items ───────────────────────────────
ALTER TABLE asset_checklist_items
  ADD COLUMN IF NOT EXISTS allow_image    SMALLINT NOT NULL DEFAULT 0,  -- 1 = image upload allowed
  ADD COLUMN IF NOT EXISTS allow_remark   SMALLINT NOT NULL DEFAULT 1,  -- 1 = remark text allowed
  ADD COLUMN IF NOT EXISTS allow_flag     SMALLINT NOT NULL DEFAULT 1,  -- 1 = technician can raise flag
  ADD COLUMN IF NOT EXISTS require_reason SMALLINT NOT NULL DEFAULT 0;  -- 1 = reason mandatory when flagged

-- ── 2. Submission (execution) header ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_checklist_submissions (
  id               BIGSERIAL PRIMARY KEY,
  checklist_id     BIGINT       NOT NULL REFERENCES asset_checklists(id)  ON DELETE CASCADE,
  asset_id         BIGINT       NOT NULL REFERENCES assets(id)            ON DELETE CASCADE,
  submitted_by     BIGINT       NULL     REFERENCES company_users(id)     ON DELETE SET NULL,
  submitted_by_name VARCHAR(200) NULL,                                    -- friendly name / fallback
  status           VARCHAR(30)  NOT NULL DEFAULT 'in_progress',
    -- in_progress | completed | completed_with_issues | overdue
  completion_pct   SMALLINT     NOT NULL DEFAULT 0,
  total_issues     SMALLINT     NOT NULL DEFAULT 0,
  submitted_at     TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acs_checklist  ON asset_checklist_submissions(checklist_id);
CREATE INDEX IF NOT EXISTS idx_acs_asset      ON asset_checklist_submissions(asset_id);
CREATE INDEX IF NOT EXISTS idx_acs_status     ON asset_checklist_submissions(status);
CREATE INDEX IF NOT EXISTS idx_acs_created    ON asset_checklist_submissions(created_at DESC);

-- ── 3. Per-item responses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_checklist_item_responses (
  id             BIGSERIAL PRIMARY KEY,
  submission_id  BIGINT   NOT NULL REFERENCES asset_checklist_submissions(id) ON DELETE CASCADE,
  item_id        BIGINT   NOT NULL REFERENCES asset_checklist_items(id)       ON DELETE CASCADE,
  answer         TEXT,
  flag_issue     BOOLEAN  NOT NULL DEFAULT FALSE,
  reason         TEXT,
  remark         TEXT,
  image_url      TEXT,
  answered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acir_submission ON asset_checklist_item_responses(submission_id);
CREATE INDEX IF NOT EXISTS idx_acir_item       ON asset_checklist_item_responses(item_id);
CREATE INDEX IF NOT EXISTS idx_acir_flag       ON asset_checklist_item_responses(flag_issue);
