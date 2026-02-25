import { Router } from "express";
import { body, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const upsertRules = [
  body("code").trim().notEmpty().withMessage("code is required").isLength({ max: 80 }),
  body("label").trim().notEmpty().withMessage("label is required").isLength({ max: 160 }),
  body("category").optional().isString().isLength({ max: 80 }),
  body("description").optional().isString().isLength({ max: 255 }),
  body("status").optional().isIn(["Active", "Inactive"]),
];

router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, label, category, description, status, created_at AS createdAt
       FROM asset_types
       ORDER BY label ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  validate(upsertRules),
  async (req, res, next) => {
    const { code, label, category, description, status = "Active" } = req.body;
    try {
      const [result] = await pool.execute(
        `INSERT INTO asset_types (code, label, category, description, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?)` ,
        [code.trim().toLowerCase(), label.trim(), category || null, description || null, status, req.user.id]
      );
      res.status(201).json({ id: result.insertId, code: code.trim().toLowerCase(), label: label.trim(), category, description, status });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ message: "Asset type code already exists" });
      }
      return next(err);
    }
  }
);

router.put(
  "/:id",
  validate([...upsertRules, param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    const { id } = req.params;
    const { code, label, category, description, status = "Active" } = req.body;
    try {
      const [result] = await pool.execute(
        `UPDATE asset_types SET code = ?, label = ?, category = ?, description = ?, status = ? WHERE id = ?`,
        [code.trim().toLowerCase(), label.trim(), category || null, description || null, status, id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ message: "Asset type not found" });
      res.json({ id: Number(id), code: code.trim().toLowerCase(), label: label.trim(), category, description, status });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ message: "Asset type code already exists" });
      }
      return next(err);
    }
  }
);

router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      const [result] = await pool.execute(`DELETE FROM asset_types WHERE id = ?`, [id]);
      if (result.affectedRows === 0) return res.status(404).json({ message: "Asset type not found" });
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
