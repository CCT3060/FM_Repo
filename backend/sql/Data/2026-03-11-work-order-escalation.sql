-- =============================================================================
-- Migration: Work Order Escalation System
-- Date: 2026-03-11
-- Description:
--   Adds escalation tracking columns to work_orders and creates a dedicated
--   escalation history table to log every auto-escalation event.
-- =============================================================================

-- ── Step 1: Extend work_orders with escalation columns ───────────────────────

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS expected_completion_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_interval_minutes INTEGER     NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS escalation_level            INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_note             TEXT;

-- ── Step 2: Create escalation history table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS work_order_escalation_history (
  id                     SERIAL       PRIMARY KEY,
  work_order_id          INTEGER      NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  escalation_level       INTEGER      NOT NULL,
  escalated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  previous_assignee_id   INTEGER      REFERENCES company_users(id) ON DELETE SET NULL,
  previous_assignee_name VARCHAR(160),
  new_assignee_id        INTEGER      REFERENCES company_users(id) ON DELETE SET NULL,
  new_assignee_name      VARCHAR(160),
  reason                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_wo_esc_hist_work_order
  ON work_order_escalation_history(work_order_id);

CREATE INDEX IF NOT EXISTS idx_wo_esc_hist_escalated_at
  ON work_order_escalation_history(escalated_at DESC);
