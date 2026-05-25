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

/* ── Background escalation checker (runs every 5 minutes) ───────────────── */
async function runEscalationCheck() {
  try {
    // Load all companies' open unresolved requests
    const [openRequests] = await pool.query(
      `SELECT ssr.id, ssr.company_id AS "companyId", ssr.asset_id AS "assetId",
              ssr.raised_by_user_id AS "raisedByUserId",
              ssr.raised_at AS "raisedAt", ssr.escalation_level AS "escalationLevel",
              COALESCE(ses.cutoff_hours, 24) AS "cutoffHours",
              a.asset_name AS "assetName"
       FROM soft_service_requests ssr
       LEFT JOIN soft_escalation_settings ses ON ses.company_id = ssr.company_id
       JOIN assets a ON a.id = ssr.asset_id
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
          `SELECT cu.id, cu.full_name, cu.push_token
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
          `SELECT cu.id, cu.full_name, cu.push_token
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
      }

      console.log(`[escalation] Request ${req.id} escalated to level ${newLevel} after ${ageLabel}`);
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
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: "default" }),
    });
  } catch {
    // Non-fatal
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

/* ── POST /requests ── Raise a soft-service request ─────────────────────── */
router.post("/requests", async (req, res, next) => {
  try {
    const { assetId, templateId, templateType = "checklist", submissionId, checklistSubmissionId } = req.body || {};
    const resolvedSubmissionId = submissionId ?? checklistSubmissionId ?? null;
    const userId    = req.companyUser.id;
    const companyId = req.companyUser.companyId;
    const roleKey   = req.companyUser.role;

    if (!assetId || templateId == null) {
      return res.status(400).json({ message: "assetId and templateId are required" });
    }

    // Permission check (pass-through if role not configured yet)
    const canRaise = await hasCapability(companyId, roleKey, "can_raise_soft_issue");
    if (!canRaise) {
      return res.status(403).json({ message: "Your role cannot raise soft-service requests" });
    }

    // Verify asset belongs to this company
    const [[asset]] = await pool.query(
      `SELECT a.id FROM assets a WHERE a.id = ? AND a.company_id = ?`,
      [assetId, companyId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    // Insert the request
    const [rows] = await pool.query(
      `INSERT INTO soft_service_requests
         (company_id, asset_id, template_id, template_type, raise_submission_id, raised_by_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')
       RETURNING id`,
      [companyId, assetId, templateId, templateType, resolvedSubmissionId, userId]
    );

    const requestId = rows[0]?.id ?? rows.insertId;

    // Notify users who can resolve soft issues
    try {
      const [[raiser]] = await pool.query(
        `SELECT full_name FROM company_users WHERE id = ?`, [userId]
      );
      const raiserName = raiser?.full_name || 'A user';

      const [[assetRow]] = await pool.query(
        `SELECT asset_name FROM assets WHERE id = ?`, [assetId]
      );
      const assetLabel = assetRow?.asset_name || 'an asset';

      const [resolvers] = await pool.query(
        `SELECT cu.id, cu.push_token
         FROM company_users cu
         JOIN company_roles cr ON cr.company_id = cu.company_id AND cr.role_key = cu.role
         WHERE cu.company_id = ?
           AND cr.can_resolve_soft_issue = TRUE
           AND cr.is_active = TRUE
           AND cu.id != ?`,
        [companyId, userId]
      );

      for (const resolver of resolvers) {
        await createInAppNotification(
          companyId, resolver.id,
          'New Soft Request',
          `${raiserName} raised a request for ${assetLabel}.`
        );
        if (resolver.push_token) {
          await sendExpoPush(
            resolver.push_token,
            'New Soft Request',
            `${raiserName} raised a request for ${assetLabel}.`,
            { screen: '/(tabs)/soft-requests', requestId }
          );
        }
      }
    } catch {
      // Non-fatal — don't fail the request creation
    }

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
       JOIN assets a ON a.id = ssr.asset_id
       JOIN company_users cu ON cu.id = ssr.raised_by_user_id
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
         ssr.template_id           AS "templateId",
         ssr.template_type         AS "templateType",
         ssr.status,
         ssr.raised_at             AS "raisedAt",
         ssr.resolved_at           AS "resolvedAt",
         resolver.full_name        AS "resolvedByName"
       FROM soft_service_requests ssr
       JOIN assets a ON a.id = ssr.asset_id
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

/* ── GET /requests/users ── List company users for assignment ────────────── */
router.get("/requests/users", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", role, designation
       FROM company_users WHERE company_id = ? AND status = 'Active' ORDER BY full_name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /requests/all ── Manager sees all requests ─────────────────────── */
router.get("/requests/all", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const status    = req.query.status;
    const assetId   = req.query.assetId;

    const params = [companyId];
    const conditions = [];
    if (status)  { conditions.push("ssr.status = ?");   params.push(status); }
    if (assetId) { conditions.push("ssr.asset_id = ?"); params.push(Number(assetId)); }

    const where = conditions.length ? " AND " + conditions.join(" AND ") : "";

    const [rows] = await pool.query(
      `SELECT
         ssr.id,
         ssr.asset_id              AS "assetId",
         a.asset_name              AS "assetName",
         a.asset_unique_id         AS "assetUniqueId",
         ssr.template_id           AS "templateId",
         ssr.template_type         AS "templateType",
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
         CONCAT('SR-', LPAD(CAST(ssr.id AS VARCHAR), 5, '0')) AS "requestNumber"
       FROM soft_service_requests ssr
       JOIN assets a ON a.id = ssr.asset_id
       JOIN company_users raiser ON raiser.id = ssr.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ssr.resolved_by_user_id
       LEFT JOIN company_users assignee ON assignee.id = ssr.assigned_to_user_id
       LEFT JOIN company_users escuser ON escuser.id = ssr.cutoff_escalation_user_id
       LEFT JOIN soft_escalation_settings ses ON ses.company_id = ssr.company_id
       WHERE ssr.company_id = ?${where}
       ORDER BY ssr.raised_at DESC
       LIMIT 200`,
      params
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
         ssr.template_id               AS "templateId",
         ssr.template_type             AS "templateType",
         ssr.raise_submission_id       AS "raiseSubmissionId",
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
         )                             AS "beforeAnswers"
       FROM soft_service_requests ssr
       JOIN assets a ON a.id = ssr.asset_id
       JOIN company_users cu ON cu.id = ssr.raised_by_user_id
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
    const requestId         = Number(req.params.id);
    const { resolveSubmissionId } = req.body || {};
    const userId    = req.companyUser.id;
    const companyId = req.companyUser.companyId;
    const roleKey   = req.companyUser.role;

    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    // Permission check (pass-through if role not configured yet)
    const canResolve = await hasCapability(companyId, roleKey, "can_resolve_soft_issue");
    if (!canResolve) {
      return res.status(403).json({ message: "Your role cannot resolve soft-service requests" });
    }

    const [[request]] = await pool.query(
      `SELECT id, status, raised_by_user_id AS "raisedByUserId", asset_id AS "assetId"
         FROM soft_service_requests WHERE id = ? AND company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status === "resolved") return res.status(409).json({ message: "Request already resolved" });

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
    if (raiser) {
      const [[asset]] = await pool.query(
        `SELECT asset_name FROM assets WHERE id = ?`, [request.assetId]
      );
      const label = asset?.asset_name || "the asset";

      await createInAppNotification(
        companyId, request.raisedByUserId,
        "Request Resolved",
        `Your request for ${label} has been closed.`
      );

      if (raiser.push_token) {
        await sendExpoPush(
          raiser.push_token,
          "Request Resolved",
          `Your request for ${label} has been closed.`,
          { screen: "/soft-my-requests", requestId }
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ── PUT /requests/:id/assign ── Assign to a user ───────────────────────── */
router.put("/requests/:id/assign", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { assignedToUserId } = req.body;
    const companyId = req.companyUser.companyId;
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });
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
        `SELECT full_name, push_token FROM company_users WHERE id = ? AND company_id = ?`,
        [assignedToUserId, companyId]
      );
      const [[assetRow]] = await pool.query(
        `SELECT a.asset_name FROM soft_service_requests ssr JOIN assets a ON a.id = ssr.asset_id WHERE ssr.id = ?`,
        [requestId]
      );
      if (assignee) {
        await createInAppNotification(companyId, assignedToUserId, "Soft Request Assigned", `You have been assigned to handle a request for ${assetRow?.asset_name || "an asset"}.`);
        if (assignee.push_token) {
          await sendExpoPush(assignee.push_token, "Soft Request Assigned", `Handle request for ${assetRow?.asset_name || "an asset"}.`, { screen: "/(tabs)/soft-requests" });
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
      `SELECT id, status AS currentStatus FROM soft_service_requests WHERE id = ? AND company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
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
    if (!id) return res.status(400).json({ message: "Invalid id" });
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
