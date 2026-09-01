import { Router } from "express";
import { body } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { validate } from "../validators.js";
import { getRolePortalPerms } from "../utils/permissions.js";

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

/* ── Helper: fetch role capabilities from company_roles table ─────────────── */
export async function getRoleCapabilities(companyId, roleKey) {
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

/**
 * POST /api/company-auth/login
 * Body: { email, password }
 * Returns: { token, user: { id, fullName, email, companyId, companyName, role, roleCapabilities } }
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

      // Try the full query first (includes optional columns that may not exist
      // on older local databases). Fall back to the base query if a column is
      // missing so local dev environments don't require manual schema migrations.
      let rows;
      try {
        [rows] = await pool.query(
          `SELECT cu.id,
                  cu.full_name      AS "fullName",
                  cu.email,
                  cu.status,
                  cu.role,
                  cu.company_id     AS "companyId",
                  cu.password_hash  AS "passwordHash",
                  cu.permissions,
                  cu.module_access  AS "moduleAccess",
                  COALESCE(cu.can_access_combined_view, TRUE) AS "canAccessCombinedView",
                  cu.default_company_id AS "defaultCompanyId",
                  c.company_name    AS "companyName",
                  c.enabled_modules AS "companyEnabledModules"
           FROM company_users cu
           JOIN companies c ON c.id = cu.company_id
           WHERE cu.email = ?
           LIMIT 1`,
          [email]
        );
      } catch (_colErr) {
        // One or more optional columns don't exist yet on this database.
        // Fall back to the columns that are guaranteed to exist.
        [rows] = await pool.query(
          `SELECT cu.id,
                  cu.full_name     AS "fullName",
                  cu.email,
                  cu.status,
                  cu.role,
                  cu.company_id    AS "companyId",
                  cu.password_hash AS "passwordHash",
                  c.company_name   AS "companyName"
           FROM company_users cu
           JOIN companies c ON c.id = cu.company_id
           WHERE cu.email = ?
           LIMIT 1`,
          [email]
        );
      }

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

      const roleCapabilities = await getRoleCapabilities(user.companyId, user.role);
      const rolePortalPerms = await getRolePortalPerms(user.companyId, user.role);

      return res.json({
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          companyId: user.companyId,
          companyName: user.companyName,
          role: user.role,
          canAccessCombinedView: user.canAccessCombinedView !== false,
          defaultCompanyId: user.defaultCompanyId || null,
          permissions: user.permissions || {},
          moduleAccess: user.moduleAccess || [],
          companyEnabledModules: user.companyEnabledModules
            ? (typeof user.companyEnabledModules === "string" ? JSON.parse(user.companyEnabledModules) : user.companyEnabledModules)
            : null,
          roleCapabilities,
          rolePortalPerms,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
