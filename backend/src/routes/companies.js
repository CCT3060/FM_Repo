import { Router } from "express";
import { param } from "express-validator";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";
import { computeSiteScore } from "../utils/siteScore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.use(requireAuth);

// Shared logos directory with companyPortal
const logosDir = path.join(__dirname, "../../uploads/logos");
fs.mkdirSync(logosDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `company-${req.params.id}${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Auto-migrations
(async () => {
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_modules TEXT DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role          VARCHAR(60) NOT NULL,
        permissions   TEXT NOT NULL DEFAULT '{}',
        UNIQUE(company_id, role)
      )`);
  } catch (err) { /* ignore */ }
  // Phase 2: Historical snapshot table for immutable past site scores
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_checklist_snapshots (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        snapshot_date DATE NOT NULL,
        total_expected_slots INTEGER NOT NULL,
        filled_slots INTEGER NOT NULL,
        site_score_pct DECIMAL(5,2) NOT NULL,
        template_breakdown JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, snapshot_date)
      )`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_company_date 
      ON daily_checklist_snapshots(company_id, snapshot_date)
    `);
  } catch (err) { console.warn("[daily-snapshots] migration warning:", err.message); }
})();

const companyRules = [];

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id,
              c.company_name        AS "companyName",
              c.company_code        AS "companyCode",
              c.description,
              c.address_line1       AS "addressLine1",
              c.address_line2       AS "addressLine2",
              c.city,
              c.state_name          AS "state",
              c.country,
              c.pincode,
              c.gst_number          AS "gstNumber",
              c.pan_number          AS "panNumber",
              c.cin_number          AS "cinNumber",
              c.contract_start_date AS "contractStartDate",
              c.contract_end_date   AS "contractEndDate",
              c.billing_cycle       AS "billingCycle",
              c.payment_terms_days  AS "paymentTermsDays",
              c.max_employees       AS "maxEmployees",
              c.qsr_module          AS "qsrModule",
              c.premeal_module      AS "premealModule",
              c.delivery_module     AS "deliveryModule",
              c.allow_guest_booking AS "allowGuestBooking",
              c.enabled_modules     AS "enabledModules",
              c.status,
              c.logo_url            AS "logoUrl",
              c.created_at          AS "createdAt",
              COALESCE(cu.employee_count, 0) AS "employeeCount"
       FROM companies c
       LEFT JOIN (
         SELECT company_id, COUNT(*) AS employee_count
         FROM company_users
         GROUP BY company_id
       ) cu ON cu.company_id = c.id
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    const parsed = rows.map((r) => ({
      ...r,
      enabledModules: r.enabledModules ? (typeof r.enabledModules === "string" ? JSON.parse(r.enabledModules) : r.enabledModules) : null,
    }));
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  validate(companyRules),
  async (req, res, next) => {
    try {
      const {
        companyName,
        companyCode,
        description,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        pincode,
        gstNumber,
        panNumber,
        cinNumber,
        contractStartDate,
        contractEndDate,
        billingCycle,
        paymentTermsDays,
        maxEmployees,
        qsrModule = true,
        premealModule = true,
        deliveryModule = true,
        allowGuestBooking = false,
        status = "Active",
        enabledModules,
      } = req.body;

      const safeCompanyName = companyName?.trim() || "Untitled Company";
      const safeCompanyCode = (companyCode?.trim() || `CO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`).toUpperCase();
      const safePaymentTerms = toNullableInt(paymentTermsDays);
      const safeMaxEmployees = toNullableInt(maxEmployees);
      const safeBillingCycle = billingCycle?.trim() || null;
      const safeContractStart = contractStartDate || null;
      const safeContractEnd = contractEndDate || null;

      const safeEnabledModules = enabledModules ? JSON.stringify(enabledModules) : null;

      const [result] = await pool.execute(
        `INSERT INTO companies (
            company_name, company_code, description,
            address_line1, address_line2, city, state_name, country, pincode,
            gst_number, pan_number, cin_number,
            contract_start_date, contract_end_date, billing_cycle,
            payment_terms_days, max_employees,
            qsr_module, premeal_module, delivery_module, allow_guest_booking,
            enabled_modules, status, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id` ,
        [
          safeCompanyName, safeCompanyCode, description,
          addressLine1, addressLine2, city, state, country, pincode,
          gstNumber, panNumber, cinNumber,
          safeContractStart, safeContractEnd, safeBillingCycle,
          safePaymentTerms, safeMaxEmployees,
          qsrModule ? 1 : 0, premealModule ? 1 : 0, deliveryModule ? 1 : 0, allowGuestBooking ? 1 : 0,
          safeEnabledModules, status, req.user.id,
        ]
      );

      res.status(201).json({
        id: result.insertId,
        companyName: safeCompanyName,
        companyCode: safeCompanyCode,
        description,
        addressLine1, addressLine2, city, state, country, pincode,
        gstNumber, panNumber, cinNumber,
        contractStartDate, contractEndDate, billingCycle, paymentTermsDays, maxEmployees,
        qsrModule: !!qsrModule, premealModule: !!premealModule,
        deliveryModule: !!deliveryModule, allowGuestBooking: !!allowGuestBooking,
        enabledModules: enabledModules || null,
        status,
      });
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(400).json({ message: "Company code already exists" });
      }
      next(err);
    }
  }
);

router.put(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        companyName, companyCode, description,
        addressLine1, addressLine2, city, state, country, pincode,
        gstNumber, panNumber, cinNumber,
        contractStartDate, contractEndDate, billingCycle,
        paymentTermsDays, maxEmployees,
        qsrModule, premealModule, deliveryModule, allowGuestBooking,
        status, enabledModules,
      } = req.body;

      const safeCompanyName = companyName?.trim() || "Untitled Company";
      const safeCompanyCode = (companyCode?.trim() || "").toUpperCase();
      const safeEnabledModules = enabledModules !== undefined ? JSON.stringify(enabledModules) : undefined;

      const [result] = await pool.execute(
        `UPDATE companies SET
            company_name = ?, company_code = ?, description = ?,
            address_line1 = ?, address_line2 = ?, city = ?, state_name = ?, country = ?, pincode = ?,
            gst_number = ?, pan_number = ?, cin_number = ?,
            contract_start_date = ?, contract_end_date = ?, billing_cycle = ?,
            payment_terms_days = ?, max_employees = ?,
            qsr_module = ?, premeal_module = ?, delivery_module = ?, allow_guest_booking = ?,
            enabled_modules = ?,
            status = ?
         WHERE id = ? AND user_id = ?`,
        [
          safeCompanyName, safeCompanyCode, description,
          addressLine1, addressLine2, city, state, country, pincode,
          gstNumber, panNumber, cinNumber,
          contractStartDate || null, contractEndDate || null, billingCycle || null,
          toNullableInt(paymentTermsDays), toNullableInt(maxEmployees),
          qsrModule ? 1 : 0, premealModule ? 1 : 0, deliveryModule ? 1 : 0, allowGuestBooking ? 1 : 0,
          safeEnabledModules !== undefined ? safeEnabledModules : null,
          status || "Active",
          id, req.user.id,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Company not found" });
      }

      return res.json({
        id: Number(id), companyName: safeCompanyName, companyCode: safeCompanyCode,
        description, addressLine1, addressLine2, city, state, country, pincode,
        gstNumber, panNumber, cinNumber, contractStartDate, contractEndDate, billingCycle,
        paymentTermsDays, maxEmployees,
        qsrModule: !!qsrModule, premealModule: !!premealModule,
        deliveryModule: !!deliveryModule, allowGuestBooking: !!allowGuestBooking,
        enabledModules: enabledModules || null,
        status: status || "Active",
      });
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(400).json({ message: "Company code already exists" });
      }
      return next(err);
    }
  }
);

router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const [result] = await pool.execute(
        `DELETE FROM companies WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Company not found" });
      }
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

/* ── Company Overview (admin sees company data from employee portal) ─────────── */
router.get(
  "/:id/overview",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.id);

      // Verify company belongs to this admin
      const [[company]] = await pool.query(
        `SELECT id, company_name AS "companyName", company_code AS "companyCode", status FROM companies WHERE id = ? AND user_id = ?`,
        [companyId, req.user.id]
      );
      if (!company) return res.status(404).json({ message: "Company not found" });

      const [assets, checklists, logsheets, departments] = await Promise.all([
        pool.query(
          `SELECT a.id, a.asset_name AS "assetName", a.asset_type AS "assetType",
                  a.asset_unique_id AS "assetUniqueId", a.status, a.building, a.floor, a.room,
                  d.name AS "departmentName", a.created_at AS "createdAt"
           FROM assets a
           LEFT JOIN departments d ON d.id = a.department_id
           WHERE a.company_id = ? ORDER BY a.asset_name`,
          [companyId]
        ),
        pool.query(
          `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
                  ct.category, ct.frequency, ct.status, ct.created_at AS "createdAt",
                  COUNT(ctq.id) AS "questionCount"
           FROM checklist_templates ct
           LEFT JOIN checklist_template_questions ctq ON ctq.template_id = ct.id
           WHERE ct.company_id = ?
           GROUP BY ct.id
           ORDER BY ct.template_name`,
          [companyId]
        ),
        pool.query(
          `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
                  lt.asset_model AS "assetModel", lt.frequency, lt.is_active AS "isActive",
                  a.asset_name AS "assetName", lt.created_at AS "createdAt",
                  (SELECT COUNT(*) FROM logsheet_entries le WHERE le.template_id = lt.id) AS "entryCount"
           FROM logsheet_templates lt
           LEFT JOIN assets a ON a.id = lt.asset_id
           WHERE lt.company_id = ?
           ORDER BY lt.template_name`,
          [companyId]
        ),
        pool.query(
          `SELECT id, name, description FROM departments WHERE company_id = ? ORDER BY name`,
          [companyId]
        ),
      ]);

      res.json({
        company,
        assets: assets[0],
        checklists: checklists[0],
        logsheets: logsheets[0],
        departments: departments[0],
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Role Permissions ──────────────────────────────────────────────────────── */
router.get(
  "/:id/role-permissions",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.id);
      const [[co]] = await pool.query(`SELECT 1 FROM companies WHERE id = ? AND user_id = ?`, [companyId, req.user.id]);
      if (!co) return res.status(404).json({ message: "Company not found" });
      const [rows] = await pool.query(`SELECT role, permissions FROM role_permissions WHERE company_id = ?`, [companyId]);
      const result = {};
      rows.forEach((r) => {
        result[r.role] = typeof r.permissions === "string" ? JSON.parse(r.permissions) : r.permissions;
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.put(
  "/:id/role-permissions",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.id);
      const [[co]] = await pool.query(`SELECT 1 FROM companies WHERE id = ? AND user_id = ?`, [companyId, req.user.id]);
      if (!co) return res.status(404).json({ message: "Company not found" });
      // req.body: { admin: { assets: {c,r,u,d}, ... }, supervisor: {...}, ... }
      for (const [role, perms] of Object.entries(req.body)) {
        const permJson = JSON.stringify(perms);
        await pool.query(
          `INSERT INTO role_permissions (company_id, role, permissions) VALUES (?, ?, ?)
           ON CONFLICT (company_id, role) DO UPDATE SET permissions = EXCLUDED.permissions`,
          [companyId, role, permJson]
        );
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

/* ── Upload company logo (Jabil admin) ──────────────────────────────────── */
router.post(
  "/:id/upload-logo",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  (req, res, next) => {
    uploadLogo.single("logo")(req, res, async (err) => {
      if (err) return res.status(400).json({ message: err.message });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      try {
        const companyId = Number(req.params.id);
        const [[co]] = await pool.query(`SELECT 1 FROM companies WHERE id = ? AND user_id = ?`, [companyId, req.user.id]);
        if (!co) return res.status(404).json({ message: "Company not found" });
        const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
        const url = `/uploads/logos/company-${companyId}${ext}`;
        await pool.query(`UPDATE companies SET logo_url = ? WHERE id = ?`, [url, companyId]);
        return res.json({ ok: true, url });
      } catch (e) { return next(e); }
    });
  }
);

/* ── Helper: Get or create snapshot for a past date (Phase 4: location-based) ─ */
async function getOrCreateSnapshot(companyId, targetDate) {
  const today = new Date().toISOString().split('T')[0];
  if (targetDate >= today) {
    return await computeSiteScore(companyId, targetDate);
  }

  // Check if snapshot exists
  const [[existing]] = await pool.query(
    `SELECT total_expected_slots AS "totalExpected",
            filled_slots AS "filledSlots",
            site_score_pct AS "siteScorePct",
            template_breakdown AS "breakdown"
     FROM daily_checklist_snapshots
     WHERE company_id = ? AND snapshot_date = ?::date`,
    [companyId, targetDate]
  );

  if (existing) {
    return {
      totalExpected: Number(existing.totalExpected),
      filledSlots: Number(existing.filledSlots),
      pendingSlots: Math.max(0, Number(existing.totalExpected) - Number(existing.filledSlots)),
      siteScorePct: Number(existing.siteScorePct),
      breakdown: existing.breakdown || [],
      fromSnapshot: true
    };
  }

  // Calculate and store snapshot for this past date
  const metrics = await calculateCompanySiteScore(companyId, targetDate);
  
  try {
    await pool.query(
      `INSERT INTO daily_checklist_snapshots 
       (company_id, snapshot_date, total_expected_slots, filled_slots, site_score_pct, template_breakdown)
       VALUES (?, ?::date, ?, ?, ?, ?::jsonb)
       ON CONFLICT (company_id, snapshot_date) DO NOTHING`,
      [companyId, targetDate, metrics.totalExpected, metrics.filledSlots, metrics.siteScorePct, JSON.stringify(metrics.breakdown)]
    );
  } catch (snapErr) {
    console.error(`[snapshot] Failed to store snapshot for company ${companyId} on ${targetDate}:`, snapErr.message);
  }

  return { ...metrics, fromSnapshot: false };
}

/* ── Admin Dashboard Overview ─────────────────────────────────────────────── */
router.get("/dashboard-overview", async (req, res, next) => {
  try {
    const { date, companyId } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const adminId = req.user.id;

    let cQuery = `SELECT id, company_name AS "companyName", status FROM companies WHERE user_id = ?`;
    const cParams = [adminId];
    if (companyId) {
      cQuery += ` AND id = ?`;
      cParams.push(Number(companyId));
    }
    cQuery += ` ORDER BY company_name`;
    const [comps] = await pool.query(cQuery, cParams);

    if (comps.length === 0) {
      return res.json({ companies: [], totals: {}, recentAlerts: [], recentWorkOrders: [], recentSoftRequests: [] });
    }

    const statsResults = await Promise.all(comps.map(async (co) => {
      // Phase 1 & 2: Use slot-based calculation with snapshot support
      const siteMetrics = await getOrCreateSnapshot(co.id, targetDate);

      let row = null;
      try {
        const [[r]] = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM locations WHERE company_id = ? AND LOWER(COALESCE(status,'active')) = 'active') AS locations,
             (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('closed','resolved','cancelled','rejected')) AS open_soft,
             (SELECT COUNT(*) FROM assets WHERE company_id = ?) AS total_assets,
             (SELECT COUNT(*) FROM assets WHERE company_id = ? AND status = 'Active') AS active_assets,
             (SELECT COUNT(*) FROM company_users WHERE company_id = ? AND status = 'Active') AS active_employees,
             (SELECT COUNT(*) FROM work_orders WHERE company_id = ? AND status = 'open') AS open_issues,
             (SELECT COUNT(*) FROM flags WHERE company_id = ? AND status IN ('open','in_progress')) AS open_flags,
             (SELECT COUNT(*) FROM flags WHERE company_id = ? AND severity = 'critical' AND status IN ('open','in_progress')) AS critical_flags,
             (SELECT COUNT(*) FROM logsheet_templates WHERE company_id = ?) AS total_ls_tpls,
             (SELECT COUNT(DISTINCT le.template_id) FROM logsheet_entries le
              JOIN logsheet_templates lt ON lt.id = le.template_id
              WHERE lt.company_id = ? AND le.submitted_at::date = ?::date) AS filled_ls_today`,
          [co.id, co.id, co.id, co.id, co.id, co.id, co.id, co.id, co.id, co.id, targetDate]
        );
        row = r;
      } catch (statErr) {
        console.error(`[dashboard-overview] stats query failed for company ${co.id}:`, statErr.message);
      }
      const totalLsTpls = Number(row?.total_ls_tpls ?? 0);
      const filledLsTd  = Number(row?.filled_ls_today ?? 0);
      return {
        id: co.id,
        companyName: co.companyName,
        status: co.status,
        totalTemplates:       siteMetrics.totalExpected,
        filledToday:          siteMetrics.filledSlots,
        pendingChecklists:    siteMetrics.pendingSlots,
        siteScore:            siteMetrics.siteScorePct,
        activeLocations:      Number(row?.locations       ?? 0),
        openSoftRequests:     Number(row?.open_soft       ?? 0),
        totalAssets:          Number(row?.total_assets    ?? 0),
        activeAssets:         Number(row?.active_assets   ?? 0),
        activeEmployees:      Number(row?.active_employees ?? 0),
        openIssues:           Number(row?.open_issues     ?? 0),
        openFlags:            Number(row?.open_flags      ?? 0),
        criticalFlags:        Number(row?.critical_flags  ?? 0),
        totalLogsheetTemplates: totalLsTpls,
        filledLogsheetsToday:   filledLsTd,
        pendingLogsheets:       Math.max(0, totalLsTpls - filledLsTd),
      };
    }));

    const ZERO_KEYS = ["totalTemplates","filledToday","pendingChecklists","activeLocations","openSoftRequests","totalAssets","activeAssets","openIssues","openFlags","criticalFlags","totalLogsheetTemplates","filledLogsheetsToday","pendingLogsheets"];
    const totals = statsResults.reduce((acc, c) => {
      ZERO_KEYS.forEach(k => { acc[k] = (acc[k] || 0) + (c[k] || 0); });
      return acc;
    }, Object.fromEntries(ZERO_KEYS.map(k => [k, 0])));
    totals.siteScore = totals.totalTemplates > 0 ? Math.round((totals.filledToday / totals.totalTemplates) * 100) : 0;

    const companyIds = statsResults.map(c => c.id);
    const idPH = companyIds.map(() => "?").join(",");

    let alertRows = [], woRows = [], srRows = [];

    try {
      const [rows] = await pool.query(
        `SELECT f.id, f.title, f.severity, f.status, f.created_at AS "createdAt",
                f.company_id AS "companyId", c.company_name AS "companyName",
                a.asset_name AS "assetName"
         FROM flags f
         JOIN companies c ON c.id = f.company_id
         LEFT JOIN assets a ON a.id = f.asset_id
         WHERE f.company_id IN (${idPH}) AND f.status IN ('open','in_progress')
         ORDER BY f.created_at DESC LIMIT 20`,
        companyIds
      );
      alertRows = rows || [];
    } catch (e) { console.error("[dashboard-overview] alertRows:", e.message); }

    try {
      const [rows] = await pool.query(
        `SELECT wo.id, wo.wo_number AS "woNumber", wo.description, wo.status,
                wo.priority, wo.created_at AS "createdAt",
                a.asset_name AS "assetName", a.company_id AS "companyId",
                c.company_name AS "companyName", cu.full_name AS "assignedTo"
         FROM work_orders wo
         JOIN assets a ON wo.asset_id = a.id
         JOIN companies c ON c.id = a.company_id
         LEFT JOIN company_users cu ON cu.id = wo.assigned_to
         WHERE a.company_id IN (${idPH}) AND wo.status = 'open'
         ORDER BY wo.created_at DESC LIMIT 20`,
        companyIds
      );
      woRows = rows || [];
    } catch (e) { console.error("[dashboard-overview] woRows:", e.message); }

    try {
      const [rows] = await pool.query(
        `SELECT ssr.id, ssr.request_type AS "requestType", ssr.description, ssr.status,
                ssr.created_at AS "createdAt", ssr.company_id AS "companyId",
                c.company_name AS "companyName", cu.full_name AS "raisedBy"
         FROM soft_service_requests ssr
         JOIN companies c ON c.id = ssr.company_id
         LEFT JOIN company_users cu ON cu.id = ssr.raised_by
         WHERE ssr.company_id IN (${idPH})
           AND LOWER(TRIM(COALESCE(ssr.status, ''))) NOT IN ('closed','resolved','cancelled','rejected')
         ORDER BY ssr.created_at DESC LIMIT 20`,
        companyIds
      );
      srRows = rows || [];
    } catch (e) { console.error("[dashboard-overview] srRows:", e.message); }

    res.json({
      companies: statsResults,
      totals,
      recentAlerts: alertRows,
      recentWorkOrders: woRows,
      recentSoftRequests: srRows,
      date: targetDate,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
