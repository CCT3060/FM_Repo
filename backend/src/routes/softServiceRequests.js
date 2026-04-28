/**
 * Soft Service Requests
 * Mounted at: /api/soft-service
 *
 * POST  /requests                  – Raise a request
 * GET   /requests/asset/:assetId   – Open requests for an asset (with before answers)
 * GET   /requests/my               – Client supervisor's own requests
 * GET   /requests/all              – Manager: all requests (with filters)
 * PUT   /requests/:id/resolve      – Resolve a request
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

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
    const { assetId, templateId, templateType = "checklist", submissionId } = req.body || {};
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
      [companyId, assetId, templateId, templateType, submissionId || null, userId]
    );

    const requestId = rows[0]?.id ?? rows.insertId;
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
               'answer',        csa.answer_json->>'value',
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
         resolver.full_name        AS "resolvedByName"
       FROM soft_service_requests ssr
       JOIN assets a ON a.id = ssr.asset_id
       JOIN company_users raiser ON raiser.id = ssr.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ssr.resolved_by_user_id
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
               'answer',         csa.answer_json->>'value',
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

export default router;
