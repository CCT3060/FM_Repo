-- ─── Checklist Submissions for QR Scans ────────────────────────────────────────
-- Adds a table to store checklist fills submitted via QR code (no auth),
-- similar to how logsheet_entries works but for checklists.

CREATE TABLE IF NOT EXISTS checklist_submissions (
  id                 SERIAL PRIMARY KEY,
  template_id        INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  asset_id           INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  submitted_by       INTEGER NULL REFERENCES company_users(id) ON DELETE SET NULL,
  submitted_by_name  VARCHAR(255) NULL,  -- for anonymous QR scans
  answers            JSONB NOT NULL DEFAULT '[]',
  note               TEXT,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_submissions_template
  ON checklist_submissions(template_id);

CREATE INDEX IF NOT EXISTS idx_checklist_submissions_asset
  ON checklist_submissions(asset_id);

CREATE INDEX IF NOT EXISTS idx_checklist_submissions_date
  ON checklist_submissions(submitted_at DESC);
