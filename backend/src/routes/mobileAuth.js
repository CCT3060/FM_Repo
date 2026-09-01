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

/* ── Helper: fetch role capabilities from role_permissions & company_roles ── */
async function getRoleCapabilities(companyId, roleKey) {
  const empty = {
    canRaiseSoftIssue: false,
    canResolveSoftIssue: false,
    isSoftManager: false,
    isTechnicalSupervisor: false,
    isTechnician: false,
    isClientSupervisor: false,
    canRaiseAdditionalRequest: false,
    canMarkAttendance: false,
    canAssignRaisedRequests: false,
    canFillLogsheet: false,
    canAssignLogsheet: false,
    canFillChecklists: false,
    canAssignChecklists: false,
    canExecuteWorkOrders: false,
    canAssignWorkOrders: false,
    canAssignHKRequestMobile: false,
    canChangeStatusHKRequestMobile: false,
    canAssignWarningsMobile: false,
    canChangeStatusWarningsMobile: false,
  };
  if (!roleKey) return empty;

  const legacyRole = roleKey.toLowerCase();
  if (legacyRole === 'admin' || legacyRole === 'catalyst_admin') {
    return {
      ...empty,
      isTechnicalSupervisor: true,
      canRaiseSoftIssue: true,
      canResolveSoftIssue: true,
      isSoftManager: true,
      canRaiseAdditionalRequest: true,
      canMarkAttendance: true,
      canAssignRaisedRequests: true,
      canFillLogsheet: true,
      canAssignLogsheet: true,
      canFillChecklists: true,
      canAssignChecklists: true,
      canExecuteWorkOrders: true,
      canAssignWorkOrders: true,
      canAssignHKRequestMobile: true,
      canChangeStatusHKRequestMobile: true,
      canAssignWarningsMobile: true,
      canChangeStatusWarningsMobile: true,
    };
  }

  // 1. Fetch from role_permissions JSON matrix first
  let matrix = {};
  let hasMatrix = false;
  try {
    const [permRows] = await pool.query(
      `SELECT permissions FROM role_permissions WHERE company_id = ? AND role = ? LIMIT 1`,
      [companyId, roleKey]
    );
    if (permRows && permRows[0]?.permissions) {
      matrix = typeof permRows[0].permissions === "string"
        ? JSON.parse(permRows[0].permissions)
        : permRows[0].permissions;
      hasMatrix = matrix && typeof matrix === "object" && Object.keys(matrix).length > 0;
    }
  } catch {
    matrix = {};
  }

  // 2. Fetch legacy role row for fallback if matrix is missing
  let row = null;
  if (!hasMatrix) {
    try {
      const [[foundRow]] = await pool.query(
        `SELECT can_raise_soft_issue       AS "canRaiseSoftIssue",
                can_resolve_soft_issue     AS "canResolveSoftIssue",
                is_soft_manager            AS "isSoftManager",
                is_technical_supervisor    AS "isTechnicalSupervisor",
                is_technician              AS "isTechnician",
                COALESCE(can_raise_additional_request, FALSE) AS "canRaiseAdditionalRequest",
                COALESCE(can_mark_attendance, FALSE) AS "canMarkAttendance",
                COALESCE(can_assign_raised_requests, FALSE) AS "canAssignRaisedRequests"
           FROM company_roles
          WHERE company_id = ? AND role_key = ? AND is_active = TRUE
          LIMIT 1`,
        [companyId, roleKey]
      );
      row = foundRow;
    } catch {
      row = null;
    }
  }

  const logsheetViewAllowed = !hasMatrix || matrix.logsheets?.v !== false;
  const checklistViewAllowed = !hasMatrix || matrix.checklists?.v !== false;
  const woMatrix = matrix.workorders || matrix.requests || {};
  const workordersViewAllowed = !hasMatrix || (matrix.workorders?.v !== false && matrix.requests?.v !== false) || Boolean(woMatrix.execute_work_orders || woMatrix.execute_workorders || woMatrix.assign_work_orders || woMatrix.assign_workorders);
  const softrequestsViewAllowed = !hasMatrix || (matrix.softrequests?.v !== false && matrix['soft-requests']?.v !== false);
  const attendanceViewAllowed = !hasMatrix || matrix.attendance?.v !== false;
  const additionalViewAllowed = !hasMatrix || matrix['additional-requests']?.v !== false;

  const isSoftManager = softrequestsViewAllowed && (hasMatrix
    ? Boolean(
        matrix._meta?.isManagerViewOnly ||
        row?.isSoftManager ||
        ((matrix.softrequests?.v || matrix['soft-requests']?.v) &&
         !matrix.softrequests?.raise_hk_issues &&
         !matrix.softrequests?.resolve_hk_issues &&
         !matrix.checklists?.fill_checklists &&
         !woMatrix.execute_work_orders &&
         !woMatrix.execute_workorders)
      )
    : Boolean(row?.isSoftManager));

  const canRaiseSoftIssue = softrequestsViewAllowed && (hasMatrix && matrix.softrequests?.raise_hk_issues !== undefined
    ? Boolean(matrix.softrequests?.raise_hk_issues)
    : Boolean(row?.canRaiseSoftIssue));

  const canResolveSoftIssue = softrequestsViewAllowed && (hasMatrix && matrix.softrequests?.resolve_hk_issues !== undefined
    ? Boolean(matrix.softrequests?.resolve_hk_issues)
    : Boolean(row?.canResolveSoftIssue));

  const canRaiseAdditional = additionalViewAllowed && (hasMatrix && matrix['additional-requests']?.raise_additional_request !== undefined
    ? Boolean(matrix['additional-requests']?.raise_additional_request)
    : Boolean(row?.canRaiseAdditionalRequest));

  const canMarkAttendance = attendanceViewAllowed && (hasMatrix && matrix.attendance?.mark_mobile_attendance !== undefined
    ? Boolean(matrix.attendance?.mark_mobile_attendance)
    : Boolean(row?.canMarkAttendance));

  const canAssignRequests = additionalViewAllowed && (hasMatrix && matrix['additional-requests']?.assign_additional_request !== undefined
    ? Boolean(matrix['additional-requests']?.assign_additional_request)
    : Boolean(row?.canAssignRaisedRequests));

  const canFillLogsheet = logsheetViewAllowed && (hasMatrix && matrix.logsheets?.fill_logsheets !== undefined
    ? Boolean(matrix.logsheets?.fill_logsheets)
    : Boolean(row?.isTechnician || roleKey === 'technician' || roleKey === 'supervisor'));

  const canAssignLogsheet = logsheetViewAllowed && (hasMatrix && matrix.logsheets?.assign_logsheets !== undefined
    ? Boolean(matrix.logsheets?.assign_logsheets)
    : Boolean(row?.isTechnicalSupervisor || roleKey === 'supervisor'));

  const canFillChecklists = checklistViewAllowed && (hasMatrix && matrix.checklists?.fill_checklists !== undefined
    ? Boolean(matrix.checklists?.fill_checklists)
    : Boolean(row?.isTechnician || roleKey === 'technician' || roleKey === 'supervisor'));

  const canAssignChecklists = checklistViewAllowed && (hasMatrix && matrix.checklists?.assign_checklists !== undefined
    ? Boolean(matrix.checklists?.assign_checklists)
    : Boolean(row?.isTechnicalSupervisor || roleKey === 'supervisor'));

  const canExecuteWorkOrders = workordersViewAllowed && (hasMatrix && (woMatrix.execute_work_orders !== undefined || woMatrix.execute_workorders !== undefined)
    ? Boolean(woMatrix.execute_work_orders ?? woMatrix.execute_workorders)
    : Boolean(row?.isTechnician || roleKey === 'technician' || roleKey === 'supervisor'));

  const canAssignWorkOrders = workordersViewAllowed && (hasMatrix && (woMatrix.assign_work_orders !== undefined || woMatrix.assign_workorders !== undefined)
    ? Boolean(woMatrix.assign_work_orders ?? woMatrix.assign_workorders)
    : Boolean(row?.isTechnicalSupervisor || roleKey === 'supervisor'));

  const isTechSupervisor = Boolean(
    canAssignChecklists ||
    canAssignLogsheet ||
    canAssignWorkOrders ||
    row?.isTechnicalSupervisor ||
    roleKey === 'supervisor'
  );

  const isTechnician = Boolean(
    canFillChecklists ||
    canFillLogsheet ||
    canExecuteWorkOrders ||
    row?.isTechnician ||
    roleKey === 'technician' ||
    roleKey === 'supervisor'
  );

  const canAssignHKRequestMobile = softrequestsViewAllowed && (hasMatrix && matrix.softrequests?.assign_cutoff_hk_mobile !== undefined
    ? Boolean(matrix.softrequests?.assign_cutoff_hk_mobile)
    : Boolean(isSoftManager || roleKey === 'supervisor'));

  const canChangeStatusHKRequestMobile = softrequestsViewAllowed && (hasMatrix && matrix.softrequests?.change_status_hk_mobile !== undefined
    ? Boolean(matrix.softrequests?.change_status_hk_mobile)
    : Boolean(canResolveSoftIssue || isSoftManager || roleKey === 'supervisor'));

  const canAssignWarningsMobile = hasMatrix && matrix.warnings?.assign_cutoff_warnings_mobile !== undefined
    ? Boolean(matrix.warnings?.assign_cutoff_warnings_mobile)
    : Boolean(isTechSupervisor || roleKey === 'supervisor');

  const canChangeStatusWarningsMobile = hasMatrix && matrix.warnings?.change_status_warnings_mobile !== undefined
    ? Boolean(matrix.warnings?.change_status_warnings_mobile)
    : Boolean(isTechSupervisor || roleKey === 'supervisor');

  const caps = {
    canRaiseSoftIssue,
    canResolveSoftIssue,
    isSoftManager,
    isTechnicalSupervisor: isTechSupervisor,
    isTechnician,
    canRaiseAdditionalRequest: canRaiseAdditional,
    canMarkAttendance,
    canAssignRaisedRequests: canAssignRequests,
    canFillLogsheet,
    canAssignLogsheet,
    canFillChecklists,
    canAssignChecklists,
    canExecuteWorkOrders,
    canAssignWorkOrders,
    canAssignHKRequestMobile,
    canChangeStatusHKRequestMobile,
    canAssignWarningsMobile,
    canChangeStatusWarningsMobile,
  };

  // A "client supervisor" can only raise issues — no resolve, no manage, no tech access
  caps.isClientSupervisor = caps.canRaiseSoftIssue &&
    !caps.canResolveSoftIssue &&
    !caps.isSoftManager &&
    !caps.isTechnicalSupervisor &&
    !caps.isTechnician &&
    !caps.canFillLogsheet &&
    !caps.canAssignLogsheet;

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
