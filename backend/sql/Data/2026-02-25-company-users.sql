-- Company-scoped portal users (admins / staff for each company)
-- PostgreSQL syntax (Supabase)

CREATE TABLE IF NOT EXISTS company_users (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name   VARCHAR(160) NOT NULL,
  email       VARCHAR(160) NOT NULL,
  phone       VARCHAR(32),
  designation VARCHAR(120),
  status      VARCHAR(20) NOT NULL DEFAULT 'Active',
  password_hash VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_email    ON company_users(email);
CREATE INDEX        IF NOT EXISTS idx_company_users_company ON company_users(company_id);
