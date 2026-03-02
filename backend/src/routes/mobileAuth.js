/**
 * Mobile App Authentication
 * 
 * POST /api/mobile-auth/login
 *   Login for company employees using username + password
 *   Returns: { token, user: { id, fullName, email, role, companyId, companyName } }
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/* ── Verify Company Code ──────────────────────────────────────────────────── */
router.post("/verify-company", async (req, res, next) => {
  try {
    const { companyCode } = req.body;

    if (!companyCode) {
      return res.status(400).json({ message: "Company code is required" });
    }

    // Find company by code
    const [[company]] = await pool.query(
      `SELECT id, company_name AS "companyName", company_code AS "companyCode", status
       FROM companies
       WHERE company_code = ?`,
      [companyCode]
    );

    if (!company) {
      return res.status(404).json({ message: "Invalid company code" });
    }

    if (company.status !== "Active") {
      return res.status(403).json({ message: "Company is inactive. Contact support." });
    }

    res.json({
      companyId: company.id,
      companyName: company.companyName,
      companyCode: company.companyCode
    });
  } catch (err) {
    next(err);
  }
});

/* ── Mobile Login (username + password) ──────────────────────────────────────── */
router.post("/login", async (req, res, next) => {
  try {
    const { username, password, companyId } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    // Find user by username and company (case-insensitive)
    const [[user]] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId", cu.full_name AS "fullName",
              cu.email, cu.phone, cu.designation, cu.role, cu.status,
              cu.password_hash AS "passwordHash", cu.supervisor_id AS "supervisorId",
              c.company_name AS "companyName"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE LOWER(cu.username) = LOWER(?)
         AND cu.company_id = ?`,
      [username, companyId]
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (user.status !== "Active") {
      return res.status(403).json({ message: "Account is inactive. Contact your administrator." });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ message: "No password set. Contact your administrator to set up mobile access." });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Generate JWT token (compatible with requireCompanyAuth middleware)
    const token = jwt.sign(
      {
        sub: user.id,         // User ID (standard JWT claim)
        email: user.email,
        companyId: user.companyId,
        role: user.role,
        type: "company_user",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Return user info + token
    delete user.passwordHash;
    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        designation: user.designation,
        role: user.role,
        companyId: user.companyId,
        companyName: user.companyName,
        supervisorId: user.supervisorId,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── Verify Token (for auto-login / persistent sessions) ────────────────────── */
router.get("/verify", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== "company_user") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    // Fetch fresh user data
    const [[user]] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId", cu.full_name AS "fullName",
              cu.email, cu.phone, cu.designation, cu.role, cu.status,
              cu.supervisor_id AS "supervisorId",
              c.company_name AS "companyName"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [decoded.sub || decoded.userId]  // Support both old and new token format
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status !== "Active") {
      return res.status(403).json({ message: "Account is inactive" });
    }

    res.json({ user });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    next(err);
  }
});

export default router;
