import { Router } from "express";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import * as XLSX from "xlsx";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { evaluateRule, createFlag, detectChecklistFlags } from "../utils/flagsHelper.js";
import { dispatchFlagNotifications } from "../utils/notificationsHelper.js";
import { sendFCMPush } from "../utils/firebaseService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true }); // ensure directory exists

const ojtStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `ojt_${Date.now()}_${safe}`);
  },
});
const uploadOjt = multer({
  storage: ojtStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|mkv|avi|mov|webm|wmv|flv|3gp|pdf|doc|docx|csv|xlsx|xls|pptx|ppt|txt|odt|ods)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});

// Separate multer instance for image uploads (reference photos, question photos)
const uploadImage = multer({
  storage: ojtStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Company logo upload (stores as company-{id}.{ext} in uploads/logos/)
const logosDir = path.join(__dirname, "../../uploads/logos");
fs.mkdirSync(logosDir, { recursive: true });
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `company-${req.companyUser.companyId}${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed for logo"));
  },
});

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

/* ── Inline migration: add employee_code column ─────────────────────────── */
(async () => {
  try {
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(100) DEFAULT NULL`);
  } catch (e) {
    console.warn('[companyPortal] migration warning:', e.message);
  }
})();

/* ── Helper: compute cutoff status from expectedCompletionAt ─────────────────
   Returns 'overdue' | 'at_risk' | 'on_time' | null                           */
const getCutoffStatus = (expectedCompletionAt, status) => {
  if (!expectedCompletionAt) return null;
  if (status === 'completed' || status === 'closed') return null;
  const deadline = new Date(expectedCompletionAt);
  const now = new Date();
  const msLeft = deadline - now;
  if (msLeft < 0) return 'overdue';
  if (msLeft < 2 * 60 * 60 * 1000) return 'at_risk'; // within 2 hours
  return 'on_time';
};
const isShiftActive = (startTime, endTime) => {
  const now = new Date();
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const startMin = toMin(startTime);
  const endMin   = toMin(endTime);
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  } else {
    return nowMin >= startMin || nowMin < endMin;
  }
};

// pg returns JSONB columns as already-parsed JS objects; guard against that
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
};

// Ensure questions column exists (safe to run on every start)
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS questions JSONB NULL").catch(() => {});
// Ensure has_remark column exists (template-level remark field toggle)
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS has_remark BOOLEAN NOT NULL DEFAULT FALSE").catch(() => {});
// Ensure overall_remark column exists on checklist_submissions
pool.query("ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS overall_remark TEXT NULL").catch(() => {});
// Ensure week_days and hourly_interval columns exist for frequency scheduling
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS week_days JSONB NULL").catch(() => {});
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS hourly_interval SMALLINT NOT NULL DEFAULT 1").catch(() => {});
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS active_months JSONB NULL").catch(() => {});

// ── Backfill QR codes for locations that have no qr_code stored yet ──────────
// Uses the production URL format that the mobile QR scanner expects.
// Only fills NULL entries — existing codes are never changed.
(async () => {
  try {
    const APP_URL = process.env.APP_URL || "https://fm.catalystservices.eco";
    // Use || operator (PostgreSQL string concat) — avoids CONCAT/cast issues with the ? adapter
    await pool.query(
      `UPDATE locations
       SET qr_code = ? || '/location/' || id::text
       WHERE qr_code IS NULL OR qr_code = ''`,
      [APP_URL]
    );
  } catch (e) {
    console.warn("[companyPortal] QR backfill warning:", e.message);
  }
})();
// Ensure reference_image_url column exists on checklist_template_questions
pool.query("ALTER TABLE checklist_template_questions ADD COLUMN IF NOT EXISTS reference_image_url TEXT NULL").catch(() => {});
// Ensure question_image_url column exists (photo-as-question feature)
pool.query("ALTER TABLE checklist_template_questions ADD COLUMN IF NOT EXISTS question_image_url TEXT NULL").catch(() => {});

// ── Notifications fixes ───────────────────────────────────────────────────────
// The original notifications table had user_id NOT NULL, but createNotification
// does not supply it — make it nullable so all notification inserts succeed.
pool.query("ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL").catch(() => {});
// Ensure push token columns exist on company_users for device push notifications
pool.query("ALTER TABLE company_users ADD COLUMN IF NOT EXISTS push_token TEXT NULL").catch(() => {});
pool.query("ALTER TABLE company_users ADD COLUMN IF NOT EXISTS push_token_platform VARCHAR(20) NULL").catch(() => {});

// Ensure tabular-logsheet columns exist (migration 2026-03-02-tabular-logsheet)
pool.query("ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS layout_type VARCHAR(20) NOT NULL DEFAULT 'standard'").catch(() => {});
pool.query("ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS location_id BIGINT NULL").catch(() => {});
pool.query("ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS data JSONB").catch(() => {});
// Ensure company_user_id column exists (migration 2026-02-28-logsheet-company-user)
pool.query("ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL").catch(() => {});
pool.query("ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL").catch(() => {});

// ── FK Bug Fix: checklist_templates.created_by must reference company_users, not users ──
pool.query(`ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS checklist_templates_created_by_fkey`).catch(() => {});
pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS created_by INTEGER NULL`).catch(() => {});

// ── OJT Management Tables ──────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_trainings (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL,
    asset_id     INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'draft',
    passing_percentage INTEGER NOT NULL DEFAULT 70,
    created_by   INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS ojt_trainings_company ON ojt_trainings(company_id)`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_modules (
    id           SERIAL PRIMARY KEY,
    training_id  INTEGER NOT NULL REFERENCES ojt_trainings(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    order_number INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_module_contents (
    id          SERIAL PRIMARY KEY,
    module_id   INTEGER NOT NULL REFERENCES ojt_modules(id) ON DELETE CASCADE,
    type        VARCHAR(30) NOT NULL DEFAULT 'text',
    url         TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_tests (
    id           SERIAL PRIMARY KEY,
    training_id  INTEGER NOT NULL REFERENCES ojt_trainings(id) ON DELETE CASCADE,
    total_marks  INTEGER NOT NULL DEFAULT 100,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_questions (
    id             SERIAL PRIMARY KEY,
    test_id        INTEGER NOT NULL REFERENCES ojt_tests(id) ON DELETE CASCADE,
    question       TEXT NOT NULL,
    options        JSONB,
    correct_answer TEXT,
    marks          INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_user_progress (
    id                 SERIAL PRIMARY KEY,
    training_id        INTEGER NOT NULL REFERENCES ojt_trainings(id) ON DELETE CASCADE,
    company_user_id    INTEGER NOT NULL,
    completed_modules  JSONB DEFAULT '[]',
    score              INTEGER,
    status             VARCHAR(30) NOT NULL DEFAULT 'not_started',
    certificate_url    TEXT,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(training_id, company_user_id)
  )
`).catch(() => {});

// ── OJT Industry-Standard Column Migrations ─────────────────────────────────
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS category VARCHAR(60) NOT NULL DEFAULT 'general'`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER NOT NULL DEFAULT 60`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS is_sequential BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES company_users(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS due_date DATE`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES company_users(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES company_users(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS trainer_sign_off_at TIMESTAMPTZ`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS trainer_sign_off_notes TEXT`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_test_attempts (
    id               SERIAL       PRIMARY KEY,
    progress_id      INTEGER      NOT NULL REFERENCES ojt_user_progress(id) ON DELETE CASCADE,
    training_id      INTEGER      NOT NULL REFERENCES ojt_trainings(id)     ON DELETE CASCADE,
    company_user_id  INTEGER      NOT NULL,
    attempt_number   INTEGER      NOT NULL DEFAULT 1,
    score            INTEGER,
    earned_marks     INTEGER,
    total_marks      INTEGER,
    passed           BOOLEAN,
    submitted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// ── Fleet Management Tables ────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS fleet_inspections (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL,
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checklist_items JSONB DEFAULT '[]',
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    notes           TEXT,
    inspected_by    INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS fleet_inspections_company ON fleet_inspections(company_id)`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS fleet_inspections_asset ON fleet_inspections(asset_id)`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS fleet_fuel_logs (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    fuel_amount NUMERIC(10,2),
    cost        NUMERIC(10,2),
    odometer    NUMERIC(10,2),
    fuel_type   VARCHAR(50),
    log_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    added_by    INTEGER,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS fleet_fuel_company ON fleet_fuel_logs(company_id)`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS fleet_maintenance (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL,
    asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    issue_title   VARCHAR(255) NOT NULL,
    description   TEXT,
    priority      VARCHAR(20) NOT NULL DEFAULT 'medium',
    status        VARCHAR(30) NOT NULL DEFAULT 'open',
    assigned_to   INTEGER,
    scheduled_date DATE,
    completed_date DATE,
    cost          NUMERIC(10,2),
    created_by    INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS fleet_maintenance_company ON fleet_maintenance(company_id)`).catch(() => {});

/* ── Dashboard ──────────────────────────────────────────────────────────────── */
router.get("/dashboard", async (req, res, next) => {
  try {
    const companyId  = cid(req);
    const { role, id: userId } = req.companyUser;

    // Base flag filter – admin sees all, supervisor sees their team's flags
    let flagWhere  = "f.company_id = ?";
    const flagParams = [companyId];
    if (role === "supervisor") {
      flagWhere += ` AND (f.supervisor_id = ? OR f.raised_by IN (
        SELECT id FROM company_users WHERE supervisor_id = ? AND company_id = ?
      ))`;
      flagParams.push(userId, userId, companyId);
    }

    const [
      [assetRows], [deptRows], [empRows], [activeAssets], [issueRows],
      [openFlags], [criticalFlags], [flagsBySeverity], [assetsHealth],
      [openSoftRows], [softWarnRows], [locationRows],
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ?", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM departments WHERE company_id = ?", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM company_users WHERE company_id = ? AND status = 'Active'", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ? AND status = 'Active'", [companyId]),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM work_orders wo
         JOIN assets a ON wo.asset_id = a.id
         WHERE a.company_id = ? AND wo.status = 'open'`,
        [companyId]
      ),
      // Open flags count
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.status IN ('open', 'in_progress')`,
        flagParams
      ),
      // Critical flags count
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.severity = 'critical' AND f.status IN ('open', 'in_progress')`,
        flagParams
      ),
      // Flags grouped by severity (open only)
      pool.query(
        `SELECT f.severity, COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.status IN ('open', 'in_progress')
         GROUP BY f.severity`,
        flagParams
      ),
      // Asset health distribution
      pool.query(
        `SELECT health_status AS "healthStatus", COUNT(*) AS cnt
         FROM assets WHERE company_id = ? GROUP BY health_status`,
        [companyId]
      ),
      // Open soft service requests
      pool.query(
        `SELECT COUNT(*) AS cnt FROM soft_service_requests
         WHERE company_id = ? AND status NOT IN ('closed','resolved')`,
        [companyId]
      ),
      // Escalated soft service requests (warnings)
      pool.query(
        `SELECT COUNT(*) AS cnt FROM soft_service_requests
         WHERE company_id = ? AND escalation_level > 0 AND status NOT IN ('closed','resolved')`,
        [companyId]
      ),
      // Active locations
      pool.query("SELECT COUNT(*) AS cnt FROM locations WHERE company_id = ?", [companyId]),
    ]);

    const severityMap = {};
    for (const r of flagsBySeverity) severityMap[r.severity] = Number(r.cnt);

    const healthMap = {};
    for (const r of assetsHealth) healthMap[r.healthStatus] = Number(r.cnt);

    res.json({
      totalAssets:      Number(assetRows[0]?.cnt      || 0),
      activeAssets:     Number(activeAssets[0]?.cnt   || 0),
      totalDepartments: Number(deptRows[0]?.cnt        || 0),
      activeEmployees:  Number(empRows[0]?.cnt         || 0),
      openIssues:       Number(issueRows[0]?.cnt        || 0),
      openSoftRequests: Number(openSoftRows[0]?.cnt    || 0),
      softRequestWarnings: Number(softWarnRows[0]?.cnt || 0),
      totalLocations:   Number(locationRows[0]?.cnt    || 0),
      flags: {
        open:     Number(openFlags[0]?.cnt     || 0),
        critical: Number(criticalFlags[0]?.cnt || 0),
        bySeverity: {
          low:      severityMap.low      || 0,
          medium:   severityMap.medium   || 0,
          high:     severityMap.high     || 0,
          critical: severityMap.critical || 0,
        },
      },
      assetHealth: {
        green:  healthMap.green  || 0,
        yellow: healthMap.yellow || 0,
        red:    healthMap.red    || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── Dashboard Chart Stats ──────────────────────────────────────────────────── */
router.get("/dashboard/chart-stats", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const { period = "day", startDate, endDate } = req.query;

    let dateFrom, dateTo;
    if (startDate && endDate) {
      dateFrom = startDate;
      dateTo   = endDate;
    } else {
      if (period === "day") {
        dateFrom = today;
        dateTo   = today;
      } else if (period === "week") {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay());
        dateFrom = d.toISOString().split("T")[0];
        const e = new Date(d); e.setDate(d.getDate() + 6);
        dateTo = e.toISOString().split("T")[0];
      } else if (period === "month") {
        const y = now.getFullYear(), m = now.getMonth() + 1;
        dateFrom = `${y}-${String(m).padStart(2,"0")}-01`;
        const last = new Date(y, m, 0).getDate();
        dateTo = `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
      } else {
        // year
        dateFrom = `${now.getFullYear()}-01-01`;
        dateTo   = `${now.getFullYear()}-12-31`;
      }
    }

    const fromDateObj = new Date(`${dateFrom}T00:00:00`);
    const toDateObj = new Date(`${dateTo}T00:00:00`);
    const daySpan = Math.max(1, Math.floor((toDateObj.getTime() - fromDateObj.getTime()) / 86400000) + 1);

    // Run all 4 queries separately so one failure doesn't kill the rest
    const safe = async (fn) => { try { return await fn(); } catch (e) { console.error("[chart-stats]", e.message); return [[{ cnt: 0 }]]; } };

    const [[ltRows]]  = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt FROM logsheet_templates WHERE company_id = ?`,
      [companyId]
    ));
    const [[ctRows]]  = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt
         FROM checklist_templates
        WHERE company_id = ?
          AND LOWER(TRIM(COALESCE(frequency, 'daily'))) = 'daily'`,
      [companyId]
    ));
    const [[subLSRows]] = await safe(() => pool.query(
      // logsheet_entries.submitted_at is NOT NULL — safe to cast directly
      `SELECT COUNT(*) AS cnt
       FROM logsheet_entries le
       JOIN logsheet_templates lt ON lt.id = le.template_id
       WHERE lt.company_id = ?
         AND le.submitted_at::date BETWEEN ? AND ?`,
      [companyId, dateFrom, dateTo]
    ));
    const [[subCSRows]] = await safe(() => pool.query(
      // Count one fill per template per day for daily checklist templates.
      `SELECT COUNT(DISTINCT (cs.template_id::text || '|' || COALESCE(cs.submitted_at, cs.created_at)::date::text)) AS cnt
         FROM checklist_submissions cs
         JOIN checklist_templates ct ON ct.id = cs.template_id
        WHERE ct.company_id = ?
          AND LOWER(TRIM(COALESCE(ct.frequency, 'daily'))) = 'daily'
          AND COALESCE(cs.submitted_at, cs.created_at)::date BETWEEN ? AND ?`,
      [companyId, dateFrom, dateTo]
    ));

    const totalLogsheets   = Number(ltRows?.cnt   || 0);
    const totalChecklists  = Number(ctRows?.cnt || 0) * daySpan;
    const filledLogsheets  = Number(subLSRows?.cnt || 0);
    const filledChecklists = Math.min(totalChecklists, Number(subCSRows?.cnt || 0));

    res.json({
      totalLogsheets,
      totalChecklists,
      filledLogsheets,
      filledChecklists,
      pendingLogsheets:  Math.max(0, totalLogsheets  - filledLogsheets),
      pendingChecklists: Math.max(0, totalChecklists - filledChecklists),
      period,
      dateFrom,
      dateTo,
    });
  } catch (err) {
    next(err);
  }
});

/* ── Asset Types (company portal admin CRUD) ───────────────────────────────── */
router.get("/asset-types", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, label, category, status,
              workflow_type AS "workflowType",
              field_layout  AS "fieldLayout"
       FROM asset_types
       WHERE status = 'Active'
       ORDER BY label`
    );
    const parsed = rows.map(r => ({ ...r, fieldLayout: r.fieldLayout || null }));
    res.json(parsed);
  } catch (err) { next(err); }
});

router.post("/asset-types", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { code, label, category, workflowType = "standard", fieldLayout } = req.body;
    if (!code?.trim() || !label?.trim()) return res.status(400).json({ message: "code and label are required" });
    const fl = fieldLayout?.fields?.length ? JSON.stringify(fieldLayout) : null;
    const [rows] = await pool.query(
      `INSERT INTO asset_types (code, label, category, status, workflow_type, field_layout)
       VALUES (?, ?, ?, 'Active', ?, ?)
       RETURNING id, code, label, category, status,
                 workflow_type AS "workflowType",
                 field_layout  AS "fieldLayout"`,
      [code.trim().toLowerCase(), label.trim(), category?.trim() || null, workflowType, fl]
    );
    res.status(201).json({ ...rows[0], fieldLayout: rows[0].fieldLayout || null });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Asset type code already exists" });
    next(err);
  }
});

router.put("/asset-types/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { label, category, workflowType = "standard", fieldLayout } = req.body;
    if (!label?.trim()) return res.status(400).json({ message: "label is required" });
    const fl = fieldLayout?.fields?.length ? JSON.stringify(fieldLayout) : null;
    const [rows] = await pool.query(
      `UPDATE asset_types SET label = ?, category = ?, workflow_type = ?, field_layout = ?
       WHERE id = ?
       RETURNING id, code, label, category, status,
                 workflow_type AS "workflowType",
                 field_layout  AS "fieldLayout"`,
      [label.trim(), category?.trim() || null, workflowType, fl, id]
    );
    if (!rows.length) return res.status(404).json({ message: "Asset type not found" });
    res.json({ ...rows[0], fieldLayout: rows[0].fieldLayout || null });
  } catch (err) { next(err); }
});

router.delete("/asset-types/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [rows] = await pool.query(`UPDATE asset_types SET status = 'Inactive' WHERE id = ? RETURNING id`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Asset type not found" });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Departments ────────────────────────────────────────────────────────────── */
router.get("/departments", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name AS "departmentName", description, created_at AS "createdAt"
       FROM departments WHERE company_id = ? ORDER BY name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/departments", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "name is required" });
    const [rows] = await pool.query(
      `INSERT INTO departments (company_id, name, description) VALUES (?, ?, ?) RETURNING id, name AS "departmentName", description, created_at AS "createdAt"`,
      [cid(req), name.trim(), description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Department name already exists" });
    next(err);
  }
});

router.put("/departments/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { name, description } = req.body;
    const [[check]] = await pool.query("SELECT id FROM departments WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Department not found" });
    const [rows] = await pool.query(
      `UPDATE departments SET name = COALESCE(?, name), description = ? WHERE id = ? RETURNING id, name AS "departmentName", description, created_at AS "createdAt"`,
      [name?.trim() || null, description ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Department name already exists" });
    next(err);
  }
});

router.delete("/departments/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM departments WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Department not found" });
    await pool.query("DELETE FROM departments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ── Assets ─────────────────────────────────────────────────────────────────── */
router.get("/assets", async (req, res, next) => {
  try {
    // Determine service domain from company_users + role capabilities.
    // service_domain: technical → exclude soft assets, soft → only soft, both → all
    // For users without explicit service_domain, infer from role capabilities.
    const [[cuRow]] = await pool.query(
      `SELECT cu.service_domain AS "serviceDomain",
              COALESCE(cr.can_raise_soft_issue, FALSE)      AS "canRaiseSoftIssue",
              COALESCE(cr.is_technician, FALSE)             AS "isTechnician",
              COALESCE(cr.is_technical_supervisor, FALSE)   AS "isTechnicalSupervisor",
              COALESCE(cr.is_soft_manager, FALSE)           AS "isSoftManager"
       FROM company_users cu
       LEFT JOIN company_roles cr
         ON cr.company_id = cu.company_id AND cr.role_key = cu.role AND cr.is_active = TRUE
       WHERE cu.id = ? LIMIT 1`,
      [req.companyUser.id]
    );

    let serviceDomain = (cuRow?.serviceDomain || '').toLowerCase();

    const userRole = req.companyUser?.role || '';
    const isAdminRole = ['admin', 'catalyst_admin'].includes(userRole);

    // Infer service domain from capabilities when not explicitly set
    if (!isAdminRole && serviceDomain !== 'both') {
      const hasSoftCap = Boolean(cuRow?.canRaiseSoftIssue || cuRow?.isSoftManager);
      const hasTechCap = Boolean(cuRow?.isTechnician || cuRow?.isTechnicalSupervisor);
      if (hasSoftCap && !hasTechCap) {
        // Strictly a soft-service user — force to soft regardless of service_domain setting
        serviceDomain = 'soft';
      } else if (hasTechCap && !hasSoftCap) {
        // Strictly a technical user — exclude soft assets
        serviceDomain = 'technical';
      } else if (!serviceDomain) {
        serviceDomain = 'technical'; // safe default
      }
    }

    // Build the asset type filter
    let softFilter = '';
    if (!isAdminRole && serviceDomain !== 'both') {
      if (serviceDomain === 'soft') {
        // Only show assets whose type belongs to soft-service workflow
        softFilter = `AND (
          LOWER(TRIM(COALESCE(a.asset_type,''))) = 'soft'
          OR a.asset_type IN (SELECT code FROM asset_types WHERE workflow_type = 'soft' AND status = 'Active')
        )`;
      } else {
        // 'technical' — exclude all soft-service asset types
        softFilter = `AND LOWER(TRIM(COALESCE(a.asset_type,''))) != 'soft'
          AND (a.asset_type IS NULL OR a.asset_type NOT IN (SELECT code FROM asset_types WHERE workflow_type = 'soft' AND status = 'Active'))`;
      }
    }
    // 'both' domain or admin role → no filter

    const { search, type, assignedOnly } = req.query;
    const params = [cid(req)];
    let extraFilters = softFilter;
    if (type) { extraFilters += ` AND a.asset_type = ?`; params.push(type); }
    if (search) {
      extraFilters += ` AND (a.asset_name ILIKE ? OR a.asset_unique_id ILIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (assignedOnly === 'true' && req.companyUser?.id) {
      extraFilters += `
        AND a.id IN (
          SELECT COALESCE(ct.asset_id, lta.asset_id)
          FROM template_user_assignments tua
          LEFT JOIN checklist_templates ct
            ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.company_id = tua.company_id
          LEFT JOIN logsheet_template_assignments lta
            ON tua.template_type = 'logsheet' AND lta.template_id = tua.template_id
          WHERE tua.assigned_to = ? AND tua.company_id = ?
        )`;
      params.push(req.companyUser.id, cid(req));
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.department_id AS "departmentId",
              d.name AS "departmentName",
              ad.metadata, ad.documents
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.company_id = ? ${extraFilters}
       ORDER BY a.asset_name`,
      params
    );
    const normalized = rows.map((r) => {
      const meta = r.metadata == null ? {} : (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata);
      const docs = r.documents == null ? undefined : (typeof r.documents === "string" ? JSON.parse(r.documents) : r.documents);
      return { ...r, metadata: docs ? { ...meta, documents: docs } : meta, documents: undefined };
    });
    res.json(normalized);
  } catch (err) {
    next(err);
  }
});

router.get("/assets/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.created_at AS "createdAt",
              d.name AS "departmentName",
              ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id = ?`,
      [id, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const meta = asset.metadata == null ? {} : (typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : asset.metadata);

    // Templates that match this asset's type – wrap in try/catch so a missing
    // column or table never kills the main asset response
    let checklists = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, 'checklist' AS "templateType", template_name AS "templateName", description
         FROM checklist_templates WHERE company_id = ? AND asset_type = ?
         UNION ALL
         SELECT id, 'logsheet' AS "templateType", template_name AS "templateName", description
         FROM logsheet_templates WHERE company_id = ? AND asset_type = ?
         ORDER BY 3 LIMIT 50`,
        [cid(req), asset.assetType, cid(req), asset.assetType]
      );
      checklists = rows;
    } catch (e) {
      console.error("[assets/:id] templates query failed:", e.message);
    }

    // Assignments for templates of this asset type
    let assignments = [];
    try {
      const [rows] = await pool.query(
        `SELECT tua.id, COALESCE(ct.template_name, lt.template_name) AS "templateName",
                tua.template_type AS "templateType",
                cu.full_name AS "assignedToName",
                tua.created_at AS "assignedAt"
         FROM template_user_assignments tua
         JOIN company_users cu ON tua.assigned_to = cu.id
         LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.asset_type = ?
         LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id AND lt.asset_type = ?
         WHERE tua.company_id = ? AND (ct.id IS NOT NULL OR lt.id IS NOT NULL)
         ORDER BY tua.created_at DESC LIMIT 50`,
        [asset.assetType, asset.assetType, cid(req)]
      );
      assignments = rows;
    } catch (e) {
      console.error("[assets/:id] assignments query failed:", e.message);
    }

    res.json({ ...asset, metadata: meta, checklists, assignments });
  } catch (err) {
    next(err);
  }
});

router.post("/assets", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { assetName, assetUniqueId, assetType, departmentId, building, floor, room, status = "Active", metadata = {} } = req.body;
    if (!assetName?.trim() || !assetType) return res.status(400).json({ message: "assetName and assetType are required" });
    const [rows] = await pool.query(
      `INSERT INTO assets (company_id, department_id, asset_name, asset_unique_id, asset_type, building, floor, room, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_name AS "assetName", asset_unique_id AS "assetUniqueId", asset_type AS "assetType", status, building, floor, room, department_id AS "departmentId"`,
      [cid(req), departmentId || null, assetName.trim(), assetUniqueId || null, assetType, building || null, floor || null, room || null, status]
    );
    const asset = rows[0];
    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON CONFLICT (asset_id) DO UPDATE SET metadata = EXCLUDED.metadata, documents = EXCLUDED.documents`,
      [asset.id, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    res.status(201).json({ ...asset, metadata });
  } catch (err) { next(err); }
});

router.put("/assets/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { assetName, assetUniqueId, assetType, departmentId, building, floor, room, status, metadata = {} } = req.body;
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    const [rows] = await pool.query(
      `UPDATE assets SET
         asset_name = COALESCE(?, asset_name),
         asset_unique_id = COALESCE(?, asset_unique_id),
         asset_type = COALESCE(?, asset_type),
         department_id = ?,
         building = ?, floor = ?, room = ?,
         status = COALESCE(?, status),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, asset_name AS "assetName", asset_unique_id AS "assetUniqueId", asset_type AS "assetType", status, building, floor, room, department_id AS "departmentId"`,
      [assetName || null, assetUniqueId || null, assetType || null, departmentId || null, building || null, floor || null, room || null, status || null, id]
    );
    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON CONFLICT (asset_id) DO UPDATE SET metadata = EXCLUDED.metadata, documents = EXCLUDED.documents`,
      [id, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    res.json({ ...rows[0], metadata });
  } catch (err) { next(err); }
});

router.delete("/assets/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    await pool.query("DELETE FROM assets WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Locations ──────────────────────────────────────────────────────────────── */
// Inline migration: ensure locations table exists (PostgreSQL-compatible)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id bigserial PRIMARY KEY,
        company_id bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name varchar(200) NOT NULL,
        campus varchar(160),
        building varchar(160),
        floor varchar(80),
        room varchar(160),
        qr_code varchar(255),
        status varchar(16) NOT NULL DEFAULT 'Active',
        created_by integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_locations_company ON locations(company_id)`);
    // Drop wrong FK on created_by (if table was created with REFERENCES users)
    await pool.query(`
      ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_created_by_fkey
    `);
  } catch (e) {
    console.warn('[companyPortal] locations table migration warning:', e.message);
  }
})();

router.get("/locations", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT id, name, campus, building, floor, room, qr_code AS "qrCode", status, created_at AS "createdAt"
       FROM locations WHERE company_id = ? ORDER BY name ASC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── Locations: Export to Excel (must be before /:id) ───────────────────── */
router.get("/locations/export", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT name AS "Location Name", campus AS "Campus", building AS "Building",
              floor AS "Floor", room AS "Room", status AS "Status"
       FROM locations WHERE company_id = ? ORDER BY name ASC`,
      [companyId]
    );
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [
      { "Location Name": "", Campus: "", Building: "", Floor: "", Room: "", Status: "Active" }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Locations");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=locations.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) { next(err); }
});

router.get("/locations/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, name, campus, building, floor, room, qr_code AS "qrCode", status, created_at AS "createdAt"
       FROM locations WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );
    if (!rows.length) return res.status(404).json({ message: "Location not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── Locations: Bulk import multer setup ─────────────────────────────────── */
const locImportStorage = multer.memoryStorage();
const uploadLocImport = multer({
  storage: locImportStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("Only Excel (.xlsx, .xls) or CSV files are allowed"));
  },
});

/* ── Locations: Bulk create (multiple rooms) — must be before POST /:id ──── */
router.post("/locations/bulk", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { locations } = req.body;
    if (!Array.isArray(locations) || locations.length === 0)
      return res.status(400).json({ message: "locations array is required" });

    const created = [];
    for (const loc of locations) {
      const { name, campus, building, floor, room, status = "Active" } = loc;
      if (!name?.trim()) continue;
      const [rows] = await pool.query(
        `INSERT INTO locations (company_id, name, campus, building, floor, room, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, name, campus, building, floor, room, qr_code AS "qrCode", status, created_at AS "createdAt"`,
        [companyId, name.trim(), campus || null, building || null, floor || null, room || null, status, userId]
      );
      if (rows[0]) created.push(rows[0]);
    }
    res.status(201).json({ created, count: created.length });
  } catch (err) { next(err); }
});

/* ── Helper: sync building/floor/room hierarchy from a (building, floor, room) triple ─── */
async function syncHierarchyEntry(companyId, building, floor, room) {
  if (!building?.trim() || !floor?.trim()) return;
  const [bldgRows] = await pool.query(
    `INSERT INTO buildings (company_id, name) VALUES (?, ?)
     ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [companyId, building.trim()]
  );
  const bldgId = bldgRows[0]?.id;
  if (!bldgId) return;
  const [flRows] = await pool.query(
    `INSERT INTO floors (company_id, building_id, floor_number) VALUES (?, ?, ?)
     ON CONFLICT (company_id, building_id, floor_number) DO UPDATE SET floor_number = EXCLUDED.floor_number
     RETURNING id`,
    [companyId, bldgId, floor.trim()]
  );
  const flId = flRows[0]?.id;
  if (flId && room?.trim()) {
    await pool.query(
      `INSERT INTO rooms (company_id, building_id, floor_id, room_name) VALUES (?, ?, ?, ?)
       ON CONFLICT (company_id, floor_id, room_name) DO NOTHING`,
      [companyId, bldgId, flId, room.trim()]
    );
  }
}

/* ── Locations: Sync hierarchy (buildings/floors/rooms) from locations table ── */
/* POST /api/company-portal/locations/sync-hierarchy                            */
/* Full rebuild: adds missing entries AND removes stale entries that no longer  */
/* correspond to any location. Idempotent — safe to call multiple times.       */
router.post("/locations/sync-hierarchy", async (req, res, next) => {
  try {
    const companyId = cid(req);

    // ── Step 1: Collect all distinct (building, floor, room) from locations ──
    const [locs] = await pool.query(
      `SELECT DISTINCT building, floor, room
       FROM locations
       WHERE company_id = ? AND building IS NOT NULL AND building <> '' AND floor IS NOT NULL AND floor <> ''`,
      [companyId]
    );

    // ── Step 2: Upsert hierarchy and collect valid room IDs ────────────────
    const validRoomIds = new Set();
    const validFloorIds = new Set();
    const validBuildingIds = new Set();

    for (const loc of locs) {
      try {
        const [bldgRows] = await pool.query(
          `INSERT INTO buildings (company_id, name) VALUES (?, ?)
           ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [companyId, loc.building.trim()]
        );
        const bldgId = bldgRows[0]?.id;
        if (!bldgId) continue;
        validBuildingIds.add(bldgId);

        const [flRows] = await pool.query(
          `INSERT INTO floors (company_id, building_id, floor_number) VALUES (?, ?, ?)
           ON CONFLICT (company_id, building_id, floor_number) DO UPDATE SET floor_number = EXCLUDED.floor_number
           RETURNING id`,
          [companyId, bldgId, loc.floor.trim()]
        );
        const flId = flRows[0]?.id;
        if (!flId) continue;
        validFloorIds.add(flId);

        if (loc.room?.trim()) {
          const [rmRows] = await pool.query(
            `INSERT INTO rooms (company_id, building_id, floor_id, room_name) VALUES (?, ?, ?, ?)
             ON CONFLICT (company_id, floor_id, room_name) DO UPDATE SET room_name = EXCLUDED.room_name
             RETURNING id`,
            [companyId, bldgId, flId, loc.room.trim()]
          );
          if (rmRows[0]?.id) validRoomIds.add(rmRows[0].id);
        }
      } catch { /* skip individual failures */ }
    }

    // ── Step 3: Delete stale rooms (not in validRoomIds) ──────────────────
    const [allRooms] = await pool.query(
      `SELECT id FROM rooms WHERE company_id = ?`, [companyId]
    );
    const staleRoomIds = allRooms.map(r => r.id).filter(id => !validRoomIds.has(id));
    if (staleRoomIds.length > 0) {
      const ph = staleRoomIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM rooms WHERE id IN (${ph})`, staleRoomIds);
    }

    // ── Step 4: Delete stale floors (not in validFloorIds) ────────────────
    const [allFloors] = await pool.query(
      `SELECT id FROM floors WHERE company_id = ?`, [companyId]
    );
    const staleFloorIds = allFloors.map(f => f.id).filter(id => !validFloorIds.has(id));
    if (staleFloorIds.length > 0) {
      const ph = staleFloorIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM floors WHERE id IN (${ph})`, staleFloorIds);
    }

    // ── Step 5: Delete stale buildings (not in validBuildingIds) ──────────
    const [allBuildings] = await pool.query(
      `SELECT id FROM buildings WHERE company_id = ?`, [companyId]
    );
    const staleBuildingIds = allBuildings.map(b => b.id).filter(id => !validBuildingIds.has(id));
    if (staleBuildingIds.length > 0) {
      const ph = staleBuildingIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM buildings WHERE id IN (${ph})`, staleBuildingIds);
    }

    // ── Step 6: Return fresh rooms list ───────────────────────────────────
    const [rooms] = await pool.query(
      `SELECT r.id, r.building_id AS "buildingId", b.name AS "buildingName",
              r.floor_id AS "floorId", f.floor_number AS "floorNumber",
              r.room_name AS "roomName", r.created_at AS "createdAt"
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       JOIN floors   f ON f.id = r.floor_id
       WHERE r.company_id = ?
       ORDER BY b.name ASC, f.floor_number ASC, r.room_name ASC`,
      [companyId]
    );

    res.json({ ok: true, rooms });
  } catch (err) { next(err); }
});

/* ── Locations: Bulk import from Excel/CSV ──────────────────────────────── */
router.post("/locations/bulk-import", uploadLocImport.single("file"), async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (!data.length) return res.status(400).json({ message: "File is empty" });

    const created = [];
    const errors = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const name = (row["Location Name"] || row["name"] || "").toString().trim();
      if (!name) { errors.push(`Row ${i + 2}: Location Name is required`); continue; }
      // Use != null to avoid treating 0 as falsy (floor "0" = Ground floor)
      const campus   = (row["Campus"]   != null ? String(row["Campus"])   : row["campus"]   != null ? String(row["campus"])   : "").trim() || null;
      const building = (row["Building"] != null ? String(row["Building"]) : row["building"] != null ? String(row["building"]) : "").trim() || null;
      const floor    = (row["Floor"]    != null ? String(row["Floor"])    : row["floor"]    != null ? String(row["floor"])    : "").trim() || null;
      const room     = (row["Room"]     != null ? String(row["Room"])     : row["room"]     != null ? String(row["room"])     : "").trim() || null;
      const status   = (row["Status"]   || row["status"]   || "Active").toString().trim();
      try {
        const [rows] = await pool.query(
          `INSERT INTO locations (company_id, name, campus, building, floor, room, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id, name, campus, building, floor, room, qr_code AS "qrCode", status, created_at AS "createdAt"`,
          [companyId, name, campus, building, floor, room, status, userId]
        );
        if (rows[0]) {
          created.push(rows[0]);
          // Sync hierarchy tables so Rooms modal stays in sync
          if (building && floor) {
            try { await syncHierarchyEntry(companyId, building, floor, room); } catch { /* non-critical */ }
          }
        }
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }
    res.json({ created, count: created.length, errors });
  } catch (err) { next(err); }
});

router.post("/locations", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { name, campus, building, floor, room, status = "Active" } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Location name is required" });

    const [rows] = await pool.query(
      `INSERT INTO locations (company_id, name, campus, building, floor, room, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, name, campus, building, floor, room, qr_code AS "qrCode", status, created_at AS "createdAt"`,
      [companyId, name.trim(), campus || null, building || null, floor || null, room || null, status, userId]
    );

    // Sync building/floor/room hierarchy tables so they appear in template dropdowns
    if (building?.trim() && floor?.trim()) {
      try { await syncHierarchyEntry(companyId, building, floor, room); } catch { /* non-critical hierarchy sync */ }
    }

    // Auto-set qr_code for newly created location (uses production app URL)
    const newLoc = rows[0];
    if (newLoc && !newLoc.qrCode) {
      const APP_URL = process.env.APP_URL || "https://fm.catalystservices.eco";
      const qrValue = `${APP_URL}/location/${newLoc.id}`;
      await pool.query("UPDATE locations SET qr_code = ? WHERE id = ?", [qrValue, newLoc.id]).catch(() => {});
      newLoc.qrCode = qrValue;
    }

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/locations/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const { name, campus, building, floor, room, status } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Location name is required" });

    // Fetch old room value so we can sync rooms table if it changed
    const [[oldLoc]] = await pool.query(
      "SELECT room FROM locations WHERE id = ? AND company_id = ?",
      [id, companyId]
    );

    const [rows] = await pool.query(
      `UPDATE locations SET name = ?, campus = ?, building = ?, floor = ?, room = ?, status = ?
       WHERE id = ? AND company_id = ?
       RETURNING id, name, campus, building, floor, room, qr_code AS "qrCode", status, created_at AS "createdAt"`,
      [name.trim(), campus || null, building || null, floor || null, room || null, status || "Active", id, companyId]
    );
    if (!rows.length) return res.status(404).json({ message: "Location not found" });

    // Sync hierarchy tables
    if (building?.trim() && floor?.trim()) {
      try {
        const [bldgRows] = await pool.query(
          `INSERT INTO buildings (company_id, name) VALUES (?, ?)
           ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [companyId, building.trim()]
        );
        const bldgId = bldgRows[0]?.id;
        if (bldgId) {
          const [flRows] = await pool.query(
            `INSERT INTO floors (company_id, building_id, floor_number) VALUES (?, ?, ?)
             ON CONFLICT (company_id, building_id, floor_number) DO UPDATE SET floor_number = EXCLUDED.floor_number
             RETURNING id`,
            [companyId, bldgId, floor.trim()]
          );
          const flId = flRows[0]?.id;
          if (flId && room?.trim()) {
            // If room name changed, update the existing rooms row; otherwise insert if missing
            if (oldLoc?.room?.trim() && oldLoc.room.trim() !== room.trim()) {
              await pool.query(
                `UPDATE rooms SET room_name = ? WHERE company_id = ? AND floor_id = ? AND room_name = ?`,
                [room.trim(), companyId, flId, oldLoc.room.trim()]
              );
            }
            await pool.query(
              `INSERT INTO rooms (company_id, building_id, floor_id, room_name) VALUES (?, ?, ?, ?)
               ON CONFLICT (company_id, floor_id, room_name) DO NOTHING`,
              [companyId, bldgId, flId, room.trim()]
            );
            // Also sync all other locations that had the old room name on the same floor
            if (oldLoc?.room?.trim() && oldLoc.room.trim() !== room.trim()) {
              await pool.query(
                `UPDATE locations SET room = ?, name = CASE WHEN name = ? THEN ? ELSE name END
                 WHERE company_id = ? AND room = ? AND floor = ? AND building = ? AND id != ?`,
                [room.trim(), oldLoc.room.trim(), room.trim(), companyId, oldLoc.room.trim(), floor.trim(), building.trim(), id]
              );
            }
          }
        }
      } catch { /* non-critical */ }
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/locations/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    await pool.query("DELETE FROM locations WHERE id = ? AND company_id = ?", [id, companyId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete("/locations", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "ids array is required" });
    const safeIds = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (safeIds.length === 0) return res.status(400).json({ message: "No valid ids" });
    const placeholders = safeIds.map(() => "?").join(",");
    await pool.query(
      `DELETE FROM locations WHERE company_id = ? AND id IN (${placeholders})`,
      [companyId, ...safeIds]
    );
    res.json({ ok: true, deleted: safeIds.length });
  } catch (err) { next(err); }
});

/* ── Buildings / Floors / Rooms ──────────────────────────────────────────────
   Separate hierarchy tables: buildings → floors → rooms.
   These are independent of the legacy `locations` table — no existing data changed.
─────────────────────────────────────────────────────────────────────────────── */
(async () => {
  // ── Phase 1: Create tables ────────────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS buildings (
      id         SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      name       VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS floors (
      id           SERIAL PRIMARY KEY,
      company_id   INTEGER NOT NULL,
      building_id  INTEGER NOT NULL,
      floor_number VARCHAR(50) NOT NULL,
      created_at   TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rooms (
      id          SERIAL PRIMARY KEY,
      company_id  INTEGER NOT NULL,
      building_id INTEGER NOT NULL,
      floor_id    INTEGER NOT NULL,
      room_name   VARCHAR(255) NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    )`);
  } catch (e) { console.warn('[hierarchy] create tables:', e.message); }

  // ── Phase 2: Deduplicate — rooms first (references floors), then floors, then buildings.
  //    Keep the row with the lowest id for each unique key. QR codes are never touched.
  try {
    await pool.query(`
      DELETE FROM rooms
      WHERE id NOT IN (
        SELECT MIN(id) FROM rooms GROUP BY company_id, floor_id, room_name
      )
    `);
    await pool.query(`
      DELETE FROM floors
      WHERE id NOT IN (
        SELECT MIN(id) FROM floors GROUP BY company_id, building_id, floor_number
      )
    `);
    await pool.query(`
      DELETE FROM buildings
      WHERE id NOT IN (
        SELECT MIN(id) FROM buildings GROUP BY company_id, name
      )
    `);
  } catch (e) { console.warn('[hierarchy] dedup:', e.message); }

  // ── Phase 3: Unique indexes (safe after dedup removes dupes) ─────────────
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_co_name    ON buildings(company_id, name)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_floors_co_bldg_floor ON floors(company_id, building_id, floor_number)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_co_floor_name  ON rooms(company_id, floor_id, room_name)`);
  } catch (e) { console.warn('[hierarchy] indexes:', e.message); }

  // ── Phase 4: Seed from existing locations text columns ───────────────────
  try {
    await pool.query(`
      INSERT INTO buildings (company_id, name)
      SELECT DISTINCT l.company_id, TRIM(l.building)
      FROM locations l
      WHERE l.building IS NOT NULL AND TRIM(l.building) <> ''
        AND NOT EXISTS (SELECT 1 FROM buildings b2 WHERE b2.company_id = l.company_id)
      ON CONFLICT (company_id, name) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO floors (company_id, building_id, floor_number)
      SELECT DISTINCT l.company_id, b.id, TRIM(l.floor)
      FROM locations l
      JOIN buildings b ON b.company_id = l.company_id AND b.name = TRIM(l.building)
      WHERE l.floor IS NOT NULL AND TRIM(l.floor) <> ''
        AND NOT EXISTS (SELECT 1 FROM floors f2 WHERE f2.company_id = l.company_id)
      ON CONFLICT (company_id, building_id, floor_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO rooms (company_id, building_id, floor_id, room_name)
      SELECT DISTINCT l.company_id, b.id, f.id, TRIM(l.room)
      FROM locations l
      JOIN buildings b ON b.company_id = l.company_id AND b.name = TRIM(l.building)
      JOIN floors    f ON f.company_id  = l.company_id
                       AND f.building_id = b.id
                       AND f.floor_number = TRIM(l.floor)
      WHERE l.room IS NOT NULL AND TRIM(l.room) <> ''
        AND NOT EXISTS (SELECT 1 FROM rooms r2 WHERE r2.company_id = l.company_id)
      ON CONFLICT (company_id, floor_id, room_name) DO NOTHING
    `);
    console.log('[hierarchy] ready — tables created, deduped, seeded from locations.');
  } catch (e) { console.warn('[hierarchy] seed:', e.message); }
})();

// ─── Buildings ───────────────────────────────────────────────────────────────
router.get("/buildings", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, created_at AS "createdAt" FROM buildings WHERE company_id = ? ORDER BY name ASC`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/buildings", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Building name is required" });
    const [rows] = await pool.query(
      `INSERT INTO buildings (company_id, name) VALUES (?, ?) RETURNING id, name, created_at AS "createdAt"`,
      [cid(req), name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/buildings/:id", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Building name is required" });
    const [rows] = await pool.query(
      `UPDATE buildings SET name = ? WHERE id = ? AND company_id = ? RETURNING id, name, created_at AS "createdAt"`,
      [name.trim(), req.params.id, cid(req)]
    );
    if (!rows.length) return res.status(404).json({ message: "Building not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/buildings/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM buildings WHERE id = ? AND company_id = ?", [req.params.id, cid(req)]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Floors ──────────────────────────────────────────────────────────────────
router.get("/floors", async (req, res, next) => {
  try {
    const { buildingId } = req.query;
    const params = [cid(req)];
    let extra = "";
    if (buildingId) { extra = "AND f.building_id = ?"; params.push(buildingId); }
    const [rows] = await pool.query(
      `SELECT f.id, f.building_id AS "buildingId", b.name AS "buildingName",
              f.floor_number AS "floorNumber", f.created_at AS "createdAt"
       FROM floors f JOIN buildings b ON b.id = f.building_id
       WHERE f.company_id = ? ${extra}
       ORDER BY b.name ASC, f.floor_number ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/floors", async (req, res, next) => {
  try {
    const { buildingId, floorNumber } = req.body;
    if (!buildingId) return res.status(400).json({ message: "buildingId is required" });
    if (!String(floorNumber ?? "").trim()) return res.status(400).json({ message: "Floor number is required" });
    const [rows] = await pool.query(
      `INSERT INTO floors (company_id, building_id, floor_number) VALUES (?, ?, ?)
       RETURNING id, building_id AS "buildingId", floor_number AS "floorNumber", created_at AS "createdAt"`,
      [cid(req), buildingId, String(floorNumber).trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/floors/:id", async (req, res, next) => {
  try {
    const { buildingId, floorNumber } = req.body;
    if (!String(floorNumber ?? "").trim()) return res.status(400).json({ message: "Floor number is required" });
    const [rows] = await pool.query(
      `UPDATE floors SET building_id = COALESCE(?, building_id), floor_number = ?
       WHERE id = ? AND company_id = ?
       RETURNING id, building_id AS "buildingId", floor_number AS "floorNumber", created_at AS "createdAt"`,
      [buildingId || null, String(floorNumber).trim(), req.params.id, cid(req)]
    );
    if (!rows.length) return res.status(404).json({ message: "Floor not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/floors/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM floors WHERE id = ? AND company_id = ?", [req.params.id, cid(req)]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Rooms ───────────────────────────────────────────────────────────────────
router.get("/rooms", async (req, res, next) => {
  try {
    const { buildingId, floorId } = req.query;
    const params = [cid(req)];
    let extra = "";
    if (buildingId) { extra += " AND r.building_id = ?"; params.push(buildingId); }
    if (floorId)    { extra += " AND r.floor_id = ?";    params.push(floorId); }
    const [rows] = await pool.query(
      `SELECT r.id, r.building_id AS "buildingId", b.name AS "buildingName",
              r.floor_id AS "floorId", f.floor_number AS "floorNumber",
              r.room_name AS "roomName", r.created_at AS "createdAt"
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       JOIN floors   f ON f.id = r.floor_id
       WHERE r.company_id = ?${extra}
       ORDER BY b.name ASC, f.floor_number ASC, r.room_name ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/rooms", async (req, res, next) => {
  try {
    const { buildingId, floorId, roomName } = req.body;
    if (!buildingId) return res.status(400).json({ message: "buildingId is required" });
    if (!floorId)    return res.status(400).json({ message: "floorId is required" });
    if (!roomName?.trim()) return res.status(400).json({ message: "Room name is required" });
    const [rows] = await pool.query(
      `INSERT INTO rooms (company_id, building_id, floor_id, room_name) VALUES (?, ?, ?, ?)
       RETURNING id, building_id AS "buildingId", floor_id AS "floorId", room_name AS "roomName", created_at AS "createdAt"`,
      [cid(req), buildingId, floorId, roomName.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/rooms/:id", async (req, res, next) => {
  try {
    const { buildingId, floorId, roomName } = req.body;
    if (!roomName?.trim()) return res.status(400).json({ message: "Room name is required" });

    // Fetch old room name before updating so we can sync locations
    const [[oldRoom]] = await pool.query(
      "SELECT room_name AS \"roomName\", floor_id AS \"floorId\", building_id AS \"buildingId\" FROM rooms WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );

    const [rows] = await pool.query(
      `UPDATE rooms SET
         building_id = COALESCE(?, building_id),
         floor_id    = COALESCE(?, floor_id),
         room_name   = ?
       WHERE id = ? AND company_id = ?
       RETURNING id, building_id AS "buildingId", floor_id AS "floorId", room_name AS "roomName", created_at AS "createdAt"`,
      [buildingId || null, floorId || null, roomName.trim(), req.params.id, cid(req)]
    );
    if (!rows.length) return res.status(404).json({ message: "Room not found" });

    // Sync the room name change into the locations table
    if (oldRoom && oldRoom.roomName && oldRoom.roomName.trim() !== roomName.trim()) {
      await pool.query(
        `UPDATE locations SET room = ?, name = CASE WHEN name = ? THEN ? ELSE name END
         WHERE company_id = ? AND room = ?`,
        [roomName.trim(), oldRoom.roomName.trim(), roomName.trim(), cid(req), oldRoom.roomName.trim()]
      );
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/rooms/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM rooms WHERE id = ? AND company_id = ?", [req.params.id, cid(req)]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Checklists ─────────────────────────────────────────────────────────────── */
// Inline migration: add service_type and location_id to checklist_templates
(async () => {
  try {
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS service_type varchar(60) NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS location_id bigint NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS building_id bigint NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS floor_id bigint NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS room_id bigint NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS start_time TEXT NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS end_time TEXT NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS monthly_day INTEGER NULL`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS notification_timer INTEGER NULL`);
  } catch (e) {
    console.warn('[companyPortal] checklist_templates migration warning:', e.message);
  }
})();

router.get("/checklists", async (req, res, next) => {
  try {
    // Use COALESCE so the query works even if new columns don't exist yet
    const [rows] = await pool.query(
      `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
              ct.asset_id AS "assetId",
              ct.category, ct.description, ct.frequency, ct.shift, ct.status,
              ct.shift_id AS "shiftId", s.name AS "shiftName",
              ct.questions, ct.created_at AS "createdAt",
              (CASE WHEN ct.questions IS NOT NULL
                 THEN jsonb_array_length(ct.questions)
                 ELSE (SELECT COUNT(*)::int FROM checklist_template_questions ctq WHERE ctq.template_id = ct.id)
               END) AS "questionCount"
       FROM checklist_templates ct
       LEFT JOIN shifts s ON s.id = ct.shift_id
       WHERE ct.company_id = ? AND ct.is_active = 1
       ORDER BY ct.template_name`,
      [cid(req)]
    ).catch(() => [[]]);

    const allRows = rows || [];

    // Fetch new columns separately — graceful if not yet migrated
    let extraMap = {};
    try {
      const [extras] = await pool.query(
        `SELECT ct.id, ct.service_type AS "serviceType", ct.location_id AS "locationId",
                ct.building_id AS "buildingId", ct.floor_id AS "floorId", ct.room_id AS "roomId",
                ct.has_remark AS "hasRemark",
                COALESCE(ct.custom_hours::text, '[]') AS "customHoursRaw",
                ct.week_days AS "weekDaysRaw", ct.hourly_interval AS "hourlyInterval",
                ct.start_time AS "startTime", ct.end_time AS "endTime",
                ct.monthly_day AS "monthlyDay",
                ct.notification_timer AS "notificationTimer",
                ct.notification_time AS "notificationTime",
                ct.active_months AS "activeMonths",
                b.name AS "buildingName", f.floor_number AS "floorName", r.room_name AS "roomName"
         FROM checklist_templates ct
         LEFT JOIN buildings b ON b.id = ct.building_id
         LEFT JOIN floors f ON f.id = ct.floor_id
         LEFT JOIN rooms r ON r.id = ct.room_id
         WHERE ct.company_id = ? AND ct.is_active = 1`,
        [cid(req)]
      );
      for (const e of extras) {
        let customHours = [];
        try { customHours = JSON.parse(e.customHoursRaw || '[]'); } catch { customHours = []; }
        let weekDays = [];
        try { weekDays = typeof e.weekDaysRaw === 'string' ? JSON.parse(e.weekDaysRaw) : (e.weekDaysRaw || []); } catch { weekDays = []; }
        extraMap[e.id] = { serviceType: e.serviceType, locationId: e.locationId, buildingId: e.buildingId, floorId: e.floorId, roomId: e.roomId, hasRemark: !!e.hasRemark, buildingName: e.buildingName, floorName: e.floorName, roomName: e.roomName, customHours, weekDays, hourlyInterval: e.hourlyInterval || 1, startTime: e.startTime || null, endTime: e.endTime || null, monthlyDay: e.monthlyDay || null, notificationTimer: e.notificationTimer || null, notificationTime: e.notificationTime || null, activeMonths: Array.isArray(e.activeMonths) ? e.activeMonths : (typeof e.activeMonths === 'string' ? JSON.parse(e.activeMonths) : []) };
      }
    } catch (_) { /* columns not yet added — skip */ }

    // For templates where JSONB questions is null/empty, fetch from checklist_template_questions
    const needQIds = allRows.filter((r) => !Array.isArray(r.questions) || r.questions.length === 0).map((r) => r.id);
    let qFromTable = {};
    if (needQIds.length > 0) {
      try {
        const [qRows] = await pool.query(
          `SELECT template_id AS "templateId", question_text AS "questionText", input_type AS "inputType",
                  is_required AS "isRequired", order_index AS "orderIndex",
                  options_json AS "optionsJson", reference_image_url AS "referenceImageUrl",
                  question_image_url AS "questionImageUrl"
           FROM checklist_template_questions
           WHERE template_id = ANY(?)
           ORDER BY template_id, order_index ASC, id ASC`,
          [needQIds]
        );
        for (const q of (qRows || [])) {
          if (!qFromTable[q.templateId]) qFromTable[q.templateId] = [];
          const opts = q.optionsJson ? (typeof q.optionsJson === "string" ? JSON.parse(q.optionsJson) : q.optionsJson) : [];
          qFromTable[q.templateId].push({
            questionText: q.questionText,
            inputType: q.inputType,
            isRequired: !!q.isRequired,
            orderIndex: q.orderIndex,
            options: opts,
            referenceImageUrl: q.referenceImageUrl || null,
            questionImageUrl: q.questionImageUrl || null,
          });
        }
      } catch (_) { /* checklist_template_questions may not exist */ }
    }

    res.json(allRows.map((r) => {
      const questions = Array.isArray(r.questions) && r.questions.length > 0
        ? r.questions
        : (qFromTable[r.id] || []);
      return { ...r, ...extraMap[r.id], questions };
    }));
  } catch (err) {
    next(err);
  }
});

router.post("/checklists", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { templateName, assetType, serviceType, assetId, locationId, buildingId, floorId, roomId, category, description, frequency = "Daily", shift, shiftId, status = "active", questions, hasRemark, weekDays, hourlyInterval, startTime, endTime, monthlyDay, notificationTimer, notificationTime, activeMonths } = req.body;
    if (!templateName?.trim()) return res.status(400).json({ message: "templateName is required" });
    const resolvedAssetType = assetType || serviceType || null;
    const questionsJson = questions ? JSON.stringify(questions) : null;
    const weekDaysJson = Array.isArray(weekDays) && weekDays.length > 0 ? JSON.stringify(weekDays) : null;
    const activeMonthsJson = Array.isArray(activeMonths) && activeMonths.length > 0 ? JSON.stringify(activeMonths) : null;
    const [rows] = await pool.query(
      `INSERT INTO checklist_templates (company_id, template_name, asset_type, service_type, asset_id, location_id, building_id, floor_id, room_id, category, description, frequency, shift, shift_id, status, is_active, created_by, questions, has_remark, week_days, hourly_interval, start_time, end_time, monthly_day, notification_timer, notification_time, active_months)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", service_type AS "serviceType", asset_id AS "assetId", location_id AS "locationId", building_id AS "buildingId", floor_id AS "floorId", room_id AS "roomId", category, description, frequency, shift, shift_id AS "shiftId", status, questions, has_remark AS "hasRemark", week_days AS "weekDays", hourly_interval AS "hourlyInterval", start_time AS "startTime", end_time AS "endTime", monthly_day AS "monthlyDay", notification_timer AS "notificationTimer", notification_time AS "notificationTime", active_months AS "activeMonths", created_at AS "createdAt"`,
      [cid(req), templateName.trim(), resolvedAssetType, serviceType || null, assetId || null, locationId || null, buildingId || null, floorId || null, roomId || null, category || null, description || null, frequency, shift || null, shiftId || null, status, null, questionsJson, hasRemark ? true : false, weekDaysJson, hourlyInterval || 1, startTime || null, endTime || null, monthlyDay ? Number(monthlyDay) : null, notificationTimer ? Number(notificationTimer) : null, notificationTime || null, activeMonthsJson]
    );
    // Auto-assign new checklist to all active catalyst supervisors (can_resolve_soft_issue) of this company
    try {
      const newId = rows[0].id;
      const [supervisors] = await pool.query(
        `SELECT cu.id
         FROM company_users cu
         JOIN company_roles cr
           ON cr.company_id = cu.company_id
          AND cr.role_key = cu.role
          AND cr.is_active = TRUE
         WHERE cu.company_id = ?
           AND cu.status = 'Active'
           AND COALESCE(cr.can_resolve_soft_issue, FALSE) = TRUE`,
        [cid(req)]
      );
      for (const sup of supervisors) {
        await pool.query(
          `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
           VALUES (?, 'checklist', ?, ?, ?, 'Auto-assigned on creation')
           ON CONFLICT (template_type, template_id, assigned_to) DO NOTHING`,
          [cid(req), newId, sup.id, req.companyUser.id]
        );
      }
    } catch (assignErr) {
      console.error('[auto-assign supervisors]', assignErr.message);
    }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { templateName, assetType, serviceType, assetId, locationId, buildingId, floorId, roomId, category, description, frequency, shift, shiftId, status, questions, hasRemark, weekDays, hourlyInterval, startTime, endTime, monthlyDay, notificationTimer, notificationTime, activeMonths } = req.body;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    const isActive = status === "active" ? 1 : 0;
    const questionsJson = questions !== undefined ? JSON.stringify(questions) : undefined;
    const resolvedAssetType = assetType || serviceType || null;
    const weekDaysJson = weekDays !== undefined ? (Array.isArray(weekDays) && weekDays.length > 0 ? JSON.stringify(weekDays) : null) : undefined;
    const activeMonthsJson = activeMonths !== undefined ? (Array.isArray(activeMonths) && activeMonths.length > 0 ? JSON.stringify(activeMonths) : null) : undefined;
    const [rows] = await pool.query(
      `UPDATE checklist_templates SET
         template_name = COALESCE(?, template_name),
         asset_type = COALESCE(?, asset_type),
         service_type = ?,
         asset_id = ?,
         location_id = ?,
         building_id = ?,
         floor_id = ?,
         room_id = ?,
         category = COALESCE(?, category),
         description = COALESCE(?, description),
         frequency = COALESCE(?, frequency),
         shift = COALESCE(?, shift),
         shift_id = COALESCE(?, shift_id),
         status = COALESCE(?, status),
         is_active = ?,
         questions = COALESCE(?, questions),
         has_remark = ?,
         week_days = COALESCE(?, week_days),
         hourly_interval = COALESCE(?, hourly_interval),
         start_time = ?,
         end_time = ?,
         monthly_day = ?,
         notification_timer = ?,
         notification_time = ?,
         active_months = COALESCE(?, active_months)
       WHERE id = ?
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", service_type AS "serviceType", asset_id AS "assetId", location_id AS "locationId", building_id AS "buildingId", floor_id AS "floorId", room_id AS "roomId", category, description, frequency, shift, shift_id AS "shiftId", status, questions, has_remark AS "hasRemark", week_days AS "weekDays", hourly_interval AS "hourlyInterval", start_time AS "startTime", end_time AS "endTime", monthly_day AS "monthlyDay", notification_timer AS "notificationTimer", notification_time AS "notificationTime", active_months AS "activeMonths", created_at AS "createdAt"`,
      [templateName || null, resolvedAssetType || null, serviceType ?? null, assetId ?? null, locationId ?? null, buildingId ?? null, floorId ?? null, roomId ?? null, category || null, description || null, frequency || null, shift || null, shiftId ?? null, status || null, isActive, questionsJson ?? null, hasRemark != null ? !!hasRemark : null, weekDaysJson ?? null, hourlyInterval ?? null, startTime ?? null, endTime ?? null, monthlyDay != null ? Number(monthlyDay) : null, notificationTimer != null ? Number(notificationTimer) : null, notificationTime ?? null, activeMonthsJson ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/checklists", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids array required" });
    const numIds = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (numIds.length === 0) return res.status(400).json({ message: "Invalid ids" });
    const [verified] = await pool.query(
      "SELECT id FROM checklist_templates WHERE id = ANY(?) AND company_id = ?",
      [numIds, cid(req)]
    );
    if (verified.length === 0) return res.status(404).json({ message: "No matching templates found" });
    await pool.query("DELETE FROM checklist_templates WHERE id = ANY(?) AND company_id = ?", [numIds, cid(req)]);
    res.json({ deleted: verified.length });
  } catch (err) { next(err); }
});

router.delete("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    await pool.query("DELETE FROM checklist_templates WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Create Logsheet Template ──────────────────────────────────────────────── */
router.post("/logsheet-templates", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can create logsheet templates" });
    }
    const { templateName, assetType, assetModel, frequency = "daily", assetId, description,
            headerConfig = {}, sections, layoutType = "standard", shiftId } = req.body;
    if (!templateName?.trim()) return res.status(400).json({ message: "templateName is required" });
    if (!assetType) return res.status(400).json({ message: "assetType is required" });
    // Standard templates require sections; tabular templates store config in headerConfig
    if (layoutType !== "tabular" && (!Array.isArray(sections) || !sections.length)) {
      return res.status(400).json({ message: "At least one section is required" });
    }

    const companyId = cid(req);
    // Merge layoutType into headerConfig so the frontend can detect it on fetch
    const mergedConfig = { ...headerConfig, layoutType };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [tmplRows] = await conn.execute(
        `INSERT INTO logsheet_templates (company_id, asset_id, template_name, asset_type, asset_model, frequency, header_config, description, is_active, layout_type, shift_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         RETURNING id`,
        [companyId, assetId || null, templateName.trim(), assetType, assetModel || null, frequency,
         JSON.stringify(mergedConfig), description || null, layoutType, shiftId || null]
      );
      const templateId = tmplRows[0]?.id;

      // Persist sections + questions only for standard templates
      if (layoutType !== "tabular" && Array.isArray(sections)) {
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index) VALUES (?, ?, ?) RETURNING id`,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;
          const questionValues = (section.questions || []).map((q, qIdx) => [
            sectionId, q.questionText, q.specification || null, q.answerType,
            (q.rule && Object.keys(q.rule).length) ? JSON.stringify(q.rule) : null,
            q.priority || "medium", q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);
          if (questionValues.length) {
            await conn.query(
              `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index) VALUES ?`,
              [questionValues]
            );
          }
        }
      }

      // Auto-assign to asset if provided
      if (assetId) {
        await conn.execute(
          `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [templateId, assetId]
        );
      }

      await conn.commit();
      res.status(201).json({ id: templateId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ── Assign Logsheet Template to Asset ──────────────────────────────────────── */
router.post("/logsheet-templates/:templateId/assign", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[tmpl]] = await pool.query("SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?", [templateId, cid(req)]);
    if (!tmpl) return res.status(404).json({ message: "Template not found" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [assetId, cid(req)]);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    await pool.query(
      `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT (template_id, asset_id) DO NOTHING`,
      [templateId, assetId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Templates ─────────────────────────────────────────────────────── */
router.get("/logsheet-templates", async (req, res, next) => {
  try {
    const [templates] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName",
              lt.description, lt.header_config AS "headerConfig",
              lt.layout_type AS "layoutType",
              lt.shift_id AS "shiftId", sh.name AS "shiftName",
              lt.is_active AS "isActive", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       LEFT JOIN assets a ON a.id = lt.asset_id
       LEFT JOIN shifts sh ON sh.id = lt.shift_id
       WHERE lt.company_id = ?
       ORDER BY lt.template_name`,
      [cid(req)]
    );

    if (!templates.length) return res.json([]);

    const templateIds = templates.map((t) => t.id);
    const [sections] = await pool.query(
      `SELECT id, template_id AS "templateId", section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id IN (${templateIds.map(() => "?").join(",")})
       ORDER BY order_index`,
      templateIds
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index`,
        sectionIds
      );
      questions = qRows;
    }

    const result = templates.map((t) => ({
      ...t,
      headerConfig: safeParse(t.headerConfig) ?? {},
      sections: sections
        .filter((s) => s.templateId === t.id)
        .map((s) => ({
          ...s,
          questions: questions
            .filter((q) => q.sectionId === s.id)
            .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
        })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Submit Logsheet Entry ──────────────────────────────────────────────────── */
router.post("/logsheet-templates/:templateId/entries", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year, shift, headerValues = {}, answers, tabularData } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    // Verify template belongs to this company
    const [[tmplRow]] = await pool.query(
      `SELECT id, COALESCE(layout_type, 'standard') AS "layoutType" FROM logsheet_templates WHERE id = ? AND company_id = ?`,
      [templateId, cid(req)]
    );
    if (!tmplRow) return res.status(404).json({ message: "Template not found" });

    const isTabular = tmplRow.layoutType === "tabular" || !!tabularData;

    // ── Shift Enforcement ─────────────────────────────────────────────────
    // Tech users can only submit during their assigned shift window.
    if (req.companyUser.role !== 'admin' && req.companyUser.role !== 'supervisor') {
      const [[shiftInfo]] = await pool.query(
        `SELECT s.id, s.name AS "shiftName", s.start_time AS "startTime",
                s.end_time AS "endTime", s.status AS "shiftStatus",
                es.id AS "employeeShiftId"
         FROM logsheet_templates lt
         JOIN shifts s ON s.id = lt.shift_id
         LEFT JOIN employee_shifts es
           ON es.shift_id = s.id AND es.company_user_id = ?
         WHERE lt.id = ? AND lt.company_id = ?`,
        [req.companyUser.id, templateId, cid(req)]
      ).catch(() => [[null]]);

      if (shiftInfo) {
        if (!shiftInfo.employeeShiftId) {
          return res.status(403).json({
            message: `You are not assigned to the "${shiftInfo.shiftName}" shift.`,
            shiftLocked: true,
            shiftName: shiftInfo.shiftName,
          });
        }
        if (shiftInfo.shiftStatus !== 'active' || !isShiftActive(shiftInfo.startTime, shiftInfo.endTime)) {
          return res.status(403).json({
            message: `The "${shiftInfo.shiftName}" shift is not currently active (${shiftInfo.startTime}–${shiftInfo.endTime}).`,
            shiftLocked: true,
            shiftName: shiftInfo.shiftName,
          });
        }
      }
    }

    if (!isTabular && !answers?.length) {
      return res.status(400).json({ message: "answers are required for standard logsheet entries" });
    }
    if (!isTabular && !assetId) {
      return res.status(400).json({ message: "assetId is required for standard logsheet entries" });
    }

    // Verify asset belongs to this company (only when asset is provided)
    let assetRow = null;
    if (assetId) {
      const [[foundAsset]] = await pool.query(
        "SELECT id, asset_name, building, floor, room FROM assets WHERE id = ? AND company_id = ?",
        [assetId, cid(req)]
      );
      if (!foundAsset) return res.status(404).json({ message: "Asset not found" });
      assetRow = foundAsset;
    }

    const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const dataJson = isTabular ? JSON.stringify(tabularData || {}) : "{}";

    const [entryRows] = await pool.query(
      `INSERT INTO logsheet_entries (template_id, asset_id, submitted_by, company_user_id, entry_date, month, year, shift, header_values, data, submitted_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NOW())
       RETURNING id`,
      [templateId, assetId || null, req.companyUser.id, monthDate, month, year,
       shift || null, JSON.stringify(headerValues), dataJson]
    );
    const entryId = entryRows[0]?.id ?? entryRows.insertId;

    // Persist individual answers for standard (non-tabular) templates
    if (!isTabular && answers?.length) {
      for (const a of answers) {
        await pool.query(
          `INSERT INTO logsheet_answers (entry_id, question_id, date_column, answer_value, is_issue, issue_reason, issue_detail)
           VALUES (?, ?, ?, ?, 0, NULL, NULL)`,
          [entryId, a.questionId, a.dateColumn || null, a.answerValue != null ? String(a.answerValue) : null]
        ).catch(() => {});
      }
    }

    // ── Flag & Alert Engine ────────────────────────────────────────────────────
    let issueCount = 0;
    if (entryId && assetId && answers?.length && !isTabular) {
      try {
        const [ruleQuestions] = await pool.query(
          `SELECT lq.id, lq.question_text, lq.rule_json, lq.answer_type
           FROM logsheet_questions lq
           JOIN logsheet_sections ls ON lq.section_id = ls.id
           WHERE ls.template_id = ?`,
          [templateId]
        );

        const qRuleMap = {};
        for (const q of ruleQuestions) {
          const rule = q.rule_json
            ? (typeof q.rule_json === "string" ? JSON.parse(q.rule_json) : q.rule_json)
            : null;
          qRuleMap[q.id] = { rule, text: q.question_text, answerType: q.answer_type };
        }

        const lsLocation = [assetRow.building, assetRow.floor, assetRow.room]
          .filter(Boolean).join(", ");

        for (const a of answers) {
          const qInfo = qRuleMap[a.questionId];
          if (!qInfo?.rule) continue;

          const ruleEval = evaluateRule(qInfo.rule, a.answerValue);
          if (!ruleEval.violated) continue;

          issueCount++;
          const description = `Rule violation for "${qInfo.text}": entered=${a.answerValue}, ${ruleEval.expectedText}`;

          const flagId = await createFlag(
            {
              source:          "logsheet",
              companyId:       cid(req),
              assetId,
              logsheetEntryId: entryId,
              questionId:      a.questionId,
              raisedBy:        req.companyUser.id,
              description,
              severity:        ruleEval.severity,
              enteredValue:    String(a.answerValue ?? ""),
              expectedRule:    ruleEval.expectedText,
              forceWorkOrder:  !!qInfo.rule.autoWorkOrder,
            },
            { assetName: assetRow.asset_name, location: lsLocation }
          ).catch((e) => { console.error("[FlagSystem] logsheet flag error:", e.message); return null; });

          if (flagId) {
            await dispatchFlagNotifications({
              flagId,
              companyId:    cid(req),
              assetId,
              assetName:    assetRow.asset_name,
              location:     lsLocation,
              questionText: qInfo.text,
              enteredValue: String(a.answerValue ?? ""),
              expectedRange: ruleEval.expectedText,
              severity:     ruleEval.severity,
              raisedBy:     req.companyUser.id,
              ruleActions:  qInfo.rule,
            }).catch(() => {});
          }
        }
      } catch (flagErr) {
        console.error("[FlagSystem] logsheet portal detection failed:", flagErr.message);
      }
    }

    res.status(201).json({ id: entryId, issues: issueCount });
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Entries (read) ────────────────────────────────────────────────── */
router.get("/logsheet-templates/:templateId/entries", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year, limit = 100 } = req.query;

    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const qParams = [templateId];
    let where = "WHERE le.template_id = ?";
    if (assetId) { where += " AND le.asset_id = ?"; qParams.push(assetId); }
    if (month) { where += " AND le.month = ?"; qParams.push(Number(month)); }
    if (year) { where += " AND le.year = ?"; qParams.push(Number(year)); }

    const [entries] = await pool.query(
      `SELECT le.id, le.asset_id AS "assetId", le.template_id AS "templateId",
              le.submitted_by AS "submittedBy", le.entry_date AS "entryDate",
              le.month, le.year, le.shift, le.header_values AS "headerValues",
              le.data,
              le.submitted_at AS "submittedAt",
              cu.full_name AS "submittedByName"
       FROM logsheet_entries le
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       ${where}
       ORDER BY le.submitted_at DESC
       LIMIT ?`,
      [...qParams, Number(limit)]
    );

    if (!entries.length) return res.json([]);

    const entryIds = entries.map((e) => e.id);
    const [answers] = await pool.query(
      `SELECT id, entry_id AS "entryId", question_id AS "questionId", date_column AS "dateColumn",
              answer_value AS "answerValue", is_issue AS "isIssue", issue_reason AS "issueReason"
       FROM logsheet_answers
       WHERE entry_id IN (${entryIds.map(() => "?").join(",")})
       ORDER BY entry_id ASC, question_id ASC, date_column ASC`,
      entryIds
    );

    const result = entries.map((e) => ({
      ...e,
      headerValues: safeParse(e.headerValues) ?? {},
      data: safeParse(e.data) ?? {},
      answers: answers.filter((a) => a.entryId === e.id),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Grid View (company portal) ────────────────────────────────────── */
router.get("/logsheet-templates/:templateId/grid", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year } = req.query;
    const now = new Date();
    const effectiveMonth = month ? Number(month) : now.getMonth() + 1;
    const effectiveYear = year ? Number(year) : now.getFullYear();
    const companyId = cid(req);

    // Verify template belongs to this company
    const [[tmplRow]] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "defaultAssetId",
              lt.header_config AS "headerConfig", lt.description,
              COALESCE(lt.layout_type, 'standard') AS "layoutType"
       FROM logsheet_templates lt WHERE lt.id = ? AND lt.company_id = ?`,
      [templateId, companyId]
    );
    if (!tmplRow) return res.status(404).json({ message: "Template not found" });
    tmplRow.headerConfig = safeParse(tmplRow.headerConfig) ?? {};
    // Ensure layoutType is always reflected in headerConfig for the frontend check
    if (!tmplRow.headerConfig.layoutType) tmplRow.headerConfig.layoutType = tmplRow.layoutType;

    // Sections + Questions
    const [sections] = await pool.query(
      `SELECT id, section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
      [templateId]
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions
         WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        sectionIds
      );
      questions = qRows;
    }

    const structuredTemplate = {
      ...tmplRow,
      sections: sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.sectionId === s.id)
          .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
      })),
    };

    // Asset info
    const effectiveAssetId = assetId ? Number(assetId) : tmplRow.defaultAssetId;
    let asset = null;
    if (effectiveAssetId) {
      const [[aRow]] = await pool.query(
        `SELECT id, asset_name AS "assetName", asset_type AS "assetType"
         FROM assets WHERE id = ? AND company_id = ?`,
        [effectiveAssetId, companyId]
      );
      asset = aRow || null;
    }

    // Fetch all entries for this template + month + year (supports date filter on frontend)
    const [entryRows] = await pool.query(
      `SELECT le.id, le.asset_id AS "assetId", le.shift,
              le.header_values AS "headerValues", le.data,
              le.submitted_at AS "submittedAt", le.status,
              cu.full_name AS "submittedByName"
       FROM logsheet_entries le
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       WHERE le.template_id = ? AND le.month = ? AND le.year = ?
       ORDER BY le.submitted_at DESC NULLS LAST`,
      [templateId, effectiveMonth, effectiveYear]
    );

    // Parse JSON columns for every entry
    const allEntries = entryRows.map((e) => ({
      ...e,
      headerValues: safeParse(e.headerValues) ?? {},
      data: safeParse(e.data) ?? {},
    }));

    const entry = allEntries[0] || null;
    let answerMap = {};

    // Build answer-map from logsheet_answers for standard (non-tabular) templates
    if (entry && tmplRow.layoutType !== "tabular") {
      const [ansRows] = await pool.query(
        `SELECT question_id AS "questionId", date_column AS "dateColumn",
                answer_value AS "answerValue", is_issue AS "isIssue", issue_reason AS "issueReason"
         FROM logsheet_answers WHERE entry_id = ?
         ORDER BY question_id ASC, date_column ASC`,
        [entry.id]
      );
      for (const a of ansRows) {
        if (!answerMap[a.questionId]) answerMap[a.questionId] = {};
        answerMap[a.questionId][a.dateColumn] = {
          value: a.answerValue,
          isIssue: !!a.isIssue,
          issueReason: a.issueReason,
        };
      }
    }

    const daysInMonth = new Date(effectiveYear, effectiveMonth, 0).getDate();

    res.json({ template: structuredTemplate, asset, entry, entries: allEntries, answerMap, daysInMonth });
  } catch (err) {
    next(err);
  }
});

/* ── Single Logsheet Template ───────────────────────────────────────────────── */
router.get("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName",
              lt.description, lt.header_config AS "headerConfig",
              lt.layout_type AS "layoutType",
              lt.is_active AS "isActive", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       LEFT JOIN assets a ON a.id = lt.asset_id
       WHERE lt.id = ? AND lt.company_id = ?`,
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const [sections] = await pool.query(
      `SELECT id, section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id = ? ORDER BY order_index`,
      [templateId]
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index`,
        sectionIds
      );
      questions = qRows;
    }

    res.json({
      ...tmpl,
      headerConfig: safeParse(tmpl.headerConfig) ?? {},
      sections: sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.sectionId === s.id)
          .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ── Update Logsheet Template ───────────────────────────────────────────────── */
router.put("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can edit logsheet templates" });
    }
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const { templateName, assetType, assetModel, frequency, assetId, description, headerConfig, sections } = req.body;

    const setClauses = [];
    const setParams = [];
    if (templateName !== undefined) { setClauses.push("template_name = ?"); setParams.push(templateName.trim()); }
    if (assetType !== undefined) { setClauses.push("asset_type = ?"); setParams.push(assetType); }
    if (assetModel !== undefined) { setClauses.push("asset_model = ?"); setParams.push(assetModel || null); }
    if (frequency !== undefined) { setClauses.push("frequency = ?"); setParams.push(frequency); }
    if (assetId !== undefined) { setClauses.push("asset_id = ?"); setParams.push(assetId || null); }
    if (description !== undefined) { setClauses.push("description = ?"); setParams.push(description || null); }
    if (headerConfig !== undefined) { setClauses.push("header_config = ?"); setParams.push(JSON.stringify(headerConfig)); }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (setClauses.length) {
        await conn.execute(
          `UPDATE logsheet_templates SET ${setClauses.join(", ")} WHERE id = ?`,
          [...setParams, templateId]
        );
      }

      // Sync assignment if assetId changed
      if (assetId !== undefined) {
        await conn.execute("DELETE FROM logsheet_template_assignments WHERE template_id = ?", [templateId]);
        if (assetId) {
          await conn.execute(
            `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
            [templateId, assetId]
          );
        }
      }

      if (Array.isArray(sections)) {
        await conn.execute("DELETE FROM logsheet_sections WHERE template_id = ?", [templateId]);
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index) VALUES (?, ?, ?) RETURNING id`,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;
          const questionValues = (section.questions || []).map((q, qIdx) => [
            sectionId, q.questionText, q.specification || null, q.answerType,
            (q.rule && Object.keys(q.rule).length) ? JSON.stringify(q.rule) : null,
            q.priority || "medium", q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);
          if (questionValues.length) {
            await conn.query(
              `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index) VALUES ?`,
              [questionValues]
            );
          }
        }
      }

      await conn.commit();
      res.status(204).send();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ── Delete Logsheet Template ───────────────────────────────────────────────── */
router.delete("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can delete logsheet templates" });
    }
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });
    await pool.execute("DELETE FROM logsheet_templates WHERE id = ?", [templateId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/* ── Employees ──────────────────────────────────────────────────────────────── */
router.get("/employees", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId",
              cu.full_name AS "fullName", cu.email, cu.phone,
              cu.designation, cu.role, cu.shift, cu.status, cu.username,
              cu.employee_code AS "employeeCode",
              cu.supervisor_id AS "supervisorId",
              COALESCE(cu.service_domain, 'technical') AS "serviceDomain",
              cu.permissions,
              cu.module_access AS "moduleAccess",
              s.full_name AS "supervisorName",
              s.role AS "supervisorRole",
              cu.created_at AS "createdAt"
       FROM company_users cu
       LEFT JOIN company_users s ON s.id = cu.supervisor_id
       WHERE cu.company_id = ?
       ORDER BY cu.role ASC, cu.full_name ASC`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Users by role list (for parent dropdowns) ─────────────────────────────── */
router.get("/employees/by-role", async (req, res, next) => {
  try {
    const { role } = req.query;  // single role or comma-separated list
    const roles = (role || "").split(",").map((r) => r.trim()).filter(Boolean);
    let where = "WHERE company_id = ?";
    const params = [cid(req)];
    if (roles.length) {
      where += ` AND role IN (${roles.map(() => "?").join(",")})`;
      params.push(...roles);
    }
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, role, shift, designation
       FROM company_users
       ${where}
       ORDER BY full_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Supervisors list (for dropdowns) ───────────────────────────────────────── */
router.get("/employees/supervisors", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, designation
       FROM company_users
       WHERE company_id = ? AND role = 'supervisor'
       ORDER BY full_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET: My team members (for supervisors in mobile app)
router.get("/my-team", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, phone, role, designation, status
       FROM company_users
       WHERE supervisor_id = ? AND company_id = ?
       ORDER BY full_name`,
      [req.companyUser.id, cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/employees", async (req, res, next) => {
  try {
    const { fullName, email, phone, designation, role = "employee", status = "Active", password, username, supervisorId, shift, serviceDomain = "technical", employeeCode, permissions, moduleAccess } = req.body;
    if (!fullName || !email) return res.status(400).json({ message: "fullName and email are required" });

    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can add employees" });
    }

    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId || null);

    const validDomains = ['technical', 'soft', 'both'];
    const resolvedDomain = validDomains.includes(serviceDomain) ? serviceDomain : 'technical';

    // Default moduleAccess to all modules when not specified
    const DEFAULT_MODULE_ACCESS = ["dashboard", "checklists", "logsheets", "mytasks", "locations"];
    const resolvedModuleAccess = Array.isArray(moduleAccess) && moduleAccess.length > 0
      ? moduleAccess : DEFAULT_MODULE_ACCESS;
    const permJson = JSON.stringify(permissions && typeof permissions === "object" ? permissions : {});
    const modJson  = JSON.stringify(resolvedModuleAccess);

    let passwordHash = null;
    if (password) passwordHash = await bcrypt.hash(password, 10);

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, shift, status, password_hash, username, supervisor_id, service_domain, employee_code, permissions, module_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
       RETURNING id,
                 company_id     AS "companyId",
                 full_name      AS "fullName",
                 email, phone, designation, role, shift, status, username,
                 employee_code  AS "employeeCode",
                 supervisor_id  AS "supervisorId",
                 service_domain AS "serviceDomain",
                 permissions,
                 module_access  AS "moduleAccess",
                 created_at     AS "createdAt"`,
      [cid(req), fullName, email, phone || null, designation || null, role, shift || null, status, passwordHash, username || null, resolvedSupervisorId, resolvedDomain, employeeCode || null, permJson, modJson]
    );
    const newEmployee = rows[0];
    // Auto-assign all active checklist templates if the new employee is a catalyst supervisor
    try {
      const [[roleRow]] = await pool.query(
        `SELECT can_resolve_soft_issue FROM company_roles
         WHERE company_id = ? AND role_key = ? AND is_active = TRUE LIMIT 1`,
        [cid(req), role]
      );
      if (roleRow?.can_resolve_soft_issue) {
        const [templates] = await pool.query(
          `SELECT id FROM checklist_templates WHERE company_id = ? AND is_active = 1`,
          [cid(req)]
        );
        for (const tpl of templates) {
          await pool.query(
            `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
             VALUES (?, 'checklist', ?, ?, ?, 'Auto-assigned on creation')
             ON CONFLICT (template_type, template_id, assigned_to) DO NOTHING`,
            [cid(req), tpl.id, newEmployee.id, req.companyUser.id]
          );
        }
      }
    } catch (assignErr) {
      console.error('[auto-assign new catalyst supervisor]', assignErr.message);
    }
    res.status(201).json(newEmployee);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "uq_company_users_username") return res.status(409).json({ message: "Username already exists" });
      return res.status(409).json({ message: "Email already exists" });
    }
    next(err);
  }
});

router.put("/employees/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, designation, role, status, password, username, supervisorId, shift, serviceDomain, employeeCode, permissions, moduleAccess } = req.body;

    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Employee not found" });

    if (req.companyUser.role === "supervisor") {
      const [[emp]] = await pool.query(
        "SELECT supervisor_id FROM company_users WHERE id = ?", [id]
      );
      if (!emp || String(emp.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "Not authorised to edit this employee" });
      }
    }

    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId !== undefined ? (supervisorId || null) : undefined);

    const validDomains = ['technical', 'soft', 'both'];
    let serviceDomainClause = "";

    let passwordClause = "";
    let usernameClause = username !== undefined ? ", username = ?" : "";
    let supervisorClause = resolvedSupervisorId !== undefined ? ", supervisor_id = ?" : "";
    let shiftClause = shift !== undefined ? ", shift = ?" : "";
    let employeeCodeClause = employeeCode !== undefined ? ", employee_code = ?" : "";
    let permissionsClause = "";
    let moduleAccessClause = "";
    if (serviceDomain !== undefined && validDomains.includes(serviceDomain)) {
      serviceDomainClause = ", service_domain = ?";
    }
    if (permissions !== undefined) {
      permissionsClause = ", permissions = ?::jsonb";
    }
    if (moduleAccess !== undefined) {
      moduleAccessClause = ", module_access = ?::jsonb";
    }
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active"];
    if (username !== undefined) params.push(username || null);
    if (resolvedSupervisorId !== undefined) params.push(resolvedSupervisorId);
    if (shift !== undefined) params.push(shift || null);
    if (serviceDomainClause) params.push(serviceDomain);
    if (employeeCodeClause) params.push(employeeCode || null);
    if (permissionsClause) params.push(JSON.stringify(permissions && typeof permissions === 'object' ? permissions : {}));
    if (moduleAccessClause) params.push(JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []));
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      passwordClause = ", password_hash = ?";
      params.push(hash);
    }
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET full_name = ?, email = ?, phone = ?, designation = ?, role = ?, status = ?${usernameClause}${supervisorClause}${shiftClause}${serviceDomainClause}${employeeCodeClause}${permissionsClause}${moduleAccessClause}${passwordClause}, updated_at = NOW()
       WHERE id = ?
       RETURNING id,
                 full_name      AS "fullName",
                 email, phone, designation, role, shift, status, username,
                 employee_code  AS "employeeCode",
                 supervisor_id  AS "supervisorId",
                 service_domain AS "serviceDomain",
                 permissions,
                 module_access  AS "moduleAccess"`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "uq_company_users_username") return res.status(409).json({ message: "Username already exists" });
      return res.status(409).json({ message: "Email already exists" });
    }
    next(err);
  }
});

router.delete("/employees/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete employees" });
    }
    const { id } = req.params;
    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Not found" });
    await pool.query("DELETE FROM company_users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ── Bulk import employees ──────────────────────────────────────────────────── */
router.post("/employees/bulk", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }
    const { employees } = req.body; // array of { fullName, email, phone, designation, role, status, password }
    if (!Array.isArray(employees) || !employees.length) {
      return res.status(400).json({ message: "employees array is required" });
    }

    const results = { created: 0, skipped: 0, errors: [] };
    for (const emp of employees) {
      try {
        const { fullName, email, phone, designation, role = "employee", status = "Active", password } = emp;
        if (!fullName || !email) { results.errors.push({ email, reason: "Missing name or email" }); continue; }
        let passwordHash = null;
        if (password) passwordHash = await bcrypt.hash(password, 10);
        await pool.query(
          `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (email) DO NOTHING`,
          [cid(req), fullName, email, phone || null, designation || null, role, status, passwordHash]
        );
        results.created++;
      } catch (err) {
        results.skipped++;
        results.errors.push({ email: emp.email, reason: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
});

/* ── Current user profile ───────────────────────────────────────────────────── */
router.get("/me", async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT cu.id, cu.full_name AS "fullName", cu.email, cu.phone, cu.designation, cu.role,
              cu.status, cu.company_id AS "companyId", c.company_name AS "companyName",
              c.enabled_modules AS "enabledModules", c.logo_url AS "logoUrl"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [req.companyUser.id]
    );
    if (!row) return res.status(404).json({ message: "User not found" });
    row.enabledModules = row.enabledModules
      ? (typeof row.enabledModules === "string" ? JSON.parse(row.enabledModules) : row.enabledModules)
      : null;
    res.json(row);
  } catch (err) {
    next(err);
  }
});

/* ── Recent filled logsheet entries (company portal) ───────────────────────── */
router.get("/logsheet-templates/entries/recent", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
            `SELECT le.id, le.month, le.year, le.shift,
              le.submitted_at AS "submittedAt",
              lt.template_name AS "templateName", lt.frequency, lt.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              COALESCE(loc.name, NULLIF(TRIM(CONCAT_WS(', ', a.building, a.floor, a.room)), '')) AS "locationName",
              COALESCE(le.company_user_id, le.submitted_by) AS "submittedById",
              cu.full_name AS "submittedBy"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
       LEFT JOIN locations loc ON loc.id = lt.location_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       WHERE lt.company_id = ?
       ORDER BY le.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Recent filled checklist submissions (company portal) ───────────────────── */
router.get("/checklist-submissions/recent", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
            `SELECT cs.id, cs.submitted_at AS "submittedAt",
              ct.template_name AS "templateName", ct.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              COALESCE(loc.name, NULLIF(TRIM(CONCAT_WS(', ', a.building, a.floor, a.room)), '')) AS "locationName",
              r.room_name AS "roomName",
              cs.status, cs.completion_pct AS "completionPct",
              COALESCE(cs.company_user_id, cs.submitted_by) AS "submittedById",
              cu.full_name AS "submittedBy"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       LEFT JOIN locations loc ON loc.id = ct.location_id
       LEFT JOIN rooms r ON r.id = ct.room_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       WHERE ct.company_id = ?
       ORDER BY cs.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Delete checklist submissions ──────────────────────────────────────────── */

// DELETE /checklist-submissions/:id  — delete a single submission (admin only)
router.delete("/checklist-submissions/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });
    // Verify submission belongs to this company
    const [[sub]] = await pool.query(
      `SELECT cs.id FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       WHERE cs.id = ? AND ct.company_id = ?`,
      [id, companyId]
    );
    if (!sub) return res.status(404).json({ message: "Submission not found" });
    await pool.query("DELETE FROM checklist_submission_answers WHERE submission_id = ?", [id]);
    await pool.query("DELETE FROM checklist_submissions WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /checklist-submissions/bulk  — delete multiple submissions at once
router.post("/checklist-submissions/bulk-delete", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ message: "No ids provided" });
    // Verify all belong to this company
    const [subs] = await pool.query(
      `SELECT cs.id FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       WHERE cs.id IN (${ids.map(() => "?").join(",")}) AND ct.company_id = ?`,
      [...ids, companyId]
    );
    const validIds = subs.map((r) => r.id);
    if (!validIds.length) return res.status(404).json({ message: "No matching submissions found" });
    await pool.query(`DELETE FROM checklist_submission_answers WHERE submission_id IN (${validIds.map(() => "?").join(",")})`, validIds);
    await pool.query(`DELETE FROM checklist_submissions WHERE id IN (${validIds.map(() => "?").join(",")})`, validIds);
    res.json({ ok: true, deleted: validIds.length });
  } catch (err) { next(err); }
});

/* ── Template ↔ User Assignments ────────────────────────────────────────────── */

// Admin assigns a template to a supervisor; supervisor can assign to their helpers
router.post("/template-user-assignments", async (req, res, next) => {
  try {
    const { templateType, templateId, assignedTo, note } = req.body;
    const normalizedTemplateId = Number(templateId);
    const normalizedAssignedTo = Number(assignedTo);
    if (!templateType || !normalizedTemplateId || !normalizedAssignedTo) {
      return res.status(400).json({ message: "templateType, templateId and assignedTo are required" });
    }
    if (!["checklist", "logsheet"].includes(templateType)) {
      return res.status(400).json({ message: "templateType must be checklist or logsheet" });
    }

    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can assign templates" });
    }

    // Supervisor can only assign to their own helpers
    if (role === "supervisor") {
      const [[target]] = await pool.query(
        "SELECT supervisor_id FROM company_users WHERE id = ? AND company_id = ?",
        [normalizedAssignedTo, cid(req)]
      );
      if (!target || String(target.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "You can only assign to employees under you" });
      }
    }

    // Verify target belongs to this company
    const [[empCheck]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [normalizedAssignedTo, cid(req)]
    );
    if (!empCheck) return res.status(404).json({ message: "Assignee not found in this company" });

    // Verify template belongs to this company
    const templateTable = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
    const [[templateCheck]] = await pool.query(
      `SELECT id, asset_type FROM ${templateTable} WHERE id = ? AND company_id = ?`,
      [normalizedTemplateId, cid(req)]
    );
    if (!templateCheck) return res.status(404).json({ message: "Template not found in this company" });

    const [rows] = await pool.query(
      `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (template_type, template_id, assigned_to) DO UPDATE
         SET note = EXCLUDED.note, assigned_by = EXCLUDED.assigned_by, created_at = NOW()
       RETURNING id, template_type AS "templateType", template_id AS "templateId",
                 assigned_to AS "assignedTo", assigned_by AS "assignedBy", note, created_at AS "createdAt"`,
      [cid(req), templateType, normalizedTemplateId, normalizedAssignedTo, req.companyUser.id, note || null]
    );

    // For logsheet assignments: ensure logsheet_template_assignments exists
    // This links the logsheet template to specific assets so mobile queries work correctly
    if (templateType === "logsheet") {
      // Check if this logsheet already has asset assignments
      const [[existingAssignment]] = await pool.query(
        "SELECT id FROM logsheet_template_assignments WHERE template_id = ? LIMIT 1",
        [normalizedTemplateId]
      );

      if (!existingAssignment) {
        // No existing asset assignments, so create one for each asset of matching type
        // This ensures the /my-assignments query returns the logsheet with a valid assetId
        const [assets] = await pool.query(
          "SELECT id FROM assets WHERE company_id = ? AND asset_type = ? AND status = 'Active' LIMIT 1",
          [cid(req), templateCheck.asset_type]
        );

        if (assets.length > 0) {
          // Insert logsheet_template_assignments for the first available asset
          await pool.query(
            `INSERT INTO logsheet_template_assignments (template_id, asset_id, attached_by)
             VALUES (?, ?, ?)
             ON CONFLICT (template_id, asset_id) DO NOTHING`,
            [normalizedTemplateId, assets[0].id, req.companyUser.id]
          );
        }
      }
    }

    res.status(201).json(rows[0]);

    // Push notification to the assigned user (non-blocking, fire-and-forget)
    try {
      const [[assignee]] = await pool.query(
        "SELECT push_token, fcm_token FROM company_users WHERE id = ? AND company_id = ?",
        [normalizedAssignedTo, cid(req)]
      );
      const templateLabel = templateType === "checklist" ? "Checklist" : "Logsheet";
      const tplTitle = `New ${templateLabel} Assigned`;
      const tplBody  = `A ${templateLabel.toLowerCase()} template has been assigned to you.`;
      const tplData  = { type: "template_assignment", templateType, templateId: String(normalizedTemplateId), screen: "/notifications" };
      if (assignee?.push_token) await sendExpoPush(assignee.push_token, tplTitle, tplBody, tplData);
      if (assignee?.fcm_token)  await sendFCMPush(assignee.fcm_token,  tplTitle, tplBody, tplData);
      await createInAppNotification(cid(req), normalizedAssignedTo, tplTitle, tplBody, "/notifications");
    } catch { /* Non-fatal */ }
  } catch (err) {
    next(err);
  }
});
router.get("/template-user-assignments", async (req, res, next) => {
  try {
    // Keep catalyst-supervisor assignments in sync: every active daily checklist
    // should exist for every active technical supervisor.
    try {
      await pool.query(
        `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
         SELECT ?, 'checklist', ct.id, cu.id, ?, 'Auto-assigned checklist'
         FROM checklist_templates ct
         JOIN company_users cu ON cu.company_id = ct.company_id
         JOIN company_roles cr
           ON cr.company_id = cu.company_id
          AND cr.role_key = cu.role
          AND cr.is_active = TRUE
         WHERE ct.company_id = ?
           AND ct.is_active = 1
           AND cu.status = 'Active'
           AND COALESCE(cr.can_resolve_soft_issue, FALSE) = TRUE
         ON CONFLICT (template_type, template_id, assigned_to) DO NOTHING`,
        [cid(req), req.companyUser.id, cid(req)]
      );
    } catch (syncErr) {
      console.error('[sync checklist assignments]', syncErr.message);
    }

    const role = req.companyUser.role;
    let rows;
    if (role === "admin") {
      [rows] = await pool.query(
        `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
                tua.assigned_to AS "assignedTo", tua.assigned_by AS "assignedBy",
                tua.note, tua.created_at AS "createdAt",
                cu.full_name AS "assignedToName", cu.role AS "assignedToRole",
                ab.full_name AS "assignedByName",
                COALESCE(ct.template_name, lt.template_name) AS "templateName"
         FROM template_user_assignments tua
         JOIN company_users cu  ON cu.id  = tua.assigned_to
         LEFT JOIN company_users ab ON ab.id = tua.assigned_by
         LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
         LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
         WHERE tua.company_id = ?
         ORDER BY tua.created_at DESC`,
        [cid(req)]
      );
    } else if (role === "supervisor") {
      // Supervisor sees assignments they made to their helpers
      [rows] = await pool.query(
        `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
                tua.assigned_to AS "assignedTo", tua.assigned_by AS "assignedBy",
                tua.note, tua.created_at AS "createdAt",
                cu.full_name AS "assignedToName", cu.role AS "assignedToRole",
                COALESCE(ct.template_name, lt.template_name) AS "templateName"
         FROM template_user_assignments tua
         JOIN company_users cu ON cu.id = tua.assigned_to
         LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
         LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
         WHERE tua.company_id = ? AND tua.assigned_by = ?
         ORDER BY tua.created_at DESC`,
        [cid(req), req.companyUser.id]
      );
    } else {
      return res.status(403).json({ message: "Not authorised" });
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get assignments for the CURRENT logged-in user (employee/helper sees their assigned tasks)
router.get("/template-user-assignments/mine", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
              tua.note, tua.created_at AS "createdAt",
              ab.full_name AS "assignedByName",
              COALESCE(ct.template_name, lt.template_name) AS "templateName",
              lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName"
       FROM template_user_assignments tua
  LEFT JOIN company_users ab    ON ab.id = tua.assigned_by
       LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
       LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
       LEFT JOIN assets a             ON a.id = lt.asset_id
       WHERE tua.assigned_to = ? AND tua.company_id = ?
       ORDER BY tua.created_at DESC`,
      [req.companyUser.id, cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WORK ORDERS
// ─────────────────────────────────────────────────────────────────────────────

/* ── Helper: create in-app notification row (non-fatal) ──────────────────── */
async function createInAppNotification(companyId, recipientId, title, message, targetScreen = null) {
  try {
    await pool.execute(
      `INSERT INTO notifications (company_id, recipient_id, type, title, message, is_read, created_at, target_screen)
       VALUES (?, ?, 'push', ?, ?, FALSE, NOW(), ?)`,
      [companyId, recipientId, title, message, targetScreen]
    );
  } catch { /* Non-fatal */ }
}

/* ── Helper: send Expo push notification (non-fatal) ──────────────────────── */
async function sendExpoPush(pushToken, title, body, data = {}) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: "default" }),
    });
  } catch { /* Non-fatal */ }
}

const generateWONumber = () =>
  `WO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/* GET /work-orders/users  – list company users available for assignment */
router.get("/work-orders/users", async (req, res, next) => {
  try {
    const companyId = parseInt(cid(req), 10);
    if (!companyId || isNaN(companyId)) return res.status(400).json({ message: "Invalid company context" });
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, role, designation, status
       FROM company_users
       WHERE company_id = ? AND status = 'Active'
       ORDER BY full_name ASC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* GET /work-orders/:id/escalation-history  – escalation audit log for a work order */
router.get("/work-orders/:id/escalation-history", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const woId = Number(req.params.id);

    // Verify the WO belongs to this company
    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const [rows] = await pool.query(
      `SELECT id, escalation_level AS "escalationLevel",
              escalated_at AS "escalatedAt",
              previous_assignee_id AS "previousAssigneeId",
              previous_assignee_name AS "previousAssigneeName",
              new_assignee_id AS "newAssigneeId",
              new_assignee_name AS "newAssigneeName",
              reason
       FROM work_order_escalation_history
       WHERE work_order_id = ?
       ORDER BY escalated_at ASC`,
      [woId]
    ).catch(() => [[]]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /work-orders/:id  – single work order with history */
router.get("/work-orders/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const woId = Number(req.params.id);

    const [[wo]] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS "workOrderNumber",
              wo.asset_id AS "assetId", wo.asset_name AS "assetName",
              wo.location, wo.issue_source AS "issueSource",
              wo.issue_description AS "issueDescription",
              wo.priority, wo.status,
              wo.flag_id AS "flagId",
              wo.cp_assigned_to AS "assignedTo",
              wo.assigned_note AS "assignedNote",
              cu.full_name AS "assignedToName",
              cu.role AS "assignedToRole",
              wo.cp_created_by AS "createdBy",
              cb.full_name AS "createdByName",
              wo.created_at AS "createdAt",
              wo.closed_at AS "closedAt",
              wo.expected_completion_at AS "expectedCompletionAt",
              wo.escalation_interval_minutes AS "escalationIntervalMinutes",
              wo.escalation_level AS "escalationLevel",
              wo.escalation_note AS "escalationNote",
              f.severity AS "flagSeverity", f.source AS "flagSource"
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN flags f ON f.id = wo.flag_id
       WHERE wo.id = ? AND wo.company_id = ?`,
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const [history] = await pool.query(
      `SELECT woh.id, woh.status, woh.remarks, woh.event_at AS "timestamp",
              cu.full_name AS "updatedByName"
       FROM work_order_history woh
       LEFT JOIN company_users cu ON cu.id = woh.updated_by
       WHERE woh.work_order_id = ?
       ORDER BY woh.event_at ASC`,
      [woId]
    );

    // Escalation history (graceful – table may not exist pre-migration)
    const [escalationHistory] = await pool.query(
      `SELECT id, escalation_level AS "escalationLevel",
              escalated_at AS "escalatedAt",
              previous_assignee_name AS "previousAssigneeName",
              new_assignee_name AS "newAssigneeName",
              reason
       FROM work_order_escalation_history
       WHERE work_order_id = ?
       ORDER BY escalated_at ASC`,
      [woId]
    ).catch(() => [[]]);

    res.json({ ...wo, cutoffStatus: getCutoffStatus(wo.expectedCompletionAt, wo.status), history, escalationHistory });
  } catch (err) { next(err); }
});

/* GET /work-orders  – list all work orders for this company */
router.get("/work-orders", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { status, priority, assignedTo, limit = 200, offset = 0 } = req.query;

    let where = "WHERE wo.company_id = ?";
    const params = [companyId];

    if (status)     { where += " AND wo.status = ?";      params.push(status); }
    if (priority)   { where += " AND wo.priority = ?";    params.push(priority); }
    if (assignedTo) { where += " AND wo.cp_assigned_to = ?"; params.push(Number(assignedTo)); }

    const [rows] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS "workOrderNumber",
              wo.asset_id AS "assetId", wo.asset_name AS "assetName",
              wo.location, wo.issue_source AS "issueSource",
              wo.issue_description AS "issueDescription",
              wo.priority, wo.status,
              wo.flag_id AS "flagId",
              wo.cp_assigned_to AS "assignedTo",
              wo.assigned_note AS "assignedNote",
              cu.full_name AS "assignedToName",
              wo.cp_created_by AS "createdBy",
              cb.full_name AS "createdByName",
              wo.created_at AS "createdAt",
              wo.expected_completion_at AS "expectedCompletionAt",
              wo.escalation_level AS "escalationLevel",
              f.severity AS "flagSeverity", f.source AS "flagSource",
              COALESCE(f.escalated, FALSE) AS "flagEscalated"
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN flags f ON f.id = wo.flag_id
       ${where}
       ORDER BY wo.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM work_orders wo ${where}`,
      params
    );

    res.json({
      total: Number(countRow?.total ?? 0),
      data: rows.map(wo => ({
        ...wo,
        cutoffStatus: getCutoffStatus(wo.expectedCompletionAt, wo.status),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* POST /work-orders  – create a work order (optionally linked to a flag) */
router.post("/work-orders", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    // Built-in non-supervisory roles cannot create work orders
    const blockedRoles = ['employee', 'technician', 'cleaner', 'security', 'driver', 'fleet_operator'];
    if (blockedRoles.includes(role)) {
      return res.status(403).json({ message: "Not authorised" });
    }

    const {
      assetId,
      issueDescription,
      title,
      description,
      priority = "medium",
      flagId,
      assignedTo,
      assignedNote,
      expectedCompletionAt,
      escalationIntervalMinutes,
    } = req.body;

    // Accept 'title' or 'description' as fallback for 'issueDescription' (mobile compatibility)
    const resolvedDescription = issueDescription || title || description;

    if (!resolvedDescription) {
      return res.status(400).json({ message: "issueDescription is required" });
    }

    // Validate escalation fields
    const resolvedInterval = escalationIntervalMinutes
      ? Math.max(1, Math.min(10080, Number(escalationIntervalMinutes))) // 1 min – 7 days
      : 120; // default 2 hours
    let resolvedDeadline = null;
    if (expectedCompletionAt) {
      const d = new Date(expectedCompletionAt);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "expectedCompletionAt is not a valid date" });
      resolvedDeadline = d;
    }

    // Resolve asset
    let assetName = null;
    let location = null;
    if (assetId) {
      const [[asset]] = await pool.query(
        "SELECT asset_name AS \"assetName\", building, floor, room FROM assets WHERE id = ? AND company_id = ?",
        [assetId, companyId]
      );
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      assetName = asset.assetName;
      location = [asset.building, asset.floor, asset.room].filter(Boolean).join(", ") || null;
    }

    const workOrderNumber = generateWONumber();
    const issueSource = flagId ? "flag" : "manual";

    const [result] = await pool.execute(
      `INSERT INTO work_orders
         (work_order_number, company_id, asset_id, asset_name, location,
          issue_source, issue_description, priority, status,
          flag_id, cp_assigned_to, assigned_note, cp_created_by,
          expected_completion_at, escalation_interval_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        workOrderNumber, companyId, assetId || null, assetName, location,
        issueSource, resolvedDescription, priority,
        flagId || null, assignedTo || null, assignedNote || null, userId,
        resolvedDeadline, resolvedInterval,
      ]
    );
    const woId = result.insertId ?? result[0]?.id;

    // Log history
    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
       VALUES (?, 'open', NULL, ?)`,
      [woId, `Work order created${flagId ? " from flag" : ""}`]
    );

    // If linked to a flag, update the flag's work_order_id
    if (flagId) {
      await pool.execute(
        "UPDATE flags SET work_order_id = ?, status = 'in_progress', updated_at = NOW() WHERE id = ? AND company_id = ?",
        [woId, flagId, companyId]
      );
    }

    res.status(201).json({ id: woId, workOrderNumber });

    // Push notification to the assigned technician (non-blocking)
    if (assignedTo) {
      try {
        const [[assignee]] = await pool.query(
          "SELECT push_token, fcm_token FROM company_users WHERE id = ? AND company_id = ?",
          [assignedTo, companyId]
        );
        const woTitle = "Work Order Assigned";
        const woBody  = `${workOrderNumber}: ${resolvedDescription.slice(0, 80)}`;
        const woData  = { type: "work_order", workOrderId: String(woId), workOrderNumber, screen: "/work-orders" };
        if (assignee?.push_token) {
          await sendExpoPush(assignee.push_token, woTitle, woBody, woData);
        }
        if (assignee?.fcm_token) {
          await sendFCMPush(assignee.fcm_token, woTitle, woBody, woData);
        }
        await createInAppNotification(companyId, assignedTo, woTitle, woBody, "/work-orders");
      } catch { /* Non-fatal */ }
    }
  } catch (err) {
    next(err);
  }
});

/* PUT /work-orders/:id/assign  – assign or re-assign a work order */
router.put("/work-orders/:id/assign", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const woId = Number(req.params.id);
    const { assignedTo, assignedNote } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ message: "assignedTo (company user id) is required" });
    }

    // Verify WO belongs to this company
    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    // Verify assignee belongs to this company
    const [[assignee]] = await pool.query(
      `SELECT id, full_name AS "fullName" FROM company_users WHERE id = ? AND company_id = ?`,
      [assignedTo, companyId]
    );
    if (!assignee) return res.status(404).json({ message: "Assignee not found in this company" });

    await pool.execute(
      "UPDATE work_orders SET cp_assigned_to = ?, assigned_note = ?, status = 'in_progress' WHERE id = ?",
      [assignedTo, assignedNote || null, woId]
    );

    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
       VALUES (?, 'in_progress', NULL, ?)`,
      [woId, `Assigned to ${assignee.fullName}`]
    );

    res.json({ success: true, assignedToName: assignee.fullName });
  } catch (err) {
    next(err);
  }
});

/* PUT /work-orders/:id/status  – update work order status */
router.put("/work-orders/:id/status", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    const woId = Number(req.params.id);

    if (role !== "admin" && role !== "supervisor") {
      // Technicians can only update their own assigned work orders
      const [[assigned]] = await pool.query(
        "SELECT id FROM work_orders WHERE id = ? AND company_id = ? AND cp_assigned_to = ?",
        [woId, companyId, userId]
      );
      if (!assigned) return res.status(403).json({ message: "Not authorised" });
    }

    const { status, remark } = req.body;

    const VALID = ["open", "in_progress", "completed", "closed"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const [[wo]] = await pool.query(
      "SELECT id, flag_id AS \"flagId\" FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const closedAt = (status === "completed" || status === "closed") ? new Date() : null;
    await pool.execute(
      `UPDATE work_orders SET status = ?, closed_at = ? WHERE id = ?`,
      [status, closedAt, woId]
    );

    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks) VALUES (?, ?, NULL, ?)`,
      [woId, status, remark || null]
    );

    // If the linked flag is still open and WO is completed, auto-resolve it
    if (wo.flagId && (status === "completed" || status === "closed")) {
      await pool.execute(
        "UPDATE flags SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = ? AND status IN ('open','in_progress')",
        [wo.flagId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* PATCH /work-orders/:id/cutoff  – admin/supervisor can set or update the cutoff deadline */
router.patch("/work-orders/:id/cutoff", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const woId = Number(req.params.id);
    const { expectedCompletionAt } = req.body;

    // Allow null to clear the deadline
    let resolvedDeadline = null;
    if (expectedCompletionAt != null) {
      const d = new Date(expectedCompletionAt);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ message: "expectedCompletionAt is not a valid ISO date string" });
      }
      resolvedDeadline = d;
    }

    const [[wo]] = await pool.query(
      "SELECT id, status FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    await pool.execute(
      "UPDATE work_orders SET expected_completion_at = ? WHERE id = ?",
      [resolvedDeadline, woId]
    );

    res.json({ success: true, expectedCompletionAt: resolvedDeadline });
  } catch (err) {
    next(err);
  }
});

// Delete an assignment (admin: any; supervisor: only ones they created)
router.delete("/template-user-assignments/:id", async (req, res, next) => {  try {
    const { id } = req.params;
    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[row]] = await pool.query(
      "SELECT id, assigned_by FROM template_user_assignments WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!row) return res.status(404).json({ message: "Assignment not found" });

    if (role === "supervisor" && String(row.assigned_by) !== String(req.companyUser.id)) {
      return res.status(403).json({ message: "Not authorised to delete this assignment" });
    }

    await pool.query("DELETE FROM template_user_assignments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OJT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/* GET /ojt/trainings – list all trainings for this company (admin only) */
router.get("/ojt/trainings", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.status,
              ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              ot.trainer_id AS "trainerId",
              tr.full_name AS "trainerName",
              ot.created_by AS "createdBy", ot.created_at AS "createdAt", ot.updated_at AS "updatedAt",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest",
              (SELECT COUNT(*) FROM ojt_user_progress WHERE training_id = ot.id) AS "enrolledCount",
              (SELECT COUNT(*) FROM ojt_user_progress WHERE training_id = ot.id AND status = 'completed') AS "completedCount",
              (SELECT ROUND(AVG(score)) FROM ojt_user_progress WHERE training_id = ot.id AND score IS NOT NULL) AS "avgScore"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       LEFT JOIN company_users tr ON tr.id = ot.trainer_id
       WHERE ot.company_id = ?
       ORDER BY ot.created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /ojt/trainings/:id – single training with modules and test */
router.get("/ojt/trainings/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.status,
              ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              ot.trainer_id AS "trainerId", tr.full_name AS "trainerName",
              ot.created_by AS "createdBy", ot.created_at AS "createdAt", ot.updated_at AS "updatedAt"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       LEFT JOIN company_users tr ON tr.id = ot.trainer_id
       WHERE ot.id = ? AND ot.company_id = ?`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });

    const [modules] = await pool.query(
      `SELECT om.id, om.title, om.description, om.order_number AS "orderNumber", om.created_at AS "createdAt"
       FROM ojt_modules om WHERE om.training_id = ? ORDER BY om.order_number ASC`,
      [id]
    );
    const moduleIds = modules.map(m => m.id);
    let contents = [];
    if (moduleIds.length) {
      const [cRows] = await pool.query(
        `SELECT id, module_id AS "moduleId", type, url, description FROM ojt_module_contents WHERE module_id IN (${moduleIds.map(() => "?").join(",")}) ORDER BY id`,
        moduleIds
      );
      contents = cRows;
    }

    const [[test]] = await pool.query(
      `SELECT id, total_marks AS "totalMarks" FROM ojt_tests WHERE training_id = ? LIMIT 1`,
      [id]
    );
    let questions = [];
    if (test) {
      const [qRows] = await pool.query(
        `SELECT id, question, options, correct_answer AS "correctAnswer", marks FROM ojt_questions WHERE test_id = ? ORDER BY id`,
        [test.id]
      );
      questions = qRows.map(q => ({ ...q, options: safeParse(q.options) || [] }));
    }

    res.json({
      ...training,
      modules: modules.map(m => ({ ...m, contents: contents.filter(c => c.moduleId === m.id) })),
      test: test ? { ...test, questions } : null,
    });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings – create training (admin only) */
router.post("/ojt/trainings", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { title, description, assetId, passingPercentage = 70,
            category = "general", estimatedDurationMinutes = 60,
            isSequential = false, maxAttempts = 3, trainerId } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_trainings
         (company_id, asset_id, title, description, passing_percentage, created_by,
          category, estimated_duration_minutes, is_sequential, max_attempts, trainer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, title, description, status, passing_percentage AS "passingPercentage",
                 category, estimated_duration_minutes AS "estimatedDurationMinutes",
                 is_sequential AS "isSequential", max_attempts AS "maxAttempts",
                 asset_id AS "assetId", trainer_id AS "trainerId", created_at AS "createdAt"`,
      [companyId, assetId || null, title.trim(), description || null, passingPercentage,
       req.companyUser.id, category, estimatedDurationMinutes, isSequential, maxAttempts, trainerId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /ojt/trainings/:id – update training (admin only) */
router.put("/ojt/trainings/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    const { title, description, assetId, passingPercentage,
            category, estimatedDurationMinutes, isSequential, maxAttempts, trainerId } = req.body;
    const [rows] = await pool.query(
      `UPDATE ojt_trainings SET
         title                     = COALESCE(?, title),
         description               = COALESCE(?, description),
         asset_id                  = COALESCE(?, asset_id),
         passing_percentage        = COALESCE(?, passing_percentage),
         category                  = COALESCE(?, category),
         estimated_duration_minutes= COALESCE(?, estimated_duration_minutes),
         is_sequential             = COALESCE(?, is_sequential),
         max_attempts              = COALESCE(?, max_attempts),
         trainer_id                = COALESCE(?, trainer_id),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, title, description, status,
                 passing_percentage AS "passingPercentage",
                 category, estimated_duration_minutes AS "estimatedDurationMinutes",
                 is_sequential AS "isSequential", max_attempts AS "maxAttempts",
                 asset_id AS "assetId", trainer_id AS "trainerId", updated_at AS "updatedAt"`,
      [title || null, description ?? null, assetId || null, passingPercentage || null,
       category || null, estimatedDurationMinutes || null,
       isSequential != null ? isSequential : null,
       maxAttempts || null, trainerId != null ? (trainerId || null) : null,
       id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* PATCH /ojt/trainings/:id/publish – toggle published/draft (admin only) */
router.patch("/ojt/trainings/:id/publish", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id, status FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    const newStatus = check.status === "published" ? "draft" : "published";
    await pool.query("UPDATE ojt_trainings SET status = ?, updated_at = NOW() WHERE id = ?", [newStatus, id]);
    res.json({ success: true, status: newStatus });
  } catch (err) { next(err); }
});

/* DELETE /ojt/trainings/:id – delete training (admin only) */
router.delete("/ojt/trainings/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    await pool.query("DELETE FROM ojt_trainings WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings/:id/modules – add module (admin only) */
router.post("/ojt/trainings/:id/modules", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!training) return res.status(404).json({ message: "Training not found" });
    const { title, description, orderNumber = 0 } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_modules (training_id, title, description, order_number)
       VALUES (?, ?, ?, ?)
       RETURNING id, title, description, order_number AS "orderNumber", created_at AS "createdAt"`,
      [id, title.trim(), description || null, orderNumber]
    );
    res.status(201).json({ ...rows[0], contents: [] });
  } catch (err) { next(err); }
});

/* PUT /ojt/modules/:moduleId – update module (admin only) */
router.put("/ojt/modules/:moduleId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { moduleId } = req.params;
    const { title, description, orderNumber } = req.body;
    const [[mod]] = await pool.query(
      `SELECT om.id FROM ojt_modules om
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE om.id = ? AND ot.company_id = ?`,
      [moduleId, cid(req)]
    );
    if (!mod) return res.status(404).json({ message: "Module not found" });
    const [rows] = await pool.query(
      `UPDATE ojt_modules SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         order_number = COALESCE(?, order_number)
       WHERE id = ?
       RETURNING id, title, description, order_number AS "orderNumber"`,
      [title || null, description ?? null, orderNumber ?? null, moduleId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /ojt/modules/:moduleId (admin only) */
router.delete("/ojt/modules/:moduleId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { moduleId } = req.params;
    const [[mod]] = await pool.query(
      `SELECT om.id FROM ojt_modules om
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE om.id = ? AND ot.company_id = ?`,
      [moduleId, cid(req)]
    );
    if (!mod) return res.status(404).json({ message: "Module not found" });
    await pool.query("DELETE FROM ojt_modules WHERE id = ?", [moduleId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /ojt/modules/:moduleId/content – add content to module */
router.post("/ojt/modules/:moduleId/content", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { moduleId } = req.params;
    const [[mod]] = await pool.query(
      `SELECT om.id FROM ojt_modules om
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE om.id = ? AND ot.company_id = ?`,
      [moduleId, cid(req)]
    );
    if (!mod) return res.status(404).json({ message: "Module not found" });
    const { type = "text", url, description } = req.body;
    const [rows] = await pool.query(
      `INSERT INTO ojt_module_contents (module_id, type, url, description)
       VALUES (?, ?, ?, ?)
       RETURNING id, module_id AS "moduleId", type, url, description`,
      [moduleId, type, url || null, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /ojt/contents/:contentId */
router.delete("/ojt/contents/:contentId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { contentId } = req.params;
    const [[c]] = await pool.query(
      `SELECT oc.id FROM ojt_module_contents oc
       JOIN ojt_modules om ON om.id = oc.module_id
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE oc.id = ? AND ot.company_id = ?`,
      [contentId, cid(req)]
    );
    if (!c) return res.status(404).json({ message: "Content not found" });
    await pool.query("DELETE FROM ojt_module_contents WHERE id = ?", [contentId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings/:id/test – create or replace test */
router.post("/ojt/trainings/:id/test", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!training) return res.status(404).json({ message: "Training not found" });
    const { totalMarks = 100 } = req.body;
    await pool.query("DELETE FROM ojt_tests WHERE training_id = ?", [id]);
    const [rows] = await pool.query(
      `INSERT INTO ojt_tests (training_id, total_marks) VALUES (?, ?) RETURNING id, total_marks AS "totalMarks"`,
      [id, totalMarks]
    );
    res.status(201).json({ ...rows[0], questions: [] });
  } catch (err) { next(err); }
});

/* POST /ojt/tests/:testId/questions – add question */
router.post("/ojt/tests/:testId/questions", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { testId } = req.params;
    const [[test]] = await pool.query(
      `SELECT ot2.id FROM ojt_tests ot2
       JOIN ojt_trainings ot ON ot.id = ot2.training_id
       WHERE ot2.id = ? AND ot.company_id = ?`,
      [testId, cid(req)]
    );
    if (!test) return res.status(404).json({ message: "Test not found" });
    const { question, options, correctAnswer, marks = 1 } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: "question is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_questions (test_id, question, options, correct_answer, marks)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, question, options, correct_answer AS "correctAnswer", marks`,
      [testId, question.trim(), options ? JSON.stringify(options) : null, correctAnswer || null, marks]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /ojt/questions/:questionId */
router.put("/ojt/questions/:questionId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { questionId } = req.params;
    const [[q]] = await pool.query(
      `SELECT oq.id FROM ojt_questions oq
       JOIN ojt_tests ot2 ON ot2.id = oq.test_id
       JOIN ojt_trainings ot ON ot.id = ot2.training_id
       WHERE oq.id = ? AND ot.company_id = ?`,
      [questionId, cid(req)]
    );
    if (!q) return res.status(404).json({ message: "Question not found" });
    const { question, options, correctAnswer, marks } = req.body;
    const [rows] = await pool.query(
      `UPDATE ojt_questions SET
         question = COALESCE(?, question),
         options = COALESCE(?, options),
         correct_answer = COALESCE(?, correct_answer),
         marks = COALESCE(?, marks)
       WHERE id = ?
       RETURNING id, question, options, correct_answer AS "correctAnswer", marks`,
      [question || null, options ? JSON.stringify(options) : null, correctAnswer || null, marks ?? null, questionId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /ojt/questions/:questionId */
router.delete("/ojt/questions/:questionId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { questionId } = req.params;
    const [[q]] = await pool.query(
      `SELECT oq.id FROM ojt_questions oq
       JOIN ojt_tests ot2 ON ot2.id = oq.test_id
       JOIN ojt_trainings ot ON ot.id = ot2.training_id
       WHERE oq.id = ? AND ot.company_id = ?`,
      [questionId, cid(req)]
    );
    if (!q) return res.status(404).json({ message: "Question not found" });
    await pool.query("DELETE FROM ojt_questions WHERE id = ?", [questionId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /ojt/trainings/:id/users – user progress tracking (admin only) */
router.get("/ojt/trainings/:id/users", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query(
      `SELECT id, passing_percentage AS "passingPercentage", max_attempts AS "maxAttempts"
       FROM ojt_trainings WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [rows] = await pool.query(
      `SELECT cup.id, cup.company_user_id AS "companyUserId",
              cu.full_name AS "userName", cu.email, cu.role, cu.designation,
              cup.score, cup.status, cup.certificate_url AS "certificateUrl",
              cup.started_at AS "startedAt", cup.completed_at AS "completedAt",
              cup.completed_modules AS "completedModules",
              cup.attempt_number AS "attemptNumber",
              cup.due_date AS "dueDate",
              ab.full_name AS "assignedByName",
              cup.assigned_at AS "assignedAt",
              cup.trainer_sign_off_at AS "trainerSignOffAt",
              cup.trainer_sign_off_notes AS "trainerSignOffNotes"
       FROM ojt_user_progress cup
       JOIN company_users cu ON cu.id = cup.company_user_id
       LEFT JOIN company_users ab ON ab.id = cup.assigned_by
       WHERE cup.training_id = ?
       ORDER BY cup.updated_at DESC`,
      [id]
    );
    const [[{ totalModules }]] = await pool.query(
      `SELECT COUNT(*) AS totalModules FROM ojt_modules WHERE training_id = ?`,
      [id]
    );
    res.json({ users: rows, passingPercentage: training.passingPercentage, maxAttempts: Number(training.maxAttempts), totalModules: Number(totalModules) });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings/:id/assign – admin assigns training to a user with optional due date */
router.post("/ojt/trainings/:id/assign", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const { userId, dueDate } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const [[training]] = await pool.query(
      "SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ? AND status = 'published'",
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found or not published" });
    // Upsert: if already assigned/started just update due_date and assigned_by
    const [[existing]] = await pool.query(
      "SELECT id FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?",
      [id, userId]
    );
    if (existing) {
      await pool.query(
        `UPDATE ojt_user_progress SET due_date = ?, assigned_by = ?, assigned_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [dueDate || null, req.companyUser.id, existing.id]
      );
      return res.json({ success: true, message: "Assignment updated" });
    }
    const [rows] = await pool.query(
      `INSERT INTO ojt_user_progress
         (training_id, company_user_id, status, completed_modules, due_date, assigned_by, assigned_at)
       VALUES (?, ?, 'not_started', '[]', ?, ?, NOW())
       RETURNING id, status, due_date AS "dueDate", assigned_at AS "assignedAt"`,
      [id, userId, dueDate || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* POST /ojt/progress/:id/trainer-signoff – trainer/supervisor signs off practical skills */
router.post("/ojt/progress/:id/trainer-signoff", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const { notes } = req.body;
    const [[progress]] = await pool.query(
      `SELECT oup.id, oup.status FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.id = ? AND ot.company_id = ?`,
      [id, companyId]
    );
    if (!progress) return res.status(404).json({ message: "Progress record not found" });
    await pool.query(
      `UPDATE ojt_user_progress
         SET trainer_sign_off_at = NOW(), trainer_sign_off_notes = ?, trainer_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [notes || null, req.companyUser.id, id]
    );
    res.json({ success: true, trainerSignOffAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

/* POST /ojt/progress/:id/certificate – grant certificate to user */
router.post("/ojt/progress/:id/certificate", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[progress]] = await pool.query(
      `SELECT oup.id, oup.training_id, oup.company_user_id, oup.score
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.id = ? AND ot.company_id = ?`,
      [id, companyId]
    );
    if (!progress) return res.status(404).json({ message: "Progress not found" });
    const certUrl = `/ojt/certificate/progress-${id}`;
    await pool.query("UPDATE ojt_user_progress SET certificate_url = ? WHERE id = ?", [certUrl, id]);
    res.json({ id, certificateUrl: certUrl });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// FLEET MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/* GET /fleet/submissions – recent checklist + logsheet submissions for fleet assets */
router.get("/fleet/submissions", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [fleetAssets] = await pool.query(
      `SELECT id FROM assets WHERE company_id = ? AND asset_type = 'fleet'`,
      [companyId]
    );
    if (fleetAssets.length === 0) return res.json([]);
    const fleetIds = fleetAssets.map(a => a.id);
    const ph = fleetIds.map(() => "?").join(",");

    const [chkRows] = await pool.query(
      `SELECT cs.id, 'checklist' AS type, ct.template_name AS name,
              cu.full_name AS "submittedBy", a.asset_name AS "assetName",
              COALESCE(cs.submitted_at, cs.created_at) AS "submittedAt",
              cs.gps_lat AS lat, cs.gps_lng AS lng, cs.shift, cs.status,
              cs.completion_pct AS "completionPct"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       LEFT JOIN assets a ON a.id = cs.asset_id
       WHERE cs.asset_id IN (${ph}) AND ct.company_id = ?
       ORDER BY COALESCE(cs.submitted_at, cs.created_at) DESC
       LIMIT 100`,
      [...fleetIds, companyId]
    );

    const [lsRows] = await pool.query(
      `SELECT le.id, 'logsheet' AS type, lt.template_name AS name,
              cu.full_name AS "submittedBy", a.asset_name AS "assetName",
              le.submitted_at AS "submittedAt",
              NULL AS lat, NULL AS lng, le.shift, 'submitted' AS status,
              100 AS "completionPct"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       LEFT JOIN assets a ON a.id = le.asset_id
       WHERE le.asset_id IN (${ph}) AND lt.company_id = ?
       ORDER BY le.submitted_at DESC
       LIMIT 100`,
      [...fleetIds, companyId]
    );

    const combined = [...chkRows, ...lsRows]
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, 100);
    res.json(combined);
  } catch (err) { next(err); }
});

/* GET /fleet/submissions/detail/:type/:id – full submission detail with answers */
router.get("/fleet/submissions/detail/:type/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { type, id } = req.params;

    if (type === "checklist") {
      const [[sub]] = await pool.query(
        `SELECT cs.id, ct.template_name AS name,
                cu.full_name AS "submittedBy",
                a.asset_name AS "assetName",
                cs.gps_lat AS lat, cs.gps_lng AS lng,
                cs.shift, cs.status,
                cs.completion_pct AS "completionPct",
                COALESCE(cs.submitted_at, cs.created_at) AS "submittedAt"
         FROM checklist_submissions cs
         LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
         LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
         LEFT JOIN assets a ON a.id = cs.asset_id
         WHERE cs.id = ? AND ct.company_id = ?`,
        [id, companyId]
      );
      if (!sub) return res.status(404).json({ message: "Submission not found" });

      let answers = [];
      try {
        const [rows] = await pool.query(
          `SELECT question_text AS question, input_type AS "inputType",
                  answer_json AS "answerJson", option_selected AS answer
           FROM checklist_submission_answers WHERE submission_id = ? ORDER BY id`,
          [id]
        );
        answers = rows.map(a => ({
          question: a.question,
          type: a.inputType || a.input_type,
          answer: a.answer ||
            (a.answerJson  ? (typeof a.answerJson  === "object" ? JSON.stringify(a.answerJson)  : a.answerJson)  :
             a.answer_json ? (typeof a.answer_json === "object" ? JSON.stringify(a.answer_json) : a.answer_json) : "—")
        }));
      } catch (_) { /* answers table may be empty */ }

      return res.json({ ...sub, type: "checklist", answers });
    } else if (type === "logsheet") {
      const [[entry]] = await pool.query(
        `SELECT le.id, lt.template_name AS name,
                cu.full_name AS "submittedBy",
                a.asset_name AS "assetName",
                le.shift, le.entry_date AS "entryDate",
                le.submitted_at AS "submittedAt", le.data
         FROM logsheet_entries le
         LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
         LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
         LEFT JOIN assets a ON a.id = le.asset_id
         WHERE le.id = ? AND lt.company_id = ?`,
        [id, companyId]
      );
      if (!entry) return res.status(404).json({ message: "Entry not found" });

      const rawData = entry.data
        ? (typeof entry.data === "string" ? JSON.parse(entry.data) : entry.data)
        : {};
      const answers = Object.entries(rawData).map(([k, v]) => ({
        question: k, type: "text",
        answer: v != null ? String(v) : "—"
      }));
      const { data: _omit, ...entryClean } = entry;
      return res.json({ ...entryClean, type: "logsheet", lat: null, lng: null, answers });
    }
    return res.status(400).json({ message: "Invalid type" });
  } catch (err) { next(err); }
});

/* GET /fleet/submissions/export-csv – export fleet submissions as CSV */
router.get("/fleet/submissions/export-csv", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [fleetAssets] = await pool.query(
      `SELECT id FROM assets WHERE company_id = ? AND asset_type = 'fleet'`,
      [companyId]
    );
    if (fleetAssets.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="fleet-submissions.csv"`);
      return res.send("Type,Template,Asset,Submitted By,Date,Status,Location\n");
    }
    const fleetIds = fleetAssets.map(a => a.id);
    const ph = fleetIds.map(() => "?").join(",");

    const [chkRows] = await pool.query(
      `SELECT 'checklist' AS type, ct.template_name AS name,
              a.asset_name AS asset, cu.full_name AS submittedBy,
              COALESCE(cs.submitted_at, cs.created_at) AS submittedAt,
              cs.status, cs.gps_lat AS lat, cs.gps_lng AS lng
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN company_users cu ON cu.id = cs.company_user_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       WHERE cs.asset_id IN (${ph}) AND ct.company_id = ?
       ORDER BY COALESCE(cs.submitted_at, cs.created_at) DESC`,
      [...fleetIds, companyId]
    );

    const [lsRows] = await pool.query(
      `SELECT 'logsheet' AS type, lt.template_name AS name,
              a.asset_name AS asset, cu.full_name AS submittedBy,
              le.submitted_at AS submittedAt, 'submitted' AS status,
              NULL AS lat, NULL AS lng
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN company_users cu ON cu.id = le.company_user_id
       LEFT JOIN assets a ON a.id = le.asset_id
       WHERE le.asset_id IN (${ph}) AND lt.company_id = ?
       ORDER BY le.submitted_at DESC`,
      [...fleetIds, companyId]
    );

    const rows = [...chkRows, ...lsRows].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Type,Template,Asset,Submitted By,Date & Time,Status,GPS Location\n";
    const body = rows.map(r => [
      esc(r.type),
      esc(r.name),
      esc(r.asset),
      esc(r.submittedBy),
      esc(r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ""),
      esc(r.status),
      esc(r.lat && r.lng ? `${r.lat}, ${r.lng}` : ""),
    ].join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="fleet-submissions.csv"`);
    res.send(header + body);
  } catch (err) { next(err); }
});

/* GET /fleet/assets – fleet assets for this company */
router.get("/fleet/assets", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              d.name AS "departmentName", ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.company_id = ? AND a.asset_type = 'fleet'
       ORDER BY a.asset_name`,
      [companyId]
    );
    const normalized = rows.map(r => {
      const meta = r.metadata == null ? {} : (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata);
      return { ...r, metadata: meta };
    });
    res.json(normalized);
  } catch (err) { next(err); }
});

/* GET /fleet/assets/:id – detailed view with related data */
router.get("/fleet/assets/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;

    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              d.name AS "departmentName", ad.metadata, a.created_at AS "createdAt"
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id = ? AND a.asset_type = 'fleet'`,
      [id, companyId]
    );

    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const dt = { ...asset, metadata: asset.metadata == null ? {} : (typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : asset.metadata) };

    const [inspections] = await pool.query(
      `SELECT fi.id, fi.inspection_date AS "inspectionDate", fi.status, fi.notes,
              cu.full_name AS "inspectedByName", fi.created_at AS "createdAt"
       FROM fleet_inspections fi
       LEFT JOIN company_users cu ON cu.id = fi.inspected_by
       WHERE fi.asset_id = ? AND fi.company_id = ?
       ORDER BY fi.inspection_date DESC`,
      [id, companyId]
    );

    const [fuelLogs] = await pool.query(
      `SELECT fl.id, fl.fuel_amount AS "fuelAmount", fl.cost, fl.odometer, fl.fuel_type AS "fuelType",
              fl.log_date AS "logDate", fl.notes, cu.full_name AS "addedByName", fl.created_at AS "createdAt"
       FROM fleet_fuel_logs fl
       LEFT JOIN company_users cu ON cu.id = fl.added_by
       WHERE fl.asset_id = ? AND fl.company_id = ?
       ORDER BY fl.log_date DESC`,
      [id, companyId]
    );

    const [maintenance] = await pool.query(
      `SELECT fm.id, fm.issue_title AS "issueTitle", fm.priority, fm.status, fm.cost,
              fm.scheduled_date AS "scheduledDate", fm.completed_date AS "completedDate",
              cu.full_name AS "assignedToName", fm.created_at AS "createdAt"
       FROM fleet_maintenance fm
       LEFT JOIN company_users cu ON cu.id = fm.assigned_to
       WHERE fm.asset_id = ? AND fm.company_id = ?
       ORDER BY fm.created_at DESC`,
      [id, companyId]
    );

    const [assignments] = await pool.query(
      `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
              COALESCE(ct.template_name, lt.template_name) AS "templateName",
              tua.created_at AS "createdAt", cu.full_name AS "assignedToName"
       FROM template_user_assignments tua
       LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
       LEFT JOIN logsheet_templates lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
       LEFT JOIN company_users cu ON cu.id = tua.assigned_to
       WHERE tua.company_id = ? AND (
         (tua.template_type = 'checklist' AND ct.asset_id = ?) OR
         (tua.template_type = 'logsheet' AND lt.asset_id = ?)
       )`,
      [companyId, id, id]
    );

    res.json({
      ...dt,
      inspections,
      fuelLogs,
      maintenance,
      assignments,
      stats: {
        totalFuel: fuelLogs.reduce((sum, l) => sum + (parseFloat(l.fuelAmount) || 0), 0),
        totalFuelCost: fuelLogs.reduce((sum, l) => sum + (parseFloat(l.cost) || 0), 0),
        totalMaintenanceCost: maintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0),
        openIssues: maintenance.filter(m => m.status !== "completed" && m.status !== "closed").length
      }
    });
  } catch (err) { next(err); }
});

/* GET /fleet/inspections/:assetId – inspections for an asset */
router.get("/fleet/inspections/:assetId", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { assetId } = req.params;
    const [rows] = await pool.query(
      `SELECT fi.id, fi.asset_id AS "assetId", fi.inspection_date AS "inspectionDate",
              fi.checklist_items AS "checklistItems", fi.status, fi.notes,
              fi.inspected_by AS "inspectedBy", cu.full_name AS "inspectedByName",
              fi.created_at AS "createdAt"
       FROM fleet_inspections fi
       LEFT JOIN company_users cu ON cu.id = fi.inspected_by
       WHERE fi.company_id = ? AND fi.asset_id = ?
       ORDER BY fi.inspection_date DESC`,
      [companyId, assetId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /fleet/inspections – all inspections for company */
router.get("/fleet/inspections", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT fi.id, fi.asset_id AS "assetId", a.asset_name AS "assetName",
              fi.inspection_date AS "inspectionDate", fi.checklist_items AS "checklistItems",
              fi.status, fi.notes, fi.inspected_by AS "inspectedBy",
              cu.full_name AS "inspectedByName", fi.created_at AS "createdAt"
       FROM fleet_inspections fi
       JOIN assets a ON a.id = fi.asset_id
       LEFT JOIN company_users cu ON cu.id = fi.inspected_by
       WHERE fi.company_id = ?
       ORDER BY fi.inspection_date DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /fleet/inspections */
router.post("/fleet/inspections", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { assetId, inspectionDate, checklistItems = [], status = "pending", notes } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ? AND asset_type = 'fleet'", [assetId, companyId]);
    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const [rows] = await pool.query(
      `INSERT INTO fleet_inspections (company_id, asset_id, inspection_date, checklist_items, status, notes, inspected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_id AS "assetId", inspection_date AS "inspectionDate",
                 checklist_items AS "checklistItems", status, notes, created_at AS "createdAt"`,
      [companyId, assetId, inspectionDate || null, JSON.stringify(checklistItems), status, notes || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /fleet/inspections/:id */
router.put("/fleet/inspections/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_inspections WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Inspection not found" });
    const { inspectionDate, checklistItems, status, notes } = req.body;
    const [rows] = await pool.query(
      `UPDATE fleet_inspections SET
         inspection_date = COALESCE(?, inspection_date),
         checklist_items = COALESCE(?, checklist_items),
         status = COALESCE(?, status),
         notes = COALESCE(?, notes),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, asset_id AS "assetId", inspection_date AS "inspectionDate",
                 checklist_items AS "checklistItems", status, notes, updated_at AS "updatedAt"`,
      [inspectionDate || null, checklistItems ? JSON.stringify(checklistItems) : null, status || null, notes ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /fleet/inspections/:id */
router.delete("/fleet/inspections/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_inspections WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Inspection not found" });
    await pool.query("DELETE FROM fleet_inspections WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /fleet/fuel – all fuel logs for company */
router.get("/fleet/fuel", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { assetId } = req.query;
    const params = [companyId];
    let where = "fl.company_id = ?";
    if (assetId) { where += " AND fl.asset_id = ?"; params.push(assetId); }
    const [rows] = await pool.query(
      `SELECT fl.id, fl.asset_id AS "assetId", a.asset_name AS "assetName",
              fl.fuel_amount AS "fuelAmount", fl.cost, fl.odometer, fl.fuel_type AS "fuelType",
              fl.log_date AS "logDate", fl.notes,
              fl.added_by AS "addedBy", cu.full_name AS "addedByName",
              fl.created_at AS "createdAt"
       FROM fleet_fuel_logs fl
       JOIN assets a ON a.id = fl.asset_id
       LEFT JOIN company_users cu ON cu.id = fl.added_by
       WHERE ${where}
       ORDER BY fl.log_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /fleet/fuel */
router.post("/fleet/fuel", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { assetId, fuelAmount, cost, odometer, fuelType, logDate, notes } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ? AND asset_type = 'fleet'", [assetId, companyId]);
    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const [rows] = await pool.query(
      `INSERT INTO fleet_fuel_logs (company_id, asset_id, fuel_amount, cost, odometer, fuel_type, log_date, notes, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_id AS "assetId", fuel_amount AS "fuelAmount", cost, odometer,
                 fuel_type AS "fuelType", log_date AS "logDate", notes, created_at AS "createdAt"`,
      [companyId, assetId, fuelAmount || null, cost || null, odometer || null, fuelType || null, logDate || null, notes || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /fleet/fuel/:id */
router.put("/fleet/fuel/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_fuel_logs WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Fuel log not found" });
    const { fuelAmount, cost, odometer, fuelType, logDate, notes } = req.body;
    const [rows] = await pool.query(
      `UPDATE fleet_fuel_logs SET
         fuel_amount = COALESCE(?, fuel_amount), cost = COALESCE(?, cost),
         odometer = COALESCE(?, odometer), fuel_type = COALESCE(?, fuel_type),
         log_date = COALESCE(?, log_date), notes = COALESCE(?, notes)
       WHERE id = ?
       RETURNING id, asset_id AS "assetId", fuel_amount AS "fuelAmount", cost, odometer,
                 fuel_type AS "fuelType", log_date AS "logDate", notes`,
      [fuelAmount || null, cost || null, odometer || null, fuelType || null, logDate || null, notes ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /fleet/fuel/:id */
router.delete("/fleet/fuel/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_fuel_logs WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Fuel log not found" });
    await pool.query("DELETE FROM fleet_fuel_logs WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /fleet/maintenance – all maintenance records */
router.get("/fleet/maintenance", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { assetId, status } = req.query;
    const params = [companyId];
    let where = "fm.company_id = ?";
    if (assetId) { where += " AND fm.asset_id = ?"; params.push(assetId); }
    if (status) { where += " AND fm.status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT fm.id, fm.asset_id AS "assetId", a.asset_name AS "assetName",
              fm.issue_title AS "issueTitle", fm.description, fm.priority, fm.status,
              fm.assigned_to AS "assignedTo", cu.full_name AS "assignedToName",
              fm.scheduled_date AS "scheduledDate", fm.completed_date AS "completedDate",
              fm.cost, fm.created_at AS "createdAt", fm.updated_at AS "updatedAt"
       FROM fleet_maintenance fm
       JOIN assets a ON a.id = fm.asset_id
       LEFT JOIN company_users cu ON cu.id = fm.assigned_to
       WHERE ${where}
       ORDER BY fm.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /fleet/maintenance */
router.post("/fleet/maintenance", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { assetId, issueTitle, description, priority = "medium", assignedTo, scheduledDate, cost } = req.body;
    if (!assetId || !issueTitle?.trim()) return res.status(400).json({ message: "assetId and issueTitle are required" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ? AND asset_type = 'fleet'", [assetId, companyId]);
    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const [rows] = await pool.query(
      `INSERT INTO fleet_maintenance (company_id, asset_id, issue_title, description, priority, assigned_to, scheduled_date, cost, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_id AS "assetId", issue_title AS "issueTitle", description, priority, status,
                 assigned_to AS "assignedTo", scheduled_date AS "scheduledDate", cost, created_at AS "createdAt"`,
      [companyId, assetId, issueTitle.trim(), description || null, priority, assignedTo || null, scheduledDate || null, cost || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /fleet/maintenance/:id */
router.put("/fleet/maintenance/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_maintenance WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Maintenance record not found" });
    const { issueTitle, description, priority, status, assignedTo, scheduledDate, completedDate, cost } = req.body;
    const [rows] = await pool.query(
      `UPDATE fleet_maintenance SET
         issue_title = COALESCE(?, issue_title),
         description = COALESCE(?, description),
         priority = COALESCE(?, priority),
         status = COALESCE(?, status),
         assigned_to = COALESCE(?, assigned_to),
         scheduled_date = COALESCE(?, scheduled_date),
         completed_date = COALESCE(?, completed_date),
         cost = COALESCE(?, cost),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, asset_id AS "assetId", issue_title AS "issueTitle", description, priority, status,
                 assigned_to AS "assignedTo", scheduled_date AS "scheduledDate",
                 completed_date AS "completedDate", cost, updated_at AS "updatedAt"`,
      [issueTitle || null, description ?? null, priority || null, status || null, assignedTo || null, scheduledDate || null, completedDate || null, cost || null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* PATCH /fleet/maintenance/:id/status */
router.patch("/fleet/maintenance/:id/status", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const { status } = req.body;
    const VALID = ["open", "in_progress", "completed", "closed"];
    if (!VALID.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [[check]] = await pool.query("SELECT id FROM fleet_maintenance WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Maintenance record not found" });
    const completedDate = (status === "completed" || status === "closed") ? new Date().toISOString().split("T")[0] : null;
    await pool.query(
      "UPDATE fleet_maintenance SET status = ?, completed_date = COALESCE(?, completed_date), updated_at = NOW() WHERE id = ?",
      [status, completedDate, id]
    );
    res.json({ success: true, status });
  } catch (err) { next(err); }
});

/* DELETE /fleet/maintenance/:id */
router.delete("/fleet/maintenance/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_maintenance WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Maintenance record not found" });
    await pool.query("DELETE FROM fleet_maintenance WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /upload-image – upload a reference image for checklist questions (admin only) */
router.post("/upload-image", (req, res, next) => {
  uploadImage.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message || "File too large" });
    } else if (err) {
      return res.status(400).json({ message: err.message || "Only image files are allowed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) { next(err); }
});

/* POST /upload-logo – upload company client logo (admin only) */
router.post("/upload-logo", (req, res, next) => {
  uploadLogo.single("logo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message || "File too large" });
    } else if (err) {
      return res.status(400).json({ message: err.message || "Only image files are allowed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const baseUrl = `/uploads/logos/company-${req.companyUser.companyId}${ext}`;
    const url = `${baseUrl}?v=${Date.now()}`;
    await pool.query("UPDATE companies SET logo_url = ? WHERE id = ?", [url, req.companyUser.companyId]);
    res.json({ url });
  } catch (err) { next(err); }
});

/* POST /ojt/upload – upload a video or document file (admin only) */
router.post("/ojt/upload", (req, res, next) => {
  uploadOjt.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message || "File too large" });
    } else if (err) {
      return res.status(400).json({ message: err.message || "File type not allowed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// OJT MOBILE ENDPOINTS (accessible to technicians via company JWT)
// ─────────────────────────────────────────────────────────────────────────────

/* GET /ojt/mobile/trainings – published trainings for this company */
router.get("/ojt/mobile/trainings", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [trainings] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       WHERE ot.company_id = ? AND ot.status = 'published'
       ORDER BY ot.created_at DESC`,
      [companyId]
    );
    const [progress] = await pool.query(
      `SELECT training_id AS "trainingId", status, score, certificate_url AS "certificateUrl",
              completed_modules AS "completedModules", started_at AS "startedAt", completed_at AS "completedAt",
              due_date AS "dueDate", attempt_number AS "attemptNumber", assigned_by IS NOT NULL AS "isAssigned"
       FROM ojt_user_progress
       WHERE company_user_id = ? AND training_id IN (${trainings.length ? trainings.map(() => "?").join(",") : "NULL"})`,
      [userId, ...trainings.map(t => t.id)]
    );
    const progressMap = {};
    progress.forEach(p => { progressMap[p.trainingId] = p; });
    res.json(trainings.map(t => ({ ...t, myProgress: progressMap[t.id] || null })));
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/trainings/:id – training detail with modules, contents, test */
router.get("/ojt/mobile/trainings/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.status, ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       WHERE ot.id = ? AND ot.company_id = ? AND ot.status = 'published'`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found or not published" });

    const [modules] = await pool.query(
      `SELECT id, title, description, order_number AS "orderNumber" FROM ojt_modules WHERE training_id = ? ORDER BY order_number ASC`,
      [id]
    );
    const moduleIds = modules.map(m => m.id);
    let contents = [];
    if (moduleIds.length) {
      const [cRows] = await pool.query(
        `SELECT id, module_id AS "moduleId", type, url, description FROM ojt_module_contents WHERE module_id IN (${moduleIds.map(() => "?").join(",")}) ORDER BY id`,
        moduleIds
      );
      contents = cRows;
    }

    const [[test]] = await pool.query(
      `SELECT id, total_marks AS "totalMarks" FROM ojt_tests WHERE training_id = ? LIMIT 1`, [id]
    );
    let questions = [];
    if (test) {
      const [qRows] = await pool.query(
        `SELECT id, question, options, marks FROM ojt_questions WHERE test_id = ? ORDER BY id`,
        [test.id]
      );
      questions = qRows.map(q => ({ ...q, options: safeParse(q.options) || [] }));
    }

    const userId = req.companyUser.id;
    const [[myProgress]] = await pool.query(
      `SELECT id, status, score, certificate_url AS "certificateUrl",
              completed_modules AS "completedModules", started_at AS "startedAt", completed_at AS "completedAt",
              due_date AS "dueDate", attempt_number AS "attemptNumber",
              trainer_sign_off_at AS "trainerSignOffAt", trainer_sign_off_notes AS "trainerSignOffNotes"
       FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?`,
      [id, userId]
    );

    res.json({
      ...training,
      modules: modules.map(m => ({ ...m, contents: contents.filter(c => c.moduleId === m.id) })),
      test: test ? { ...test, questions } : null,
      myProgress: myProgress || null,
    });
  } catch (err) { next(err); }
});

/* POST /ojt/mobile/trainings/:id/start – start training */
router.post("/ojt/mobile/trainings/:id/start", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const [[training]] = await pool.query(
      "SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ? AND status = 'published'",
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [[existing]] = await pool.query(
      "SELECT id, status FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?",
      [id, userId]
    );
    if (existing) {
      // Already has a record — just activate if it was a not_started assignment
      if (existing.status === "not_started") {
        await pool.query(
          "UPDATE ojt_user_progress SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = ?",
          [existing.id]
        );
      }
      return res.json({ id: existing.id, message: "Already started" });
    }
    const [rows] = await pool.query(
      `INSERT INTO ojt_user_progress (training_id, company_user_id, status, completed_modules, started_at)
       VALUES (?, ?, 'in_progress', '[]', NOW())
       RETURNING id, status, started_at AS "startedAt"`,
      [id, userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* POST /ojt/mobile/trainings/:id/complete-module – mark module as completed */
router.post("/ojt/mobile/trainings/:id/complete-module", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const { moduleId } = req.body;
    if (!moduleId) return res.status(400).json({ message: "moduleId is required" });

    const [[progress]] = await pool.query(
      `SELECT oup.id, oup.completed_modules AS "completedModules"
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.training_id = ? AND oup.company_user_id = ? AND ot.company_id = ?`,
      [id, userId, companyId]
    );
    if (!progress) return res.status(404).json({ message: "Progress record not found. Start training first." });

    const completed = Array.isArray(progress.completedModules)
      ? progress.completedModules
      : (typeof progress.completedModules === "string" ? JSON.parse(progress.completedModules) : []);
    if (!completed.includes(Number(moduleId))) completed.push(Number(moduleId));

    await pool.query(
      "UPDATE ojt_user_progress SET completed_modules = ?, updated_at = NOW() WHERE id = ?",
      [JSON.stringify(completed), progress.id]
    );
    res.json({ completedModules: completed });
  } catch (err) { next(err); }
});

/* POST /ojt/mobile/trainings/:id/submit-test – submit test answers, calculate score, track attempts */
router.post("/ojt/mobile/trainings/:id/submit-test", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const { answers = {} } = req.body;

    const [[training]] = await pool.query(
      `SELECT id, passing_percentage AS pp, max_attempts AS ma FROM ojt_trainings
       WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });

    // Check attempt limit
    const [[progressRec]] = await pool.query(
      `SELECT id, attempt_number AS an, status FROM ojt_user_progress
       WHERE training_id = ? AND company_user_id = ?`,
      [id, userId]
    );
    if (!progressRec) return res.status(400).json({ message: "Start the training first" });
    const maxAttempts = Number(training.ma) || 3;
    const currentAttempt = Number(progressRec.an) || 1;
    if (progressRec.status === "completed") {
      return res.status(400).json({ message: "Training already completed" });
    }
    if (progressRec.status === "failed" && currentAttempt >= maxAttempts) {
      return res.status(400).json({ message: `Maximum attempts (${maxAttempts}) reached`, attemptsExhausted: true });
    }

    const [[test]] = await pool.query("SELECT id, total_marks AS tm FROM ojt_tests WHERE training_id = ?", [id]);
    if (!test) return res.status(400).json({ message: "No test found for this training" });

    const [questions] = await pool.query(
      "SELECT id, correct_answer AS ca, marks FROM ojt_questions WHERE test_id = ?",
      [test.id]
    );

    let earned = 0;
    const totalMarks = questions.reduce((s, q) => s + Number(q.marks || 1), 0);
    questions.forEach(q => {
      const userAnswer = (answers[q.id] || "").trim().toLowerCase();
      const correct = (q.ca || "").trim().toLowerCase();
      if (userAnswer === correct) earned += Number(q.marks || 1);
    });

    const passingPct = Number(training.pp) || 70;
    const scorePct = totalMarks > 0 ? Math.round((earned / totalMarks) * 100) : 0;
    const passed = scorePct >= passingPct;
    const newStatus = passed ? "completed" : "failed";
    const nextAttemptNumber = progressRec.status === "failed" ? currentAttempt + 1 : currentAttempt;

    // Record this attempt in history
    await pool.query(
      `INSERT INTO ojt_test_attempts (progress_id, training_id, company_user_id, attempt_number, score, earned_marks, total_marks, passed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [progressRec.id, id, userId, currentAttempt, scorePct, earned, totalMarks, passed]
    );

    await pool.query(
      `UPDATE ojt_user_progress
         SET status = ?, score = ?, completed_at = ?, attempt_number = ?, updated_at = NOW()
       WHERE id = ?`,
      [newStatus, scorePct, passed ? new Date().toISOString() : null, nextAttemptNumber, progressRec.id]
    );

    const attemptsRemaining = passed ? 0 : Math.max(0, maxAttempts - nextAttemptNumber);
    res.json({ score: scorePct, earned, totalMarks, passed, passingPct, status: newStatus,
               attemptNumber: currentAttempt, attemptsRemaining, maxAttempts });
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/my-progress – all progress for the logged-in user */
router.get("/ojt/mobile/my-progress", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [rows] = await pool.query(
      `SELECT oup.id, oup.training_id AS "trainingId", ot.title AS "trainingTitle",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              oup.status, oup.score, oup.certificate_url AS "certificateUrl",
              oup.completed_modules AS "completedModules", oup.started_at AS "startedAt",
              oup.completed_at AS "completedAt", oup.due_date AS "dueDate",
              oup.attempt_number AS "attemptNumber", ot.max_attempts AS "maxAttempts",
              oup.trainer_sign_off_at AS "trainerSignOffAt",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "totalModules"
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.company_user_id = ? AND ot.company_id = ?
       ORDER BY oup.updated_at DESC`,
      [userId, companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/my-assignments – assigned trainings not yet started */
router.get("/ojt/mobile/my-assignments", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [rows] = await pool.query(
      `SELECT oup.id, oup.training_id AS "trainingId", ot.title AS "trainingTitle",
              ot.description, ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.passing_percentage AS "passingPercentage",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              oup.status, oup.due_date AS "dueDate", oup.assigned_at AS "assignedAt",
              ab.full_name AS "assignedByName",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest"
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       LEFT JOIN assets a ON a.id = ot.asset_id
       LEFT JOIN company_users ab ON ab.id = oup.assigned_by
       WHERE oup.company_user_id = ? AND ot.company_id = ? AND oup.assigned_by IS NOT NULL
       ORDER BY oup.due_date ASC NULLS LAST, oup.assigned_at DESC`,
      [userId, companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/test-attempts/:trainingId – attempt history for the logged-in user */
router.get("/ojt/mobile/test-attempts/:trainingId", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { trainingId } = req.params;
    const [[training]] = await pool.query(
      "SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?",
      [trainingId, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [rows] = await pool.query(
      `SELECT id, attempt_number AS "attemptNumber", score, earned_marks AS "earnedMarks",
              total_marks AS "totalMarks", passed, submitted_at AS "submittedAt"
       FROM ojt_test_attempts
       WHERE training_id = ? AND company_user_id = ?
       ORDER BY attempt_number ASC`,
      [trainingId, userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /api/company-portal/my-companies ───────────────────────────────────
   Returns all companies the logged-in user has access to (primary + assigned).
   Used by multi-company admins to populate the company switcher dropdown.     */
router.get("/my-companies", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    // Primary company
    const [[primary]] = await pool.query(
      `SELECT id, company_name AS "companyName", company_code AS "companyCode"
       FROM companies WHERE id = ?`,
      [cid(req)]
    );
    // Extra assigned companies
    const [extras] = await pool.query(
      `SELECT c.id, c.company_name AS "companyName", c.company_code AS "companyCode"
       FROM user_company_assignments uca
       JOIN companies c ON c.id = uca.company_id
       WHERE uca.user_id = ?
       ORDER BY c.company_name`,
      [userId]
    );
    // Merge; primary first, no duplicates
    const allIds = new Set();
    const result = [];
    if (primary) { allIds.add(primary.id); result.push({ ...primary, isPrimary: true }); }
    for (const e of extras) {
      if (!allIds.has(e.id)) { allIds.add(e.id); result.push({ ...e, isPrimary: false }); }
    }
    res.json(result);
  } catch (err) { next(err); }
});

/* ── POST /api/company-portal/switch-company ────────────────────────────────
   Lets a multi-company user get a new short-lived JWT for a different company.
   The user must have access to the target company via user_company_assignments
   or it must be their primary company.                                        */
router.post("/switch-company", async (req, res, next) => {
  try {
    const { companyId: targetId } = req.body;
    if (!targetId) return res.status(400).json({ message: "companyId is required" });

    const userId = req.companyUser.id;
    const primaryCompanyId = cid(req);

    // Allow if target is primary company
    let allowed = Number(targetId) === Number(primaryCompanyId);

    if (!allowed) {
      // Check user_company_assignments
      const [[row]] = await pool.query(
        `SELECT id FROM user_company_assignments WHERE user_id = ? AND company_id = ?`,
        [userId, targetId]
      );
      allowed = !!row;
    }

    if (!allowed) return res.status(403).json({ message: "You do not have access to this company" });

    // Fetch company info
    const [[company]] = await pool.query(
      `SELECT id, company_name AS "companyName", company_code AS "companyCode", enabled_modules AS "enabledModules"
       FROM companies WHERE id = ?`,
      [targetId]
    );
    if (!company) return res.status(404).json({ message: "Company not found" });

    const { companyUser } = req;
    const jwt = (await import("jsonwebtoken")).default;
    const newToken = jwt.sign(
      { sub: companyUser.id, email: companyUser.email, companyId: Number(targetId), role: companyUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    res.json({
      token: newToken,
      company: {
        id: company.id,
        companyName: company.companyName,
        companyCode: company.companyCode,
        enabledModules: company.enabledModules
          ? (typeof company.enabledModules === "string" ? JSON.parse(company.enabledModules) : company.enabledModules)
          : null,
      },
    });
  } catch (err) { next(err); }
});

export default router;
