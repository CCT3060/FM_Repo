-- Add role field to company_users for the Company Employee Portal
-- PostgreSQL syntax (Supabase)

ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS role VARCHAR(60) NOT NULL DEFAULT 'employee';

COMMENT ON COLUMN company_users.role IS 'Values: admin, supervisor, technician, cleaner, security, driver, fleet_operator, employee';
