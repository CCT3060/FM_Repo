-- ─────────────────────────────────────────────────────────────────────────────
-- Soft Services: dynamic role capabilities + request tracking + push tokens
-- PostgreSQL-compatible migration
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add soft-service capability flags to company_roles
ALTER TABLE company_roles
  ADD COLUMN IF NOT EXISTS can_raise_soft_issue   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_resolve_soft_issue BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_soft_manager        BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Push token storage on company_users (for Expo push notifications)
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS push_token          VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_token_platform VARCHAR(10)  DEFAULT NULL;

-- 3. Soft-service request table
CREATE TABLE IF NOT EXISTS soft_service_requests (
  id                    BIGSERIAL PRIMARY KEY,
  company_id            BIGINT        NOT NULL,
  asset_id              BIGINT        NOT NULL,
  template_id           BIGINT        NOT NULL,
  template_type         VARCHAR(20)   NOT NULL DEFAULT 'checklist',
  raise_submission_id   BIGINT        DEFAULT NULL,
  raised_by_user_id     BIGINT        NOT NULL,
  raised_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status                VARCHAR(20)   NOT NULL DEFAULT 'open',
  resolve_submission_id BIGINT        DEFAULT NULL,
  resolved_by_user_id   BIGINT        DEFAULT NULL,
  resolved_at           TIMESTAMPTZ   DEFAULT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssr_company  ON soft_service_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_ssr_asset    ON soft_service_requests (company_id, asset_id, status);
CREATE INDEX IF NOT EXISTS idx_ssr_raiser   ON soft_service_requests (raised_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ssr_resolver ON soft_service_requests (resolved_by_user_id);
