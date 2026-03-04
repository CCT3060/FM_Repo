import { Router } from "express";
import { param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

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
              c.status,
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
    res.json(rows);
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
      } = req.body;

      const safeCompanyName = companyName?.trim() || "Untitled Company";
      const safeCompanyCode = (companyCode?.trim() || `CO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`).toUpperCase();
      const safePaymentTerms = toNullableInt(paymentTermsDays);
      const safeMaxEmployees = toNullableInt(maxEmployees);
      const safeBillingCycle = billingCycle?.trim() || null;
      const safeContractStart = contractStartDate || null;
      const safeContractEnd = contractEndDate || null;

      const [result] = await pool.execute(
        `INSERT INTO companies (
            company_name, company_code, description,
            address_line1, address_line2, city, state_name, country, pincode,
            gst_number, pan_number, cin_number,
            contract_start_date, contract_end_date, billing_cycle,
            payment_terms_days, max_employees,
            qsr_module, premeal_module, delivery_module, allow_guest_booking,
          status, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id` ,
        [
          safeCompanyName, safeCompanyCode, description,
          addressLine1, addressLine2, city, state, country, pincode,
          gstNumber, panNumber, cinNumber,
          safeContractStart, safeContractEnd, safeBillingCycle,
          safePaymentTerms, safeMaxEmployees,
          qsrModule ? 1 : 0, premealModule ? 1 : 0, deliveryModule ? 1 : 0, allowGuestBooking ? 1 : 0,
          status, req.user.id,
        ]
      );

      res.status(201).json({
        id: result.insertId,
        companyName: safeCompanyName,
        companyCode: safeCompanyCode,
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
        qsrModule: !!qsrModule,
        premealModule: !!premealModule,
        deliveryModule: !!deliveryModule,
        allowGuestBooking: !!allowGuestBooking,
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
        status,
      } = req.body;

      const safeCompanyName = companyName?.trim() || "Untitled Company";
      const safeCompanyCode = (companyCode?.trim() || "").toUpperCase();

      const [result] = await pool.execute(
        `UPDATE companies SET
            company_name = ?, company_code = ?, description = ?,
            address_line1 = ?, address_line2 = ?, city = ?, state_name = ?, country = ?, pincode = ?,
            gst_number = ?, pan_number = ?, cin_number = ?,
            contract_start_date = ?, contract_end_date = ?, billing_cycle = ?,
            payment_terms_days = ?, max_employees = ?,
            qsr_module = ?, premeal_module = ?, delivery_module = ?, allow_guest_booking = ?,
            status = ?
         WHERE id = ? AND user_id = ?`,
        [
          safeCompanyName, safeCompanyCode, description,
          addressLine1, addressLine2, city, state, country, pincode,
          gstNumber, panNumber, cinNumber,
          contractStartDate || null, contractEndDate || null, billingCycle || null,
          toNullableInt(paymentTermsDays), toNullableInt(maxEmployees),
          qsrModule ? 1 : 0, premealModule ? 1 : 0, deliveryModule ? 1 : 0, allowGuestBooking ? 1 : 0,
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

export default router;
