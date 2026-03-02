import { Router } from "express";
import { body } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { validate } from "../validators.js";

const router = Router();

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
        `SELECT id,
                full_name AS "fullName",
                email,
                status,
                password_hash AS "passwordHash"
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [email]
      );

      if (!rows.length) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const user = rows[0];
      if (user.status !== "Active") {
        return res.status(403).json({ message: "User is inactive" });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
        expiresIn: "8h",
      });

      return res.json({
        token,
        user: { id: user.id, fullName: user.fullName, email: user.email },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
