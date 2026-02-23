import { Router } from "express";
import { body, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";

const router = Router();

const clientRules = [
  body("clientName").trim().notEmpty().withMessage("Client name is required"),
  body("email").optional().isEmail().withMessage("Email must be valid"),
  body("phone").optional().isString().isLength({ min: 6, max: 20 }),
  body("state").optional().isString().isLength({ max: 80 }),
  body("pincode").optional().isString().isLength({ max: 12 }),
  body("gst").optional().isString().isLength({ max: 20 }),
  body("company").optional().isString().isLength({ max: 120 }),
  body("address").optional().isString().isLength({ max: 255 }),
  body("status").isIn(["Active", "Inactive"]).withMessage("Status must be Active or Inactive"),
];

router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, client_name AS clientName, email, phone, state_name AS state, pincode, gst_number AS gst, company_name AS company, address, status, created_at AS createdAt
       FROM clients
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", validate(clientRules), async (req, res, next) => {
  try {
    const { clientName, email, phone, state, pincode, gst, company, address, status } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO clients (client_name, email, phone, state_name, pincode, gst_number, company_name, address, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientName, email, phone, state, pincode, gst, company, address, status]
    );

    res.status(201).json({
      id: result.insertId,
      clientName,
      email,
      phone,
      state,
      pincode,
      gst,
      company,
      address,
      status,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id",
  validate([...clientRules, param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { clientName, email, phone, state, pincode, gst, company, address, status } = req.body;

      const [result] = await pool.execute(
        `UPDATE clients
         SET client_name = ?, email = ?, phone = ?, state_name = ?, pincode = ?, gst_number = ?, company_name = ?, address = ?, status = ?
         WHERE id = ?`,
        [clientName, email, phone, state, pincode, gst, company, address, status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Client not found" });
      }

      return res.json({ id: Number(id), clientName, email, phone, state, pincode, gst, company, address, status });
    } catch (err) {
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
      const [result] = await pool.execute(`DELETE FROM clients WHERE id = ?`, [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Client not found" });
      }
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
