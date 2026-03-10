-- ─── Rule-Based Flag & Alert Engine ──────────────────────────────────────────
-- Extends the existing flag system with:
--   • Full rule configuration on checklist + logsheet questions
--   • In-app notifications table
--   • Asset risk-level tracking (normal → unstable → high_risk)
--   • Entered value + expected rule metadata on flags
--   • Repeat violation counter on flags
-- Run AFTER: 2026-02-28-flags-system.sql

-- ── 1. checklist_template_questions: add rule_json ───────────────────────────
ALTER TABLE checklist_template_questions
  ADD COLUMN IF NOT EXISTS rule_json JSON NULL;

-- ── 2. Extend flags table ─────────────────────────────────────────────────────
-- entered_value  – the actual value that violated the rule
-- expected_rule  – human-readable description of what was expected
-- repeat_count   – how many times this same question+asset violated its rule

ALTER TABLE flags
  ADD COLUMN IF NOT EXISTS entered_value  VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS expected_rule  VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS repeat_count   INT         NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_flags_question ON flags(question_id);

-- ── 3. Asset risk level ───────────────────────────────────────────────────────
-- normal    – fewer than 3 violations in 7 days
-- unstable  – 3+ violations in 7 days
-- high_risk – 5+ violations in 30 days

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) NOT NULL DEFAULT 'normal';

-- ── 4. Notifications table ────────────────────────────────────────────────────
-- The notifications table already exists (created in 2026-02-26-logsheet-workorders.sql)
-- with columns: id, user_id, type, payload, status, created_at.
-- We extend it here with the columns needed by the flag alert engine.
-- type values (new):
--   flag_raised     – new flag was auto-generated
--   flag_escalated  – unresolved flag was escalated
--   flag_resolved   – flag was resolved
--   flag_assigned   – supervisor was assigned a flag

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS company_id   BIGINT       NULL REFERENCES companies(id)     ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipient_id BIGINT       NULL REFERENCES company_users(id)  ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS flag_id      BIGINT       NULL REFERENCES flags(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title        VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS message      TEXT         NULL,
  ADD COLUMN IF NOT EXISTS is_read      BOOLEAN      NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_flag      ON notifications(flag_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications(recipient_id, is_read)
  WHERE is_read = FALSE;

-- ── 5. Escalation config per company (per-severity override) ─────────────────
-- If admin wants critical flags escalated after 2h instead of the global default,
-- they insert a row here.  Rows are optional – the job falls back to env vars.

CREATE TABLE IF NOT EXISTS escalation_config (
  id                BIGSERIAL   PRIMARY KEY,
  company_id        BIGINT      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  severity          VARCHAR(16) NOT NULL,   -- low | medium | high | critical
  escalation_hours  SMALLINT    NOT NULL DEFAULT 24,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_escalation_config UNIQUE (company_id, severity)
);

-- ── 6. rule_json contract (documentation only – stored in JSON columns) ───────
-- Applies to both logsheet_questions.rule_json AND
--              checklist_template_questions.rule_json
--
-- {
--   "operator"        : "between",     // gt|lt|gte|lte|between|outside|neq|eq|yes_no
--   "minValue"        : 10,
--   "maxValue"        : 100,
--   "idealMin"        : 20,            // optional: green zone
--   "idealMax"        : 80,
--   "triggerValue"    : "no",          // for yes_no: "no"|"yes"
--   "severity"        : "high",        // override auto-calculated severity
--   "autoWorkOrder"   : true,
--   "notifySupervisor": true,
--   "notifyAdmin"     : true,
--   "notifyClient"    : false,
--   "escalationHours" : 8             // per-rule escalation override
-- }
