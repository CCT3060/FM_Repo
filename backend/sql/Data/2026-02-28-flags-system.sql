-- ─── Flag System ──────────────────────────────────────────────────────────────
-- Implements enterprise-level flag tracking for Checklists and Logsheets.
-- Tables: flags, flag_history
-- Extends: assets (health columns), work_orders (flag_id link)
-- Run this migration on your Supabase/Postgres database.

-- ── 1. Asset health-tracking columns ─────────────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS open_flags_count SMALLINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_status    VARCHAR(10) NOT NULL DEFAULT 'green';

-- ── 2. Flags table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flags (
  id                   BIGSERIAL PRIMARY KEY,
  company_id           BIGINT NOT NULL REFERENCES companies(id)              ON DELETE CASCADE,
  asset_id             BIGINT NOT NULL REFERENCES assets(id)                 ON DELETE CASCADE,

  -- What originated the flag
  source               VARCHAR(20) NOT NULL DEFAULT 'manual',   -- checklist | logsheet | manual

  -- Checklist context
  checklist_id         BIGINT NULL REFERENCES checklist_templates(id)        ON DELETE SET NULL,
  submission_id        BIGINT NULL REFERENCES checklist_submissions(id)      ON DELETE SET NULL,
  question_id          BIGINT NULL,   -- checklist_template_questions.id or logsheet_questions.id (no FK – flexible)

  -- Logsheet context
  logsheet_entry_id    BIGINT NULL REFERENCES logsheet_entries(id)           ON DELETE SET NULL,
  logsheet_answer_id   BIGINT NULL,   -- logsheet_answers.id (no FK to avoid cascade issues)

  -- People
  raised_by            BIGINT NULL REFERENCES company_users(id)              ON DELETE SET NULL,
  supervisor_id        BIGINT NULL REFERENCES company_users(id)              ON DELETE SET NULL,

  -- Content
  description          TEXT,
  severity             VARCHAR(16) NOT NULL DEFAULT 'medium',   -- low | medium | high | critical
  status               VARCHAR(20) NOT NULL DEFAULT 'open',     -- open | in_progress | resolved | closed

  -- Work-order linkage (populated automatically for critical flags)
  work_order_id        BIGINT NULL REFERENCES work_orders(id)                ON DELETE SET NULL,

  -- Escalation
  escalated            BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at         TIMESTAMPTZ NULL,

  -- Lifecycle
  resolved_at          TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flags_company    ON flags(company_id);
CREATE INDEX IF NOT EXISTS idx_flags_asset      ON flags(asset_id);
CREATE INDEX IF NOT EXISTS idx_flags_status     ON flags(status);
CREATE INDEX IF NOT EXISTS idx_flags_severity   ON flags(severity);
CREATE INDEX IF NOT EXISTS idx_flags_supervisor ON flags(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_flags_source     ON flags(source);
CREATE INDEX IF NOT EXISTS idx_flags_created    ON flags(created_at DESC);

-- ── 3. Flag status audit history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flag_history (
  id           BIGSERIAL PRIMARY KEY,
  flag_id      BIGINT NOT NULL REFERENCES flags(id)           ON DELETE CASCADE,
  old_status   VARCHAR(20) NULL,
  new_status   VARCHAR(20) NOT NULL,
  updated_by   BIGINT NULL REFERENCES company_users(id)       ON DELETE SET NULL,
  remark       VARCHAR(500),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flag_history_flag ON flag_history(flag_id);

-- ── 4. Extend work_orders to reference the originating flag ───────────────────
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS flag_id BIGINT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_work_orders_flag'
      AND table_name = 'work_orders'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT fk_work_orders_flag
      FOREIGN KEY (flag_id) REFERENCES flags(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_work_orders_flag ON work_orders(flag_id);
