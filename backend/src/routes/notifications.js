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

// ── One-time migration: add target_screen column if it doesn't exist ─────────
pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_screen VARCHAR(255) DEFAULT NULL`)
  .catch(() => {}); // Silently ignore if already exists or driver error

// ── Auto-cleanup: delete read notifications older than 2 days ────────────────
// Runs on startup, then every hour.
const cleanupOldNotifications = async () => {
  try {
    const [result] = await pool.query(
      `DELETE FROM notifications WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '2 days'`
    );
    const deleted = result?.rowCount ?? result?.affectedRows ?? 0;
    if (deleted > 0) console.log(`[notifications] Cleaned up ${deleted} read notifications older than 2 days`);
  } catch (e) {
    console.warn("[notifications] Cleanup error:", e.message);
  }
};
cleanupOldNotifications();
setInterval(cleanupOldNotifications, 60 * 60 * 1000); // every hour

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
         n.message   AS "body",
         n.target_screen AS "targetScreen",
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
    res.json({ unread: Number(row?.cnt ?? 0), count: Number(row?.cnt ?? 0) });
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

// ── DELETE /notifications/all ─────────────────────────────────────────────────
router.delete("/all", async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM notifications WHERE recipient_id = ?`,
      [req.companyUser.id]
    );
    res.json({ message: "All notifications deleted" });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /notifications/:id ─────────────────────────────────────────────────
router.delete(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const [result] = await pool.query(
        `DELETE FROM notifications WHERE id = ? AND recipient_id = ?`,
        [Number(req.params.id), req.companyUser.id]
      );
      if (!result.affectedRows && !result.rowCount) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ message: "Notification deleted" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
