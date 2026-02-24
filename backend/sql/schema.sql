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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asset_checklists_asset (asset_id),
  CONSTRAINT fk_asset_checklists_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS asset_checklist_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  checklist_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
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
