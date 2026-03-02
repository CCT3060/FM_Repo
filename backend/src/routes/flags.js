/**
 * flags.js
 * ──────────────────────────────────────────────────────────────────────────────
 * REST API for the Flag System.
 * All routes are protected by requireCompanyAuth.
 *
 * Role-based access:
 *   admin      → see/manage all flags in their company
 *   supervisor → see flags raised by their direct reports + flags they supervise
 *   employee   → see only flags they raised
 *
 * Endpoints:
 *   GET    /flags                   list flags (filtered by role)
 *   GET    /flags/summary           aggregate stats for dashboard
 *   GET    /flags/:id               single flag detail
 *   PUT    /flags/:id               update status / severity
 *   POST   /flags                   manually create a flag
 *   GET    /assets/:assetId/flags   all flags for one asset
 */

import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { createFlag, updateAssetHealth } from "../utils/flagsHelper.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

// ── Shared field list for flag queries ────────────────────────────────────────
const FLAG_FIELDS = `
  f.id,
  f.company_id       AS "companyId",
  f.asset_id         AS "assetId",
  a.asset_name       AS "assetName",
  a.building,
  a.floor,
  f.source,
  f.checklist_id     AS "checklistId",
  f.submission_id    AS "submissionId",
  f.question_id      AS "questionId",
  f.logsheet_entry_id AS "logsheetEntryId",
  f.severity,
  f.status,
  f.description,
  f.work_order_id    AS "workOrderId",
  f.escalated,
  f.escalated_at     AS "escalatedAt",
  f.resolved_at      AS "resolvedAt",
  f.created_at       AS "createdAt",
  f.updated_at       AS "updatedAt",
  rcu.full_name      AS "raisedByName",
  scu.full_name      AS "supervisorName"
`;

// ── Helper: build WHERE clause based on role ──────────────────────────────────
function buildRoleWhere(role, userId, companyId) {
  const conditions = [`f.company_id = ?`];
  const params     = [companyId];

  if (role === "supervisor") {
    // Flags this supervisor is responsible for OR flags raised by their team members
    conditions.push(`(f.supervisor_id = ? OR f.raised_by IN (
      SELECT id FROM company_users WHERE supervisor_id = ? AND company_id = ?
    ))`);
    params.push(userId, userId, companyId);
  } else if (role !== "admin") {
    // Regular employee: only their own flags
    conditions.push(`f.raised_by = ?`);
    params.push(userId);
  }
  // admin: no extra condition

  return { where: conditions.join(" AND "), params };
}

// ── GET /flags ────────────────────────────────────────────────────────────────
router.get(
  "/",
  validate([
    query("status").optional().isString(),
    query("severity").optional().isString(),
    query("assetId").optional().isInt({ min: 1 }),
    query("supervisorId").optional().isInt({ min: 1 }),
    query("source").optional().isIn(["checklist", "logsheet", "manual"]),
    query("limit").optional().isInt({ min: 1, max: 500 }),
    query("offset").optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, severity, assetId, supervisorId, source, limit = 100, offset = 0 } = req.query;
      const { role, id: userId } = req.companyUser;
      const companyId = cid(req);

      const { where, params } = buildRoleWhere(role, userId, companyId);
      const extraConditions = [];

      if (status)      { extraConditions.push("f.status = ?");        params.push(status); }
      if (severity)    { extraConditions.push("f.severity = ?");      params.push(severity); }
      if (assetId)     { extraConditions.push("f.asset_id = ?");      params.push(Number(assetId)); }
      if (supervisorId && role === "admin") {
        extraConditions.push("f.supervisor_id = ?"); params.push(Number(supervisorId));
      }
      if (source) { extraConditions.push("f.source = ?"); params.push(source); }

      const fullWhere = extraConditions.length
        ? `${where} AND ${extraConditions.join(" AND ")}`
        : where;

      const [flags] = await pool.query(
        `SELECT ${FLAG_FIELDS}
         FROM flags f
         LEFT JOIN assets       a   ON a.id = f.asset_id
         LEFT JOIN company_users rcu ON rcu.id = f.raised_by
         LEFT JOIN company_users scu ON scu.id = f.supervisor_id
         WHERE ${fullWhere}
         ORDER BY f.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
      );

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM flags f WHERE ${fullWhere}`,
        params
      );

      res.json({
        total: Number(countRow?.total ?? 0),
        limit: Number(limit),
        offset: Number(offset),
        data: flags,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /flags/summary ────────────────────────────────────────────────────────
// Dashboard aggregate stats (admin / supervisor)
router.get("/summary", async (req, res, next) => {
  try {
    const { role, id: userId } = req.companyUser;
    const companyId = cid(req);

    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const { where, params } = buildRoleWhere(role, userId, companyId);

    const [bySeverity] = await pool.query(
      `SELECT severity, COUNT(*) AS cnt
       FROM flags f
       WHERE ${where} AND f.status IN ('open', 'in_progress')
       GROUP BY severity`,
      params
    );

    const [byStatus] = await pool.query(
      `SELECT status, COUNT(*) AS cnt
       FROM flags f
       WHERE ${where}
       GROUP BY status`,
      params
    );

    const [bySupervisor] = await pool.query(
      `SELECT scu.full_name AS supervisorName, COUNT(*) AS cnt
       FROM flags f
       LEFT JOIN company_users scu ON scu.id = f.supervisor_id
       WHERE ${where} AND f.status IN ('open', 'in_progress')
       GROUP BY scu.full_name
       ORDER BY cnt DESC
       LIMIT 10`,
      params
    );

    const [byAssetType] = await pool.query(
      `SELECT a.asset_type AS assetType, COUNT(*) AS cnt
       FROM flags f
       JOIN assets a ON a.id = f.asset_id
       WHERE ${where} AND f.status IN ('open', 'in_progress')
       GROUP BY a.asset_type`,
      params
    );

    const [[totals]] = await pool.query(
      `SELECT
         COUNT(*)                                               AS total,
         COUNT(*) FILTER (WHERE f.status IN ('open', 'in_progress')) AS open,
         COUNT(*) FILTER (WHERE f.severity = 'critical'
                            AND f.status IN ('open', 'in_progress'))  AS critical,
         COUNT(*) FILTER (WHERE f.escalated = TRUE
                            AND f.status IN ('open', 'in_progress'))  AS escalated
       FROM flags f
       WHERE ${where}`,
      params
    );

    res.json({
      totals: {
        total:     Number(totals?.total     ?? 0),
        open:      Number(totals?.open      ?? 0),
        critical:  Number(totals?.critical  ?? 0),
        escalated: Number(totals?.escalated ?? 0),
      },
      bySeverity:   bySeverity.map((r) => ({ severity: r.severity,   count: Number(r.cnt) })),
      byStatus:     byStatus.map((r)   => ({ status: r.status,       count: Number(r.cnt) })),
      bySupervisor: bySupervisor.map((r) => ({ supervisor: r.supervisorName, count: Number(r.cnt) })),
      byAssetType:  byAssetType.map((r)  => ({ assetType: r.assetType,       count: Number(r.cnt) })),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /flags/:id ────────────────────────────────────────────────────────────
router.get(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { role, id: userId } = req.companyUser;
      const companyId = cid(req);

      const { where, params } = buildRoleWhere(role, userId, companyId);

      const [[flag]] = await pool.query(
        `SELECT ${FLAG_FIELDS}
         FROM flags f
         LEFT JOIN assets       a   ON a.id = f.asset_id
         LEFT JOIN company_users rcu ON rcu.id = f.raised_by
         LEFT JOIN company_users scu ON scu.id = f.supervisor_id
         WHERE f.id = ? AND ${where}`,
        [Number(id), ...params]
      );

      if (!flag) return res.status(404).json({ message: "Flag not found" });

      // Fetch flag history
      const [history] = await pool.query(
        `SELECT fh.id, fh.old_status AS "oldStatus", fh.new_status AS "newStatus",
                fh.remark, fh.changed_at AS "changedAt",
                cu.full_name AS "updatedBy"
         FROM flag_history fh
         LEFT JOIN company_users cu ON cu.id = fh.updated_by
         WHERE fh.flag_id = ?
         ORDER BY fh.changed_at ASC`,
        [Number(id)]
      );

      res.json({ ...flag, history });
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /flags/:id ────────────────────────────────────────────────────────────
router.put(
  "/:id",
  validate([
    param("id").isInt({ min: 1 }),
    body("status").optional().isIn(["open", "in_progress", "resolved", "closed"]),
    body("severity").optional().isIn(["low", "medium", "high", "critical"]),
    body("remark").optional().isString().trim(),
    body("supervisorId").optional().isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const { id } = req.params;
      const { status, severity, remark, supervisorId } = req.body;
      const { role, id: userId } = req.companyUser;
      const companyId = cid(req);

      await conn.beginTransaction();

      // Fetch the flag and verify access
      const [[existing]] = await conn.query(
        `SELECT f.id, f.status, f.severity, f.asset_id AS "assetId"
         FROM flags f
         WHERE f.id = ? AND f.company_id = ?`,
        [Number(id), companyId]
      );
      if (!existing) {
        await conn.rollback();
        return res.status(404).json({ message: "Flag not found" });
      }

      // Employees can only update flags they raised
      if (role !== "admin" && role !== "supervisor") {
        const [[own]] = await conn.query(
          "SELECT id FROM flags WHERE id = ? AND raised_by = ?",
          [id, userId]
        );
        if (!own) {
          await conn.rollback();
          return res.status(403).json({ message: "Not authorised to update this flag" });
        }
      }

      const newStatus   = status   || existing.status;
      const newSeverity = severity || existing.severity;

      const setClauses  = ["severity = ?", "updated_at = NOW()"];
      const setParams   = [newSeverity];

      if (status) {
        setClauses.push("status = ?");
        setParams.push(status);
        if (status === "resolved" || status === "closed") {
          setClauses.push("resolved_at = NOW()");
        }
      }
      if (supervisorId && (role === "admin" || role === "supervisor")) {
        setClauses.push("supervisor_id = ?");
        setParams.push(Number(supervisorId));
      }

      await conn.query(
        `UPDATE flags SET ${setClauses.join(", ")} WHERE id = ?`,
        [...setParams, Number(id)]
      );

      // Record history entry if status changed
      if (status && status !== existing.status) {
        await conn.query(
          `INSERT INTO flag_history (flag_id, old_status, new_status, updated_by, remark)
           VALUES (?, ?, ?, ?, ?)`,
          [Number(id), existing.status, newStatus, userId, remark || null]
        );
      }

      // Recalculate asset health after status change
      if (status) {
        await updateAssetHealth(existing.assetId, conn);
      }

      await conn.commit();

      const [[updated]] = await pool.query(
        `SELECT ${FLAG_FIELDS}
         FROM flags f
         LEFT JOIN assets       a   ON a.id = f.asset_id
         LEFT JOIN company_users rcu ON rcu.id = f.raised_by
         LEFT JOIN company_users scu ON scu.id = f.supervisor_id
         WHERE f.id = ?`,
        [Number(id)]
      );

      res.json(updated);
    } catch (err) {
      await conn.rollback().catch(() => {});
      next(err);
    } finally {
      conn.release();
    }
  }
);

// ── POST /flags (manual creation) ────────────────────────────────────────────
router.post(
  "/",
  validate([
    body("assetId").isInt({ min: 1 }).withMessage("assetId is required"),
    body("description").trim().notEmpty().withMessage("description is required"),
    body("severity").optional().isIn(["low", "medium", "high", "critical"]),
    body("source").optional().isIn(["checklist", "logsheet", "manual"]),
    body("supervisorId").optional().isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      const { assetId, description, severity = "medium", source = "manual", supervisorId } = req.body;
      const { role, id: userId } = req.companyUser;
      const companyId = cid(req);

      // Verify asset belongs to the company
      const [[asset]] = await pool.query(
        "SELECT id, asset_name, building, floor, room FROM assets WHERE id = ? AND company_id = ?",
        [assetId, companyId]
      );
      if (!asset) return res.status(404).json({ message: "Asset not found" });

      // Only admin/supervisor may manually create flags
      if (role !== "admin" && role !== "supervisor") {
        return res.status(403).json({ message: "Only admin or supervisor can create flags manually" });
      }

      const location = [asset.building, asset.floor, asset.room].filter(Boolean).join(", ");

      const flagId = await createFlag(
        {
          source,
          companyId,
          assetId: asset.id,
          raisedBy: userId,
          supervisorId: supervisorId || null,
          description,
          severity,
        },
        { assetName: asset.asset_name, location }
      );

      res.status(201).json({ flagId, message: "Flag created" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /assets/:assetId/flags ─────────────────────────────────────────────────
router.get(
  "/assets/:assetId/flags",
  validate([
    param("assetId").isInt({ min: 1 }),
    query("status").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 200 }),
  ]),
  async (req, res, next) => {
    try {
      const { assetId } = req.params;
      const { status, limit = 50 } = req.query;
      const { role, id: userId } = req.companyUser;
      const companyId = cid(req);

      // Verify asset belongs to company
      const [[asset]] = await pool.query(
        `SELECT id, asset_name, open_flags_count AS "openFlagsCount",
                health_status AS "healthStatus"
         FROM assets WHERE id = ? AND company_id = ?`,
        [Number(assetId), companyId]
      );
      if (!asset) return res.status(404).json({ message: "Asset not found" });

      // Build access condition
      const { where: roleWhere, params: roleParams } = buildRoleWhere(role, userId, companyId);
      const conditions = [roleWhere, "f.asset_id = ?"];
      const params     = [...roleParams, Number(assetId)];

      if (status) { conditions.push("f.status = ?"); params.push(status); }

      const [flags] = await pool.query(
        `SELECT ${FLAG_FIELDS}
         FROM flags f
         LEFT JOIN assets       a   ON a.id = f.asset_id
         LEFT JOIN company_users rcu ON rcu.id = f.raised_by
         LEFT JOIN company_users scu ON scu.id = f.supervisor_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY f.created_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
      );

      res.json({ asset, flags });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /flags/dashboard – aggregate stats for the flag dashboard ─────────────
router.get("/dashboard", async (req, res, next) => {
  try {
    const companyId = cid(req);

    const [
      [todayRows],
      [openRows],
      [criticalRows],
      [repeatRows],
      [topAssetRows],
      [mttrRows],
      [riskRows],
      [recentRows],
    ] = await Promise.all([
      // Total flags today
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags WHERE company_id = ? AND created_at >= CURRENT_DATE`,
        [companyId]
      ),
      // Open flags by severity
      pool.query(
        `SELECT severity, COUNT(*) AS cnt FROM flags
         WHERE company_id = ? AND status IN ('open','in_progress')
         GROUP BY severity`,
        [companyId]
      ),
      // Critical open flags
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags
         WHERE company_id = ? AND severity = 'critical' AND status IN ('open','in_progress')`,
        [companyId]
      ),
      // Repeat violations – questions flagged 3+ times in 30 days
      pool.query(
        `SELECT question_id AS questionId, COUNT(*) AS cnt,
                MIN(description) AS description,
                a.asset_name AS assetName
         FROM flags f
         LEFT JOIN assets a ON a.id = f.asset_id
         WHERE f.company_id = ? AND f.question_id IS NOT NULL
           AND f.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY f.question_id, a.asset_name
         HAVING COUNT(*) >= 3
         ORDER BY cnt DESC
         LIMIT 10`,
        [companyId]
      ),
      // Asset with most flags (last 30 days)
      pool.query(
        `SELECT f.asset_id AS assetId, a.asset_name AS assetName,
                a.health_status AS healthStatus, a.risk_level AS riskLevel,
                COUNT(*) AS flagCount
         FROM flags f
         JOIN assets a ON a.id = f.asset_id
         WHERE f.company_id = ? AND f.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY f.asset_id, a.asset_name, a.health_status, a.risk_level
         ORDER BY flagCount DESC
         LIMIT 5`,
        [companyId]
      ),
      // MTTR – mean hours to resolve (resolved flags)
      pool.query(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600), 1) AS mttrHours
         FROM flags
         WHERE company_id = ? AND status = 'resolved' AND resolved_at IS NOT NULL
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [companyId]
      ),
      // Asset risk levels
      pool.query(
        `SELECT risk_level AS riskLevel, COUNT(*) AS cnt
         FROM assets a
         JOIN companies c ON c.id = a.company_id
         WHERE a.company_id = ?
         GROUP BY risk_level`,
        [companyId]
      ),
      // Most recent 10 open flags
      pool.query(
        `SELECT f.id, f.severity, f.status, f.description,
                f.entered_value AS enteredValue, f.expected_rule AS expectedRule,
                f.repeat_count AS repeatCount,
                f.created_at AS createdAt,
                a.asset_name AS assetName,
                rcu.full_name AS raisedByName
         FROM flags f
         LEFT JOIN assets a ON a.id = f.asset_id
         LEFT JOIN company_users rcu ON rcu.id = f.raised_by
         WHERE f.company_id = ? AND f.status IN ('open','in_progress')
         ORDER BY f.severity DESC, f.created_at DESC
         LIMIT 10`,
        [companyId]
      ),
    ]);

    // Aggregate open counts by severity
    const openBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of openRows) openBySeverity[r.severity] = Number(r.cnt);
    const totalOpen = Object.values(openBySeverity).reduce((s, v) => s + v, 0);

    res.json({
      today:        Number(todayRows[0]?.cnt ?? 0),
      totalOpen,
      openBySeverity,
      criticalOpen: Number(criticalRows[0]?.cnt ?? 0),
      mttrHours:    Number(mttrRows[0]?.mttrHours ?? 0) || null,
      topAssets:    topAssetRows,
      repeatViolations: repeatRows,
      assetRiskLevels:  riskRows,
      recentFlags:      recentRows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
