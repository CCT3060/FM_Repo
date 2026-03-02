-- ─── Add Username for Mobile App Login ─────────────────────────────────────────
-- Adds username field to company_users table for mobile app authentication.
-- Username is unique and required for employees to login to the React Native app.

ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL;

-- Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_username 
  ON company_users(LOWER(username));

-- Add comment for documentation
COMMENT ON COLUMN company_users.username IS 'Unique username for mobile app login';
