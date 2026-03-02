-- Track which company_user submitted a logsheet entry (for per-user completion filtering)
ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL;
