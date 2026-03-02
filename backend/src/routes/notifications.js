/**
 * notifications.js
 * ──────────────────────────────────────────────────────────────────────────────
 * In-app notification API for the Flag & Alert Engine.
 * Requires company portal authentication (company_users).
 *
 * Endpoints:
 *   GET  /notifications           – list current user's notifications
 *   GET  /notifications/count     – unread notification count (polling)
 *   PUT  /notifications/:id/read  – mark one notification as read
 *   PUT  /notifications/read-all  – mark all as read
 */

import { Router } from "express";
import { param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

// ── GET /notifications ────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const userId    = req.companyUser.id;
    const limit     = Math.min(Number(req.query.limit)  || 50, 200);
    const offset    = Number(req.query.offset) || 0;
    const unreadOnly = req.query.unread === "true";

    let whereExtra = "";
    if (unreadOnly) whereExtra = " AND n.is_read = FALSE";

    const [rows] = await pool.query(
      `SELECT
         n.id,
         n.flag_id   AS "flagId",
         n.type,
         n.title,
         n.message,
         n.is_read   AS "isRead",
         n.created_at AS "createdAt",
         -- flag snapshot for quick display
         f.severity,
         f.status    AS "flagStatus",
         a.asset_name AS "assetName"
       FROM notifications n
       LEFT JOIN flags  f ON f.id = n.flag_id
       LEFT JOIN assets a ON a.id = f.asset_id
       WHERE n.recipient_id = ?${whereExtra}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /notifications/count ──────────────────────────────────────────────────
router.get("/count", async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_id = ? AND is_read = FALSE`,
      [req.companyUser.id]
    );
    res.json({ unread: Number(row?.cnt ?? 0) });
  } catch (err) {
    next(err);
  }
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────
router.put("/read-all", async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE recipient_id = ? AND is_read = FALSE`,
      [req.companyUser.id]
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

// ── PUT /notifications/:id/read ───────────────────────────────────────────────
router.put(
  "/:id/read",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const [result] = await pool.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE id = ? AND recipient_id = ?`,
        [Number(req.params.id), req.companyUser.id]
      );
      if (!result.affectedRows && !result.rowCount) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ message: "Marked as read" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
