-- ─── Make flags.asset_id nullable ─────────────────────────────────────────────
-- Flags can now be raised on checklists / logsheets that are not linked to a
-- specific asset (e.g. general safety or administrative checklists).
-- Run AFTER: 2026-02-28-flags-system.sql

ALTER TABLE flags
  ALTER COLUMN asset_id DROP NOT NULL;

-- Also drop the FK constraint and recreate it without NOT NULL restriction
-- (PostgreSQL silently allows this; on Supabase the FK is already nullable-safe)
-- If the constraint doesn't exist the ALTER COLUMN above is sufficient.
