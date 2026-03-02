-- ─── Tabular Logsheet Layout Support ─────────────────────────────────────────
-- Adds a layout_type column to logsheet_templates so that admins can create
-- "tabular" style log sheets (like the Steam Engine Room Log Sheet) in addition
-- to the existing "standard" section+question form layout.
--
-- Tabular templates store their entire column-group / row / footer configuration
-- inside the existing header_config JSONB column, using the shape described in
-- the frontend TabularLogsheetBuilder component.
--
-- Tabular entry data is stored as a JSON blob in logsheet_entries.data (already
-- a JSONB column), rather than in the logsheet_answers normalised rows.
--
-- Run AFTER: 2026-03-02-rule-based-flag-engine.sql

ALTER TABLE logsheet_templates
  ADD COLUMN IF NOT EXISTS layout_type VARCHAR(20) NOT NULL DEFAULT 'standard';

-- Index allows efficient filtering by layout type (e.g., show only tabular)
CREATE INDEX IF NOT EXISTS idx_logsheet_templates_layout ON logsheet_templates(layout_type);

-- Ensure logsheet_entries.data column exists (added in earlier migration, but
-- guard here for safety)
ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS data JSONB;
