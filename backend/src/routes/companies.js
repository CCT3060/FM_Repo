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
      `SELECT id, company_name AS companyName, company_code AS companyCode, description,
              address_line1 AS addressLine1, address_line2 AS addressLine2, city, state_name AS state, country, pincode,
              gst_number AS gstNumber, pan_number AS panNumber, cin_number AS cinNumber,
              contract_start_date AS contractStartDate, contract_end_date AS contractEndDate,
              billing_cycle AS billingCycle, payment_terms_days AS paymentTermsDays, max_employees AS maxEmployees,
              qsr_module AS qsrModule, premeal_module AS premealModule, delivery_module AS deliveryModule, allow_guest_booking AS allowGuestBooking,
              status, created_at AS createdAt
       FROM companies
       WHERE user_id = ?
       ORDER BY created_at DESC`,
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
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
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ message: "Company code already exists" });
      }
      next(err);
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

export default router;
