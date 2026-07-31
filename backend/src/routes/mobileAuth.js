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

/* ── Helper: fetch role capabilities from company_roles table ─────────────── */
async function getRoleCapabilities(companyId, roleKey) {
  const empty = { canRaiseSoftIssue: false, canResolveSoftIssue: false, isSoftManager: false, isTechnicalSupervisor: false, isTechnician: false, isClientSupervisor: false, canRaiseAdditionalRequest: false };
  if (!roleKey) return empty;

  // Legacy built-in role keys that are always technical
  const legacyRole = roleKey.toLowerCase();
  if (legacyRole === 'supervisor') return { ...empty, isTechnicalSupervisor: true };
  if (legacyRole === 'technician') return { ...empty, isTechnician: true };
  if (legacyRole === 'admin' || legacyRole === 'technical_lead') return { ...empty, isTechnicalSupervisor: true };

  // Custom role — look up in company_roles
  let row;
  try {
    [[row]] = await pool.query(
      `SELECT can_raise_soft_issue       AS "canRaiseSoftIssue",
              can_resolve_soft_issue     AS "canResolveSoftIssue",
              is_soft_manager            AS "isSoftManager",
              is_technical_supervisor    AS "isTechnicalSupervisor",
              is_technician              AS "isTechnician",
              COALESCE(can_raise_additional_request, FALSE) AS "canRaiseAdditionalRequest"
         FROM company_roles
        WHERE company_id = ? AND role_key = ? AND is_active = TRUE
        LIMIT 1`,
      [companyId, roleKey]
    );
  } catch {
    // Columns may not be migrated yet on some instances — fall back gracefully
    [[row]] = await pool.query(
      `SELECT can_raise_soft_issue   AS "canRaiseSoftIssue",
              can_resolve_soft_issue AS "canResolveSoftIssue",
              is_soft_manager        AS "isSoftManager"
         FROM company_roles
        WHERE company_id = ? AND role_key = ? AND is_active = TRUE
        LIMIT 1`,
      [companyId, roleKey]
    ).catch(() => [[null]]);
  }

  if (!row) return empty;

  const caps = {
    canRaiseSoftIssue:          Boolean(row.canRaiseSoftIssue),
    canResolveSoftIssue:        Boolean(row.canResolveSoftIssue),
    isSoftManager:              Boolean(row.isSoftManager),
    isTechnicalSupervisor:      Boolean(row.isTechnicalSupervisor),
    isTechnician:               Boolean(row.isTechnician),
    canRaiseAdditionalRequest:  Boolean(row.canRaiseAdditionalRequest),
  };

  // A "client supervisor" can only raise issues — no resolve, no manage, no tech access
  caps.isClientSupervisor = caps.canRaiseSoftIssue &&
    !caps.canResolveSoftIssue &&
    !caps.isSoftManager &&
    !caps.isTechnicalSupervisor &&
    !caps.isTechnician;

  return caps;
}

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
              cu.permissions, cu.module_access AS "moduleAccess",
              c.company_name AS "companyName",
              c.enabled_modules AS "companyEnabledModules",
              c.logo_url AS "companyLogoUrl"
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
        sub: user.id,
        email: user.email,
        companyId: user.companyId,
        role: user.role,
        type: "company_user",
      },
      JWT_SECRET,
      { expiresIn: "90d" }
    );

    // Fetch dynamic role capabilities
    const roleCapabilities = await getRoleCapabilities(user.companyId, user.role);

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
        companyLogoUrl: user.companyLogoUrl || null,
        supervisorId: user.supervisorId,
        permissions: user.permissions || {},
        moduleAccess: user.moduleAccess || [],
        companyEnabledModules: user.companyEnabledModules
          ? (typeof user.companyEnabledModules === "string" ? JSON.parse(user.companyEnabledModules) : user.companyEnabledModules)
          : null,
        roleCapabilities,
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
              cu.permissions, cu.module_access AS "moduleAccess",
              c.company_name AS "companyName",
              c.enabled_modules AS "companyEnabledModules",
              c.logo_url AS "companyLogoUrl"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [decoded.sub || decoded.userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status !== "Active") {
      return res.status(403).json({ message: "Account is inactive" });
    }

    const roleCapabilities = await getRoleCapabilities(user.companyId, user.role);
    const companyEnabledModules = user.companyEnabledModules
      ? (typeof user.companyEnabledModules === "string" ? JSON.parse(user.companyEnabledModules) : user.companyEnabledModules)
      : null;
    res.json({
      user: {
        ...user,
        companyEnabledModules,
        roleCapabilities,
        permissions: user.permissions || {},
        moduleAccess: user.moduleAccess || [],
      },
    });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    next(err);
  }
});

/* ── Register / update push token ───────────────────────────────────────────── */
router.post("/push-token", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    if (decoded.type !== "company_user") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    const { token: pushToken, platform, fcmToken } = req.body || {};
    if (!pushToken && !fcmToken) return res.status(400).json({ message: "token or fcmToken is required" });

    const userId = decoded.sub || decoded.userId;

    // Ensure fcm_token column exists (idempotent migration)
    await pool.query(
      `ALTER TABLE company_users ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL`
    );

    if (pushToken) {
      await pool.query(
        `UPDATE company_users SET push_token = ?, push_token_platform = ? WHERE id = ?`,
        [pushToken, platform || null, userId]
      );
    }
    if (fcmToken) {
      await pool.query(
        `UPDATE company_users SET fcm_token = ? WHERE id = ?`,
        [fcmToken, userId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    next(err);
  }
});

export default router;
