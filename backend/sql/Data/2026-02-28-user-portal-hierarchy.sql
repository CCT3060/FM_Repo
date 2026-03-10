-- ─── User Portal Hierarchy ───────────────────────────────────────────────────
-- Adds supervisor_id (self-ref FK) to company_users so supervisors can have helpers.
-- Creates template_user_assignments table so admins can assign checklist / logsheet
-- templates to supervisors, and supervisors can re-assign to their team members.

-- 1. self-referential supervisor column
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS supervisor_id INTEGER NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_company_users_supervisor'
      AND table_name = 'company_users'
  ) THEN
    ALTER TABLE company_users
      ADD CONSTRAINT fk_company_users_supervisor
      FOREIGN KEY (supervisor_id)
      REFERENCES company_users(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_company_users_supervisor
  ON company_users(supervisor_id);

-- 2. template assignment table
CREATE TABLE IF NOT EXISTS template_user_assignments (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_type VARCHAR(20) NOT NULL CHECK (template_type IN ('checklist','logsheet')),
  template_id  INTEGER NOT NULL,
  assigned_to  INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  assigned_by  INTEGER REFERENCES company_users(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tua_company
  ON template_user_assignments(company_id);

CREATE INDEX IF NOT EXISTS idx_tua_assigned_to
  ON template_user_assignments(assigned_to);

CREATE INDEX IF NOT EXISTS idx_tua_template
  ON template_user_assignments(template_type, template_id);

-- prevent duplicate assignments of the same template to the same user
CREATE UNIQUE INDEX IF NOT EXISTS uq_tua_type_template_user
  ON template_user_assignments(template_type, template_id, assigned_to);
