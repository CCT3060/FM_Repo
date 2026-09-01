/**
 * Company Custom Roles / Hierarchy
 * ──────────────────────────────────────────────────────────────────────────
 * Lets each company admin define their own roles + parent-child hierarchy.
 * Mounted at: /api/company-portal/roles
 *
 * Routes:
 *   GET    /                 – list this company's roles (ordered by sort_order)
 *   POST   /                 – create a role
 *   PUT    /:id              – update a role
 *   DELETE /:id              – delete a role
 *   PUT    /reorder          – bulk update sort_order via [{id, sortOrder}]
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || `role_${Date.now()}`;

// ── Auto-migration: replace full UNIQUE constraint with partial index ────────
// Root cause: UNIQUE (company_id, role_key) blocks re-creating a soft-deleted
// role. Fix: drop the table constraint, add a partial unique index that only
// applies when is_active = TRUE so soft-deleted rows don't occupy the slot.
(async () => {
  try {
    await pool.query(`
      ALTER TABLE company_roles
        DROP CONSTRAINT IF EXISTS company_roles_company_id_role_key_key
    `);
  } catch (err) { /* silent */ }
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS company_roles_active_unique
        ON company_roles (company_id, role_key)
        WHERE is_active = TRUE
    `);
  } catch (err) { /* silent */ }
  try {
    await pool.query(`
      ALTER TABLE company_roles ADD COLUMN IF NOT EXISTS can_mark_attendance BOOLEAN NOT NULL DEFAULT FALSE
    `);
  } catch (err) { /* silent */ }
  try {
    await pool.query(`
      ALTER TABLE company_roles ADD COLUMN IF NOT EXISTS can_assign_raised_requests BOOLEAN NOT NULL DEFAULT FALSE
    `);
  } catch (err) { /* silent */ }
})();

/* ── List roles ───────────────────────────────────────────────────────────── */
router.get("/", async (req, res, next) => {
  try {
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT id,
                company_id               AS "companyId",
                role_key                 AS "roleKey",
                label,
                parent_role_key          AS "parentRoleKey",
                sort_order               AS "sortOrder",
                color,
                bg_color                 AS "bgColor",
                is_active                AS "isActive",
                can_raise_soft_issue     AS "canRaiseSoftIssue",
                can_resolve_soft_issue   AS "canResolveSoftIssue",
                is_soft_manager          AS "isSoftManager",
                is_technical_supervisor  AS "isTechnicalSupervisor",
                is_technician            AS "isTechnician",
                COALESCE(can_raise_additional_request, FALSE) AS "canRaiseAdditionalRequest",
                COALESCE(can_mark_attendance, FALSE) AS "canMarkAttendance",
                COALESCE(can_assign_raised_requests, FALSE) AS "canAssignRaisedRequests"
           FROM company_roles
          WHERE company_id = ?
            AND is_active = TRUE
          ORDER BY sort_order ASC, id ASC`,
        [cid(req)]
      );
    } catch (selectErr) {
      // Capability columns not migrated yet — select without them
      if (String(selectErr?.message).includes("does not exist") || selectErr?.code === '42703' || String(selectErr?.message).includes("Unknown column")) {
        [rows] = await pool.query(
          `SELECT id,
                  company_id      AS "companyId",
                  role_key        AS "roleKey",
                  label,
                  parent_role_key AS "parentRoleKey",
                  sort_order      AS "sortOrder",
                  color,
                  bg_color        AS "bgColor",
                  is_active       AS "isActive"
             FROM company_roles
            WHERE company_id = ?
              AND is_active = TRUE
            ORDER BY sort_order ASC, id ASC`,
          [cid(req)]
        );
      } else {
        throw selectErr;
      }
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Create role ──────────────────────────────────────────────────────────── */
router.post("/", async (req, res, next) => {
  try {
    const { label, parentRoleKey, color, bgColor, sortOrder,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager,
            isTechnicalSupervisor, isTechnician, canRaiseAdditionalRequest,
            canMarkAttendance, canAssignRaisedRequests, companyId } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ message: "label is required" });
    }
    const key = req.body.roleKey ? slugify(req.body.roleKey) : slugify(label);

    // Determine target company: use provided companyId or JWT's company
    let targetCompanyId = companyId ? Number(companyId) : cid(req);
    
    // If companyId provided, verify user has access to that company
    if (companyId && Number(companyId) !== cid(req)) {
      const [[access]] = await pool.query(
        `SELECT 1 FROM user_company_assignments WHERE user_id = ? AND company_id = ?`,
        [req.companyUser.id, targetCompanyId]
      );
      if (!access) {
        return res.status(403).json({ message: "You don't have access to this company" });
      }
    }

    // Block duplicate active roles (ignore soft-deleted rows so they can be re-created)
    const [activeExists] = await pool.query(
      `SELECT id FROM company_roles WHERE company_id = ? AND role_key = ? AND is_active = TRUE`,
      [targetCompanyId, key]
    );
    if (activeExists.length) {
      return res.status(409).json({ message: "Role with that key already exists" });
    }

    const [[nextOrder]] = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next" FROM company_roles WHERE company_id = ?`,
      [targetCompanyId]
    );
    const order = Number.isFinite(sortOrder) ? sortOrder : nextOrder.next;

    const baseValues = [
      targetCompanyId,
      key,
      String(label).trim().slice(0, 120),
      parentRoleKey ? slugify(parentRoleKey) : null,
      order,
      color || "#2563eb",
      bgColor || "#dbeafe",
    ];
    // Try INSERT with soft-service capability columns (requires migration).
    // Fall back to INSERT without them if the columns don't exist yet.
    try {
      await pool.query(
        `INSERT INTO company_roles
           (company_id, role_key, label, parent_role_key, sort_order, color, bg_color,
            can_raise_soft_issue, can_resolve_soft_issue, is_soft_manager,
            is_technical_supervisor, is_technician, can_raise_additional_request,
            can_mark_attendance, can_assign_raised_requests)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...baseValues,
          Boolean(canRaiseSoftIssue),
          Boolean(canResolveSoftIssue),
          Boolean(isSoftManager),
          Boolean(isTechnicalSupervisor),
          Boolean(isTechnician),
          Boolean(canRaiseAdditionalRequest),
          Boolean(canMarkAttendance),
          Boolean(canAssignRaisedRequests),
        ]
      );
    } catch (insertErr) {
      // Column doesn't exist yet (migration pending) — insert without it
      if (String(insertErr?.message).includes("does not exist") || insertErr?.code === '42703' || String(insertErr?.message).includes("Unknown column")) {
        await pool.query(
          `INSERT INTO company_roles
             (company_id, role_key, label, parent_role_key, sort_order, color, bg_color)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          baseValues
        );
      } else {
        throw insertErr;
      }
    }
    res.status(201).json({ ok: true, roleKey: key });
  } catch (err) {
    next(err);
  }
});

/* ── Bulk reorder ─────────────────────────────────────────────────────────── */
router.put("/reorder/bulk", async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const it of items) {
      const id = Number(it?.id);
      const order = Number(it?.sortOrder);
      if (!Number.isFinite(id) || !Number.isFinite(order)) continue;
      await pool.query(
        `UPDATE company_roles SET sort_order = ?, updated_at = NOW()
          WHERE company_id = ? AND id = ?`,
        [order, cid(req), id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Role Permissions (CRUD per module) ─────────────────────────────────────

router.get("/role-permissions", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT role, permissions FROM role_permissions WHERE company_id = ?`,
      [cid(req)]
    );
    const result = {};
    rows.forEach((r) => {
      result[r.role] = typeof r.permissions === "string" ? JSON.parse(r.permissions) : r.permissions;
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.put("/role-permissions", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    for (const [role, perms] of Object.entries(req.body)) {
      const permJson = JSON.stringify(perms);
      await pool.query(
        `INSERT INTO role_permissions (company_id, role, permissions) VALUES (?, ?, ?)
         ON CONFLICT (company_id, role) DO UPDATE SET permissions = EXCLUDED.permissions`,
        [companyId, role, permJson]
      );

      // Dual-write sync to company_roles capability columns for seamless backward compatibility
      if (perms && typeof perms === "object") {
        const isSoftManager = perms._meta?.isManagerViewOnly;
        const canRaiseSoftIssue = perms.softrequests?.raise_hk_issues;
        const canResolveSoftIssue = perms.softrequests?.resolve_hk_issues;
        const canRaiseAdditional = perms['additional-requests']?.raise_additional_request;
        const canMarkAttendance = perms.attendance?.mark_mobile_attendance;
        const canAssignRequests = perms['additional-requests']?.assign_additional_request;
        const isTechSupervisor = perms.checklists?.assign_checklists || perms.workorders?.assign_work_orders;
        const isTechnician = perms.checklists?.fill_checklists || perms.workorders?.execute_work_orders;

        const syncUpdates = [];
        const syncParams = [];
        if (isSoftManager !== undefined) { syncUpdates.push("is_soft_manager = ?"); syncParams.push(Boolean(isSoftManager)); }
        if (canRaiseSoftIssue !== undefined) { syncUpdates.push("can_raise_soft_issue = ?"); syncParams.push(Boolean(canRaiseSoftIssue)); }
        if (canResolveSoftIssue !== undefined) { syncUpdates.push("can_resolve_soft_issue = ?"); syncParams.push(Boolean(canResolveSoftIssue)); }
        if (canRaiseAdditional !== undefined) { syncUpdates.push("can_raise_additional_request = ?"); syncParams.push(Boolean(canRaiseAdditional)); }
        if (canMarkAttendance !== undefined) { syncUpdates.push("can_mark_attendance = ?"); syncParams.push(Boolean(canMarkAttendance)); }
        if (canAssignRequests !== undefined) { syncUpdates.push("can_assign_raised_requests = ?"); syncParams.push(Boolean(canAssignRequests)); }
        if (isTechSupervisor !== undefined) { syncUpdates.push("is_technical_supervisor = ?"); syncParams.push(Boolean(isTechSupervisor)); }
        if (isTechnician !== undefined) { syncUpdates.push("is_technician = ?"); syncParams.push(Boolean(isTechnician)); }

        if (syncUpdates.length) {
          syncParams.push(companyId, role);
          await pool.query(
            `UPDATE company_roles SET ${syncUpdates.join(", ")} WHERE company_id = ? AND role_key = ?`,
            syncParams
          ).catch(() => {});
        }
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── Update role ──────────────────────────────────────────────────────────── */
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const { label, parentRoleKey, color, bgColor, sortOrder,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager,
            isTechnicalSupervisor, isTechnician, canRaiseAdditionalRequest,
            canMarkAttendance, canAssignRaisedRequests } = req.body || {};
    const fields = [];
    const params = [];
    if (label !== undefined) {
      fields.push(`label = ?`);
      params.push(String(label).trim().slice(0, 120));
    }
    if (parentRoleKey !== undefined) {
      fields.push(`parent_role_key = ?`);
      params.push(parentRoleKey ? slugify(parentRoleKey) : null);
    }
    if (color !== undefined) {
      fields.push(`color = ?`);
      params.push(color);
    }
    if (bgColor !== undefined) {
      fields.push(`bg_color = ?`);
      params.push(bgColor);
    }
    if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
      fields.push(`sort_order = ?`);
      params.push(sortOrder);
    }
    if (canRaiseSoftIssue !== undefined) {
      fields.push(`can_raise_soft_issue = ?`);
      params.push(Boolean(canRaiseSoftIssue));
    }
    if (canResolveSoftIssue !== undefined) {
      fields.push(`can_resolve_soft_issue = ?`);
      params.push(Boolean(canResolveSoftIssue));
    }
    if (isSoftManager !== undefined) {
      fields.push(`is_soft_manager = ?`);
      params.push(Boolean(isSoftManager));
    }
    if (isTechnicalSupervisor !== undefined) {
      fields.push(`is_technical_supervisor = ?`);
      params.push(Boolean(isTechnicalSupervisor));
    }
    if (isTechnician !== undefined) {
      fields.push(`is_technician = ?`);
      params.push(Boolean(isTechnician));
    }
    if (canRaiseAdditionalRequest !== undefined) {
      fields.push(`can_raise_additional_request = ?`);
      params.push(Boolean(canRaiseAdditionalRequest));
    }
    if (canMarkAttendance !== undefined) {
      fields.push(`can_mark_attendance = ?`);
      params.push(Boolean(canMarkAttendance));
    }
    if (canAssignRaisedRequests !== undefined) {
      fields.push(`can_assign_raised_requests = ?`);
      params.push(Boolean(canAssignRaisedRequests));
    }
    if (!fields.length) return res.json({ ok: true });
    fields.push(`updated_at = NOW()`);
    params.push(cid(req), id);
    await pool.query(
      `UPDATE company_roles SET ${fields.join(", ")} WHERE company_id = ? AND id = ?`,
      params
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ── Delete role ──────────────────────────────────────────────────────────── */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await pool.query(
      `DELETE FROM company_roles WHERE company_id = ? AND id = ?`,
      [cid(req), id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
