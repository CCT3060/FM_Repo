/**
 * Soft Service Requests
 * Mounted at: /api/soft-service
 *
 * POST  /requests                  – Raise a request
 * GET   /requests/asset/:assetId   – Open requests for an asset (with before answers)
 * GET   /requests/my               – Client supervisor's own requests
 * GET   /requests/all              – Manager: all requests (with filters)
 * PUT   /requests/:id/resolve      – Resolve a request
 * PUT   /escalation-settings       – Set company escalation cutoff (hours)
 * GET   /escalation-settings       – Get company escalation cutoff
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { sendFCMPush } from "../utils/firebaseService.js";
import { hasModulePerm, canViewAllModuleRequests } from "../utils/permissions.js";

const router = Router();
router.use(requireCompanyAuth);

/* ── DB migration: add escalation columns if missing ─────────────────────── */
(async () => {
  try {
    await pool.query(`ALTER TABLE soft_service_requests
      ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ DEFAULT NULL`);
    await pool.query(`ALTER TABLE soft_service_requests
      ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE soft_service_requests
      ADD COLUMN IF NOT EXISTS assigned_to_user_id BIGINT DEFAULT NULL`);
    await pool.query(`ALTER TABLE soft_service_requests
      ADD COLUMN IF NOT EXISTS cutoff_at TIMESTAMPTZ DEFAULT NULL`);
    await pool.query(`ALTER TABLE soft_service_requests
      ADD COLUMN IF NOT EXISTS cutoff_escalation_user_id BIGINT DEFAULT NULL`);
    await pool.query(`ALTER TABLE soft_service_requests
      ADD COLUMN IF NOT EXISTS location_id BIGINT DEFAULT NULL`);
    // Allow asset_id to be NULL (needed for location-based requests)
    await pool.query(`ALTER TABLE soft_service_requests
      ALTER COLUMN asset_id DROP NOT NULL`).catch(() => {});
    // Per-company escalation cutoff table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS soft_escalation_settings (
        company_id       INTEGER PRIMARY KEY,
        cutoff_hours     INTEGER NOT NULL DEFAULT 24,
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.warn('[soft-service] migration warning:', e.message);
  }
})();
// Per-request cutoff notification tracker
pool.query(`ALTER TABLE soft_service_requests ADD COLUMN IF NOT EXISTS cutoff_notified_at TIMESTAMPTZ DEFAULT NULL`).catch(() => {});

/* ── Background escalation checker (runs every 5 minutes) ───────────────── */
async function runEscalationCheck() {
  try {
    // Load all companies' open unresolved requests
    const [openRequests] = await pool.query(
      `SELECT ssr.id, ssr.company_id AS "companyId", ssr.asset_id AS "assetId",
              ssr.raised_by_user_id AS "raisedByUserId",
              ssr.raised_at AS "raisedAt", ssr.escalation_level AS "escalationLevel",
              COALESCE(ses.cutoff_hours, 24) AS "cutoffHours",
              COALESCE(a.asset_name, loc.name, 'an item') AS "assetName"
       FROM soft_service_requests ssr
       LEFT JOIN soft_escalation_settings ses ON ses.company_id = ssr.company_id
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN locations loc ON loc.id = ssr.location_id
       WHERE ssr.status = 'open'
         AND ssr.escalation_level < 2`  /* max 2 escalations */
    );

    for (const req of openRequests) {
      const ageHours = (Date.now() - new Date(req.raisedAt).getTime()) / 3_600_000;
      const cutoff = req.cutoffHours * (req.escalationLevel + 1); // each level adds one cutoff period
      if (ageHours < cutoff) continue;

      const newLevel = req.escalationLevel + 1;

      // Update escalation level and timestamp
      await pool.query(
        `UPDATE soft_service_requests
           SET escalation_level = ?, escalated_at = NOW()
         WHERE id = ?`,
        [newLevel, req.id]
      );

      // Notify soft managers (level 1) or admins (level 2)
      const targetCapability = newLevel === 1 ? 'is_soft_manager' : null;
      let notifyUsers;
      if (targetCapability) {
        [notifyUsers] = await pool.query(
          `SELECT cu.id, cu.full_name, cu.push_token, cu.fcm_token
           FROM company_users cu
           JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role
           WHERE cu.company_id = ?
             AND cr.${targetCapability} = TRUE
             AND cr.is_active = TRUE`,
          [req.companyId]
        );
      } else {
        // Level 2: notify anyone who can resolve
        [notifyUsers] = await pool.query(
          `SELECT cu.id, cu.full_name, cu.push_token, cu.fcm_token
           FROM company_users cu
           JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role
           WHERE cu.company_id = ?
             AND cr.can_resolve_soft_issue = TRUE
             AND cr.is_active = TRUE`,
          [req.companyId]
        );
      }

      const ageLabel = ageHours < 48
        ? `${Math.round(ageHours)}h`
        : `${Math.round(ageHours / 24)}d`;

      for (const u of notifyUsers) {
        await createInAppNotification(
          req.companyId, u.id,
          `⚠️ Escalated Request (Level ${newLevel})`,
          `Request for ${req.assetName} has been open for ${ageLabel}. Immediate attention required.`
        );
        if (u.push_token) {
          await sendExpoPush(
            u.push_token,
            `⚠️ Escalated Request (Level ${newLevel})`,
            `Request for ${req.assetName} open ${ageLabel}. Needs resolution.`,
            { screen: '/(tabs)/soft-requests', requestId: req.id }
          );
        }
        if (u.fcm_token) {
          await sendFCMPush(
            u.fcm_token,
            `⚠️ Escalated Request (Level ${newLevel})`,
            `Request for ${req.assetName} open ${ageLabel}. Needs resolution.`,
            { screen: '/(tabs)/soft-requests', requestId: String(req.id) }
          );
        }
      }

      console.log(`[escalation] Request ${req.id} escalated to level ${newLevel} after ${ageLabel}`);
    }

    // Per-request cutoff_at — notify specific escalation user once when cutoff passes
    const [cutoffReqs] = await pool.query(
      `SELECT ssr.id, ssr.company_id AS "companyId",
              ssr.cutoff_escalation_user_id AS "escalationUserId",
              COALESCE(a.asset_name, loc.name, 'an item') AS "assetName",
              cu.push_token AS "pushToken", cu.fcm_token AS "fcmToken"
       FROM soft_service_requests ssr
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN locations loc ON loc.id = ssr.location_id
       LEFT JOIN company_users cu ON cu.id = ssr.cutoff_escalation_user_id
       WHERE ssr.status NOT IN ('resolved','closed')
         AND ssr.cutoff_at IS NOT NULL AND ssr.cutoff_at < NOW()
         AND ssr.cutoff_escalation_user_id IS NOT NULL
         AND ssr.cutoff_notified_at IS NULL`
    );
    for (const req of cutoffReqs) {
      await pool.query(`UPDATE soft_service_requests SET cutoff_notified_at = NOW() WHERE id = ?`, [req.id]);
      const title = '⏰ HK Request Overdue';
      const body  = `Cutoff exceeded for HK request: ${req.assetName}`;
      await createInAppNotification(req.companyId, req.escalationUserId, title, body);
      if (req.pushToken) {
        await sendExpoPush(req.pushToken, title, body, { screen: '/(tabs)/soft-requests', requestId: String(req.id) });
      }
      if (req.fcmToken) {
        await sendFCMPush(req.fcmToken, title, body, { screen: '/(tabs)/soft-requests', requestId: String(req.id) });
      }
    }
  } catch (e) {
    console.error('[escalation] check failed:', e.message);
  }
}

// Run every 5 minutes
setInterval(runEscalationCheck, 5 * 60 * 1000);
// Also run once after 30s of startup
setTimeout(runEscalationCheck, 30_000);

/* ── Helper: send Expo push notification ─────────────────────────────────── */
async function sendExpoPush(pushToken, title, body, data = {}) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data,
        sound: "default",
        priority: "high",
        channelId: data?.channelId || "default",
      }),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
      if (ticket?.status === "error") {
        console.error("[ExpoPush/softRequests] Delivery error:", ticket.message, JSON.stringify(ticket.details));
      }
    } else {
      console.error("[ExpoPush/softRequests] HTTP error:", res.status);
    }
  } catch (err) {
    console.error("[ExpoPush/softRequests] Fetch failed:", err.message);
  }
}

/* ── Helper: in-app notification ─────────────────────────────────────────── */
async function createInAppNotification(companyId, recipientId, title, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (company_id, recipient_id, type, title, message, is_read, created_at)
       VALUES (?, ?, 'soft_request', ?, ?, FALSE, NOW())`,
      [companyId, recipientId, title, message]
    );
  } catch {
    // Non-fatal
  }
}

/* ── Helper: check role capability (permissive if no role configured yet) ── */
async function hasCapability(companyId, roleKey, column) {
  if (!roleKey) return true; // no role set → allow during setup
  try {
    const [[row]] = await pool.query(
      `SELECT ${column} AS cap FROM company_roles
        WHERE company_id = ? AND role_key = ? AND is_active = TRUE LIMIT 1`,
      [companyId, roleKey]
    );
    // If role row exists and explicitly disables → deny
    // If no row found (role not configured) → allow transitionally
    if (row && row.cap === false) return false;
    return true;
  } catch {
    return true; // DB error → allow
  }
}

async function hasCapabilityStrict(companyId, roleKey, column) {
  if (!roleKey) return false;
  if (roleKey === 'admin') return true;
  try {
    const [[row]] = await pool.query(
      `SELECT ${column} AS cap FROM company_roles
        WHERE company_id = ? AND role_key = ? AND is_active = TRUE LIMIT 1`,
      [companyId, roleKey]
    );
    return !!(row && row.cap);
  } catch {
    return false;
  }
}

/* ── POST /requests ── Raise a soft-service request ─────────────────────── */
router.post("/requests", async (req, res, next) => {
  try {
    const { assetId, locationId, templateId, templateType = "checklist", submissionId, checklistSubmissionId } = req.body || {};
    const resolvedSubmissionId = submissionId ?? checklistSubmissionId ?? null;
    const userId    = req.companyUser.id;
    const companyId = req.companyUser.companyId;
    const roleKey   = req.companyUser.role;

    if ((assetId == null && locationId == null) || templateId == null) {
      return res.status(400).json({ message: "Either assetId or locationId, and templateId are required" });
    }

    // Permission check (pass-through if role not configured yet)
    const canRaise = await hasCapability(companyId, roleKey, "can_raise_soft_issue");
    if (!canRaise) {
      return res.status(403).json({ message: "Your role cannot raise soft-service requests" });
    }

    let assetLabel = "an item";

    if (assetId != null) {
      // Verify asset belongs to this company
      const [[asset]] = await pool.query(
        `SELECT a.id, a.asset_name FROM assets a WHERE a.id = ? AND a.company_id = ?`,
        [assetId, companyId]
      );
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      assetLabel = asset.asset_name || "an asset";
    } else {
      // Verify location belongs to this company
      const [[location]] = await pool.query(
        `SELECT l.id, l.name FROM locations l WHERE l.id = ? AND l.company_id = ?`,
        [locationId, companyId]
      );
      if (!location) return res.status(404).json({ message: "Location not found" });
      assetLabel = location.name || "a location";
    }

    // Insert the request
    const [rows] = await pool.query(
      `INSERT INTO soft_service_requests
         (company_id, asset_id, location_id, template_id, template_type, raise_submission_id, raised_by_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
       RETURNING id`,
      [companyId, assetId ?? null, locationId ?? null, templateId, templateType, resolvedSubmissionId, userId]
    );

    const requestId = rows[0]?.id ?? rows.insertId;

    // Notification is sent only when the request is assigned to a specific resolver
    // (handled by PUT /requests/:id/assign). No broadcast to all resolvers on creation.

    res.status(201).json({ ok: true, requestId });
  } catch (err) {
    next(err);
  }
});

/* ── GET /requests/asset/:assetId ── Pending requests for an asset ────────── */
router.get("/requests/asset/:assetId", async (req, res, next) => {
  try {
    const assetId   = Number(req.params.assetId);
    const companyId = req.companyUser.companyId;

    if (!Number.isFinite(assetId)) return res.status(400).json({ message: "Invalid assetId" });

    const [rows] = await pool.query(
      `SELECT
         ssr.id,
         ssr.asset_id                  AS "assetId",
         a.asset_name                  AS "assetName",
         ssr.template_id               AS "templateId",
         ssr.template_type             AS "templateType",
         ssr.raise_submission_id       AS "raiseSubmissionId",
         ssr.raised_by_user_id         AS "raisedByUserId",
         cu.full_name                  AS "raisedByName",
         ssr.raised_at                 AS "raisedAt",
         ssr.status,
         COALESCE(
           (SELECT ct.template_name FROM checklist_templates ct WHERE ct.id = ssr.template_id AND ssr.template_type = 'checklist' LIMIT 1),
           (SELECT lt.template_name FROM logsheet_templates lt WHERE lt.id = ssr.template_id AND ssr.template_type = 'logsheet' LIMIT 1)
         )                             AS "templateName",
         (
           SELECT json_agg(
             json_build_object(
               'questionId',    csa.question_id,
               'questionText',  csa.question_text,
               'inputType',     csa.input_type,
               'answer',        CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                     THEN csa.answer_json->'value'->>'value'
                                     ELSE csa.answer_json->>'value'
                                END,
               'photoUrl',      COALESCE(
                                  CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                       THEN csa.answer_json->'value'->>'photoUrl'
                                       ELSE NULL
                                  END,
                                  csa.answer_json->>'photoUrl'
                                ),
               'optionSelected', csa.option_selected
             ) ORDER BY csa.id
           )
           FROM checklist_submission_answers csa
           WHERE csa.submission_id = ssr.raise_submission_id
         )                             AS "beforeAnswers",
         cs.submitted_at               AS "beforeSubmittedAt"
       FROM soft_service_requests ssr
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN company_users cu ON cu.id = ssr.raised_by_user_id
       LEFT JOIN checklist_submissions cs ON cs.id = ssr.raise_submission_id
       WHERE ssr.company_id = ? AND ssr.asset_id = ? AND ssr.status = 'open'
       ORDER BY ssr.raised_at DESC`,
      [companyId, assetId]
    );

    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── GET /requests/my ── Client supervisor's own requests ────────────────── */
router.get("/requests/my", async (req, res, next) => {
  try {
    const userId    = req.companyUser.id;
    const companyId = req.companyUser.companyId;
    const status    = req.query.status;

    const params = [companyId, userId];
    let whereExtra = "";
    if (status) { whereExtra = " AND ssr.status = ?"; params.push(status); }

    const [rows] = await pool.query(
      `SELECT
         ssr.id,
         ssr.asset_id              AS "assetId",
         a.asset_name              AS "assetName",
         a.asset_unique_id         AS "assetUniqueId",
         ssr.location_id           AS "locationId",
         loc.name                  AS "locationName",
         ssr.template_id           AS "templateId",
         ssr.template_type         AS "templateType",
         COALESCE(ct.template_name, lt.template_name) AS "templateName",
         ssr.status,
         raiser.full_name          AS "raisedByName",
         ssr.raised_at             AS "raisedAt",
         ssr.resolved_at           AS "resolvedAt",
         resolver.full_name        AS "resolvedByName"
       FROM soft_service_requests ssr
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN locations loc ON loc.id = ssr.location_id
       LEFT JOIN checklist_templates ct ON ssr.template_type = 'checklist' AND ct.id = ssr.template_id
       LEFT JOIN logsheet_templates lt ON ssr.template_type = 'logsheet' AND lt.id = ssr.template_id
       LEFT JOIN company_users raiser ON raiser.id = ssr.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ssr.resolved_by_user_id
       WHERE ssr.company_id = ? AND ssr.raised_by_user_id = ?${whereExtra}
       ORDER BY ssr.raised_at DESC
       LIMIT 100`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── GET /requests/escalation-users — All active company employees (for escalation dropdown) ── */
router.get("/requests/escalation-users", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const [rows] = await pool.query(
      `SELECT cu.id, cu.full_name AS "fullName", cu.designation,
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

/* ── GET /requests/users ── List company users for assignment ────────────── */
router.get("/requests/users", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    // Only return users whose custom role has can_resolve_soft_issue = TRUE.
    // This maps exactly to "Catalyst Supervisor" (or any role the admin marked
    // as able to resolve soft requests in Manage Roles).
    const [rows] = await pool.query(
      `SELECT cu.id,
              cu.full_name    AS "fullName",
              cu.role,
              cu.designation,
              COALESCE(cr.label, cu.role) AS "roleLabel"
       FROM company_users cu
       JOIN company_roles cr
         ON cr.company_id = cu.company_id
        AND cr.role_key   = cu.role
        AND cr.is_active  = TRUE
        AND cr.can_resolve_soft_issue = TRUE
       WHERE cu.company_id = ? AND cu.status = 'Active'
       ORDER BY cu.full_name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /requests/all ── Manager sees all requests ─────────────────────── */
router.get("/requests/all", async (req, res, next) => {
  try {
    if (!(await hasModulePerm(req, "softrequests", "v"))) {
      return res.status(403).json({ message: "Unauthorized: View permission denied for Soft Requests" });
    }
    const userId    = req.companyUser.id;
    const roleKey   = req.companyUser.role;
    const companyId = req.companyUser.companyId;
    const status    = req.query.status;
    const assetId   = req.query.assetId;
    const qCid      = req.query.companyId;

    // Determine company scope (single company or all UCA companies)
    let companyWhere, companyParams;
    if (qCid === "all") {
      companyWhere  = "ssr.company_id IN (SELECT company_id FROM user_company_assignments WHERE user_id = ? UNION SELECT ?::integer)";
      companyParams = [userId, companyId];
    } else {
      companyWhere  = "ssr.company_id = ?";
      companyParams = [qCid ? Number(qCid) : companyId];
    }

    const conditions = [];
    const extraParams = [];
    const isSoftManagerRole = await canViewAllModuleRequests(req, "softrequests");

    if (!isSoftManagerRole) {
      conditions.push("(ssr.assigned_to_user_id = ? OR ssr.raised_by_user_id = ?)");
      extraParams.push(userId, userId);
    }

    if (status)  { conditions.push("ssr.status = ?");   extraParams.push(status); }
    if (assetId) { conditions.push("ssr.asset_id = ?"); extraParams.push(Number(assetId)); }

    const andWhere = conditions.length ? " AND " + conditions.join(" AND ") : "";

    const [rows] = await pool.query(
      `SELECT
         ssr.id,
         ssr.asset_id              AS "assetId",
         a.asset_name              AS "assetName",
         a.asset_unique_id         AS "assetUniqueId",
         ssr.location_id           AS "locationId",
         loc.name                  AS "locationName",
         ssr.template_id           AS "templateId",
         ssr.template_type         AS "templateType",
         COALESCE(ct.template_name, lt.template_name) AS "templateName",
         ssr.status,
         ssr.raised_at             AS "raisedAt",
         raiser.full_name          AS "raisedByName",
         ssr.resolved_at           AS "resolvedAt",
         resolver.full_name        AS "resolvedByName",
         ssr.assigned_to_user_id   AS "assignedToId",
         assignee.full_name        AS "assignedToName",
         ssr.cutoff_at             AS "cutoffAt",
         ssr.cutoff_escalation_user_id AS "cutoffEscalateToId",
         escuser.full_name          AS "cutoffEscalateToName",
         ssr.escalation_level      AS "escalationLevel",
         ssr.escalated_at          AS "escalatedAt",
         COALESCE(ses.cutoff_hours, 24) AS "cutoffHours",
         CONCAT('SR-', LPAD(CAST(ssr.id AS VARCHAR), 5, '0')) AS "requestNumber",
         co.company_name           AS "companyName"
       FROM soft_service_requests ssr
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN locations loc ON loc.id = ssr.location_id
       LEFT JOIN checklist_templates ct ON ssr.template_type = 'checklist' AND ct.id = ssr.template_id
       LEFT JOIN logsheet_templates lt ON ssr.template_type = 'logsheet' AND lt.id = ssr.template_id
       LEFT JOIN company_users raiser ON raiser.id = ssr.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ssr.resolved_by_user_id
       LEFT JOIN company_users assignee ON assignee.id = ssr.assigned_to_user_id
       LEFT JOIN company_users escuser ON escuser.id = ssr.cutoff_escalation_user_id
       LEFT JOIN soft_escalation_settings ses ON ses.company_id = ssr.company_id
       LEFT JOIN companies co ON co.id = ssr.company_id
       WHERE ${companyWhere}${andWhere}
       ORDER BY ssr.raised_at DESC
       LIMIT 200`,
      [...companyParams, ...extraParams]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── GET /requests/:id ── Single request detail ─────────────────────────── */
router.get("/requests/:id", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const companyId = req.companyUser.companyId;
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    const [[row]] = await pool.query(
      `SELECT
         ssr.id,
         ssr.asset_id                  AS "assetId",
         a.asset_name                  AS "assetName",
         ssr.location_id               AS "locationId",
         loc.name                      AS "locationName",
         ssr.template_id               AS "templateId",
         ssr.template_type             AS "templateType",
         ssr.raise_submission_id       AS "raiseSubmissionId",
         ssr.resolve_submission_id     AS "resolveSubmissionId",
         ssr.assigned_to_user_id       AS "assignedToId",
         cu.full_name                  AS "raisedByName",
         ssr.raised_at                 AS "raisedAt",
         ssr.status,
         ssr.resolved_at               AS "resolvedAt",
         resolver.full_name            AS "resolvedByName",
         assignee.full_name            AS "assignedToName",
         COALESCE(
           (SELECT ct.template_name FROM checklist_templates ct WHERE ct.id = ssr.template_id AND ssr.template_type = 'checklist' LIMIT 1),
           (SELECT lt.template_name FROM logsheet_templates lt WHERE lt.id = ssr.template_id AND ssr.template_type = 'logsheet' LIMIT 1)
         )                             AS "templateName",
         (
           SELECT json_agg(
             json_build_object(
               'questionId',     csa.question_id,
               'questionText',   csa.question_text,
               'inputType',      csa.input_type,
               'answer',         CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                      THEN csa.answer_json->'value'->>'value'
                                      ELSE csa.answer_json->>'value'
                                 END,
               'photoUrl',       COALESCE(
                                   CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                        THEN csa.answer_json->'value'->>'photoUrl'
                                        ELSE NULL
                                   END,
                                   csa.answer_json->>'photoUrl'
                                 ),
               'optionSelected', csa.option_selected
             ) ORDER BY csa.id
           )
           FROM checklist_submission_answers csa
           WHERE csa.submission_id = ssr.raise_submission_id
         )                             AS "beforeAnswers",
         (
           SELECT json_agg(
             json_build_object(
               'questionId',     csa.question_id,
               'questionText',   csa.question_text,
               'inputType',      csa.input_type,
               'answer',         CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                    THEN csa.answer_json->'value'->>'value'
                                    ELSE csa.answer_json->>'value'
                               END,
               'photoUrl',       COALESCE(
                                   CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                        THEN csa.answer_json->'value'->>'photoUrl'
                                        ELSE NULL
                                   END,
                                   csa.answer_json->>'photoUrl'
                                 ),
               'optionSelected', csa.option_selected
             ) ORDER BY csa.id
           )
           FROM checklist_submission_answers csa
           WHERE csa.submission_id = ssr.resolve_submission_id
         )                             AS "afterAnswers",
         (
           SELECT json_agg(
             json_build_object(
               'questionId',     csa.question_id,
               'questionText',   csa.question_text,
               'inputType',      csa.input_type,
               'answer',         CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                      THEN csa.answer_json->'value'->>'value'
                                      ELSE csa.answer_json->>'value'
                                 END,
               'photoUrl',       COALESCE(
                                   CASE WHEN jsonb_typeof(csa.answer_json->'value') = 'object'
                                        THEN csa.answer_json->'value'->>'photoUrl'
                                        ELSE NULL
                                   END,
                                   csa.answer_json->>'photoUrl'
                                 ),
               'optionSelected', csa.option_selected
             ) ORDER BY csa.id
           )
           FROM checklist_submission_answers csa
           WHERE csa.submission_id = (
             SELECT cs2.id
             FROM checklist_submissions cs2
             JOIN company_users cu2 ON cu2.id = cs2.company_user_id
             JOIN company_roles cr2
               ON cr2.company_id = cu2.company_id
              AND cr2.role_key = cu2.role
              AND cr2.is_active = TRUE
             WHERE cs2.template_id = ssr.template_id
               AND cu2.company_id = ssr.company_id
               AND COALESCE(cr2.can_resolve_soft_issue, FALSE) = TRUE
               AND cs2.submitted_at <= ssr.raised_at
               AND cs2.id != COALESCE(ssr.raise_submission_id, 0)
             ORDER BY cs2.submitted_at DESC
             LIMIT 1
           )
         )                             AS "catalystAnswers"
       FROM soft_service_requests ssr
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN locations loc ON loc.id = ssr.location_id
       LEFT JOIN company_users cu ON cu.id = ssr.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ssr.resolved_by_user_id
       LEFT JOIN company_users assignee ON assignee.id = ssr.assigned_to_user_id
       WHERE ssr.id = ? AND ssr.company_id = ?`,
      [requestId, companyId]
    );
    if (!row) return res.status(404).json({ message: "Request not found" });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

/* ── PUT /requests/:id/resolve ── Resolve a request ─────────────────────── */
router.put("/requests/:id/resolve", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { resolveSubmissionId } = req.body || {};
    const userId    = req.companyUser.id;
    const companyId = req.companyUser.companyId;
    const roleKey   = req.companyUser.role;

    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    // Permission check
    const isManager =
      roleKey === "admin" ||
      roleKey === "catalyst_admin" ||
      (await hasCapabilityStrict(companyId, roleKey, "is_soft_manager")) ||
      (await hasCapabilityStrict(companyId, roleKey, "can_assign_raised_requests")) ||
      (await hasModulePerm(req, "softrequests", "change_status_hk_web")) ||
      (await hasModulePerm(req, "softrequests", "change_status_hk_mobile"));

    const canResolve =
      isManager ||
      (await hasModulePerm(req, "softrequests", "resolve_hk_issues")) ||
      (await hasCapabilityStrict(companyId, roleKey, "can_resolve_soft_issue"));
    if (!canResolve) {
      return res.status(403).json({ message: "Your role cannot resolve soft-service requests" });
    }

    const [[request]] = await pool.query(
      `SELECT id, status,
              assigned_to_user_id AS "assignedToUserId",
              raised_by_user_id AS "raisedByUserId", asset_id AS "assetId"
         FROM soft_service_requests WHERE id = ? AND company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status === "resolved") return res.status(409).json({ message: "Request already resolved" });
    // Managers & admins can resolve any request; field users can resolve requests assigned to themselves or unassigned
    if (!isManager && request.assignedToUserId && Number(request.assignedToUserId) !== Number(userId)) {
      return res.status(403).json({ message: "This request is assigned to another supervisor" });
    }

    await pool.query(
      `UPDATE soft_service_requests
          SET status = 'resolved', resolved_by_user_id = ?,
              resolve_submission_id = ?, resolved_at = NOW()
        WHERE id = ?`,
      [userId, resolveSubmissionId || null, requestId]
    );

    // Notify the raiser
    const [[raiser]] = await pool.query(
      `SELECT full_name, push_token FROM company_users WHERE id = ?`,
      [request.raisedByUserId]
    );
    if (raiser?.push_token) {
      sendExpoPush(
        raiser.push_token,
        "HK Request Resolved",
        "Your request has been resolved.",
        { screen: "/(tabs)/soft-requests" }
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUT /requests/:id/assign ── Assign to supervisor ───────────────────── */
router.put("/requests/:id/assign", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { assignedToUserId } = req.body;
    const companyId = req.companyUser.companyId;
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    const hasAssignPerm =
      req.companyUser.role === 'admin' ||
      req.companyUser.role === 'catalyst_admin' ||
      await hasCapabilityStrict(companyId, req.companyUser.role, 'is_soft_manager') ||
      await hasCapabilityStrict(companyId, req.companyUser.role, 'can_assign_raised_requests') ||
      await hasModulePerm(req, "softrequests", "assign_cutoff_hk_web") ||
      await hasModulePerm(req, "softrequests", "assign_cutoff_hk_mobile");

    if (!hasAssignPerm) {
      return res.status(403).json({ message: "Unauthorized to assign requests" });
    }

    const [[request]] = await pool.query(
      `SELECT id, status FROM soft_service_requests WHERE id = ? AND company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    await pool.query(
      `UPDATE soft_service_requests SET assigned_to_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [assignedToUserId || null, requestId]
    );
    // Notify assigned user
    if (assignedToUserId) {
      const [[assignee]] = await pool.query(
        `SELECT full_name, push_token, fcm_token FROM company_users WHERE id = ? AND company_id = ?`,
        [assignedToUserId, companyId]
      );
      const [[requestRow]] = await pool.query(
        `SELECT a.asset_name, l.name AS location_name
         FROM soft_service_requests ssr
         LEFT JOIN assets a ON a.id = ssr.asset_id
         LEFT JOIN locations l ON l.id = ssr.location_id
         WHERE ssr.id = ?`,
        [requestId]
      );
      if (assignee) {
        const target = requestRow?.location_name
          ? `location — '${requestRow.location_name}'`
          : (requestRow?.asset_name ? `asset '${requestRow.asset_name}'` : 'an item');
        const notifTitle = "HK Request Assigned";
        const notifBody  = `Handle HK request for ${target}.`;
        const notifData  = { screen: "/(tabs)/soft-requests" };
        await createInAppNotification(companyId, assignedToUserId, "HK Request Assigned", `You have been assigned to handle an HK request for ${target}.`);
        if (assignee.push_token) {
          await sendExpoPush(assignee.push_token, notifTitle, notifBody, notifData);
        }
        if (assignee.fcm_token) {
          await sendFCMPush(assignee.fcm_token, notifTitle, notifBody, notifData);
        }
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUT /requests/:id/cutoff ── Set cutoff date + escalation user ─────── */
router.put("/requests/:id/cutoff", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { cutoffAt, escalationUserId } = req.body;
    const companyId = req.companyUser.companyId;
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    const hasAssignPerm =
      req.companyUser.role === 'admin' ||
      req.companyUser.role === 'catalyst_admin' ||
      await hasCapabilityStrict(companyId, req.companyUser.role, 'is_soft_manager') ||
      await hasCapabilityStrict(companyId, req.companyUser.role, 'can_assign_raised_requests') ||
      await hasModulePerm(req, "softrequests", "assign_cutoff_hk_web") ||
      await hasModulePerm(req, "softrequests", "assign_cutoff_hk_mobile");

    if (!hasAssignPerm) {
      return res.status(403).json({ message: "Unauthorized to set cutoff" });
    }

    const [[request]] = await pool.query(
      `SELECT id FROM soft_service_requests WHERE id = ? AND company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    await pool.query(
      `UPDATE soft_service_requests SET cutoff_at = ?, cutoff_escalation_user_id = ?, updated_at = NOW() WHERE id = ?`,
      [cutoffAt || null, escalationUserId || null, requestId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── PUT /requests/:id/status ── Update status ─────────────────────────── */
router.put("/requests/:id/status", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { status } = req.body;
    const companyId = req.companyUser.companyId;
    const validStatuses = ["open", "acknowledged", "in_progress", "closed", "resolved"];
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [[request]] = await pool.query(
      `SELECT id, status AS currentStatus, assigned_to_user_id AS "assignedToUserId" FROM soft_service_requests WHERE id = ? AND company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });

    const isAssignee = request.assignedToUserId && Number(request.assignedToUserId) === Number(req.companyUser.id);
    const hasStatusPerm =
      req.companyUser.role === 'admin' ||
      req.companyUser.role === 'catalyst_admin' ||
      await hasCapabilityStrict(companyId, req.companyUser.role, 'is_soft_manager') ||
      await hasModulePerm(req, "softrequests", "change_status_hk_web") ||
      await hasModulePerm(req, "softrequests", "change_status_hk_mobile");

    if (!hasStatusPerm && !isAssignee) {
      return res.status(403).json({ message: "Unauthorized to update status" });
    }
    const isClosed = status === "closed" || status === "resolved";
    const resolvedFields = isClosed
      ? `, resolved_by_user_id = ${req.companyUser.id}, resolved_at = NOW()`
      : "";
    await pool.query(
      `UPDATE soft_service_requests SET status = ?${resolvedFields}, updated_at = NOW() WHERE id = ?`,
      [status, requestId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── GET /escalation-settings ─────────────────────────────────────────────── */
router.get("/escalation-settings", async (req, res, next) => {  try {
    const companyId = req.companyUser.companyId;
    const [[row]] = await pool.query(
      `SELECT cutoff_hours AS "cutoffHours" FROM soft_escalation_settings WHERE company_id = ?`,
      [companyId]
    );
    res.json({ cutoffHours: row?.cutoffHours ?? 24 });
  } catch (err) { next(err); }
});

/* ── PUT /escalation-settings ─────────────────────────────────────────────── */
router.put("/escalation-settings", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const { cutoffHours } = req.body;
    if (!Number.isFinite(Number(cutoffHours)) || Number(cutoffHours) < 1) {
      return res.status(400).json({ message: "cutoffHours must be a positive number" });
    }
    await pool.query(
      `INSERT INTO soft_escalation_settings (company_id, cutoff_hours, updated_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (company_id)
       DO UPDATE SET cutoff_hours = EXCLUDED.cutoff_hours, updated_at = NOW()`,
      [companyId, Number(cutoffHours)]
    );
    res.json({ ok: true, cutoffHours: Number(cutoffHours) });
  } catch (err) { next(err); }
});

/* ── GET /requests/all — also returns escalation info ─────────────────────── */

/* ── DELETE /requests/:id — delete a single soft request ─────────────────── */
router.delete("/requests/:id", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    // Check delete permission using matrix helper
    const hasAssignPerm = await hasModulePerm(req, "softrequests", "d");
    if (!hasAssignPerm) {
      return res.status(403).json({ message: "Unauthorized to delete requests" });
    }

    const [[row]] = await pool.query(
      "SELECT id FROM soft_service_requests WHERE id = ? AND company_id = ?",
      [id, companyId]
    );
    if (!row) return res.status(404).json({ message: "Request not found" });
    await pool.query("DELETE FROM soft_service_requests WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── POST /requests/bulk-delete — delete multiple soft requests ────────────── */
router.post("/requests/bulk-delete", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;

    // Check delete permission using matrix helper
    const hasAssignPerm = await hasModulePerm(req, "softrequests", "d");
    if (!hasAssignPerm) {
      return res.status(403).json({ message: "Unauthorized to delete requests" });
    }

    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ message: "No ids provided" });
    const [rows] = await pool.query(
      `SELECT id FROM soft_service_requests WHERE id IN (${ids.map(() => "?").join(",")}) AND company_id = ?`,
      [...ids, companyId]
    );
    const validIds = rows.map((r) => r.id);
    if (!validIds.length) return res.status(404).json({ message: "No matching requests" });
    await pool.query(`DELETE FROM soft_service_requests WHERE id IN (${validIds.map(() => "?").join(",")})`, validIds);
    res.json({ ok: true, deleted: validIds.length });
  } catch (err) { next(err); }
});

export default router;
