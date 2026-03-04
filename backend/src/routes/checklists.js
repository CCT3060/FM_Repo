import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";
import { createFlag } from "../utils/flagsHelper.js";

const router = Router();

router.use(requireAuth);

const getOwnedAsset = async (assetId, userId) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.asset_type AS "assetType" FROM assets a
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
        `SELECT ac.id, ac.asset_id AS "assetId", ac.name, ac.description, ac.asset_category AS "assetCategory", ac.created_at AS "createdAt"
         FROM asset_checklists ac
         WHERE ac.asset_id = ?
         ORDER BY ac.created_at DESC`,
        [assetId]
      );

      if (rows.length === 0) return res.json([]);

      const checklistIds = rows.map((r) => r.id);
      const [items] = await pool.query(
        `SELECT id, checklist_id AS "checklistId", title, answer_type AS "answerType", is_required AS "isRequired", order_index AS "orderIndex", config,
                allow_image AS "allowImage", allow_remark AS "allowRemark", allow_flag AS "allowFlagIssue", require_reason AS "requireReason"
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
            allowImage: !!i.allowImage,
            allowRemark: i.allowRemark === undefined ? true : !!i.allowRemark,
            allowFlagIssue: i.allowFlagIssue === undefined ? true : !!i.allowFlagIssue,
            requireReason: !!i.requireReason,
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
        "INSERT INTO asset_checklists (asset_id, name, description, asset_category) VALUES (?, ?, ?, ?) RETURNING id",
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
          i.allowImage ? 1 : 0,
          i.allowRemark !== false ? 1 : 0,
          i.allowFlagIssue !== false ? 1 : 0,
          i.requireReason ? 1 : 0,
        ]);
        await conn.query(
          "INSERT INTO asset_checklist_items (checklist_id, title, answer_type, is_required, order_index, config, allow_image, allow_remark, allow_flag, require_reason) VALUES ?",
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
          allowImage: !!i.allowImage,
          allowRemark: i.allowRemark !== false,
          allowFlagIssue: i.allowFlagIssue !== false,
          requireReason: !!i.requireReason,
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
        `SELECT aca.user_id AS "userId", u.full_name AS "fullName", u.email
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
        "INSERT INTO asset_checklist_assignments (checklist_id, user_id) VALUES ? ON CONFLICT (checklist_id, user_id) DO NOTHING",
        [values]
      );

      const [assigned] = await pool.query(
        `SELECT aca.user_id AS "userId", u.full_name AS "fullName", u.email
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

// ── Submission endpoints ────────────────────────────────────────────────────

// GET /api/checklists/submissions/issues  – issues report (must be before /:id routes)
router.get(
  "/submissions/issues",
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { assetId, checklistId, from, to, limit = 50, offset = 0 } = req.query;

      let where = `c.user_id = ? AND r.flag_issue = TRUE`;
      const params = [userId];

      if (assetId) { where += " AND a.id = ?"; params.push(assetId); }
      if (checklistId) { where += " AND ac.id = ?"; params.push(checklistId); }
      if (from) { where += " AND s.created_at >= ?"; params.push(from); }
      if (to) { where += " AND s.created_at <= ?"; params.push(to); }

      params.push(Number(limit), Number(offset));

      const [rows] = await pool.query(
        `SELECT r.id, r.submission_id AS "submissionId", r.item_id AS "itemId",
                i.title AS "itemTitle", i.answer_type AS "answerType",
                r.answer, r.reason, r.remark, r.image_url AS "imageUrl", r.answered_at AS "answeredAt",
                s.checklist_id AS "checklistId", ac.name AS checklistName,
                s.asset_id AS "assetId", a.name AS assetName,
                s.submitted_by AS "submittedBy", s.submitted_by_name AS "submittedByName",
                s.created_at AS "submittedAt"
         FROM asset_checklist_item_responses r
         JOIN asset_checklist_submissions s ON s.id = r.submission_id
         JOIN asset_checklist_items i ON i.id = r.item_id
         JOIN asset_checklists ac ON ac.id = s.checklist_id
         JOIN assets a ON a.id = s.asset_id
         JOIN companies c ON c.id = a.company_id
         WHERE ${where}
         ORDER BY r.answered_at DESC
         LIMIT ? OFFSET ?`,
        params
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/checklists/:id/submit  – execute a checklist submission
router.post(
  "/:id/submit",
  validate([
    param("id").isInt({ min: 1 }).withMessage("id must be numeric"),
    body("assetId").isInt({ min: 1 }).withMessage("assetId is required"),
    body("submittedBy").isInt({ min: 1 }).withMessage("submittedBy (companyUserId) is required"),
    body("submittedByName").optional().isString().trim(),
    body("responses").isArray({ min: 1 }).withMessage("responses array is required"),
    body("responses.*.itemId").isInt({ min: 1 }).withMessage("itemId is required"),
    body("responses.*.answer").optional().isString(),
    body("responses.*.flagIssue").optional().isBoolean().toBoolean(),
    body("responses.*.reason").optional().isString().trim(),
    body("responses.*.remark").optional().isString().trim(),
    body("responses.*.imageUrl").optional().isURL(),
  ]),
  async (req, res, next) => {
    const { id } = req.params;
    const { assetId, submittedBy, submittedByName, responses } = req.body;
    try {
      // verify checklist belongs to this admin's company
      const [clRows] = await pool.query(
        `SELECT ac.id, ac.name, a.company_id AS "companyId"
         FROM asset_checklists ac
         JOIN assets a ON a.id = ac.asset_id
         JOIN companies c ON c.id = a.company_id
         WHERE ac.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (clRows.length === 0) return res.status(404).json({ message: "Checklist not found" });
      const { companyId } = clRows[0];

      // fetch all items to validate and calc stats
      const [items] = await pool.query(
        `SELECT id, title, answer_type AS "answerType", is_required AS "isRequired",
                allow_flag AS "allowFlag", require_reason AS "requireReason"
         FROM asset_checklist_items WHERE checklist_id = ?`,
        [id]
      );

      const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
      const totalItems = items.filter((i) => i.isRequired).length || items.length;
      let answered = 0; let totalIssues = 0;

      for (const r of responses) {
        const item = itemMap[r.itemId];
        if (!item) continue;
        if (r.answer !== undefined && r.answer !== null && r.answer !== "") answered++;
        if (r.flagIssue) totalIssues++;
      }

      const completionPct = Math.round((answered / Math.max(totalItems, 1)) * 100);
      let status = "completed";
      if (totalIssues > 0) status = "completed_with_issues";
      if (completionPct < 100) status = completionPct === 0 ? "in_progress" : "in_progress";
      if (completionPct >= 100 && totalIssues > 0) status = "completed_with_issues";
      if (completionPct >= 100 && totalIssues === 0) status = "completed";

      // insert submission
      const [subResult] = await pool.execute(
        `INSERT INTO asset_checklist_submissions
           (checklist_id, asset_id, submitted_by, submitted_by_name, status, completion_pct, total_issues, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW()) RETURNING id`,
        [id, assetId, submittedBy, submittedByName || null, status, completionPct, totalIssues]
      );
      const submissionId = subResult.insertId;

      // insert responses
      if (responses.length > 0) {
        const resValues = responses.map((r) => [
          submissionId,
          r.itemId,
          r.answer || null,
          r.flagIssue ? true : false,
          r.reason || null,
          r.remark || null,
          r.imageUrl || null,
        ]);
        await pool.query(
          `INSERT INTO asset_checklist_item_responses
             (submission_id, item_id, answer, flag_issue, reason, remark, image_url)
           VALUES ?`,
          [resValues]
        );
      }

      // create flags for flagged items (non-fatal)
      const flagPromises = responses
        .filter((r) => r.flagIssue && itemMap[r.itemId]?.allowFlag)
        .map((r) =>
          createFlag(
            {
              companyId,
              assetId,
              source: "checklist",
              checklistId: id,
              submissionId,
              questionId: r.itemId,
              raisedBy: submittedBy,
              severity: "medium",
              description: `Checklist item flagged: ${itemMap[r.itemId]?.title || r.itemId}${
                r.reason ? ` — ${r.reason}` : ""
              }`,
            },
            { id: assetId },
            pool
          ).catch(() => null)
        );
      await Promise.allSettled(flagPromises);

      res.status(201).json({
        id: submissionId,
        checklistId: Number(id),
        assetId,
        submittedBy,
        submittedByName: submittedByName || null,
        status,
        completionPct,
        totalIssues,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/checklists/:id/submissions  – list submissions for a checklist
router.get(
  "/:id/submissions",
  validate([
    param("id").isInt({ min: 1 }).withMessage("id must be numeric"),
    query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
    query("offset").optional().isInt({ min: 0 }).toInt(),
  ]),
  async (req, res, next) => {
    const { id } = req.params;
    const { limit = 20, offset = 0, status } = req.query;
    try {
      // verify ownership
      const [clRows] = await pool.query(
        `SELECT ac.id FROM asset_checklists ac
         JOIN assets a ON a.id = ac.asset_id
         JOIN companies c ON c.id = a.company_id
         WHERE ac.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (clRows.length === 0) return res.status(404).json({ message: "Checklist not found" });

      let where = "s.checklist_id = ?";
      const params = [id];
      if (status) { where += " AND s.status = ?"; params.push(status); }

      const [subs] = await pool.query(
        `SELECT s.id, s.checklist_id AS "checklistId", s.asset_id AS "assetId",
                s.submitted_by AS "submittedBy", s.submitted_by_name AS "submittedByName",
                s.status, s.completion_pct AS "completionPct", s.total_issues AS "totalIssues",
                s.submitted_at AS "submittedAt", s.created_at AS "createdAt"
         FROM asset_checklist_submissions s
         WHERE ${where}
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
      );

      if (subs.length === 0) return res.json([]);

      const subIds = subs.map((s) => s.id);
      const [responses] = await pool.query(
        `SELECT r.id, r.submission_id AS "submissionId", r.item_id AS "itemId",
                i.title AS "itemTitle", i.answer_type AS "answerType",
                r.answer, r.flag_issue AS "flagIssue", r.reason, r.remark, r.image_url AS "imageUrl", r.answered_at AS "answeredAt"
         FROM asset_checklist_item_responses r
         JOIN asset_checklist_items i ON i.id = r.item_id
         WHERE r.submission_id IN (${subIds.map(() => "?").join(",")})
         ORDER BY i.order_index ASC, i.id ASC`,
        subIds
      );

      const grouped = subs.map((s) => ({
        ...s,
        responses: responses.filter((r) => r.submissionId === s.id),
      }));

      res.json(grouped);
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
        `SELECT ac.asset_id AS "assetId"
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
