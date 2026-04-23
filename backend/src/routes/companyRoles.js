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
                is_soft_manager          AS "isSoftManager"
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
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ message: "label is required" });
    }
    const key = req.body.roleKey ? slugify(req.body.roleKey) : slugify(label);
    const [exists] = await pool.query(
      `SELECT id FROM company_roles WHERE company_id = ? AND role_key = ?`,
      [cid(req), key]
    );
    if (exists.length) {
      return res.status(409).json({ message: "Role with that key already exists" });
    }
    const [[nextOrder]] = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next" FROM company_roles WHERE company_id = ?`,
      [cid(req)]
    );
    const order = Number.isFinite(sortOrder) ? sortOrder : nextOrder.next;
    const baseValues = [
      cid(req),
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
            can_raise_soft_issue, can_resolve_soft_issue, is_soft_manager)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...baseValues,
          canRaiseSoftIssue   ? 1 : 0,
          canResolveSoftIssue ? 1 : 0,
          isSoftManager       ? 1 : 0,
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

/* ── Update role ──────────────────────────────────────────────────────────── */
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const { label, parentRoleKey, color, bgColor, sortOrder,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager } = req.body || {};
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
      params.push(canRaiseSoftIssue ? 1 : 0);
    }
    if (canResolveSoftIssue !== undefined) {
      fields.push(`can_resolve_soft_issue = ?`);
      params.push(canResolveSoftIssue ? 1 : 0);
    }
    if (isSoftManager !== undefined) {
      fields.push(`is_soft_manager = ?`);
      params.push(isSoftManager ? 1 : 0);
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

/* ── Delete role (soft) ───────────────────────────────────────────────────── */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await pool.query(
      `UPDATE company_roles SET is_active = FALSE, updated_at = NOW()
        WHERE company_id = ? AND id = ?`,
      [cid(req), id]
    );
    res.json({ ok: true });
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

export default router;
