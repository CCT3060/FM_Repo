-- Core clients and users
CREATE TABLE IF NOT EXISTS clients (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	client_name VARCHAR(160) NOT NULL,
	email VARCHAR(160),
	phone VARCHAR(32),
	state_name VARCHAR(80),
	pincode VARCHAR(12),
	gst_number VARCHAR(32),
	company_name VARCHAR(160),
	address VARCHAR(255),
	status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_clients_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	full_name VARCHAR(160) NOT NULL,
	email VARCHAR(160) NOT NULL,
	phone VARCHAR(32),
	role VARCHAR(120),
	status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
	password_hash VARCHAR(255) NOT NULL,
	client_id INT UNSIGNED NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_users_email (email),
	CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Companies owned by users
CREATE TABLE IF NOT EXISTS companies (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	company_name VARCHAR(160) NOT NULL,
	company_code VARCHAR(80) NOT NULL,
	description VARCHAR(255),
	address_line1 VARCHAR(255),
	address_line2 VARCHAR(255),
	city VARCHAR(120),
	state_name VARCHAR(120),
	country VARCHAR(120),
	pincode VARCHAR(32),
	gst_number VARCHAR(64),
	pan_number VARCHAR(32),
	cin_number VARCHAR(64),
	contract_start_date DATE,
	contract_end_date DATE,
	billing_cycle VARCHAR(32),
	payment_terms_days INT,
	max_employees INT,
	qsr_module TINYINT(1) NOT NULL DEFAULT 1,
	premeal_module TINYINT(1) NOT NULL DEFAULT 1,
	delivery_module TINYINT(1) NOT NULL DEFAULT 1,
	allow_guest_booking TINYINT(1) NOT NULL DEFAULT 0,
	status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
	user_id INT UNSIGNED NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_companies_code (company_code),
	CONSTRAINT fk_companies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Departments within companies
CREATE TABLE IF NOT EXISTS departments (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	company_id INT UNSIGNED NOT NULL,
	name VARCHAR(160) NOT NULL,
	description VARCHAR(255),
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_departments_company_name (company_id, name),
	KEY idx_departments_company (company_id),
	CONSTRAINT fk_departments_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Assets core table
CREATE TABLE IF NOT EXISTS assets (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	company_id INT UNSIGNED NOT NULL,
	department_id INT UNSIGNED,
	asset_name VARCHAR(200) NOT NULL,
	asset_unique_id VARCHAR(120),
	asset_type ENUM('soft','technical','fleet') NOT NULL,
	building VARCHAR(160),
	floor VARCHAR(80),
	room VARCHAR(160),
	status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
	qr_code VARCHAR(255),
	created_by INT UNSIGNED,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_assets_company (company_id),
	KEY idx_assets_department (department_id),
	CONSTRAINT fk_assets_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
	CONSTRAINT fk_assets_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
	CONSTRAINT fk_assets_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Asset details stored as JSON for flexible schemas per type
CREATE TABLE IF NOT EXISTS asset_details (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	asset_id INT UNSIGNED NOT NULL,
	metadata JSON,
	documents JSON,
	PRIMARY KEY (id),
	KEY idx_asset_details_asset (asset_id),
	CONSTRAINT fk_asset_details_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Asset history for audits / future work orders
CREATE TABLE IF NOT EXISTS asset_history (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	asset_id INT UNSIGNED NOT NULL,
	action VARCHAR(120) NOT NULL,
	details JSON,
	created_by INT UNSIGNED,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_asset_history_asset (asset_id),
	CONSTRAINT fk_asset_history_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
	CONSTRAINT fk_asset_history_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Asset checklists (asset-wise)
CREATE TABLE IF NOT EXISTS asset_checklists (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	asset_id INT UNSIGNED NOT NULL,
	name VARCHAR(200) NOT NULL,
	description VARCHAR(500),
	asset_category ENUM('soft','technical','fleet') NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_asset_checklists_asset (asset_id),
	CONSTRAINT fk_asset_checklists_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS asset_checklist_items (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	checklist_id INT UNSIGNED NOT NULL,
	title VARCHAR(200) NOT NULL,
	answer_type ENUM('yes_no','text') NOT NULL DEFAULT 'yes_no',
	is_required TINYINT(1) NOT NULL DEFAULT 0,
	order_index INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_asset_checklist_items_checklist (checklist_id),
	CONSTRAINT fk_asset_checklist_items_checklist FOREIGN KEY (checklist_id) REFERENCES asset_checklists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Asset logsheets (notes per asset)
CREATE TABLE IF NOT EXISTS asset_logs (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	asset_id INT UNSIGNED NOT NULL,
	note TEXT,
	created_by INT UNSIGNED,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_asset_logs_asset (asset_id),
	CONSTRAINT fk_asset_logs_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
	CONSTRAINT fk_asset_logs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Checklist template system
CREATE TABLE IF NOT EXISTS checklist_templates (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	company_id INT UNSIGNED NOT NULL,
	template_name VARCHAR(200) NOT NULL,
	asset_type VARCHAR(80) NOT NULL,
	category VARCHAR(80),
	description VARCHAR(500),
	frequency ENUM('Daily','Weekly','Monthly','Custom') NOT NULL DEFAULT 'Daily',
	shift VARCHAR(80),
	status ENUM('active','inactive') NOT NULL DEFAULT 'active',
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_by INT UNSIGNED,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_checklist_templates_company (company_id),
	KEY idx_checklist_templates_asset_type (asset_type),
	CONSTRAINT fk_checklist_templates_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
	CONSTRAINT fk_checklist_templates_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklist_template_questions (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	template_id INT UNSIGNED NOT NULL,
	question_text VARCHAR(500) NOT NULL,
	input_type ENUM('text','yes_no','dropdown','number','photo','signature','ok_not_ok','remark') NOT NULL,
	is_required TINYINT(1) NOT NULL DEFAULT 0,
	order_index INT NOT NULL DEFAULT 0,
	options_json JSON,
	meta JSON,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_checklist_template_questions_template (template_id),
	CONSTRAINT fk_checklist_template_questions_template FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklist_assignments (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	template_id INT UNSIGNED NOT NULL,
	assigned_to_type ENUM('asset','location','department','user') NOT NULL,
	assigned_to_id INT UNSIGNED NOT NULL,
	frequency ENUM('Daily','Weekly','Monthly','Custom') NOT NULL DEFAULT 'Daily',
	start_date DATE,
	due_time TIME,
	status ENUM('active','inactive') NOT NULL DEFAULT 'active',
	attached_by INT UNSIGNED,
	attached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_checklist_assignment (template_id, assigned_to_type, assigned_to_id),
	KEY idx_checklist_assignment_template (template_id),
	KEY idx_checklist_assignment_target (assigned_to_type, assigned_to_id),
	CONSTRAINT fk_checklist_assignment_template FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_checklist_assignment_user FOREIGN KEY (attached_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklist_submissions (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	template_id INT UNSIGNED NOT NULL,
	assignment_id INT UNSIGNED,
	asset_id INT UNSIGNED,
	submitted_by INT UNSIGNED,
	shift VARCHAR(80),
	status ENUM('draft','pending','submitted','approved','rejected','overdue') NOT NULL DEFAULT 'draft',
	completion_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
	supervisor_by INT UNSIGNED,
	supervisor_note VARCHAR(500),
	gps_lat DECIMAL(10,7),
	gps_lng DECIMAL(10,7),
	submitted_at DATETIME NULL,
	approved_at DATETIME NULL,
	PRIMARY KEY (id),
	KEY idx_checklist_submissions_template (template_id),
	KEY idx_checklist_submissions_assignment (assignment_id),
	KEY idx_checklist_submissions_asset (asset_id),
	KEY idx_checklist_submissions_status (status),
	CONSTRAINT fk_checklist_submissions_template FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_checklist_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES checklist_assignments(id) ON DELETE SET NULL,
	CONSTRAINT fk_checklist_submissions_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
	CONSTRAINT fk_checklist_submissions_user FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT fk_checklist_supervisor_user FOREIGN KEY (supervisor_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklist_submission_answers (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	submission_id INT UNSIGNED NOT NULL,
	question_id INT UNSIGNED,
	question_text VARCHAR(500) NOT NULL,
	input_type ENUM('text','yes_no','dropdown','number','photo','signature','ok_not_ok','remark') NOT NULL,
	answer_json JSON,
	option_selected VARCHAR(255),
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_checklist_submission_answers_submission (submission_id),
	CONSTRAINT fk_checklist_submission_answers_submission FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id) ON DELETE CASCADE,
	CONSTRAINT fk_checklist_submission_answers_question FOREIGN KEY (question_id) REFERENCES checklist_template_questions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Logsheet template system
CREATE TABLE IF NOT EXISTS logsheet_templates (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	company_id INT UNSIGNED NOT NULL,
	template_name VARCHAR(200) NOT NULL,
	asset_type ENUM('soft','technical','fleet') NOT NULL,
	asset_model VARCHAR(160),
	header_config JSON,
	description VARCHAR(500),
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_by INT UNSIGNED,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_logsheet_templates_company (company_id),
	KEY idx_logsheet_templates_asset_type (asset_type),
	CONSTRAINT fk_logsheet_templates_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
	CONSTRAINT fk_logsheet_templates_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Logsheet sections (grouping questions such as Cleaning / Inspection)
CREATE TABLE IF NOT EXISTS logsheet_sections (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	template_id INT UNSIGNED NOT NULL,
	section_name VARCHAR(200) NOT NULL,
	order_index INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_logsheet_sections_template (template_id),
	CONSTRAINT fk_logsheet_sections_template FOREIGN KEY (template_id) REFERENCES logsheet_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Logsheet questions per section
CREATE TABLE IF NOT EXISTS logsheet_questions (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	section_id INT UNSIGNED NOT NULL,
	question_text VARCHAR(500) NOT NULL,
	specification VARCHAR(255),
	answer_type ENUM('yes_no','text','number') NOT NULL,
	rule_json JSON,
	is_mandatory TINYINT(1) NOT NULL DEFAULT 0,
	order_index INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_logsheet_questions_section (section_id),
	CONSTRAINT fk_logsheet_questions_section FOREIGN KEY (section_id) REFERENCES logsheet_sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS logsheet_template_assignments (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	template_id INT UNSIGNED NOT NULL,
	asset_id INT UNSIGNED NOT NULL,
	attached_by INT UNSIGNED,
	attached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_logsheet_assignment (template_id, asset_id),
	KEY idx_logsheet_assignment_asset (asset_id),
	CONSTRAINT fk_logsheet_assignment_template FOREIGN KEY (template_id) REFERENCES logsheet_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_logsheet_assignment_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
	CONSTRAINT fk_logsheet_assignment_user FOREIGN KEY (attached_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS logsheet_entries (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	template_id INT UNSIGNED NOT NULL,
	asset_id INT UNSIGNED NOT NULL,
	submitted_by INT UNSIGNED,
	entry_date DATE NOT NULL DEFAULT (CURRENT_DATE),
	month TINYINT UNSIGNED NOT NULL,
	year SMALLINT UNSIGNED NOT NULL,
	shift VARCHAR(80),
	header_values JSON,
	submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	data JSON,
	PRIMARY KEY (id),
	KEY idx_logsheet_entries_template (template_id),
	KEY idx_logsheet_entries_asset (asset_id),
	KEY idx_logsheet_entries_date (entry_date),
	CONSTRAINT fk_logsheet_entries_template FOREIGN KEY (template_id) REFERENCES logsheet_templates(id) ON DELETE CASCADE,
	CONSTRAINT fk_logsheet_entries_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
	CONSTRAINT fk_logsheet_entries_user FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Grid answers per question/day for a monthly logsheet entry
CREATE TABLE IF NOT EXISTS logsheet_answers (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	entry_id INT UNSIGNED NOT NULL,
	question_id INT UNSIGNED NOT NULL,
	date_column TINYINT UNSIGNED NOT NULL,
	answer_value VARCHAR(255),
	is_issue TINYINT(1) NOT NULL DEFAULT 0,
	issue_reason VARCHAR(255),
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_logsheet_answers_entry (entry_id),
	KEY idx_logsheet_answers_question (question_id),
	KEY idx_logsheet_answers_date (date_column),
	CONSTRAINT fk_logsheet_answers_entry FOREIGN KEY (entry_id) REFERENCES logsheet_entries(id) ON DELETE CASCADE,
	CONSTRAINT fk_logsheet_answers_question FOREIGN KEY (question_id) REFERENCES logsheet_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


