-- Allow asset_id to be NULL in checklist_submissions and logsheet_entries
-- so supervisors can submit without selecting an asset from the mobile app.

ALTER TABLE checklist_submissions
  ALTER COLUMN asset_id DROP NOT NULL;

-- logsheet_entries asset_id was originally NOT NULL; make it optional for mobile submissions
ALTER TABLE logsheet_entries
  ALTER COLUMN asset_id DROP NOT NULL;
