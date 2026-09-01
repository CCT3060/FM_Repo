import pool from "../db.js";

/**
 * Checks a module permission operation ('v', 'c', 'r', 'u', 'd') against a role's permissions map.
 */
export function checkRolePerm(permsForRole, moduleKey, op) {
  if (!permsForRole) return op === "v"; // Default view=true if no perms set

  const modPerms =
    permsForRole[moduleKey] ||
    (moduleKey === "softrequests"
      ? permsForRole["soft-requests"] || permsForRole["softRequests"]
      : null) ||
    (moduleKey === "workorders"
      ? permsForRole["requests"] || permsForRole["workorders"] || permsForRole["work-orders"]
      : null) ||
    (moduleKey === "ojt"
      ? permsForRole["ojtTraining"] || permsForRole["ojt-training"] || permsForRole["ojt"]
      : null) ||
    (moduleKey === "additional-requests"
      ? permsForRole["additionalRequests"] || permsForRole["additional-requests"]
      : null);

  if (!modPerms) {
    // If no permission record for this module, default view (v) to true, others false
    return op === "v";
  }

  // op can be 'v', 'c', 'r', 'u', 'd'
  if (op === "v") {
    if (modPerms.v !== undefined) return Boolean(modPerms.v);
    return true; // Backward compatibility (missing 'v' defaults to true)
  }

  // For c, r, u, d: first check if 'v' (View) is allowed. If v is false, CRUD actions are blocked!
  const isViewAllowed = modPerms.v !== undefined ? Boolean(modPerms.v) : true;
  if (!isViewAllowed) return false;

  const shortOp = op;
  const longOp =
    op === "c"
      ? "create"
      : op === "r"
      ? "read"
      : op === "u"
      ? "update"
      : op === "d"
      ? "delete"
      : op;

  if (modPerms[shortOp] !== undefined) return Boolean(modPerms[shortOp]);
  if (modPerms[longOp] !== undefined) return Boolean(modPerms[longOp]);

  return false;
}

/**
 * Fetches the role permissions object for a specific company and role.
 */
export async function getRolePortalPerms(companyId, role) {
  if (!companyId || !role) return null;
  try {
    const [[row]] = await pool.query(
      `SELECT permissions FROM role_permissions WHERE company_id = ? AND role = ?`,
      [companyId, role]
    );
    if (!row || !row.permissions) return null;
    return typeof row.permissions === "string"
      ? JSON.parse(row.permissions)
      : row.permissions;
  } catch {
    return null;
  }
}

/**
 * Express route permission checker.
 */
export async function hasModulePerm(req, moduleKey, op) {
  const role = req.companyUser?.role;
  if (!role) return false;

  // Full admin roles always pass
  if (role === "admin" || role === "catalyst_admin") return true;

  const companyId = req.companyUser.companyId;
  const perms = await getRolePortalPerms(companyId, role);

  if (!perms) {
    // If standard role (supervisor/employee) with no custom role_permissions row, allow
    if (role === "supervisor" || role === "employee") return true;
    return op === "v";
  }

  return checkRolePerm(perms, moduleKey, op);
}

/**
 * Shared helper to check if a user can view all company-wide requests (HK Requests or Additional Requests).
 * Broad visibility is restricted to admins, soft managers, and users with explicit assignment permissions.
 */
export async function canViewAllModuleRequests(req, moduleKey) {
  const role = req.companyUser?.role;
  if (!role) return false;
  if (role === "admin" || role === "catalyst_admin") return true;

  const companyId = req.companyUser.companyId;

  // Check explicit module assignment permission
  if (moduleKey === "softrequests") {
    if (await hasModulePerm(req, "softrequests", "assign_cutoff_hk_web")) return true;
    if (await hasModulePerm(req, "softrequests", "assign_cutoff_hk_mobile")) return true;
  } else if (moduleKey === "additional-requests") {
    if (await hasModulePerm(req, "additional-requests", "assign_additional_request")) return true;
  }

  // Check capability flags from company_roles
  try {
    const [[row]] = await pool.query(
      `SELECT is_soft_manager, can_assign_raised_requests FROM company_roles
       WHERE company_id = ? AND role_key = ? AND is_active = TRUE LIMIT 1`,
      [companyId, role]
    );
    if (row && (row.is_soft_manager || row.can_assign_raised_requests)) {
      return true;
    }
  } catch {}

  return false;
}
