import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const assetTypes = ["soft", "technical", "fleet"];
const answerTypes = ["yes_no", "text", "number"];
const priorityLevels = ["low", "medium", "high", "critical"];
const headerFields = ["siteName", "location", "capacity", "assetId", "monthYear", "shift", "technician", "supervisor"];

const ensureTemplateOwned = async (templateId, userId) => {
  const [rows] = await pool.query(
    `SELECT lt.id, lt.company_id AS companyId
     FROM logsheet_templates lt
     JOIN companies c ON lt.company_id = c.id
     WHERE lt.id = ? AND c.user_id = ?`,
    [templateId, userId]
  );
  return rows[0];
};

const ensureAssetOwned = async (assetId, userId) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.company_id AS companyId
     FROM assets a
     JOIN companies c ON a.company_id = c.id
     WHERE a.id = ? AND c.user_id = ?`,
    [assetId, userId]
  );
  return rows[0];
};

const normalizeHeaderConfig = (config = {}) => {
  const safe = {};
  headerFields.forEach((key) => {
    if (config[key] !== undefined) safe[key] = !!config[key];
  });
  return safe;
};

const normalizeRule = (rule) => {
  if (!rule) return null;
  if (typeof rule === "string") return { ruleText: rule };
  if (typeof rule === "object") {
    const normalized = {};
    if (rule.ruleText) normalized.ruleText = rule.ruleText;
    if (rule.minValue !== undefined && rule.minValue !== null) normalized.minValue = Number(rule.minValue);
    if (rule.maxValue !== undefined && rule.maxValue !== null) normalized.maxValue = Number(rule.maxValue);
    return Object.keys(normalized).length ? normalized : null;
  }
  return null;
};

const evaluateIssue = (question, rawValue) => {
  if (rawValue === undefined || rawValue === null) return { isIssue: false, reason: null, priority: question.priority || "medium" };
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  if (question.answer_type === "yes_no") {
    const val = String(value).toLowerCase();
    if (val === "no" || val === "n" || val === "0" || val === "false") {
        return { isIssue: true, reason: "Answered NO", priority: question.priority || "medium" };
    }
  }
  if (question.answer_type === "number") {
    const num = Number(value);
    if (Number.isFinite(num) && question.rule_json) {
      const rule = typeof question.rule_json === "string" ? JSON.parse(question.rule_json) : question.rule_json;
      if (rule?.maxValue !== undefined && Number.isFinite(rule.maxValue) && num > rule.maxValue) {
          return { isIssue: true, reason: `Above max ${rule.maxValue}` , priority: rule?.priority || question.priority || "high" };
      }
      if (rule?.minValue !== undefined && Number.isFinite(rule.minValue) && num < rule.minValue) {
          return { isIssue: true, reason: `Below min ${rule.minValue}` , priority: rule?.priority || question.priority || "high" };
      }
    }
  }
  return { isIssue: false, reason: null, priority: question.priority || "medium" };
};

const generateWorkOrderNumber = () => `WO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const createWorkOrder = async (conn, {
  asset,
  entryId,
  questionId,
  issueDescription,
  priority = "medium",
  createdBy,
}) => {
  const workOrderNumber = generateWorkOrderNumber();
  const location = [asset.building, asset.floor, asset.room].filter(Boolean).join(", ") || null;
  const [woResult] = await conn.execute(
    `INSERT INTO work_orders (
      work_order_number, asset_id, asset_name, location, issue_source, logsheet_entry_id, question_id, issue_description, priority, status, created_by
    ) VALUES (?, ?, ?, ?, 'logsheet', ?, ?, ?, ?, 'open', ?)` ,
    [workOrderNumber, asset.id, asset.asset_name, location, entryId, questionId, issueDescription, priority, createdBy]
  );
  const woId = woResult.insertId;
  await conn.execute(
    `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
     VALUES (?, 'open', ?, ?)` ,
    [woId, createdBy || null, issueDescription]
  );
  return { id: woId, workOrderNumber };
};

router.post(
  "/",
  validate([
    body("companyId").isInt({ min: 1 }),
    body("templateName").trim().notEmpty(),
    body("assetType").isIn(assetTypes),
    body("assetModel").optional().isString(),
    body("description").optional().isString(),
    body("isActive").optional().isBoolean().toBoolean(),
    body("headerConfig").optional().isObject(),
    body("sections").isArray({ min: 1 }),
    body("sections.*.name").trim().notEmpty(),
    body("sections.*.order").optional().isInt({ min: 0 }).toInt(),
    body("sections.*.questions").isArray({ min: 1 }),
    body("sections.*.questions.*.questionText").trim().notEmpty(),
    body("sections.*.questions.*.answerType").isIn(answerTypes),
    body("sections.*.questions.*.specification").optional().isString(),
    body("sections.*.questions.*.rule").optional(),
    body("sections.*.questions.*.priority").optional().isIn(priorityLevels),
    body("sections.*.questions.*.mandatory").optional().isBoolean().toBoolean(),
    body("sections.*.questions.*.order").optional().isInt({ min: 0 }).toInt(),
  ]),
  async (req, res, next) => {
    const { companyId, templateName, assetType, assetModel, description, isActive = true, headerConfig = {}, sections } = req.body;
    const headerJson = normalizeHeaderConfig(headerConfig);
    try {
      const [companyRows] = await pool.query(
        "SELECT id FROM companies WHERE id = ? AND user_id = ?",
        [companyId, req.user.id]
      );
      if (companyRows.length === 0) return res.status(404).json({ message: "Company not found" });

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [tmplResult] = await conn.execute(
          `INSERT INTO logsheet_templates (company_id, template_name, asset_type, asset_model, header_config, description, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
          [companyId, templateName, assetType, assetModel || null, JSON.stringify(headerJson), description || null, isActive ? 1 : 0, req.user.id]
        );
        const templateId = tmplResult.insertId;

        for (let sIdx = 0; sIdx < sections.length; sIdx += 1) {
          const section = sections[sIdx];
          const [secResult] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index)
             VALUES (?, ?, ?)` ,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secResult.insertId;

          const questionValues = section.questions.map((q, qIdx) => [
            sectionId,
            q.questionText,
            q.specification || null,
            q.answerType,
            normalizeRule(q.rule) ? JSON.stringify(normalizeRule(q.rule)) : null,
            q.priority && priorityLevels.includes(q.priority) ? q.priority : "medium",
            q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);

          await conn.query(
            `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index)
             VALUES ?`,
            [questionValues]
          );
        }

        await conn.commit();
        res.status(201).json({ id: templateId });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/",
  validate([
    query("companyId").optional().isInt({ min: 1 }),
    query("assetType").optional().isIn(assetTypes),
    query("includeSections").optional().isBoolean().toBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const { companyId, assetType, includeSections = false } = req.query;
      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";
      if (companyId) { where += " AND lt.company_id = ?"; params.push(companyId); }
      if (assetType) { where += " AND lt.asset_type = ?"; params.push(assetType); }

      const [templates] = await pool.query(
        `SELECT lt.id, lt.company_id AS companyId, lt.template_name AS templateName, lt.asset_type AS assetType,
                lt.asset_model AS assetModel, lt.header_config AS headerConfig, lt.description, lt.is_active AS isActive, lt.created_at AS createdAt
         FROM logsheet_templates lt
         JOIN companies c ON lt.company_id = c.id
         ${where}
         ORDER BY lt.created_at DESC`,
        params
      );

      if (!includeSections || templates.length === 0) {
        const basic = templates.map((t) => ({ ...t, headerConfig: t.headerConfig ? JSON.parse(t.headerConfig) : {} }));
        return res.json(basic);
      }

      const templateIds = templates.map((t) => t.id);
      const [sections] = await pool.query(
        `SELECT id, template_id AS templateId, section_name AS sectionName, order_index AS orderIndex
         FROM logsheet_sections
         WHERE template_id IN (${templateIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        templateIds
      );

      const sectionIds = sections.map((s) => s.id);
      let questions = [];
      if (sectionIds.length) {
        const [rows] = await pool.query(
            `SELECT id, section_id AS sectionId, question_text AS questionText, specification, answer_type AS answerType,
              rule_json AS ruleJson, priority, is_mandatory AS isMandatory, order_index AS orderIndex
           FROM logsheet_questions
           WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
           ORDER BY order_index ASC, id ASC`,
          sectionIds
        );
        questions = rows;
      }

      const mapped = templates.map((t) => ({
        ...t,
        headerConfig: t.headerConfig ? JSON.parse(t.headerConfig) : {},
        sections: sections
          .filter((s) => s.templateId === t.id)
          .map((s) => ({
            ...s,
            questions: questions
              .filter((q) => q.sectionId === s.id)
              .map((q) => ({
                ...q,
                rule: q.ruleJson ? JSON.parse(q.ruleJson) : undefined,
              })),
          })),
      }));

      res.json(mapped);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/assign",
  validate([
    param("id").isInt({ min: 1 }),
    body("assetId").isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { assetId } = req.body;
    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const asset = await ensureAssetOwned(assetId, req.user.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      if (template.companyId !== asset.companyId) {
        return res.status(400).json({ message: "Template and asset must belong to the same company" });
      }

      await pool.query(
        `INSERT INTO logsheet_template_assignments (template_id, asset_id, attached_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE attached_at = attached_at`,
        [templateId, assetId, req.user.id]
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/asset/:assetId",
  validate([param("assetId").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const assetId = Number(req.params.assetId);
      const asset = await ensureAssetOwned(assetId, req.user.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });

      const [templates] = await pool.query(
        `SELECT lta.template_id AS templateId, lt.template_name AS templateName, lt.asset_type AS assetType,
                lt.is_active AS isActive, lt.header_config AS headerConfig
         FROM logsheet_template_assignments lta
         JOIN logsheet_templates lt ON lta.template_id = lt.id
         WHERE lta.asset_id = ?
         ORDER BY lt.template_name ASC`,
        [assetId]
      );

      if (templates.length === 0) return res.json([]);

      const templateIds = templates.map((t) => t.templateId);
      const [sections] = await pool.query(
        `SELECT id, template_id AS templateId, section_name AS sectionName, order_index AS orderIndex
         FROM logsheet_sections
         WHERE template_id IN (${templateIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        templateIds
      );
      const sectionIds = sections.map((s) => s.id);
      let questions = [];
      if (sectionIds.length) {
        const [rows] = await pool.query(
          `SELECT id, section_id AS sectionId, question_text AS questionText, specification, answer_type AS answerType,
                  rule_json AS ruleJson, is_mandatory AS isMandatory, order_index AS orderIndex
           FROM logsheet_questions
           WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
           ORDER BY order_index ASC, id ASC`,
          sectionIds
        );
        questions = rows;
      }

      const result = templates.map((t) => ({
        ...t,
        headerConfig: t.headerConfig ? JSON.parse(t.headerConfig) : {},
        sections: sections
          .filter((s) => s.templateId === t.templateId)
          .map((s) => ({
            ...s,
            questions: questions
              .filter((q) => q.sectionId === s.id)
              .map((q) => ({ ...q, rule: q.ruleJson ? JSON.parse(q.ruleJson) : undefined })),
          })),
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/entries",
  validate([
    param("id").isInt({ min: 1 }),
    body("assetId").isInt({ min: 1 }),
    body("month").isInt({ min: 1, max: 12 }).toInt(),
    body("year").isInt({ min: 2000, max: 2100 }).toInt(),
    body("shift").optional().isString(),
    body("headerValues").optional().isObject(),
    body("answers").isArray({ min: 1 }),
    body("answers.*.questionId").isInt({ min: 1 }).toInt(),
    body("answers.*.dateColumn").isInt({ min: 1, max: 31 }).toInt(),
    body("answers.*.answerValue").optional(),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { assetId, month, year, shift, headerValues = {}, answers } = req.body;
    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const asset = await ensureAssetOwned(assetId, req.user.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      if (template.companyId !== asset.companyId) {
        return res.status(400).json({ message: "Template and asset must belong to the same company" });
      }

      const [questionRows] = await pool.query(
        `SELECT q.id, q.answer_type, q.rule_json, q.priority, q.question_text AS questionText
         FROM logsheet_questions q
         JOIN logsheet_sections s ON q.section_id = s.id
         WHERE s.template_id = ?`,
        [templateId]
      );
      const questionMap = new Map(questionRows.map((q) => [q.id, q]));

      const invalid = answers.find((a) => !questionMap.has(a.questionId));
      if (invalid) return res.status(400).json({ message: `Question ${invalid.questionId} does not belong to template` });

      const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [entryResult] = await conn.execute(
          `INSERT INTO logsheet_entries (template_id, asset_id, submitted_by, entry_date, month, year, shift, header_values, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
          [templateId, assetId, req.user.id, monthDate, month, year, shift || null, JSON.stringify(headerValues || {}), JSON.stringify({})]
        );
        const entryId = entryResult.insertId;

        const answerValues = answers.map((a) => {
          const question = questionMap.get(a.questionId);
          const issue = evaluateIssue(question, a.answerValue);
          const detail = issue.isIssue ? { reason: issue.reason, priority: issue.priority } : null;
          return [
            entryId,
            a.questionId,
            a.dateColumn,
            a.answerValue !== undefined && a.answerValue !== null ? String(a.answerValue) : null,
            issue.isIssue ? 1 : 0,
            issue.reason,
            detail ? JSON.stringify(detail) : null,
          ];
        });

        await conn.query(
          `INSERT INTO logsheet_answers (entry_id, question_id, date_column, answer_value, is_issue, issue_reason, issue_detail)
           VALUES ?`,
          [answerValues]
        );

        // Auto-create work orders for issues
        const issueAnswers = answers.map((a, idx) => ({ ...a, idx })).filter((_, idx) => answerValues[idx][4] === 1);
        if (issueAnswers.length) {
          const [assetRows] = await conn.query(
            `SELECT id, asset_name, building, floor, room
             FROM assets WHERE id = ?` ,
            [assetId]
          );
          const assetRow = assetRows[0];
          for (const issue of issueAnswers) {
            const question = questionMap.get(issue.questionId);
            const issueDetail = answerValues[issue.idx][6] ? JSON.parse(answerValues[issue.idx][6]) : null;
            const desc = `Logsheet issue on question '${question.questionText || ""}' (Q${issue.questionId}) for asset ${assetRow?.asset_name || assetId}. Answer: ${issue.answerValue ?? ""}. Reason: ${issueDetail?.reason || "Rule triggered"}.`;
            await createWorkOrder(conn, {
              asset: assetRow,
              entryId,
              questionId: issue.questionId,
              issueDescription: desc,
              priority: issueDetail?.priority || question.priority || "medium",
              createdBy: req.user.id,
            });
          }
        }

        await conn.commit();
        res.status(201).json({ id: entryId, issues: answerValues.filter((v) => v[4] === 1).length });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id/entries",
  validate([
    param("id").isInt({ min: 1 }),
    query("assetId").optional().isInt({ min: 1 }),
    query("month").optional().isInt({ min: 1, max: 12 }).toInt(),
    query("year").optional().isInt({ min: 2000, max: 2100 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 500 }),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { assetId, month, year, limit = 100 } = req.query;
    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const params = [templateId];
      let where = "WHERE le.template_id = ?";
      if (assetId) { where += " AND le.asset_id = ?"; params.push(assetId); }
      if (month) { where += " AND le.month = ?"; params.push(month); }
      if (year) { where += " AND le.year = ?"; params.push(year); }

      const [entries] = await pool.query(
        `SELECT le.id, le.asset_id AS assetId, le.template_id AS templateId, le.submitted_by AS submittedBy,
                le.entry_date AS entryDate, le.month, le.year, le.shift, le.header_values AS headerValues,
                le.submitted_at AS submittedAt
         FROM logsheet_entries le
         ${where}
         ORDER BY le.submitted_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
      );

      if (entries.length === 0) return res.json([]);

      const entryIds = entries.map((e) => e.id);
      const [answers] = await pool.query(
        `SELECT id, entry_id AS entryId, question_id AS questionId, date_column AS dateColumn, answer_value AS answerValue,
                is_issue AS isIssue, issue_reason AS issueReason
         FROM logsheet_answers
         WHERE entry_id IN (${entryIds.map(() => "?").join(",")})
         ORDER BY entry_id ASC, question_id ASC, date_column ASC`,
        entryIds
      );

      const result = entries.map((e) => ({
        ...e,
        headerValues: e.headerValues ? JSON.parse(e.headerValues) : {},
        answers: answers.filter((a) => a.entryId === e.id),
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
