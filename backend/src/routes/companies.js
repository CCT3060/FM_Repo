import { Router } from "express";
import { param } from "express-validator";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

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

export default router;
