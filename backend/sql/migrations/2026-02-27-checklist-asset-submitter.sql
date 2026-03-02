-- Link checklist templates to a specific asset (optional)
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS asset_id BIGINT REFERENCES assets(id) ON DELETE SET NULL;

-- Track which company_user submitted a checklist (separate from the users table FK)
ALTER TABLE checklist_submissions
  ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL;
