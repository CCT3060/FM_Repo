-- ─── Template Assignment & Submission Tables ────────────────────────────────
-- Creates tables for checklist/logsheet submissions from company users (mobile app)

-- Ensure checklist_submissions table exists
CREATE TABLE IF NOT EXISTS checklist_submissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id INT UNSIGNED NOT NULL,
  asset_id INT UNSIGNED,
  submitted_by_company_user INT UNSIGNED,
  user_name VARCHAR(200),
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_checklist_submissions_template (template_id),
  KEY idx_checklist_submissions_asset (asset_id),
  KEY idx_checklist_submissions_user (submitted_by_company_user),
  CONSTRAINT fk_checklist_submissions_template FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_submissions_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_checklist_submissions_user FOREIGN KEY (submitted_by_company_user) REFERENCES company_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Checklist submission answers
CREATE TABLE IF NOT EXISTS checklist_submission_answers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  submission_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer_value TEXT,
  PRIMARY KEY (id),
  KEY idx_checklist_submission_answers_submission (submission_id),
  KEY idx_checklist_submission_answers_question (question_id),
  CONSTRAINT fk_checklist_submission_answers_submission FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_submission_answers_question FOREIGN KEY (question_id) REFERENCES checklist_template_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ensure logsheet_entries has company_user columns
ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS submitted_by_company_user INT UNSIGNED AFTER asset_id;

ALTER TABLE logsheet_entries
  ADD COLUMN IF NOT EXISTS user_name VARCHAR(200) AFTER submitted_by_company_user;

-- Add foreign key if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_logsheet_entries_company_user'
      AND table_name = 'logsheet_entries'
  ) THEN
    ALTER TABLE logsheet_entries
      ADD CONSTRAINT fk_logsheet_entries_company_user
      FOREIGN KEY (submitted_by_company_user)
      REFERENCES company_users(id)
      ON DELETE SET NULL;
  END IF;
END$$;
