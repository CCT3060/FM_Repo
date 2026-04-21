-- ── Custom per-company roles / hierarchy ──────────────────────────────────
-- Lets each company admin define their own role hierarchy instead of the
-- hard-coded Technical Lead → Asst. Manager → Technical Executive → Supervisor
-- → Technician chain. Existing employees keep their `role` string; admin can
-- still create employees with any role string defined here.

CREATE TABLE IF NOT EXISTS company_roles (
  id               BIGSERIAL   PRIMARY KEY,
  company_id       BIGINT      NOT NULL,
  role_key         VARCHAR(80) NOT NULL,
  label            VARCHAR(120) NOT NULL,
  parent_role_key  VARCHAR(80) DEFAULT NULL,
  sort_order       SMALLINT    NOT NULL DEFAULT 0,
  color            VARCHAR(16) NOT NULL DEFAULT '#2563eb',
  bg_color         VARCHAR(16) NOT NULL DEFAULT '#dbeafe',
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_cr_company ON company_roles (company_id);
CREATE INDEX IF NOT EXISTS idx_cr_parent  ON company_roles (parent_role_key);
