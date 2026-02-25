-- Logsheet & Work Order enhancements

-- Add rule/priority to logsheet questions
ALTER TABLE logsheet_questions
  ADD COLUMN IF NOT EXISTS rule_json JSON NULL AFTER specification,
  ADD COLUMN IF NOT EXISTS priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium' AFTER rule_json;

-- Add status to logsheet entries for workflow tracking
ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS status ENUM('draft','submitted') NOT NULL DEFAULT 'submitted' AFTER year;

-- Add richer issue detail storage
ALTER TABLE logsheet_answers
  ADD COLUMN IF NOT EXISTS issue_detail JSON NULL AFTER issue_reason;

-- Work orders core table
CREATE TABLE IF NOT EXISTS work_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  work_order_number VARCHAR(64) NOT NULL,
  asset_id INT UNSIGNED NOT NULL,
  asset_name VARCHAR(200),
  location VARCHAR(255),
  issue_source ENUM('logsheet','manual') NOT NULL DEFAULT 'logsheet',
  logsheet_entry_id INT UNSIGNED,
  question_id INT UNSIGNED,
  issue_description VARCHAR(500),
  priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status ENUM('open','in_progress','completed','closed') NOT NULL DEFAULT 'open',
  assigned_to INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_work_order_number (work_order_number),
  KEY idx_work_orders_asset (asset_id),
  KEY idx_work_orders_status (status),
  KEY idx_work_orders_entry (logsheet_entry_id),
  CONSTRAINT fk_work_orders_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_work_orders_entry FOREIGN KEY (logsheet_entry_id) REFERENCES logsheet_entries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Work order history / timeline
CREATE TABLE IF NOT EXISTS work_order_history (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  work_order_id INT UNSIGNED NOT NULL,
  status ENUM('open','in_progress','completed','closed') NOT NULL,
  updated_by INT UNSIGNED NULL,
  remarks VARCHAR(500),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_work_order_history_order (work_order_id),
  CONSTRAINT fk_work_order_history_order FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notification queue (basic)
CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(80) NOT NULL,
  payload JSON,
  status ENUM('unread','read') NOT NULL DEFAULT 'unread',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin settings for automation flags
CREATE TABLE IF NOT EXISTS admin_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  auto_create_work_order TINYINT(1) NOT NULL DEFAULT 1,
  combine_issues TINYINT(1) NOT NULL DEFAULT 0,
  auto_assign_team TINYINT(1) NOT NULL DEFAULT 0,
  default_team_id INT UNSIGNED NULL,
  escalation_minutes INT UNSIGNED NULL,
  priority_rules JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_settings_company (company_id),
  CONSTRAINT fk_admin_settings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
