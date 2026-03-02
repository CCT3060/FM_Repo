import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const assetOwnershipWhere = "a.id = ? AND c.user_id = ?";

const ensureAssetOwned = async (assetId, userId) => {
  const [rows] = await pool.query(
    `SELECT a.id FROM assets a
     JOIN companies c ON a.company_id = c.id
     WHERE ${assetOwnershipWhere}`,
    [assetId, userId]
  );
  return rows.length > 0;
};

router.get(
  "/",
  validate([query("assetId").isInt({ min: 1 }).withMessage("assetId is required")]),
  async (req, res, next) => {
    try {
      const assetId = Number(req.query.assetId);
      const owned = await ensureAssetOwned(assetId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Asset not found" });

      const [rows] = await pool.query(
        `SELECT id, asset_id AS assetId, note, created_by AS createdBy, created_at AS createdAt
         FROM asset_logs
         WHERE asset_id = ?
         ORDER BY created_at DESC
         LIMIT 200`,
        [assetId]
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  validate([
    body("assetId").isInt({ min: 1 }).withMessage("assetId is required"),
    body("note").trim().notEmpty().withMessage("note is required"),
  ]),
  async (req, res, next) => {
    try {
      const { assetId, note } = req.body;
      const owned = await ensureAssetOwned(assetId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Asset not found" });

      const [result] = await pool.execute(
        "INSERT INTO asset_logs (asset_id, note, created_by) VALUES (?, ?, ?) RETURNING id",
        [assetId, note, req.user.id]
      );

      res.status(201).json({
        id: result.insertId,
        assetId,
        note,
        createdBy: req.user.id,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        `SELECT al.asset_id AS assetId
         FROM asset_logs al
         JOIN assets a ON al.asset_id = a.id
         JOIN companies c ON a.company_id = c.id
         WHERE al.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Log entry not found" });

      await pool.execute("DELETE FROM asset_logs WHERE id = ?", [id]);
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
