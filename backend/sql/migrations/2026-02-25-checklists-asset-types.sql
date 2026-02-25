-- Adds richer checklist answer types, checklist assignment to users, and dynamic asset type master

-- === Checklist answer types expansion ===
ALTER TABLE asset_checklist_items
  MODIFY answer_type ENUM('yes_no','text','long_text','number','date','datetime','label','single_select','dropdown','multi_select','file','video','signature','gps','star_rating','scan_code','meter_reading') NOT NULL DEFAULT 'yes_no';

ALTER TABLE asset_checklist_items
  ADD COLUMN IF NOT EXISTS config JSON NULL AFTER answer_type;

-- === Checklist assignments to users ===
CREATE TABLE IF NOT EXISTS asset_checklist_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  checklist_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_checklist_assignment (checklist_id, user_id),
  KEY idx_asset_checklist_assignment_user (user_id),
  CONSTRAINT fk_asset_checklist_assignment_checklist FOREIGN KEY (checklist_id) REFERENCES asset_checklists(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_checklist_assignment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- === Dynamic asset type master ===
CREATE TABLE IF NOT EXISTS asset_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  category VARCHAR(80) NULL,
  description VARCHAR(255) NULL,
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_types_code (code),
  KEY idx_asset_types_status (status),
  CONSTRAINT fk_asset_types_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed defaults if missing
INSERT INTO asset_types (code, label, category)
SELECT t.code, t.label, t.category
FROM (
  SELECT 'soft' AS code, 'Soft Services' AS label, 'soft' AS category
  UNION ALL SELECT 'technical', 'Technical', 'technical'
  UNION ALL SELECT 'fleet', 'Fleet', 'fleet'
) AS t
LEFT JOIN asset_types at2 ON at2.code = t.code
WHERE at2.id IS NULL;

-- Widen existing columns to allow dynamic codes
ALTER TABLE assets
  MODIFY asset_type VARCHAR(120) NOT NULL;

ALTER TABLE asset_checklists
  MODIFY asset_category VARCHAR(120) NOT NULL;
