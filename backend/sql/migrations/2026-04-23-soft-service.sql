-- ─────────────────────────────────────────────────────────────────────────────
-- Soft Services: dynamic role capabilities + request tracking + push tokens
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add soft-service capability flags to company_roles
--    These replace the hardcoded role-name checks on mobile.
ALTER TABLE company_roles
  ADD COLUMN IF NOT EXISTS can_raise_soft_issue   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_resolve_soft_issue BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_soft_manager        BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Push token storage on company_users (for Expo push notifications)
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS push_token          VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_token_platform VARCHAR(10)  DEFAULT NULL;  -- 'ios' | 'android'

-- 3. Soft-service request table
--    Raised by users with can_raise_soft_issue=true.
--    Resolved by users with can_resolve_soft_issue=true.
CREATE TABLE IF NOT EXISTS soft_service_requests (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id           BIGINT       NOT NULL,
  asset_id             BIGINT       NOT NULL,
  template_id          BIGINT       NOT NULL,  -- checklist template used for the request
  template_type        VARCHAR(20)  NOT NULL DEFAULT 'checklist',
  -- client submission (the "before" record)
  raise_submission_id  BIGINT       DEFAULT NULL,  -- FK: checklist_submissions.id
  raised_by_user_id    BIGINT       NOT NULL,
  raised_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- resolution (the "after" record)
  status               VARCHAR(20)  NOT NULL DEFAULT 'open',  -- 'open' | 'resolved'
  resolve_submission_id BIGINT      DEFAULT NULL,  -- FK: checklist_submissions.id
  resolved_by_user_id  BIGINT       DEFAULT NULL,
  resolved_at          TIMESTAMP    DEFAULT NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ssr_company   (company_id),
  INDEX idx_ssr_asset     (company_id, asset_id, status),
  INDEX idx_ssr_raised_by (raised_by_user_id),
  INDEX idx_ssr_resolver  (resolved_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
