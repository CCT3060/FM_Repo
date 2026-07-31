/**
 * Additional Requests
 * Mounted at: /api/additional-requests
 *
 * GET    /services                  – List active services for company
 * POST   /services                  – Create a service (admin)
 * PUT    /services/:id              – Update a service (admin)
 * DELETE /services/:id              – Delete a service (admin)
 * POST   /requests                  – Raise a request (mobile)
 * GET    /requests/users            – Users available for assignment
 * GET    /requests/my               – Requester's own requests
 * GET    /requests/all              – Admin/manager: all requests
 * GET    /requests/:id              – Single request detail
 * PUT    /requests/:id/assign       – Assign to user
 * PUT    /requests/:id/cutoff       – Set cutoff + escalation user
 * PUT    /requests/:id/status       – Update status
 * DELETE /requests/:id              – Delete single
 * POST   /requests/bulk-delete      – Delete multiple
 * GET    /escalation-settings       – Get cutoff hours
 * PUT    /escalation-settings       – Set cutoff hours
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { sendFCMPush } from "../utils/firebaseService.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
async function createInAppNotification(companyId, userId, title, body) {
  try {
    await pool.query(
      `INSERT INTO notifications (company_id, user_id, title, body, type)
       VALUES (?, ?, ?, ?, 'additional_request')`,
      [companyId, userId, title, body]
    );
  } catch { /* non-critical */ }
}

async function sendExpoPush(token, title, body, data = {}) {
  if (!token || !token.startsWith("ExponentPushToken")) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, data }),
    });
  } catch { /* non-critical */ }
}

async function hasRaiseCapability(companyId, roleKey) {
  if (!roleKey) return false;
  if (roleKey === "admin") return true;
  const [[row]] = await pool.query(
    `SELECT can_raise_additional_request AS "canRaise"
       FROM company_roles WHERE company_id = ? AND role_key = ? AND is_active = TRUE LIMIT 1`,
    [companyId, roleKey]
  ).catch(() => [[null]]);
  return Boolean(row?.canRaise);
}

/* ── Background escalation (every 5 min) ────────────────────────────────────── */
async function runEscalationCheck() {
  try {
    const [openReqs] = await pool.query(
      `SELECT ar.id, ar.company_id AS "companyId", ar.raised_by_user_id AS "raisedByUserId",
              ar.raised_at AS "raisedAt", ar.escalation_level AS "escalationLevel",
              COALESCE(ares.cutoff_hours, 24) AS "cutoffHours"
       FROM additional_requests ar
       LEFT JOIN additional_request_escalation_settings ares ON ares.company_id = ar.company_id
       WHERE ar.status NOT IN ('closed','resolved') AND ar.escalation_level < 2`
    );
    for (const req of openReqs) {
      const ageHours = (Date.now() - new Date(req.raisedAt).getTime()) / 3_600_000;
      const cutoff = req.cutoffHours * (req.escalationLevel + 1);
      if (ageHours < cutoff) continue;
      const newLevel = req.escalationLevel + 1;
      await pool.query(
        `UPDATE additional_requests SET escalation_level = ?, escalated_at = NOW() WHERE id = ?`,
        [newLevel, req.id]
      );
      const capability = newLevel === 1 ? 'is_soft_manager' : null;
      let notifyUsers;
      if (capability) {
        [notifyUsers] = await pool.query(
          `SELECT cu.id FROM company_users cu JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role
           WHERE cu.company_id = ? AND cr.${capability} = TRUE AND cr.is_active = TRUE`,
          [req.companyId]
        );
      } else {
        [notifyUsers] = await pool.query(
          `SELECT cu.id FROM company_users cu JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role
           WHERE cu.company_id = ? AND cr.can_resolve_soft_issue = TRUE AND cr.is_active = TRUE`,
          [req.companyId]
        );
      }
      for (const u of notifyUsers || []) {
        await createInAppNotification(req.companyId, u.id, "Additional Request Escalated",
          `An additional request has been escalated to level ${newLevel}.`);
      }
    }
  } catch { /* non-critical */ }
}
setInterval(() => { void runEscalationCheck(); }, 5 * 60 * 1000);

/* ════════════════════════════════════════════════════════════════════════════
   SERVICES — configuration
   ════════════════════════════════════════════════════════════════════════════ */
const DEFAULT_SERVICES = ["Plumbing", "Electrical", "Civil", "Other"];

/* ── GET /services ── */
router.get("/services", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT id, name, is_active AS "isActive", sort_order AS "sortOrder"
       FROM additional_request_services
       WHERE company_id = ? AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      [companyId]
    );
    // Seed defaults if company has none
    if (rows.length === 0) {
      for (let i = 0; i < DEFAULT_SERVICES.length; i++) {
        await pool.query(
          `INSERT INTO additional_request_services (company_id, name, sort_order)
           VALUES (?, ?, ?) ON CONFLICT (company_id, name) DO NOTHING`,
          [companyId, DEFAULT_SERVICES[i], i]
        );
      }
      const [seeded] = await pool.query(
        `SELECT id, name, is_active AS "isActive", sort_order AS "sortOrder"
         FROM additional_request_services
         WHERE company_id = ? AND is_active = TRUE ORDER BY sort_order ASC, id ASC`,
        [companyId]
      );
      return res.json(seeded);
    }
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── POST /services ── */
router.post("/services", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Name required" });
    const companyId = cid(req);
    const [[maxOrder]] = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM additional_request_services WHERE company_id = ?`,
      [companyId]
    );
    const [rows] = await pool.query(
      `INSERT INTO additional_request_services (company_id, name, sort_order)
       VALUES (?, ?, ?) ON CONFLICT (company_id, name) DO UPDATE SET is_active = TRUE
       RETURNING id, name, is_active AS "isActive", sort_order AS "sortOrder"`,
      [companyId, name.trim(), maxOrder.next]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* ── PUT /services/:id ── */
router.put("/services/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const id = Number(req.params.id);
    const { name, sortOrder } = req.body;
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const fields = [], params = [];
    if (name !== undefined) { fields.push("name = ?"); params.push(name.trim()); }
    if (sortOrder !== undefined) { fields.push("sort_order = ?"); params.push(Number(sortOrder)); }
    if (!fields.length) return res.json({ ok: true });
    params.push(cid(req), id);
    await pool.query(
      `UPDATE additional_request_services SET ${fields.join(", ")} WHERE company_id = ? AND id = ?`,
      params
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── DELETE /services/:id ── */
router.delete("/services/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await pool.query(
      `UPDATE additional_request_services SET is_active = FALSE WHERE company_id = ? AND id = ?`,
      [cid(req), id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ════════════════════════════════════════════════════════════════════════════
   REQUESTS
   ════════════════════════════════════════════════════════════════════════════ */

const VALID_STATUSES = ["open", "acknowledged", "in_progress", "closed"];
const VALID_PRIORITIES = ["Critical", "High", "Moderate", "Low"];

/* ── POST /requests — Raise a request (mobile) ── */
router.post("/requests", async (req, res, next) => {
  try {
    const { serviceId, priority, remark } = req.body || {};
    const userId = req.companyUser.id;
    const companyId = cid(req);
    const roleKey = req.companyUser.role;

    if (!serviceId || !priority || !remark?.trim())
      return res.status(400).json({ message: "serviceId, priority, and remark are required" });
    if (!VALID_PRIORITIES.includes(priority))
      return res.status(400).json({ message: "Invalid priority" });

    const canRaise = await hasRaiseCapability(companyId, roleKey);
    if (!canRaise)
      return res.status(403).json({ message: "Your role cannot raise additional requests" });

    const [[svc]] = await pool.query(
      `SELECT id FROM additional_request_services WHERE id = ? AND company_id = ? AND is_active = TRUE`,
      [serviceId, companyId]
    );
    if (!svc) return res.status(404).json({ message: "Service not found" });

    const [rows] = await pool.query(
      `INSERT INTO additional_requests (company_id, service_id, priority, remark, raised_by_user_id, status)
       VALUES (?, ?, ?, ?, ?, 'open')
       RETURNING id`,
      [companyId, serviceId, priority, remark.trim(), userId]
    );
    const requestId = rows[0]?.id;

    // Notify all admins of the new request
    const [admins] = await pool.query(
      `SELECT id, push_token, fcm_token FROM company_users WHERE company_id = ? AND role = 'admin' AND status = 'Active'`,
      [companyId]
    ).catch(() => [[]]);
    const reqNum = `AR-${String(requestId).padStart(5, '0')}`;
    const [[svcRow]] = await pool.query(`SELECT name FROM additional_request_services WHERE id = ?`, [serviceId]).catch(() => [[null]]);
    const notifTitle = `Additional Request Raised (${reqNum})`;
    const notifBody  = `${svcRow?.name || 'Service'} · ${priority} — ${remark.trim().slice(0, 80)}`;
    for (const admin of admins) {
      await createInAppNotification(companyId, admin.id, notifTitle, notifBody);
      if (admin.push_token) await sendExpoPush(admin.push_token, notifTitle, notifBody, {});
      if (admin.fcm_token)  await sendFCMPush(admin.fcm_token, notifTitle, notifBody, {});
    }

    res.status(201).json({ ok: true, requestId });
  } catch (err) { next(err); }
});

/* ── GET /requests/users — Users available for assignment ── */
router.get("/requests/users", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT cu.id, cu.full_name AS "fullName", cu.role, cu.designation,
              COALESCE(cr.label, cu.role) AS "roleLabel"
       FROM company_users cu
       LEFT JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role AND cr.is_active = TRUE
       WHERE cu.company_id = ? AND cu.status = 'Active'
       ORDER BY cu.full_name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /requests/my — Requester's own requests ── */
router.get("/requests/my", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const companyId = cid(req);
    const status = req.query.status;
    const params = [companyId, userId];
    let whereExtra = "";
    if (status) { whereExtra = " AND ar.status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT ar.id,
              CONCAT('AR-', LPAD(CAST(ar.id AS VARCHAR), 5, '0')) AS "requestNumber",
              s.name                       AS "serviceName",
              ar.priority, ar.remark, ar.status,
              raiser.full_name             AS "raisedByName",
              ar.raised_at                 AS "raisedAt",
              ar.resolved_at               AS "resolvedAt",
              resolver.full_name           AS "resolvedByName"
       FROM additional_requests ar
       JOIN additional_request_services s ON s.id = ar.service_id
       LEFT JOIN company_users raiser ON raiser.id = ar.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ar.resolved_by_user_id
       WHERE ar.company_id = ? AND ar.raised_by_user_id = ?${whereExtra}
       ORDER BY ar.raised_at DESC LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /requests/all — Admin / manager ── */
router.get("/requests/all", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const roleKey = req.companyUser.role;
    const companyId = cid(req);
    const status = req.query.status;
    const qCid = req.query.companyId;

    let companyWhere, companyParams;
    if (qCid === "all") {
      companyWhere  = "ar.company_id IN (SELECT company_id FROM user_company_assignments WHERE user_id = ?)";
      companyParams = [userId];
    } else {
      companyWhere  = "ar.company_id = ?";
      companyParams = [companyId];
    }

    const conditions = [], extraParams = [];
    const isAdmin = roleKey === "admin";
    if (!isAdmin) {
      const [[roleRow]] = await pool.query(
        `SELECT is_soft_manager AS "isSoftManager" FROM company_roles
         WHERE company_id = ? AND role_key = ? AND is_active = TRUE LIMIT 1`,
        [companyId, roleKey]
      ).catch(() => [[null]]);
      if (!roleRow?.isSoftManager) {
        conditions.push("ar.assigned_to_user_id = ?");
        extraParams.push(userId);
      }
    }
    if (status) { conditions.push("ar.status = ?"); extraParams.push(status); }
    const date = req.query.date;
    if (date) { conditions.push("DATE(ar.raised_at) = ?"); extraParams.push(date); }
    const andWhere = conditions.length ? " AND " + conditions.join(" AND ") : "";

    const [rows] = await pool.query(
      `SELECT ar.id,
              CONCAT('AR-', LPAD(CAST(ar.id AS VARCHAR), 5, '0')) AS "requestNumber",
              s.name                           AS "serviceName",
              ar.service_id                    AS "serviceId",
              ar.priority, ar.remark, ar.status,
              ar.raised_at                     AS "raisedAt",
              raiser.full_name                 AS "raisedByName",
              ar.resolved_at                   AS "resolvedAt",
              resolver.full_name               AS "resolvedByName",
              ar.assigned_to_user_id           AS "assignedToId",
              assignee.full_name               AS "assignedToName",
              ar.cutoff_at                     AS "cutoffAt",
              ar.cutoff_escalation_user_id     AS "cutoffEscalateToId",
              escuser.full_name                AS "cutoffEscalateToName",
              ar.escalation_level              AS "escalationLevel",
              ar.escalated_at                  AS "escalatedAt",
              COALESCE(ares.cutoff_hours, 24)  AS "cutoffHours",
              co.company_name                  AS "companyName"
       FROM additional_requests ar
       JOIN additional_request_services s ON s.id = ar.service_id
       LEFT JOIN company_users raiser ON raiser.id = ar.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ar.resolved_by_user_id
       LEFT JOIN company_users assignee ON assignee.id = ar.assigned_to_user_id
       LEFT JOIN company_users escuser ON escuser.id = ar.cutoff_escalation_user_id
       LEFT JOIN additional_request_escalation_settings ares ON ares.company_id = ar.company_id
       LEFT JOIN companies co ON co.id = ar.company_id
       WHERE ${companyWhere}${andWhere}
       ORDER BY ar.raised_at DESC LIMIT 200`,
      [...companyParams, ...extraParams]
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /requests/:id — Single detail ── */
router.get("/requests/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const companyId = cid(req);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const [[row]] = await pool.query(
      `SELECT ar.id,
              CONCAT('AR-', LPAD(CAST(ar.id AS VARCHAR), 5, '0')) AS "requestNumber",
              s.name                           AS "serviceName",
              ar.service_id                    AS "serviceId",
              ar.priority, ar.remark, ar.status, ar.notes,
              ar.raised_at                     AS "raisedAt",
              raiser.full_name                 AS "raisedByName",
              ar.resolved_at                   AS "resolvedAt",
              resolver.full_name               AS "resolvedByName",
              ar.assigned_to_user_id           AS "assignedToId",
              assignee.full_name               AS "assignedToName",
              ar.cutoff_at                     AS "cutoffAt",
              ar.cutoff_escalation_user_id     AS "cutoffEscalateToId",
              escuser.full_name                AS "cutoffEscalateToName",
              ar.escalation_level              AS "escalationLevel",
              ar.escalated_at                  AS "escalatedAt"
       FROM additional_requests ar
       JOIN additional_request_services s ON s.id = ar.service_id
       LEFT JOIN company_users raiser ON raiser.id = ar.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ar.resolved_by_user_id
       LEFT JOIN company_users assignee ON assignee.id = ar.assigned_to_user_id
       LEFT JOIN company_users escuser ON escuser.id = ar.cutoff_escalation_user_id
       WHERE ar.id = ? AND ar.company_id = ?`,
      [id, companyId]
    );
    if (!row) return res.status(404).json({ message: "Request not found" });
    res.json(row);
  } catch (err) { next(err); }
});

/* ── PUT /requests/:id/assign ── */
router.put("/requests/:id/assign", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { assignedToUserId } = req.body;
    const companyId = cid(req);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const [[row]] = await pool.query(
      `SELECT id FROM additional_requests WHERE id = ? AND company_id = ?`, [id, companyId]
    );
    if (!row) return res.status(404).json({ message: "Request not found" });
    await pool.query(
      `UPDATE additional_requests SET assigned_to_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [assignedToUserId || null, id]
    );
    if (assignedToUserId) {
      const [[assignee]] = await pool.query(
        `SELECT full_name, push_token, fcm_token FROM company_users WHERE id = ? AND company_id = ?`,
        [assignedToUserId, companyId]
      ).catch(() => [[null]]);
      // fetch service name for notification body
      const [[arRow]] = await pool.query(
        `SELECT s.name AS "serviceName" FROM additional_requests ar
         JOIN additional_request_services s ON s.id = ar.service_id
         WHERE ar.id = ?`,
        [id]
      ).catch(() => [[null]]);
      const serviceName = arRow?.serviceName || 'an additional request';
      if (assignee) {
        const notifBody = `Additional request for ${serviceName} is assigned to you`;
        await createInAppNotification(companyId, assignedToUserId, "Additional Request Assigned", notifBody);
        if (assignee.push_token) await sendExpoPush(assignee.push_token, "Additional Request Assigned", notifBody, {});
        if (assignee.fcm_token)  await sendFCMPush(assignee.fcm_token, "Additional Request Assigned", notifBody, {});
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUT /requests/:id/cutoff ── */
router.put("/requests/:id/cutoff", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { cutoffAt, escalationUserId } = req.body;
    const companyId = cid(req);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const [[row]] = await pool.query(
      `SELECT id FROM additional_requests WHERE id = ? AND company_id = ?`, [id, companyId]
    );
    if (!row) return res.status(404).json({ message: "Request not found" });
    await pool.query(
      `UPDATE additional_requests SET cutoff_at = ?, cutoff_escalation_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [cutoffAt || null, escalationUserId || null, id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUT /requests/:id/status ── */
router.put("/requests/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const companyId = cid(req);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [[row]] = await pool.query(
      `SELECT id FROM additional_requests WHERE id = ? AND company_id = ?`, [id, companyId]
    );
    if (!row) return res.status(404).json({ message: "Request not found" });
    const isClosed = status === "closed";
    const resolvedFields = isClosed ? `, resolved_by_user_id = ${req.companyUser.id}, resolved_at = NOW()` : "";
    await pool.query(
      `UPDATE additional_requests SET status = ?${resolvedFields}, updated_at = NOW() WHERE id = ?`,
      [status, id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── DELETE /requests/:id ── */
router.delete("/requests/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const companyId = cid(req);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const [[row]] = await pool.query(
      `SELECT id FROM additional_requests WHERE id = ? AND company_id = ?`, [id, companyId]
    );
    if (!row) return res.status(404).json({ message: "Not found" });
    await pool.query(`DELETE FROM additional_requests WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── POST /requests/bulk-delete ── */
router.post("/requests/bulk-delete", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ message: "No ids provided" });
    const [rows] = await pool.query(
      `SELECT id FROM additional_requests WHERE id IN (${ids.map(() => "?").join(",")}) AND company_id = ?`,
      [...ids, companyId]
    );
    const validIds = rows.map((r) => r.id);
    if (!validIds.length) return res.status(404).json({ message: "No matching requests" });
    await pool.query(`DELETE FROM additional_requests WHERE id IN (${validIds.map(() => "?").join(",")})`, validIds);
    res.json({ ok: true, deleted: validIds.length });
  } catch (err) { next(err); }
});

/* ── Escalation settings ── */
router.get("/escalation-settings", async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT cutoff_hours AS "cutoffHours" FROM additional_request_escalation_settings WHERE company_id = ?`,
      [cid(req)]
    );
    res.json({ cutoffHours: row?.cutoffHours ?? 24 });
  } catch (err) { next(err); }
});

router.put("/escalation-settings", async (req, res, next) => {
  try {
    const { cutoffHours } = req.body;
    if (!Number.isFinite(Number(cutoffHours)) || Number(cutoffHours) < 1)
      return res.status(400).json({ message: "cutoffHours must be positive" });
    await pool.query(
      `INSERT INTO additional_request_escalation_settings (company_id, cutoff_hours, updated_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (company_id) DO UPDATE SET cutoff_hours = EXCLUDED.cutoff_hours, updated_at = NOW()`,
      [cid(req), Number(cutoffHours)]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
