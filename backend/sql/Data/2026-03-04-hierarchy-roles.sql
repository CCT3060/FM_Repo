-- Add shift column to company_users (for shift-based Assistant Managers)
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS shift VARCHAR(30) DEFAULT NULL;

-- Update role comment to include new hierarchy roles
COMMENT ON COLUMN company_users.role IS
  'Hierarchy: technical_lead > assistant_manager > technical_executive > supervisor > technician. '
  'Others: admin, cleaner, security, driver, fleet_operator, employee';

-- Index for faster hierarchy lookups
CREATE INDEX IF NOT EXISTS idx_cu_role         ON company_users (role);
CREATE INDEX IF NOT EXISTS idx_cu_supervisor   ON company_users (supervisor_id);
