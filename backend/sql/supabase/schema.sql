-- Supabase/Postgres schema for FM backend
-- Run inside your Supabase project's Postgres database

create table if not exists clients (
  id bigserial primary key,
  client_name varchar(160) not null,
  email varchar(160) unique,
  phone varchar(32),
  state_name varchar(80),
  pincode varchar(12),
  gst_number varchar(32),
  company_name varchar(160),
  address varchar(255),
  status varchar(16) not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id bigserial primary key,
  full_name varchar(160) not null,
  email varchar(160) not null unique,
  phone varchar(32),
  role varchar(120),
  status varchar(16) not null default 'Active',
  password_hash varchar(255) not null,
  client_id bigint not null references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id bigserial primary key,
  company_name varchar(160) not null,
  company_code varchar(80) not null unique,
  description varchar(255),
  address_line1 varchar(255),
  address_line2 varchar(255),
  city varchar(120),
  state_name varchar(120),
  country varchar(120),
  pincode varchar(32),
  gst_number varchar(64),
  pan_number varchar(32),
  cin_number varchar(64),
  contract_start_date date,
  contract_end_date date,
  billing_cycle varchar(32),
  payment_terms_days integer,
  max_employees integer,
  qsr_module smallint not null default 1,
  premeal_module smallint not null default 1,
  delivery_module smallint not null default 1,
  allow_guest_booking smallint not null default 0,
  status varchar(16) not null default 'Active',
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists departments (
  id bigserial primary key,
  company_id bigint not null references companies(id) on delete cascade,
  name varchar(160) not null,
  description varchar(255),
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists idx_departments_company on departments(company_id);

create table if not exists asset_types (
  id bigserial primary key,
  code varchar(80) not null unique,
  label varchar(160) not null,
  category varchar(80),
  description varchar(255),
  status varchar(16) not null default 'Active',
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id bigserial primary key,
  company_id bigint not null references companies(id) on delete cascade,
  department_id bigint references departments(id) on delete set null,
  asset_name varchar(200) not null,
  asset_unique_id varchar(120),
  asset_type varchar(120) not null,
  building varchar(160),
  floor varchar(80),
  room varchar(160),
  status varchar(16) not null default 'Active',
  qr_code varchar(255),
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assets_company on assets(company_id);
create index if not exists idx_assets_department on assets(department_id);

create table if not exists asset_details (
  id bigserial primary key,
  asset_id bigint not null references assets(id) on delete cascade,
  metadata jsonb,
  documents jsonb
);

create index if not exists idx_asset_details_asset on asset_details(asset_id);

create table if not exists asset_history (
  id bigserial primary key,
  asset_id bigint not null references assets(id) on delete cascade,
  action varchar(120) not null,
  details jsonb,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_history_asset on asset_history(asset_id);

create table if not exists asset_checklists (
  id bigserial primary key,
  asset_id bigint not null references assets(id) on delete cascade,
  name varchar(200) not null,
  description varchar(500),
  asset_category varchar(120) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_checklists_asset on asset_checklists(asset_id);

create table if not exists asset_checklist_items (
  id bigserial primary key,
  checklist_id bigint not null references asset_checklists(id) on delete cascade,
  title varchar(200) not null,
  answer_type varchar(64) not null default 'yes_no',
  is_required smallint not null default 0,
  order_index integer not null default 0,
  config jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_checklist_items_checklist on asset_checklist_items(checklist_id);

create table if not exists asset_checklist_assignments (
  id bigserial primary key,
  checklist_id bigint not null references asset_checklists(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (checklist_id, user_id)
);

create table if not exists asset_logs (
  id bigserial primary key,
  asset_id bigint not null references assets(id) on delete cascade,
  note text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_logs_asset on asset_logs(asset_id);

create table if not exists checklist_templates (
  id bigserial primary key,
  company_id bigint not null references companies(id) on delete cascade,
  template_name varchar(200) not null,
  asset_type varchar(80) not null,
  category varchar(80),
  description varchar(500),
  frequency varchar(32) not null default 'Daily',
  shift varchar(80),
  status varchar(16) not null default 'active',
  is_active smallint not null default 1,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_checklist_templates_company on checklist_templates(company_id);
create index if not exists idx_checklist_templates_asset_type on checklist_templates(asset_type);

create table if not exists checklist_template_questions (
  id bigserial primary key,
  template_id bigint not null references checklist_templates(id) on delete cascade,
  question_text varchar(500) not null,
  input_type varchar(64) not null,
  is_required smallint not null default 0,
  order_index integer not null default 0,
  options_json jsonb,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_checklist_template_questions_template on checklist_template_questions(template_id);

create table if not exists checklist_assignments (
  id bigserial primary key,
  template_id bigint not null references checklist_templates(id) on delete cascade,
  assigned_to_type varchar(32) not null,
  assigned_to_id bigint not null,
  frequency varchar(32) not null default 'Daily',
  start_date date,
  due_time time,
  status varchar(16) not null default 'active',
  attached_by bigint references users(id) on delete set null,
  attached_at timestamptz not null default now(),
  unique(template_id, assigned_to_type, assigned_to_id)
);

create index if not exists idx_checklist_assignment_target on checklist_assignments(assigned_to_type, assigned_to_id);

create table if not exists checklist_submissions (
  id bigserial primary key,
  template_id bigint not null references checklist_templates(id) on delete cascade,
  assignment_id bigint references checklist_assignments(id) on delete set null,
  asset_id bigint references assets(id) on delete set null,
  submitted_by bigint references users(id) on delete set null,
  shift varchar(80),
  status varchar(32) not null default 'draft',
  completion_pct smallint not null default 0,
  supervisor_by bigint references users(id) on delete set null,
  supervisor_note varchar(500),
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_checklist_submissions_template on checklist_submissions(template_id);
create index if not exists idx_checklist_submissions_assignment on checklist_submissions(assignment_id);
create index if not exists idx_checklist_submissions_status on checklist_submissions(status);

create table if not exists checklist_submission_answers (
  id bigserial primary key,
  submission_id bigint not null references checklist_submissions(id) on delete cascade,
  question_id bigint references checklist_template_questions(id) on delete set null,
  question_text varchar(500) not null,
  input_type varchar(64) not null,
  answer_json jsonb,
  option_selected varchar(255),
  created_at timestamptz not null default now()
);

create index if not exists idx_checklist_answers_submission on checklist_submission_answers(submission_id);

create table if not exists logsheet_templates (
  id bigserial primary key,
  company_id bigint not null references companies(id) on delete cascade,
  template_name varchar(200) not null,
  asset_type varchar(80) not null,
  asset_model varchar(160),
  header_config jsonb,
  description varchar(500),
  is_active smallint not null default 1,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists logsheet_sections (
  id bigserial primary key,
  template_id bigint not null references logsheet_templates(id) on delete cascade,
  section_name varchar(200) not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_logsheet_sections_template on logsheet_sections(template_id);

create table if not exists logsheet_questions (
  id bigserial primary key,
  section_id bigint not null references logsheet_sections(id) on delete cascade,
  question_text varchar(500) not null,
  specification varchar(255),
  answer_type varchar(32) not null,
  rule_json jsonb,
  priority varchar(16) not null default 'medium',
  is_mandatory smallint not null default 0,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_logsheet_questions_section on logsheet_questions(section_id);

create table if not exists logsheet_template_assignments (
  id bigserial primary key,
  template_id bigint not null references logsheet_templates(id) on delete cascade,
  asset_id bigint not null references assets(id) on delete cascade,
  attached_by bigint references users(id) on delete set null,
  attached_at timestamptz not null default now(),
  unique (template_id, asset_id)
);

create index if not exists idx_logsheet_assignment_asset on logsheet_template_assignments(asset_id);

create table if not exists logsheet_entries (
  id bigserial primary key,
  template_id bigint not null references logsheet_templates(id) on delete cascade,
  asset_id bigint not null references assets(id) on delete cascade,
  submitted_by bigint references users(id) on delete set null,
  entry_date date not null default current_date,
  month smallint not null,
  year smallint not null,
  status varchar(16) not null default 'submitted',
  shift varchar(80),
  header_values jsonb,
  submitted_at timestamptz not null default now(),
  data jsonb
);

create index if not exists idx_logsheet_entries_template on logsheet_entries(template_id);
create index if not exists idx_logsheet_entries_asset on logsheet_entries(asset_id);
create index if not exists idx_logsheet_entries_date on logsheet_entries(entry_date);

create table if not exists logsheet_answers (
  id bigserial primary key,
  entry_id bigint not null references logsheet_entries(id) on delete cascade,
  question_id bigint not null references logsheet_questions(id) on delete cascade,
  date_column smallint not null,
  answer_value varchar(255),
  is_issue smallint not null default 0,
  issue_reason varchar(255),
  issue_detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_logsheet_answers_entry on logsheet_answers(entry_id);
create index if not exists idx_logsheet_answers_question on logsheet_answers(question_id);
create index if not exists idx_logsheet_answers_date on logsheet_answers(date_column);

create table if not exists work_orders (
  id bigserial primary key,
  work_order_number varchar(64) not null unique,
  asset_id bigint not null references assets(id) on delete cascade,
  asset_name varchar(200),
  location varchar(255),
  issue_source varchar(32) not null default 'logsheet',
  logsheet_entry_id bigint references logsheet_entries(id) on delete set null,
  question_id bigint references logsheet_questions(id) on delete set null,
  issue_description varchar(500),
  priority varchar(16) not null default 'medium',
  status varchar(32) not null default 'open',
  assigned_to bigint references users(id) on delete set null,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_work_orders_asset on work_orders(asset_id);
create index if not exists idx_work_orders_status on work_orders(status);
create index if not exists idx_work_orders_entry on work_orders(logsheet_entry_id);

create table if not exists work_order_history (
  id bigserial primary key,
  work_order_id bigint not null references work_orders(id) on delete cascade,
  status varchar(32) not null,
  updated_by bigint references users(id) on delete set null,
  remarks varchar(500),
  event_at timestamptz not null default now()
);

create index if not exists idx_work_order_history_order on work_order_history(work_order_id);

create table if not exists notifications (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  type varchar(80) not null,
  payload jsonb,
  status varchar(16) not null default 'unread',
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id);

create table if not exists admin_settings (
  id bigserial primary key,
  company_id bigint not null references companies(id) on delete cascade,
  auto_create_work_order smallint not null default 1,
  combine_issues smallint not null default 0,
  auto_assign_team smallint not null default 0,
  default_team_id bigint,
  escalation_minutes integer,
  priority_rules jsonb,
  created_at timestamptz not null default now(),
  unique (company_id)
);

insert into asset_types (code, label, category)
select seed.code, seed.label, seed.category
from (
  values
    ('soft', 'Soft Services', 'soft'),
    ('technical', 'Technical', 'technical'),
    ('fleet', 'Fleet', 'fleet')
) as seed(code, label, category)
where not exists (
  select 1 from asset_types at where at.code = seed.code
);
