import { Router } from "express";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { evaluateRule, createFlag, detectChecklistFlags } from "../utils/flagsHelper.js";
import { dispatchFlagNotifications } from "../utils/notificationsHelper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../uploads");

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

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

// pg returns JSONB columns as already-parsed JS objects; guard against that
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
};

// Ensure questions column exists (safe to run on every start)
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS questions JSONB NULL").catch(() => {});

// Ensure tabular-logsheet columns exist (migration 2026-03-02-tabular-logsheet)
pool.query("ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS layout_type VARCHAR(20) NOT NULL DEFAULT 'standard'").catch(() => {});
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

    // Run all 4 queries separately so one failure doesn't kill the rest
    const safe = async (fn) => { try { return await fn(); } catch (e) { console.error("[chart-stats]", e.message); return [[{ cnt: 0 }]]; } };

    const [[ltRows]]  = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt FROM logsheet_templates WHERE company_id = ?`,
      [companyId]
    ));
    const [[ctRows]]  = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt FROM checklist_templates WHERE company_id = ?`,
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
      // checklist_submissions.submitted_at IS nullable — fall back to created_at
      `SELECT COUNT(*) AS cnt
       FROM checklist_submissions cs
       JOIN checklist_templates ct ON ct.id = cs.template_id
       WHERE ct.company_id = ?
         AND COALESCE(cs.submitted_at, cs.created_at)::date BETWEEN ? AND ?`,
      [companyId, dateFrom, dateTo]
    ));

    const totalLogsheets   = Number(ltRows?.cnt   || 0);
    const totalChecklists  = Number(ctRows?.cnt   || 0);
    const filledLogsheets  = Number(subLSRows?.cnt || 0);
    const filledChecklists = Number(subCSRows?.cnt || 0);

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
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.department_id AS "departmentId",
              d.name AS "departmentName",
              ad.metadata, ad.documents
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.company_id = ?
       ORDER BY a.asset_name`,
      [cid(req)]
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

/* ── Checklists ─────────────────────────────────────────────────────────────── */
router.get("/checklists", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
              ct.asset_id AS "assetId",
              ct.category, ct.description, ct.frequency, ct.shift, ct.status,
              ct.shift_id AS "shiftId", s.name AS "shiftName",
              ct.questions, ct.created_at AS "createdAt"
       FROM checklist_templates ct
       LEFT JOIN shifts s ON s.id = ct.shift_id
       WHERE ct.company_id = ? AND ct.is_active = 1
       ORDER BY ct.template_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/checklists", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { templateName, assetType, assetId, category, description, frequency = "Daily", shift, shiftId, status = "active", questions } = req.body;
    if (!templateName?.trim() || !assetType) return res.status(400).json({ message: "templateName and assetType are required" });
    const questionsJson = questions ? JSON.stringify(questions) : null;
    const [rows] = await pool.query(
      `INSERT INTO checklist_templates (company_id, template_name, asset_type, asset_id, category, description, frequency, shift, shift_id, status, is_active, created_by, questions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", asset_id AS "assetId", category, description, frequency, shift, shift_id AS "shiftId", status, questions, created_at AS "createdAt"`,
      [cid(req), templateName.trim(), assetType, assetId || null, category || null, description || null, frequency, shift || null, shiftId || null, status, null, questionsJson]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { templateName, assetType, assetId, category, description, frequency, shift, shiftId, status, questions } = req.body;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    const isActive = status === "active" ? 1 : 0;
    const questionsJson = questions !== undefined ? JSON.stringify(questions) : undefined;
    const [rows] = await pool.query(
      `UPDATE checklist_templates SET
         template_name = COALESCE(?, template_name),
         asset_type = COALESCE(?, asset_type),
         asset_id = ?,
         category = COALESCE(?, category),
         description = COALESCE(?, description),
         frequency = COALESCE(?, frequency),
         shift = COALESCE(?, shift),
         shift_id = COALESCE(?, shift_id),
         status = COALESCE(?, status),
         is_active = ?,
         questions = COALESCE(?, questions)
       WHERE id = ?
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", asset_id AS "assetId", category, description, frequency, shift, shift_id AS "shiftId", status, questions, created_at AS "createdAt"`,
      [templateName || null, assetType || null, assetId || null, category || null, description || null, frequency || null, shift || null, shiftId ?? null, status || null, isActive, questionsJson ?? null, id]
    );
    res.json(rows[0]);
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
              cu.supervisor_id AS "supervisorId",
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
    const { fullName, email, phone, designation, role = "employee", status = "Active", password, username, supervisorId, shift } = req.body;
    if (!fullName || !email) return res.status(400).json({ message: "fullName and email are required" });

    // Only admin role can add employees; supervisors can add helpers under themselves
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can add employees" });
    }

    // Supervisors can only set themselves as the supervisor
    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId || null);

    let passwordHash = null;
    if (password) passwordHash = await bcrypt.hash(password, 10);

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, shift, status, password_hash, username, supervisor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id,
                 company_id    AS "companyId",
                 full_name     AS "fullName",
                 email, phone, designation, role, shift, status, username,
                 supervisor_id AS "supervisorId",
                 created_at    AS "createdAt"`,
      [cid(req), fullName, email, phone || null, designation || null, role, shift || null, status, passwordHash, username || null, resolvedSupervisorId]
    );
    res.status(201).json(rows[0]);
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
    const { fullName, email, phone, designation, role, status, password, username, supervisorId, shift } = req.body;

    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Employee not found" });

    // Supervisors can only manage employees under themselves
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

    let passwordClause = "";
    let usernameClause = username !== undefined ? ", username = ?" : "";
    let supervisorClause = resolvedSupervisorId !== undefined ? ", supervisor_id = ?" : "";
    let shiftClause = shift !== undefined ? ", shift = ?" : "";
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active"];
    if (username !== undefined) params.push(username || null);
    if (resolvedSupervisorId !== undefined) params.push(resolvedSupervisorId);
    if (shift !== undefined) params.push(shift || null);
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      passwordClause = ", password_hash = ?";
      params.push(hash);
    }
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET full_name = ?, email = ?, phone = ?, designation = ?, role = ?, status = ?${usernameClause}${supervisorClause}${shiftClause}${passwordClause}, updated_at = NOW()
       WHERE id = ?
       RETURNING id,
                 full_name     AS "fullName",
                 email, phone, designation, role, shift, status, username,
                 supervisor_id AS "supervisorId"`,
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
              cu.status, cu.company_id AS "companyId", c.company_name AS "companyName"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [req.companyUser.id]
    );
    if (!row) return res.status(404).json({ message: "User not found" });
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
              cu.full_name AS "submittedBy"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
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
              cs.status, cs.completion_pct AS "completionPct",
              cu.full_name AS "submittedBy"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN assets a ON a.id = cs.asset_id
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

/* ── Template ↔ User Assignments ────────────────────────────────────────────── */

// Admin assigns a template to a supervisor; supervisor can assign to their helpers
router.post("/template-user-assignments", async (req, res, next) => {
  try {
    const { templateType, templateId, assignedTo, note } = req.body;
    if (!templateType || !templateId || !assignedTo) {
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
        [assignedTo, cid(req)]
      );
      if (!target || String(target.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "You can only assign to employees under you" });
      }
    }

    // Verify target belongs to this company
    const [[empCheck]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [assignedTo, cid(req)]
    );
    if (!empCheck) return res.status(404).json({ message: "Assignee not found in this company" });

    // Verify the template belongs to this company
    const templateTable = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
    const [[templateCheck]] = await pool.query(
      `SELECT id FROM ${templateTable} WHERE id = ? AND company_id = ?`,
      [templateId, cid(req)]
    );
    if (!templateCheck) return res.status(404).json({ message: "Template not found in this company" });

    const [rows] = await pool.query(
      `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (template_type, template_id, assigned_to) DO UPDATE
         SET note = EXCLUDED.note, assigned_by = EXCLUDED.assigned_by, created_at = NOW()
       RETURNING id, template_type AS "templateType", template_id AS "templateId",
                 assigned_to AS "assignedTo", assigned_by AS "assignedBy", note, created_at AS "createdAt"`,
      [cid(req), templateType, templateId, assignedTo, req.companyUser.id, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get all assignments for this company (admin sees all; supervisor sees only theirs)
router.get("/template-user-assignments", async (req, res, next) => {
  try {
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
       JOIN company_users ab         ON ab.id = tua.assigned_by
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

    res.json({ ...wo, history });
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
              f.severity AS "flagSeverity", f.source AS "flagSource"
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

    res.json({ total: Number(countRow?.total ?? 0), data: rows });
  } catch (err) {
    next(err);
  }
});

/* POST /work-orders  – create a work order (optionally linked to a flag) */
router.post("/work-orders", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const {
      assetId,
      issueDescription,
      priority = "medium",
      flagId,
      assignedTo,
      assignedNote,
    } = req.body;

    if (!issueDescription) {
      return res.status(400).json({ message: "issueDescription is required" });
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
          flag_id, cp_assigned_to, assigned_note, cp_created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
       RETURNING id`,
      [
        workOrderNumber, companyId, assetId || null, assetName, location,
        issueSource, issueDescription, priority,
        flagId || null, assignedTo || null, assignedNote || null, userId,
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

// Delete an assignment (admin: any; supervisor: only ones they created)
router.delete("/template-user-assignments/:id", async (req, res, next) => {
  try {
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
      `SELECT ot.id, ot.title, ot.description, ot.status, ot.passing_percentage AS "passingPercentage",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              ot.created_by AS "createdBy", ot.created_at AS "createdAt", ot.updated_at AS "updatedAt",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest",
              (SELECT COUNT(*) FROM ojt_user_progress WHERE training_id = ot.id) AS "enrolledCount"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
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
      `SELECT ot.id, ot.title, ot.description, ot.status, ot.passing_percentage AS "passingPercentage",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              ot.created_by AS "createdBy", ot.created_at AS "createdAt", ot.updated_at AS "updatedAt"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
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
    const { title, description, assetId, passingPercentage = 70 } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_trainings (company_id, asset_id, title, description, passing_percentage, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, title, description, status, passing_percentage AS "passingPercentage",
                 asset_id AS "assetId", created_at AS "createdAt"`,
      [companyId, assetId || null, title.trim(), description || null, passingPercentage, req.companyUser.id]
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
    const { title, description, assetId, passingPercentage } = req.body;
    const [[check]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    const [rows] = await pool.query(
      `UPDATE ojt_trainings SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         asset_id = COALESCE(?, asset_id),
         passing_percentage = COALESCE(?, passing_percentage),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, title, description, status, passing_percentage AS "passingPercentage",
                 asset_id AS "assetId", updated_at AS "updatedAt"`,
      [title || null, description ?? null, assetId || null, passingPercentage || null, id]
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
      "SELECT id, passing_percentage AS \"passingPercentage\" FROM ojt_trainings WHERE id = ? AND company_id = ?",
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [rows] = await pool.query(
      `SELECT cup.id, cup.company_user_id AS "companyUserId",
              cu.full_name AS "userName", cu.email, cu.role, cu.designation,
              cup.score, cup.status, cup.certificate_url AS "certificateUrl",
              cup.started_at AS "startedAt", cup.completed_at AS "completedAt",
              cup.completed_modules AS "completedModules"
       FROM ojt_user_progress cup
       JOIN company_users cu ON cu.id = cup.company_user_id
       WHERE cup.training_id = ?
       ORDER BY cup.updated_at DESC`,
      [id]
    );
    const [[{ totalModules }]] = await pool.query(
      `SELECT COUNT(*) AS totalModules FROM ojt_modules WHERE training_id = ?`,
      [id]
    );
    res.json({ users: rows, passingPercentage: training.passingPercentage, totalModules: Number(totalModules) });
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
    const certUrl = `cert-training-${progress.training_id}-user-${progress.company_user_id}-${Date.now()}`;
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

/* POST /ojt/upload – upload a video or document file (admin only) */
router.post("/ojt/upload", uploadOjt.single("file"), async (req, res, next) => {
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
              completed_modules AS "completedModules", started_at AS "startedAt", completed_at AS "completedAt"
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
              completed_modules AS "completedModules", started_at AS "startedAt", completed_at AS "completedAt"
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
      "SELECT id FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?",
      [id, userId]
    );
    if (existing) return res.json({ id: existing.id, message: "Already started" });
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

/* POST /ojt/mobile/trainings/:id/submit-test – submit test answers, calculate score */
router.post("/ojt/mobile/trainings/:id/submit-test", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const { answers = {} } = req.body;

    const [[training]] = await pool.query(
      "SELECT id, passing_percentage AS pp FROM ojt_trainings WHERE id = ? AND company_id = ?",
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });

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

    await pool.query(
      `UPDATE ojt_user_progress SET status = ?, score = ?, completed_at = ?, updated_at = NOW()
       WHERE training_id = ? AND company_user_id = ?`,
      [newStatus, scorePct, passed ? new Date().toISOString() : null, id, userId]
    );

    res.json({ score: scorePct, earned, totalMarks, passed, passingPct, status: newStatus });
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/my-progress – all progress for the logged-in user */
router.get("/ojt/mobile/my-progress", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [rows] = await pool.query(
      `SELECT oup.id, oup.training_id AS "trainingId", ot.title AS "trainingTitle",
              oup.status, oup.score, oup.certificate_url AS "certificateUrl",
              oup.completed_modules AS "completedModules", oup.started_at AS "startedAt",
              oup.completed_at AS "completedAt",
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

export default router;
