-- ─── Shift Management System ──────────────────────────────────────────────────
-- Adds shift definitions, employee-shift assignments, and links shifts to
-- checklist/logsheet templates.
--
-- Also fixes: add `questions` JSON column to checklist_templates (used by
--             companyPortal routes to store questions inline).

-- ── 0. Fix existing gap: questions JSON column on checklist_templates ─────────
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS questions JSON;

-- ── 1. Shift definitions (company-scoped) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  start_time  TIME NOT NULL,  -- e.g. '06:00:00'
  end_time    TIME NOT NULL,  -- e.g. '14:00:00'  (can be < start_time for overnight)
  description TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_company ON shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status  ON shifts(status);

-- ── 2. Employee ↔ Shift many-to-many ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_shifts (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  shift_id        INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_user_id, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_user  ON employee_shifts(company_user_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_shift ON employee_shifts(shift_id);

-- ── 3. Link templates to a specific shift (optional; NULL = all shifts) ───────
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;

ALTER TABLE logsheet_templates
  ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;

-- ── 4. Record which shift a submission belonged to ───────────────────────────
ALTER TABLE checklist_submissions
  ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;

ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS submission_shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;

-- ── 5. Indexes for fast shift-based lookups ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_checklist_templates_shift ON checklist_templates(shift_id);
CREATE INDEX IF NOT EXISTS idx_logsheet_templates_shift  ON logsheet_templates(shift_id);
