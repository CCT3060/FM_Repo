-- Add custom_hours JSON column to checklist_templates
-- Stores an array of hour integers (0-23) for hourly scheduling when frequency = 'Custom'
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS custom_hours JSON NULL AFTER frequency;
