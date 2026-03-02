import { Router } from "express";
import { body, param, query } from "express-validator";
import { randomUUID } from "crypto";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const getAssetType = async (code) => {
  const [rows] = await pool.query(
    "SELECT code, label, category FROM asset_types WHERE code = ? AND status = 'Active'",
    [code]
  );
  return rows[0] || null;
};

const logHistory = async (assetId, action, details, userId) => {
  await pool.execute(
    "INSERT INTO asset_history (asset_id, action, details, created_by) VALUES (?, ?, ?, ?)",
    [assetId, action, JSON.stringify(details || {}), userId || null]
  );
};

const createRules = [
  body("companyId").isInt({ min: 1 }).withMessage("companyId is required"),
  body("departmentId").isInt({ min: 1 }).withMessage("departmentId is required"),
  body("assetName").trim().notEmpty().withMessage("Asset name is required"),
  body("assetType").trim().notEmpty().withMessage("Invalid asset type"),
  body("status").optional().isIn(["Active", "Inactive"]),
  body("assetUniqueId").optional().isString().isLength({ max: 120 }),
  body("building").optional().isString().isLength({ max: 160 }),
  body("floor").optional().isString().isLength({ max: 80 }),
  body("room").optional().isString().isLength({ max: 160 }),
  body("qrCode").optional().isString().isLength({ max: 255 }),
  body("metadata").optional().isObject().withMessage("metadata must be an object"),
];

const updateRules = [
  param("id").isInt().withMessage("id must be numeric"),
  body("departmentId").optional().isInt({ min: 1 }),
  body("assetName").optional().isString().notEmpty(),
  body("assetType").optional().isString().trim(),
  body("status").optional().isIn(["Active", "Inactive"]),
  body("assetUniqueId").optional().isString().isLength({ max: 120 }),
  body("building").optional().isString().isLength({ max: 160 }),
  body("floor").optional().isString().isLength({ max: 80 }),
  body("room").optional().isString().isLength({ max: 160 }),
  body("qrCode").optional().isString().isLength({ max: 255 }),
  body("metadata").optional().isObject().withMessage("metadata must be an object"),
];

router.get(
  "/",
  validate([
    query("companyId").optional().isInt({ min: 1 }),
    query("departmentId").optional().isInt({ min: 1 }),
    query("type").optional().isString().trim(),
    query("status").optional().isIn(["Active", "Inactive"]),
    query("search").optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const { companyId, departmentId, type, status, search } = req.query;
      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";

      if (companyId) {
        where += " AND c.id = ?";
        params.push(companyId);
      }
      if (departmentId) {
        where += " AND a.department_id = ?";
        params.push(departmentId);
      }
      if (type) {
        where += " AND a.asset_type = ?";
        params.push(type);
      }
      if (status) {
        where += " AND a.status = ?";
        params.push(status);
      }
      if (search) {
        where += " AND (a.asset_name LIKE ? OR a.asset_unique_id LIKE ? OR a.building LIKE ? OR a.room LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like);
      }

      const [rows] = await pool.query(
        `SELECT a.id, a.company_id AS companyId, c.company_name AS companyName,
                  a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId, a.asset_type AS assetType,
                a.building, a.floor, a.room, a.status, a.qr_code AS qrCode,
                  a.department_id AS departmentId, d.name AS departmentName,
                a.created_by AS createdBy, a.created_at AS createdAt, ad.metadata, ad.documents
         FROM assets a
         JOIN companies c ON a.company_id = c.id
                LEFT JOIN departments d ON a.department_id = d.id
         LEFT JOIN asset_details ad ON ad.asset_id = a.id
         ${where}
         ORDER BY a.created_at DESC`,
        params
      );

      const normalized = rows.map((r) => {
        // MySQL returns JSON columns as objects; legacy rows might be strings. Normalize safely.
        const metaRaw = r.metadata;
        const docsRaw = r.documents;

        const meta = metaRaw === null || metaRaw === undefined
          ? {}
          : (typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw);

        const docs = docsRaw === null || docsRaw === undefined
          ? undefined
          : (typeof docsRaw === "string" ? JSON.parse(docsRaw) : docsRaw);

        const mergedMeta = docs ? { ...meta, documents: docs } : meta;

        return {
          ...r,
          metadata: mergedMeta,
        };
      });

      res.json(normalized);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  validate(createRules),
  async (req, res, next) => {
    const conn = pool;
    try {
      const {
        companyId,
        departmentId,
        assetName,
        assetType,
        assetUniqueId,
        building,
        floor,
        room,
        status = "Active",
        qrCode,
        metadata = {},
      } = req.body;

      const assetTypeRecord = await getAssetType(assetType);
      if (!assetTypeRecord) {
        return res.status(400).json({ message: "Asset type does not exist or is inactive" });
      }

      const [companyRows] = await conn.query(
        "SELECT id FROM companies WHERE id = ? AND user_id = ?",
        [companyId, req.user.id]
      );
      if (companyRows.length === 0) {
        return res.status(404).json({ message: "Company not found for user" });
      }

      const [departmentRows] = await conn.query(
        `SELECT d.id, d.name FROM departments d
         JOIN companies c ON d.company_id = c.id
         WHERE d.id = ? AND d.company_id = ? AND c.user_id = ?`,
        [departmentId, companyId, req.user.id]
      );
      if (departmentRows.length === 0) {
        return res.status(404).json({ message: "Department not found for company" });
      }
      const departmentName = departmentRows[0].name;

      const generatedId = `AST-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
      const uniqueIdToUse = assetUniqueId || generatedId;

      const [result] = await conn.execute(
        `INSERT INTO assets (
            company_id, department_id, asset_name, asset_unique_id, asset_type,
            building, floor, room, status, qr_code, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id` ,
        [
          companyId,
          departmentId,
          assetName,
          uniqueIdToUse,
          assetTypeRecord.code,
          building || null,
          floor || null,
          room || null,
          status,
          qrCode || null,
          req.user.id,
        ]
      );

      const assetId = result.insertId;
      const docs = Array.isArray(metadata?.documents) ? metadata.documents : undefined;
      const metaWithoutDocs = { ...metadata };
      if (metaWithoutDocs.documents !== undefined) {
        delete metaWithoutDocs.documents;
      }

      await conn.execute(
        `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)` ,
        [assetId, JSON.stringify(metaWithoutDocs || {}), docs ? JSON.stringify(docs) : null]
      );

      await logHistory(
        assetId,
        "created",
        {
          assetName,
          assetType: assetTypeRecord.code,
          departmentId,
          status,
          building,
          floor,
          room,
          metadata,
        },
        req.user.id
      );

      res.status(201).json({
        id: assetId,
        companyId,
        assetName,
        assetUniqueId: uniqueIdToUse,
        assetType,
        departmentId,
        departmentName,
        building,
        floor,
        room,
        status,
        qrCode,
        metadata,
        createdBy: req.user.id,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/:id",
  validate(updateRules),
  async (req, res, next) => {
    const { id } = req.params;
      const {
        assetName,
        assetType,
        departmentId,
        assetUniqueId,
        building,
        floor,
        room,
        status,
        qrCode,
        metadata,
      } = req.body;

    try {
      const [rows] = await pool.query(
        `SELECT a.id, a.company_id
         FROM assets a
         JOIN companies c ON a.company_id = c.id
         WHERE a.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Asset not found" });
      }

      const companyId = rows[0].company_id;

      if (assetType !== undefined) {
        const assetTypeRecord = await getAssetType(assetType);
        if (!assetTypeRecord) {
          return res.status(400).json({ message: "Asset type does not exist or is inactive" });
        }
      }

      if (departmentId !== undefined) {
        const [departmentRows] = await pool.query(
          `SELECT d.id FROM departments d
           JOIN companies c ON d.company_id = c.id
           WHERE d.id = ? AND d.company_id = ? AND c.user_id = ?`,
          [departmentId, companyId, req.user.id]
        );
        if (departmentRows.length === 0) {
          return res.status(404).json({ message: "Department not found for company" });
        }
      }

      await pool.execute(
        `UPDATE assets
         SET asset_name = COALESCE(?, asset_name),
             asset_unique_id = COALESCE(?, asset_unique_id),
             asset_type = COALESCE(?, asset_type),
             department_id = COALESCE(?, department_id),
             building = COALESCE(?, building),
             floor = COALESCE(?, floor),
             room = COALESCE(?, room),
             status = COALESCE(?, status),
             qr_code = COALESCE(?, qr_code)
         WHERE id = ?`,
        [
          assetName || null,
          assetUniqueId || null,
          assetType || null,
          departmentId || null,
          building || null,
          floor || null,
          room || null,
          status || null,
          qrCode || null,
          id,
        ]
      );

      if (metadata !== undefined) {
        const docs = Array.isArray(metadata?.documents) ? metadata.documents : undefined;
        const metaWithoutDocs = { ...metadata };
        if (metaWithoutDocs.documents !== undefined) {
          delete metaWithoutDocs.documents;
        }
        const [detailRows] = await pool.query(
          "SELECT id FROM asset_details WHERE asset_id = ?",
          [id]
        );
        if (detailRows.length === 0) {
          await pool.execute(
            "INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)",
            [id, JSON.stringify(metaWithoutDocs || {}), docs ? JSON.stringify(docs) : null]
          );
        } else {
          await pool.execute(
            "UPDATE asset_details SET metadata = ?, documents = ? WHERE asset_id = ?",
            [JSON.stringify(metaWithoutDocs || {}), docs ? JSON.stringify(docs) : null, id]
          );
        }
      }

      await logHistory(
        id,
        "updated",
        {
          assetName,
          assetType,
          departmentId,
          status,
          building,
          floor,
          room,
          metadata,
        },
        req.user.id
      );

      res.json({ message: "Asset updated" });
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
        `SELECT a.id
         FROM assets a
         JOIN companies c ON a.company_id = c.id
         WHERE a.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Asset not found" });
      }

      await logHistory(id, "deleted", {}, req.user.id);
      await pool.execute("DELETE FROM assets WHERE id = ?", [id]);
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
