/**
 * Soft Service Requests
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the client-supervisor → catalyst-supervisor request workflow for
 * soft-services assets.
 *
 * Mounted at: /api/soft-service
 *
 * Routes:
 *   POST  /requests                    – Raise a request (client supervisor scans QR, finds issue)
 *   GET   /requests/asset/:assetId     – Get open request(s) for an asset (catalyst supervisor check)
 *   GET   /requests/my                 – Client supervisor sees their own requests
 *   GET   /requests/all                – Client manager / admin sees all requests (with filters)
 *   PUT   /requests/:id/resolve        – Catalyst supervisor resolves a request
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
    // Non-fatal — don't fail the request if push fails
  }
}

/* ── Helper: in-app notification ─────────────────────────────────────────── */
async function createInAppNotification(companyId, recipientId, title, message, requestId) {
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

/* ── POST /requests ── Raise a soft-service request ─────────────────────── */
router.post("/requests", async (req, res, next) => {
  try {
    const { assetId, templateId, templateType = "checklist", answers = [], submissionId } = req.body || {};
    const userId = req.companyUser.id;
    const companyId = req.companyUser.companyId;

    if (!assetId || !templateId) {
      return res.status(400).json({ message: "assetId and templateId are required" });
    }

    // Verify asset belongs to this company and is a soft-service asset
    const [[asset]] = await pool.query(
      `SELECT a.id, at.category
         FROM assets a
         JOIN asset_types at ON at.id = a.asset_type_id
        WHERE a.id = ? AND a.company_id = ?`,
      [assetId, companyId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    if (asset.category !== "soft") {
      return res.status(400).json({ message: "Requests can only be raised for soft-service assets" });
    }

    // Check user has permission to raise issues
    const [[roleRow]] = await pool.query(
      `SELECT cr.can_raise_soft_issue
         FROM company_roles cr
        WHERE cr.company_id = ? AND cr.role_key = ? AND cr.is_active = TRUE`,
      [companyId, req.companyUser.role]
    );
    if (!roleRow?.can_raise_soft_issue) {
      return res.status(403).json({ message: "Your role cannot raise soft-service requests" });
    }

    // Insert the request record (submission may already exist from the checklist submission step)
    const [result] = await pool.query(
      `INSERT INTO soft_service_requests
         (company_id, asset_id, template_id, template_type, raise_submission_id, raised_by_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [companyId, assetId, templateId, templateType, submissionId || null, userId]
    );

    res.status(201).json({ ok: true, requestId: result.insertId });
  } catch (err) {
    next(err);
  }
});

/* ── GET /requests/asset/:assetId ── Pending requests for an asset ────────── */
router.get("/requests/asset/:assetId", async (req, res, next) => {
  try {
    const assetId = Number(req.params.assetId);
    const companyId = req.companyUser.companyId;

    if (!Number.isFinite(assetId)) return res.status(400).json({ message: "Invalid assetId" });

    const [rows] = await pool.query(
      `SELECT
         ssr.id,
         ssr.asset_id              AS "assetId",
         ssr.template_id           AS "templateId",
         ssr.template_type         AS "templateType",
         ssr.raise_submission_id   AS "raiseSubmissionId",
         ssr.raised_by_user_id     AS "raisedByUserId",
         cu.full_name              AS "raisedByName",
         ssr.raised_at             AS "raisedAt",
         ssr.status,
         -- answers from the raise submission for "before" display
         cs.answers_json           AS "beforeAnswers",
         cs.submitted_at           AS "beforeSubmittedAt"
       FROM soft_service_requests ssr
       JOIN company_users cu ON cu.id = ssr.raised_by_user_id
       LEFT JOIN checklist_submissions cs ON cs.id = ssr.raise_submission_id
       WHERE ssr.company_id = ? AND ssr.asset_id = ? AND ssr.status = 'open'
       ORDER BY ssr.raised_at DESC`,
      [companyId, assetId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── GET /requests/my ── Client supervisor's own requests ────────────────── */
router.get("/requests/my", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const companyId = req.companyUser.companyId;
    const status = req.query.status; // optional filter: 'open' | 'resolved'

    let whereExtra = "";
    const params = [companyId, userId];
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

/* ── GET /requests/all ── Client manager / admin sees all ─────────────────── */
router.get("/requests/all", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const status = req.query.status;    // 'open' | 'resolved'
    const assetId = req.query.assetId;

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
         -- before submission snapshot
         cs_before.submitted_at    AS "beforeSubmittedAt",
         -- after submission snapshot
         cs_after.submitted_at     AS "afterSubmittedAt"
       FROM soft_service_requests ssr
       JOIN assets a ON a.id = ssr.asset_id
       JOIN company_users raiser ON raiser.id = ssr.raised_by_user_id
       LEFT JOIN company_users resolver ON resolver.id = ssr.resolved_by_user_id
       LEFT JOIN checklist_submissions cs_before ON cs_before.id = ssr.raise_submission_id
       LEFT JOIN checklist_submissions cs_after  ON cs_after.id  = ssr.resolve_submission_id
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

/* ── PUT /requests/:id/resolve ── Catalyst supervisor resolves ────────────── */
router.put("/requests/:id/resolve", async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const { resolveSubmissionId } = req.body || {};
    const userId = req.companyUser.id;
    const companyId = req.companyUser.companyId;

    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    // Verify user can resolve
    const [[roleRow]] = await pool.query(
      `SELECT cr.can_resolve_soft_issue
         FROM company_roles cr
        WHERE cr.company_id = ? AND cr.role_key = ? AND cr.is_active = TRUE`,
      [companyId, req.companyUser.role]
    );
    if (!roleRow?.can_resolve_soft_issue) {
      return res.status(403).json({ message: "Your role cannot resolve soft-service requests" });
    }

    // Fetch the request
    const [[request]] = await pool.query(
      `SELECT ssr.id, ssr.status, ssr.raised_by_user_id AS "raisedByUserId", ssr.asset_id AS "assetId"
         FROM soft_service_requests ssr
        WHERE ssr.id = ? AND ssr.company_id = ?`,
      [requestId, companyId]
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status === "resolved") return res.status(409).json({ message: "Request already resolved" });

    // Mark resolved
    await pool.query(
      `UPDATE soft_service_requests
          SET status = 'resolved',
              resolved_by_user_id = ?,
              resolve_submission_id = ?,
              resolved_at = NOW()
        WHERE id = ?`,
      [userId, resolveSubmissionId || null, requestId]
    );

    // Notify the client supervisor who raised the request
    const [[raiser]] = await pool.query(
      `SELECT full_name, push_token FROM company_users WHERE id = ?`,
      [request.raisedByUserId]
    );

    if (raiser) {
      const [[asset]] = await pool.query(`SELECT asset_name FROM assets WHERE id = ?`, [request.assetId]);
      const assetLabel = asset?.asset_name || "the asset";

      // In-app notification
      await createInAppNotification(
        companyId,
        request.raisedByUserId,
        "Request Resolved",
        `Your request for ${assetLabel} has been closed successfully.`,
        requestId
      );

      // Push notification
      if (raiser.push_token) {
        await sendExpoPush(
          raiser.push_token,
          "Request Resolved",
          `Your request for ${assetLabel} has been closed successfully.`,
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
