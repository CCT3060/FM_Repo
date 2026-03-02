import { Router } from "express";
import { body } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { validate } from "../validators.js";

const router = Router();

// Auto-add role column if it doesn't exist yet
(async () => {
  try {
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS role VARCHAR(60) NOT NULL DEFAULT 'employee'`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[company-auth] migration:", err.message);
  }
})();

/**
 * POST /api/company-auth/login
 * Body: { email, password }
 * Returns: { token, user: { id, fullName, email, companyId, companyName, role } }
 */
router.post(
  "/login",
  validate([
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ]),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const [rows] = await pool.query(
        `SELECT cu.id,
                cu.full_name    AS "fullName",
                cu.email,
                cu.status,
                cu.role,
                cu.company_id   AS "companyId",
                cu.password_hash AS "passwordHash",
                c.company_name  AS "companyName"
         FROM company_users cu
         JOIN companies c ON c.id = cu.company_id
         WHERE cu.email = ?
         LIMIT 1`,
        [email]
      );

      if (!rows.length) return res.status(401).json({ message: "Invalid credentials" });
      const user = rows[0];

      if (user.status !== "Active") return res.status(403).json({ message: "Account is inactive" });
      if (!user.passwordHash) return res.status(401).json({ message: "No password set for this account — contact your admin" });

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

      const token = jwt.sign(
        { sub: user.id, email: user.email, companyId: user.companyId, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "10h" }
      );

      return res.json({
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          companyId: user.companyId,
          companyName: user.companyName,
          role: user.role,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
