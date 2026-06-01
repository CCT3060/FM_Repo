-- Locations table for Soft Service location management
CREATE TABLE IF NOT EXISTS locations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  campus VARCHAR(160),
  building VARCHAR(160),
  floor VARCHAR(80),
  room VARCHAR(160),
  qr_code VARCHAR(255),
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_by INT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_locations_company (company_id),
  CONSTRAINT fk_locations_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_locations_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
