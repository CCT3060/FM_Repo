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
        `SELECT ac.id, ac.asset_id AS assetId, ac.name, ac.created_at AS createdAt
         FROM asset_checklists ac
         WHERE ac.asset_id = ?
         ORDER BY ac.created_at DESC`,
        [assetId]
      );

      if (rows.length === 0) return res.json([]);

      const checklistIds = rows.map((r) => r.id);
      const [items] = await pool.query(
        `SELECT id, checklist_id AS checklistId, title, is_required AS isRequired
         FROM asset_checklist_items
         WHERE checklist_id IN (${checklistIds.map(() => "?").join(",")})
         ORDER BY id ASC`,
        checklistIds
      );

      const grouped = rows.map((r) => ({
        ...r,
        items: items.filter((i) => i.checklistId === r.id),
      }));

      res.json(grouped);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  validate([
    body("assetId").isInt({ min: 1 }).withMessage("assetId is required"),
    body("name").trim().notEmpty().withMessage("Checklist name is required"),
    body("items").isArray({ min: 1 }).withMessage("items is required"),
    body("items.*.title").trim().notEmpty().withMessage("Item title is required"),
    body("items.*.isRequired").optional().isBoolean().toBoolean(),
  ]),
  async (req, res, next) => {
    const { assetId, name, items } = req.body;
    try {
      const owned = await ensureAssetOwned(assetId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Asset not found" });

      const conn = pool;
      const [result] = await conn.execute(
        "INSERT INTO asset_checklists (asset_id, name) VALUES (?, ?)",
        [assetId, name]
      );
      const checklistId = result.insertId;

      if (items?.length) {
        const values = items.map((i) => [checklistId, i.title, i.isRequired ? 1 : 0]);
        await conn.query(
          "INSERT INTO asset_checklist_items (checklist_id, title, is_required) VALUES ?",
          [values]
        );
      }

      res.status(201).json({ id: checklistId, assetId, name, items: items || [] });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT ac.asset_id AS assetId
         FROM asset_checklists ac
         JOIN assets a ON ac.asset_id = a.id
         JOIN companies c ON a.company_id = c.id
         WHERE ac.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Checklist not found" });
      await pool.execute("DELETE FROM asset_checklists WHERE id = ?", [id]);
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
