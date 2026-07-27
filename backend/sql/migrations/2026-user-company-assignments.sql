-- ─── Multi-Company User Assignments ────────────────────────────────────────────
-- Allows a single company_user (typically admin role) to be assigned to multiple
-- companies. The primary company is still stored in company_users.company_id.
-- Additional companies are stored here.

CREATE TABLE IF NOT EXISTS user_company_assignments (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_uca_user_id    ON user_company_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_uca_company_id ON user_company_assignments(company_id);

COMMENT ON TABLE user_company_assignments IS
  'Extra company access for multi-company users (e.g. admins managing several companies)';
