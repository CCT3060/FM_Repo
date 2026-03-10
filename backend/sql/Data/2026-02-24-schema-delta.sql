-- Schema delta for checklist + logsheet enhancements (run on existing DB)
-- Assumes MySQL 8+. Adjust types if needed.

-- === Checklist tables ===
ALTER TABLE asset_checklists
  ADD COLUMN IF NOT EXISTS description VARCHAR(500) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS asset_category ENUM('soft','technical','fleet') NOT NULL DEFAULT 'soft' AFTER description;

ALTER TABLE asset_checklist_items
  ADD COLUMN IF NOT EXISTS answer_type ENUM('yes_no','text') NOT NULL DEFAULT 'yes_no' AFTER title,
  ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0 AFTER is_required;

-- If is_required already exists, this MODIFY keeps it consistent; comment out if not needed
ALTER TABLE asset_checklist_items
  MODIFY COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0;

-- === Logsheet templates ===
ALTER TABLE logsheet_templates
  ADD COLUMN IF NOT EXISTS asset_model VARCHAR(160) NULL AFTER asset_type,
  ADD COLUMN IF NOT EXISTS header_config JSON NULL AFTER asset_model;

-- If you no longer need the old flat fields table, drop it (optional backup first)
DROP TABLE IF EXISTS logsheet_template_fields;

-- New sections table
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

-- New questions table
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

-- Expand logsheet entries for monthly grid + headers
ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS month TINYINT UNSIGNED NULL AFTER entry_date,
  ADD COLUMN IF NOT EXISTS year SMALLINT UNSIGNED NULL AFTER month,
  ADD COLUMN IF NOT EXISTS shift VARCHAR(80) NULL AFTER year,
  ADD COLUMN IF NOT EXISTS header_values JSON NULL AFTER shift;

-- Backfill month/year for existing rows
UPDATE logsheet_entries SET month = MONTH(entry_date), year = YEAR(entry_date) WHERE month IS NULL OR year IS NULL;

-- Enforce NOT NULL after backfill (optional; comment out if you prefer nullable)
ALTER TABLE logsheet_entries
  MODIFY month TINYINT UNSIGNED NOT NULL,
  MODIFY year SMALLINT UNSIGNED NOT NULL;

-- New grid answers table
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
