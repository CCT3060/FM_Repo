import { Router } from "express";
import { body } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "crypto";
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

/* ── POST /root-login — validate root credentials from env, return JWT ────── */
router.post("/root-login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const expectedUser = process.env.ROOT_USERNAME;
    const expectedPass = process.env.ROOT_PASSWORD;

    if (!expectedUser || !expectedPass) {
      return res.status(503).json({ message: "Root credentials not configured on server" });
    }

    // Use SHA-256 hashes of equal length so timingSafeEqual never throws on
    // mismatched buffer sizes (avoids leaking length information via error).
    const hash = (s) => createHash("sha256").update(String(s)).digest();
    const userOk = timingSafeEqual(hash(username), hash(expectedUser));
    const passOk = timingSafeEqual(hash(password), hash(expectedPass));

    if (!userOk || !passOk) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign({ role: "root" }, process.env.JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
