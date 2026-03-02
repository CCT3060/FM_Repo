import { Router } from "express";
import { body, param } from "express-validator";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { validate } from "../validators.js";

const router = Router();

const sharedUserRules = [
  body("fullName").trim().notEmpty().withMessage("Full name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("phone").optional().isString().isLength({ min: 6, max: 20 }),
  body("role").optional().isString().isLength({ max: 80 }),
  body("clientId").isInt().withMessage("clientId must reference a client"),
  body("status").isIn(["Active", "Inactive"]).withMessage("Status must be Active or Inactive"),
];

const passwordRule = body("password")
  .isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 0, minNumbers: 1, minSymbols: 0 })
  .withMessage("Password must be at least 8 chars and include a number");

const createUserRules = [...sharedUserRules, passwordRule];
const updateUserRules = [...sharedUserRules, passwordRule.optional({ nullable: true })];

router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name AS fullName, u.email, u.phone, u.role, u.status, u.client_id AS clientId,
              c.client_name AS clientName, u.created_at AS createdAt
       FROM users u
       LEFT JOIN clients c ON c.id = u.client_id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", validate(createUserRules), async (req, res, next) => {
  try {
    const { fullName, email, phone, role, clientId, status, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, phone, role, status, client_id, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [fullName, email, phone, role, status, clientId, passwordHash]
    );
    res.status(201).json({ id: result.insertId, fullName, email, phone, role, status, clientId });
  } catch (err) {
    if (err?.code === "23503") {
      return res.status(400).json({ message: "Client does not exist" });
    }
    return next(err);
  }
});

router.put(
  "/:id",
  validate([...updateUserRules, param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { fullName, email, phone, role, clientId, status, password } = req.body;

      const fields = [fullName, email, phone, role, status, clientId];
      let query = `UPDATE users
         SET full_name = ?, email = ?, phone = ?, role = ?, status = ?, client_id = ?`;

      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        query += `, password_hash = ?`;
        fields.push(passwordHash);
      }

      query += ` WHERE id = ?`;
      fields.push(id);

      const [result] = await pool.execute(query, fields);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({ id: Number(id), fullName, email, phone, role, status, clientId });
    } catch (err) {
      if (err?.code === "23503") {
        return res.status(400).json({ message: "Client does not exist" });
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
      const [result] = await pool.execute(`DELETE FROM users WHERE id = ?`, [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
