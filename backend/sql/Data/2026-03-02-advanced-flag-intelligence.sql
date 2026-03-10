-- =============================================================================
-- Advanced Flag Intelligence Engine – Full Schema (PostgreSQL / Supabase)
-- Migration: 2026-03-02
-- =============================================================================

-- ── 1. Enhanced flags table: add new columns ─────────────────────────────────
alter table flags
  add column if not exists rule_group_id       bigint       default null,
  add column if not exists severity_score      numeric(5,2) default null,
  add column if not exists trend_flag          boolean      not null default false,
  add column if not exists pattern_type        varchar(80)  default null,
  add column if not exists client_visible      boolean      not null default false,
  add column if not exists visibility_mode     varchar(32)  not null default 'internal',
  add column if not exists visibility_hours    smallint     default null,
  add column if not exists acknowledged_at     timestamptz  default null,
  add column if not exists investigating_at    timestamptz  default null,
  add column if not exists linked_wo_at        timestamptz  default null,
  add column if not exists closed_at           timestamptz  default null,
  add column if not exists ignored_at          timestamptz  default null,
  add column if not exists ignored_reason      text         default null,
  add column if not exists root_cause_category varchar(120) default null,
  add column if not exists repeat_count        smallint     not null default 0,
  add column if not exists department_id       bigint       default null,
  add column if not exists sla_hours           smallint     default null,
  add column if not exists first_response_at   timestamptz  default null;

-- ── 2. Multi-condition rule groups ───────────────────────────────────────────
create table if not exists flag_rule_groups (
  id                    bigserial primary key,
  company_id            bigint       not null,
  checklist_template_id bigint       default null,
  logsheet_template_id  bigint       default null,
  name                  varchar(200) not null,
  description           text         default null,
  logic_operator        varchar(3)   not null default 'AND'
                          check (logic_operator in ('AND','OR')),
  applies_to            varchar(16)  not null default 'checklist'
                          check (applies_to in ('checklist','logsheet','both')),
  severity_override     varchar(16)  default null
                          check (severity_override in ('low','medium','high','critical')),
  auto_create_wo        boolean      not null default false,
  auto_wo_threshold     varchar(16)  not null default 'high'
                          check (auto_wo_threshold in ('medium','high','critical')),
  notify_on_trigger     boolean      not null default true,
  client_visible        boolean      not null default false,
  visibility_mode       varchar(32)  not null default 'internal',
  visibility_hours      smallint     default null,
  is_active             boolean      not null default true,
  created_by            bigint       default null,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now()
);

create index if not exists idx_frg_company   on flag_rule_groups (company_id);
create index if not exists idx_frg_checklist on flag_rule_groups (checklist_template_id);
create index if not exists idx_frg_logsheet  on flag_rule_groups (logsheet_template_id);

-- ── 3. Individual conditions within a rule group ──────────────────────────────
create table if not exists flag_rule_conditions (
  id                     bigserial primary key,
  group_id               bigint      not null references flag_rule_groups(id) on delete cascade,
  condition_order        smallint    not null default 0,
  source_type            varchar(32) not null default 'question'
                           check (source_type in ('question','cross_question','trend','asset_field')),

  -- Question references
  question_id            bigint      default null,
  logsheet_question_key  varchar(200) default null,

  -- Compare-to mode
  compare_to             varchar(32) not null default 'value'
                           check (compare_to in
                             ('value','previous','rolling_avg','baseline','another_question')),
  compare_to_question_id bigint      default null,
  rolling_window         smallint    not null default 3,
  baseline_value         numeric(12,4) default null,

  -- Operator
  operator               varchar(20) not null default 'between'
                           check (operator in
                             ('gt','lt','gte','lte','eq','neq',
                              'between','outside',
                              'pct_deviation','rate_of_change',
                              'yes_no','ok_not_ok')),

  -- Threshold values
  value1                 numeric(12,4) default null,
  value2                 numeric(12,4) default null,
  pct_threshold          numeric(8,2)  default null,
  trigger_value          varchar(80)   default null,

  -- Nested sub-group logic
  parent_condition_id    bigint      default null,
  sub_logic_operator     varchar(3)  default null
                           check (sub_logic_operator in ('AND','OR')),

  created_at             timestamptz not null default now()
);

create index if not exists idx_frc_group    on flag_rule_conditions (group_id);
create index if not exists idx_frc_question on flag_rule_conditions (question_id);

-- ── 4. Asset risk scores ──────────────────────────────────────────────────────
create table if not exists asset_risk_scores (
  id                   bigserial primary key,
  asset_id             bigint       not null unique,
  company_id           bigint       not null,

  open_flags_count     smallint     not null default 0,
  critical_flags_count smallint     not null default 0,
  repeat_issue_count   smallint     not null default 0,
  wo_backlog_count     smallint     not null default 0,
  mttr_hours           numeric(8,2) default null,
  sla_breach_count     smallint     not null default 0,

  risk_score           numeric(5,2) not null default 0.00,
  risk_level           varchar(16)  not null default 'low'
                         check (risk_level in ('low','medium','high','critical')),
  asset_criticality    varchar(16)  not null default 'standard'
                         check (asset_criticality in ('standard','important','critical')),

  last_computed_at     timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

create index if not exists idx_ars_company on asset_risk_scores (company_id);
create index if not exists idx_ars_risk    on asset_risk_scores (risk_level);

-- ── 5. Trend analysis log ─────────────────────────────────────────────────────
create table if not exists trend_analysis_log (
  id             bigserial primary key,
  asset_id       bigint      not null,
  company_id     bigint      not null,

  source_type    varchar(16) not null default 'checklist'
                   check (source_type in ('checklist','logsheet')),
  question_id    bigint      default null,
  question_key   varchar(200) default null,

  detection_type varchar(40) not null
                   check (detection_type in
                     ('consecutive_violation','increasing_trend',
                      'sudden_spike','gradual_deterioration','oscillating')),
  window_size    smallint    not null default 3,
  values_json    jsonb       not null default '[]',
  severity       varchar(16) not null default 'medium'
                   check (severity in ('low','medium','high','critical')),

  flag_id        bigint      default null,
  detected_at    timestamptz not null default now()
);

create index if not exists idx_tal_asset   on trend_analysis_log (asset_id);
create index if not exists idx_tal_company on trend_analysis_log (company_id);
create index if not exists idx_tal_type    on trend_analysis_log (detection_type);
create index if not exists idx_tal_flag    on trend_analysis_log (flag_id);

-- ── 6. SLA tracking per flag ──────────────────────────────────────────────────
create table if not exists sla_tracking (
  id                      bigserial primary key,
  flag_id                 bigint       not null unique references flags(id) on delete cascade,
  company_id              bigint       not null,

  response_sla_hours      numeric(6,2) not null default 4.0,
  resolution_sla_hours    numeric(6,2) not null default 24.0,

  first_response_at       timestamptz  default null,
  resolved_at             timestamptz  default null,

  -- NULL = pending, true = met, false = breached
  response_met            boolean      default null,
  resolution_met          boolean      default null,
  response_breached_at    timestamptz  default null,
  resolution_breached_at  timestamptz  default null,

  response_time_hours     numeric(8,2) default null,
  resolution_time_hours   numeric(8,2) default null,

  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now()
);

create index if not exists idx_sla_company  on sla_tracking (company_id);
create index if not exists idx_sla_resp_met on sla_tracking (response_met);
create index if not exists idx_sla_res_met  on sla_tracking (resolution_met);

-- ── 7. Escalation matrix (admin-defined hierarchy) ────────────────────────────
create table if not exists escalation_matrix (
  id             bigserial primary key,
  company_id     bigint      not null,
  level          smallint    not null,
  level_label    varchar(80) not null default '',

  target_type    varchar(16) not null default 'role'
                   check (target_type in ('role','user','department')),
  target_role    varchar(80) default null,
  target_user_id bigint      default null,
  target_dept_id bigint      default null,

  trigger_type   varchar(30) not null
                   check (trigger_type in
                     ('severity','time_open_hours','repeat_count','risk_score')),
  trigger_value  varchar(80) not null,

  action         varchar(30) not null default 'notify'
                   check (action in
                     ('notify','reassign','create_wo','notify_client','escalate_severity')),

  is_active      boolean     not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists idx_em_company on escalation_matrix (company_id);
create index if not exists idx_em_level   on escalation_matrix (level);

-- ── 8. Flag escalation history ────────────────────────────────────────────────
create table if not exists flag_escalations (
  id                  bigserial primary key,
  flag_id             bigint      not null references flags(id) on delete cascade,
  matrix_level        smallint    default null,
  triggered_by        varchar(16) not null default 'auto'
                        check (triggered_by in ('auto','manual','system')),
  trigger_type        varchar(80) not null,
  trigger_value       varchar(80) default null,
  action_taken        varchar(120) not null,
  notified_users_json jsonb       default null,
  remark              text        default null,
  escalated_at        timestamptz not null default now()
);

create index if not exists idx_fesc_flag on flag_escalations (flag_id);

-- ── 9. Cross-asset correlation events ────────────────────────────────────────
create table if not exists asset_correlation_events (
  id             bigserial primary key,
  company_id     bigint      not null,
  location_key   varchar(200) not null,
  building       varchar(160) default null,
  floor          varchar(80)  default null,
  pattern_type   varchar(120) not null,
  asset_ids_json jsonb        not null default '[]',
  flag_ids_json  jsonb        not null default '[]',
  site_flag_id   bigint       default null,
  asset_count    smallint     not null default 2,
  severity       varchar(16)  not null default 'high'
                   check (severity in ('low','medium','high','critical')),
  status         varchar(16)  not null default 'open'
                   check (status in ('open','acknowledged','resolved')),
  detected_at    timestamptz  not null default now(),
  resolved_at    timestamptz  default null
);

create index if not exists idx_ace_company  on asset_correlation_events (company_id);
create index if not exists idx_ace_location on asset_correlation_events (location_key);
create index if not exists idx_ace_detected on asset_correlation_events (detected_at);

-- ── 10. Asset criticality extension ──────────────────────────────────────────
alter table assets
  add column if not exists criticality     varchar(16)  not null default 'standard'
                             check (criticality in ('standard','important','critical')),
  add column if not exists safety_impact   varchar(16)  not null default 'none'
                             check (safety_impact in ('none','low','medium','high')),
  add column if not exists baseline_values jsonb        default null,
  add column if not exists risk_score      numeric(5,2) default 0,
  add column if not exists risk_level      varchar(16)  not null default 'low'
                             check (risk_level in ('low','medium','high','critical'));

-- ── 11. Per-question flag rule config on checklist questions ─────────────────
alter table checklist_template_questions
  add column if not exists flag_rule_json jsonb default null;

-- ── Indexes for performance ───────────────────────────────────────────────────
create index if not exists idx_flags_asset_created  on flags (asset_id, created_at desc);
create index if not exists idx_flags_company_status on flags (company_id, status);
create index if not exists idx_flags_rule_group     on flags (rule_group_id);
create index if not exists idx_flags_trend          on flags (trend_flag, company_id);
