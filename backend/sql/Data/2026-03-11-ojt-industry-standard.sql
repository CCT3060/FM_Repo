-- =============================================================================
-- Migration: OJT Industry-Standard Enhancements
-- Date: 2026-03-11
-- Description:
--   Adds industry-standard OJT fields: training categories, estimated duration,
--   sequential module unlock, max test attempts, assignment system with due dates,
--   attempt tracking, and trainer/supervisor sign-off.
-- =============================================================================

-- ── Step 1: Extend ojt_trainings ─────────────────────────────────────────────

ALTER TABLE ojt_trainings
  ADD COLUMN IF NOT EXISTS category                   VARCHAR(60)  NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER      NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS is_sequential              BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_attempts               INTEGER      NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS trainer_id                 INTEGER      REFERENCES company_users(id) ON DELETE SET NULL;

-- ── Step 2: Extend ojt_user_progress ─────────────────────────────────────────

ALTER TABLE ojt_user_progress
  ADD COLUMN IF NOT EXISTS attempt_number         INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS due_date               DATE,
  ADD COLUMN IF NOT EXISTS assigned_by            INTEGER      REFERENCES company_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trainer_id             INTEGER      REFERENCES company_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trainer_sign_off_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trainer_sign_off_notes TEXT;

-- ── Step 3: Test attempt history table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS ojt_test_attempts (
  id               SERIAL       PRIMARY KEY,
  progress_id      INTEGER      NOT NULL REFERENCES ojt_user_progress(id) ON DELETE CASCADE,
  training_id      INTEGER      NOT NULL REFERENCES ojt_trainings(id)     ON DELETE CASCADE,
  company_user_id  INTEGER      NOT NULL,
  attempt_number   INTEGER      NOT NULL DEFAULT 1,
  score            INTEGER,
  earned_marks     INTEGER,
  total_marks      INTEGER,
  passed           BOOLEAN,
  submitted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ojt_attempts_progress  ON ojt_test_attempts(progress_id);
CREATE INDEX IF NOT EXISTS idx_ojt_attempts_user      ON ojt_test_attempts(company_user_id);
