import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const getOwnedAsset = async (assetId, userId) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.asset_type AS assetType FROM assets a
     JOIN companies c ON a.company_id = c.id
     WHERE a.id = ? AND c.user_id = ?`,
    [assetId, userId]
  );
  return rows[0] || null;
};

const answerTypes = [
  "yes_no",
  "text",
  "long_text",
  "number",
  "date",
  "datetime",
  "label",
  "single_select",
  "dropdown",
  "multi_select",
  "file",
  "video",
  "signature",
  "gps",
  "star_rating",
  "scan_code",
  "meter_reading",
];

router.get(
  "/",
  validate([query("assetId").isInt({ min: 1 }).withMessage("assetId is required")]),
  async (req, res, next) => {
    try {
      const assetId = Number(req.query.assetId);
      const asset = await getOwnedAsset(assetId, req.user.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });

      const [rows] = await pool.query(
        `SELECT ac.id, ac.asset_id AS assetId, ac.name, ac.description, ac.asset_category AS assetCategory, ac.created_at AS createdAt
         FROM asset_checklists ac
         WHERE ac.asset_id = ?
         ORDER BY ac.created_at DESC`,
        [assetId]
      );

      if (rows.length === 0) return res.json([]);

      const checklistIds = rows.map((r) => r.id);
      const [items] = await pool.query(
        `SELECT id, checklist_id AS checklistId, title, answer_type AS answerType, is_required AS isRequired, order_index AS orderIndex, config
         FROM asset_checklist_items
         WHERE checklist_id IN (${checklistIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        checklistIds
      );

      const grouped = rows.map((r) => ({
        ...r,
        items: items
          .filter((i) => i.checklistId === r.id)
          .map((i) => ({
            ...i,
            config: i.config ? JSON.parse(i.config) : null,
          })),
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
    body("description").optional().isString().trim(),
    body("items").isArray({ min: 1 }).withMessage("items is required"),
    body("items.*.title").trim().notEmpty().withMessage("Item title is required"),
    body("items.*.isRequired").optional().isBoolean().toBoolean(),
    body("items.*.answerType").isIn(answerTypes).withMessage("Invalid answerType"),
    body("items.*.order").optional().isInt({ min: 0 }).toInt(),
    body("items.*.config").optional().isObject(),
  ]),
  async (req, res, next) => {
    const { assetId, name, description, items } = req.body;
    try {
      const asset = await getOwnedAsset(assetId, req.user.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });

      const conn = pool;
      const [result] = await conn.execute(
        "INSERT INTO asset_checklists (asset_id, name, description, asset_category) VALUES (?, ?, ?, ?)",
        [assetId, name, description || null, asset.assetType]
      );
      const checklistId = result.insertId;

      if (items?.length) {
        const values = items.map((i, idx) => [
          checklistId,
          i.title,
          i.answerType || "yes_no",
          i.isRequired ? 1 : 0,
          Number.isFinite(i.order) ? Number(i.order) : idx,
          i.config ? JSON.stringify(i.config) : null,
        ]);
        await conn.query(
          "INSERT INTO asset_checklist_items (checklist_id, title, answer_type, is_required, order_index, config) VALUES ?",
          [values]
        );
      }

      res.status(201).json({
        id: checklistId,
        assetId,
        name,
        description: description || null,
        assetCategory: asset.assetType,
        items: items?.map((i, idx) => ({
          title: i.title,
          answerType: i.answerType,
          isRequired: !!i.isRequired,
          orderIndex: Number.isFinite(i.order) ? Number(i.order) : idx,
          config: i.config || null,
        })) || [],
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id/assignees",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        `SELECT aca.user_id AS userId, u.full_name AS fullName, u.email
         FROM asset_checklist_assignments aca
         JOIN asset_checklists ac ON ac.id = aca.checklist_id
         JOIN assets a ON a.id = ac.asset_id
         JOIN companies c ON c.id = a.company_id
         JOIN users u ON u.id = aca.user_id
         WHERE aca.checklist_id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      return res.json(rows);
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/:id/assignees",
  validate([
    param("id").isInt().withMessage("id must be numeric"),
    body("userIds").isArray({ min: 1 }).withMessage("userIds array required"),
    body("userIds.*").isInt({ min: 1 }).withMessage("userIds must be numeric"),
  ]),
  async (req, res, next) => {
    const { id } = req.params;
    const { userIds } = req.body;
    try {
      // verify ownership of checklist
      const [checklistRows] = await pool.query(
        `SELECT ac.id
         FROM asset_checklists ac
         JOIN assets a ON a.id = ac.asset_id
         JOIN companies c ON c.id = a.company_id
         WHERE ac.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (checklistRows.length === 0) {
        return res.status(404).json({ message: "Checklist not found" });
      }

      // ensure users exist
      const [userRows] = await pool.query(
        `SELECT id FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`,
        userIds
      );
      const foundIds = new Set(userRows.map((u) => Number(u.id)));
      const missing = userIds.filter((idVal) => !foundIds.has(Number(idVal)));
      if (missing.length) {
        return res.status(400).json({ message: `Users not found: ${missing.join(",")}` });
      }

      // insert new assignments ignoring duplicates
      const values = userIds.map((uid) => [id, uid]);
      await pool.query(
        "INSERT IGNORE INTO asset_checklist_assignments (checklist_id, user_id) VALUES ?",
        [values]
      );

      const [assigned] = await pool.query(
        `SELECT aca.user_id AS userId, u.full_name AS fullName, u.email
         FROM asset_checklist_assignments aca
         JOIN users u ON u.id = aca.user_id
         WHERE aca.checklist_id = ?
         ORDER BY u.full_name ASC`,
        [id]
      );
      return res.status(201).json(assigned);
    } catch (err) {
      return next(err);
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
