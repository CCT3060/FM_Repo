import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";
import { orchestrateFlag } from "../utils/flagOrchestrator.js";

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

// pg returns JSONB columns as already-parsed JS objects; guard against re-parsing
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
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
  const [woRows] = await conn.execute(
    `INSERT INTO work_orders (
      work_order_number, asset_id, asset_name, location, issue_source, logsheet_entry_id, question_id, issue_description, priority, status, created_by
    ) VALUES (?, ?, ?, ?, 'logsheet', ?, ?, ?, ?, 'open', ?)
    RETURNING id` ,
    [workOrderNumber, asset.id, asset.asset_name, location, entryId, questionId, issueDescription, priority, createdBy]
  );
  const woId = woRows[0]?.id;
  await conn.execute(
    `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
     VALUES (?, 'open', ?, ?)` ,
    [woId, createdBy || null, issueDescription]
  );
  return { id: woId, workOrderNumber };
};

const frequencies = ["daily","weekly","monthly","quarterly","half_yearly","yearly"];

router.post(
  "/",
  validate([
    body("companyId").isInt({ min: 1 }),
    body("templateName").trim().notEmpty(),
    body("assetType").isIn(assetTypes),
    body("assetModel").optional().isString(),
    body("frequency").optional().isIn(frequencies),
    body("assetId").optional({ nullable: true }).isInt({ min: 1 }),
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
    const { companyId, templateName, assetType, assetModel, frequency = "daily", assetId, description, isActive = true, headerConfig = {}, sections } = req.body;
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
        const [tmplRows] = await conn.execute(
          `INSERT INTO logsheet_templates (company_id, asset_id, template_name, asset_type, asset_model, frequency, header_config, description, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id` ,
          [companyId, assetId || null, templateName, assetType, assetModel || null, frequency, JSON.stringify(headerJson), description || null, isActive ? 1 : 0, req.user.id]
        );
        const templateId = tmplRows[0]?.id;

        for (let sIdx = 0; sIdx < sections.length; sIdx += 1) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index)
             VALUES (?, ?, ?)
             RETURNING id` ,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;

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

        // Auto-assign to asset if provided
        if (assetId) {
          await conn.execute(
            `INSERT IGNORE INTO logsheet_template_assignments (template_id, asset_id, attached_by) VALUES (?, ?, ?)`,
            [templateId, assetId, req.user.id]
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
                lt.asset_model AS assetModel, lt.frequency, lt.asset_id AS assetId,
                a.asset_name AS assetName,
                lt.header_config AS headerConfig, lt.description, lt.is_active AS isActive, lt.created_at AS createdAt
         FROM logsheet_templates lt
         JOIN companies c ON lt.company_id = c.id
         LEFT JOIN assets a ON a.id = lt.asset_id
         ${where}
         ORDER BY lt.created_at DESC`,
        params
      );

      if (!includeSections || templates.length === 0) {
        const basic = templates.map((t) => ({ ...t, headerConfig: safeParse(t.headerConfig) ?? {} }));
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
        headerConfig: safeParse(t.headerConfig) ?? {},
        sections: sections
          .filter((s) => s.templateId === t.id)
          .map((s) => ({
            ...s,
            questions: questions
              .filter((q) => q.sectionId === s.id)
              .map((q) => ({
                ...q,
                rule: safeParse(q.ruleJson) ?? undefined,
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
         ON CONFLICT (template_id, asset_id) DO NOTHING`,
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
        headerConfig: safeParse(t.headerConfig) ?? {},
        sections: sections
          .filter((s) => s.templateId === t.templateId)
          .map((s) => ({
            ...s,
            questions: questions
              .filter((q) => q.sectionId === s.id)
              .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
          })),
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/* ── Recent filled logsheet entries (admin) ────────────────────────────────── */
router.get("/entries/recent", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT le.id, le.month, le.year, le.shift,
              COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
              le.status,
              lt.template_name AS "templateName", lt.frequency, lt.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              c.company_name AS "companyName", c.id AS "companyId",
              cu.full_name AS "submittedBy"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       LEFT JOIN companies c ON c.id = lt.company_id
       WHERE c.user_id = ?
       ORDER BY le.submitted_at DESC NULLS LAST, le.entry_date DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Single logsheet entry detail (admin) ──────────────────────────────────── */
router.get("/entries/:id", async (req, res, next) => {
  const entryId = Number(req.params.id);
  try {
    const [[entry]] = await pool.query(
      `SELECT le.id, le.month, le.year, le.shift, le.status, le.data,
              COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
              lt.template_name AS "templateName", lt.frequency, lt.id AS "templateId",
              lt.layout_type AS "layoutType", lt.header_config AS "headerConfig",
              a.asset_name AS "assetName", a.id AS "assetId",
              c.company_name AS "companyName",
              cu.full_name AS "submittedBy"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       LEFT JOIN companies c ON c.id = lt.company_id
       WHERE le.id = ? AND c.user_id = ?`,
      [entryId, req.user.id]
    );
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    const [answers] = await pool.query(
      `SELECT la.id, la.question_id AS "questionId", la.date_column AS "dateColumn",
              la.answer_value AS "answerValue", la.is_issue AS "isIssue",
              la.issue_reason AS "issueReason",
              lq.question_text AS "questionText", lq.answer_type AS "answerType",
              lq.specification,
              ls.name AS "sectionName"
       FROM logsheet_answers la
       LEFT JOIN logsheet_questions lq ON lq.id = la.question_id
       LEFT JOIN logsheet_sections ls ON ls.id = lq.section_id
       WHERE la.entry_id = ?
       ORDER BY ls.order_index ASC, lq.order_index ASC, la.date_column ASC`,
      [entryId]
    );

    const safeParse = (v) => {
      if (v == null) return null;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
      return v;
    };

    res.json({ ...entry, data: safeParse(entry.data), answers });
  } catch (err) {
    next(err);
  }
});

// ── Issues / flagged readings report ──────────────────────────────────────────
router.get("/entries/issues", async (req, res, next) => {
  const { from, to, assetId, templateId: filterTemplateId, limit = 200, offset = 0 } = req.query;
  try {
    let where = "c.user_id = ? AND la.is_issue = TRUE";
    const params = [req.user.id];
    if (assetId) { where += " AND a.id = ?"; params.push(assetId); }
    if (filterTemplateId) { where += " AND lt.id = ?"; params.push(filterTemplateId); }
    if (from) { where += " AND le.entry_date >= ?"; params.push(from); }
    if (to) { where += " AND le.entry_date <= ?"; params.push(to); }
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(
      `SELECT la.id, la.date_column AS day, la.answer_value AS value,
              la.is_issue AS isIssue, la.issue_reason AS issueReason,
              lq.question_text AS questionText, lq.specification, lq.answer_type AS answerType, lq.priority,
              ls.section_name AS sectionName,
              le.id AS entryId, le.month, le.year, le.shift,
              le.submitted_at AS submittedAt,
              lt.id AS templateId, lt.template_name AS templateName, lt.frequency,
              a.id AS assetId, a.asset_name AS assetName,
              c.id AS companyId, c.company_name AS companyName,
              cu.full_name AS submittedBy
       FROM logsheet_answers la
       JOIN logsheet_entries le ON le.id = la.entry_id
       JOIN logsheet_questions lq ON lq.id = la.question_id
       JOIN logsheet_sections ls ON ls.id = lq.section_id
       JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
       LEFT JOIN company_users cu ON cu.id = le.company_user_id
       JOIN companies c ON c.id = lt.company_id
       WHERE ${where}
       ORDER BY le.submitted_at DESC NULLS LAST, la.date_column ASC
       LIMIT ? OFFSET ?`,
      params
    );

    // Summary stats
    const [stats] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN lq.priority = 'critical' THEN 1 ELSE 0 END) AS critical,
              SUM(CASE WHEN lq.priority = 'high'     THEN 1 ELSE 0 END) AS high,
              SUM(CASE WHEN lq.priority = 'medium'   THEN 1 ELSE 0 END) AS medium,
              SUM(CASE WHEN lq.priority = 'low'      THEN 1 ELSE 0 END) AS low
       FROM logsheet_answers la
       JOIN logsheet_entries le ON le.id = la.entry_id
       JOIN logsheet_questions lq ON lq.id = la.question_id
       JOIN logsheet_sections ls ON ls.id = lq.section_id
       JOIN logsheet_templates lt ON lt.id = le.template_id
       JOIN companies c ON c.id = lt.company_id
       WHERE c.user_id = ? AND la.is_issue = TRUE`,
      [req.user.id]
    );

    res.json({ issues: rows, summary: stats[0] });
  } catch (err) {
    next(err);
  }
});

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
        const [entryRows] = await conn.execute(
          `INSERT INTO logsheet_entries (template_id, asset_id, submitted_by, entry_date, month, year, shift, header_values, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id` ,
          [templateId, assetId, req.user.id, monthDate, month, year, shift || null, JSON.stringify(headerValues || {}), JSON.stringify({})]
        );
        const entryId = entryRows[0]?.id;

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

        // ── Advanced Flag Intelligence: fire orchestrator asynchronously ──────
        const [[assetCompany]] = await pool.query(
          `SELECT company_id AS companyId FROM assets WHERE id = ? LIMIT 1`,
          [assetId]
        ).catch(() => [[null]]);
        if (assetCompany?.companyId) {
          const orchAnswers = answers.map((a) => ({
            questionId: a.questionId,
            answerJson: { value: a.answerValue },
          }));
          orchestrateFlag({
            companyId:    assetCompany.companyId,
            assetId,
            templateId,
            templateType: "logsheet",
            submissionId: entryId,
            answers:      orchAnswers,
            raisedBy:     req.user.id,
          }).catch((e) => console.error("[Logsheet] orchestrateFlag error:", e.message));
        }

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
        headerValues: safeParse(e.headerValues) ?? {},
        answers: answers.filter((a) => a.entryId === e.id),
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ── Single template with sections + questions ─────────────────────────────────
router.get(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const [rows] = await pool.query(
        `SELECT lt.id, lt.company_id AS companyId, lt.template_name AS templateName, lt.asset_type AS assetType,
                lt.asset_model AS assetModel, lt.frequency, lt.asset_id AS assetId,
                a.asset_name AS assetName,
                lt.header_config AS headerConfig, lt.description,
                lt.is_active AS isActive, lt.created_at AS createdAt
         FROM logsheet_templates lt
         LEFT JOIN assets a ON a.id = lt.asset_id
         WHERE lt.id = ?`,
        [templateId]
      );
      const tmpl = rows[0];
      if (!tmpl) return res.status(404).json({ message: "Template not found" });

      const [sections] = await pool.query(
        `SELECT id, section_name AS sectionName, order_index AS orderIndex
         FROM logsheet_sections WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
        [templateId]
      );

      const sectionIds = sections.map((s) => s.id);
      let questions = [];
      if (sectionIds.length) {
        const [qRows] = await pool.query(
          `SELECT id, section_id AS sectionId, question_text AS questionText, specification,
                  answer_type AS answerType, rule_json AS ruleJson, priority, is_mandatory AS isMandatory,
                  order_index AS orderIndex
           FROM logsheet_questions
           WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
           ORDER BY order_index ASC, id ASC`,
          sectionIds
        );
        questions = qRows;
      }

      res.json({
        ...tmpl,
        headerConfig: safeParse(tmpl.headerConfig) ?? {},
        sections: sections.map((s) => ({
          ...s,
          questions: questions
            .filter((q) => q.sectionId === s.id)
            .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Update template (rebuild sections + questions in a transaction) ────────────
router.put(
  "/:id",
  validate([
    param("id").isInt({ min: 1 }),
    body("templateName").optional().trim().notEmpty(),
    body("assetType").optional().isIn(assetTypes),
    body("assetModel").optional().isString(),
    body("description").optional().isString(),
    body("isActive").optional().isBoolean().toBoolean(),
    body("headerConfig").optional().isObject(),
    body("sections").optional().isArray({ min: 1 }),
    body("sections.*.name").optional().trim().notEmpty(),
    body("sections.*.order").optional().isInt({ min: 0 }).toInt(),
    body("sections.*.questions").optional().isArray({ min: 1 }),
    body("sections.*.questions.*.questionText").optional().trim().notEmpty(),
    body("sections.*.questions.*.answerType").optional().isIn(answerTypes),
    body("sections.*.questions.*.specification").optional().isString(),
    body("sections.*.questions.*.rule").optional(),
    body("sections.*.questions.*.priority").optional().isIn(priorityLevels),
    body("sections.*.questions.*.mandatory").optional().isBoolean().toBoolean(),
    body("sections.*.questions.*.order").optional().isInt({ min: 0 }).toInt(),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { templateName, assetType, assetModel, frequency, assetId, description, isActive, headerConfig, sections } = req.body;
    try {
      const owned = await ensureTemplateOwned(templateId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Template not found" });

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Build dynamic SET clause for scalar fields
        const setClauses = [];
        const setParams = [];
        if (templateName !== undefined) { setClauses.push("template_name = ?"); setParams.push(templateName); }
        if (assetType !== undefined) { setClauses.push("asset_type = ?"); setParams.push(assetType); }
        if (assetModel !== undefined) { setClauses.push("asset_model = ?"); setParams.push(assetModel || null); }
        if (frequency !== undefined) { setClauses.push("frequency = ?"); setParams.push(frequency); }
        if (assetId !== undefined) { setClauses.push("asset_id = ?"); setParams.push(assetId || null); }
        if (description !== undefined) { setClauses.push("description = ?"); setParams.push(description || null); }
        if (isActive !== undefined) { setClauses.push("is_active = ?"); setParams.push(isActive ? 1 : 0); }
        if (headerConfig !== undefined) { setClauses.push("header_config = ?"); setParams.push(JSON.stringify(normalizeHeaderConfig(headerConfig))); }

        if (setClauses.length) {
          await conn.execute(
            `UPDATE logsheet_templates SET ${setClauses.join(", ")} WHERE id = ?`,
            [...setParams, templateId]
          );
        }

        // Sync assignment table if assetId changed
        if (assetId !== undefined) {
          await conn.execute("DELETE FROM logsheet_template_assignments WHERE template_id = ?", [templateId]);
          if (assetId) {
            await conn.execute(
              `INSERT IGNORE INTO logsheet_template_assignments (template_id, asset_id, attached_by) VALUES (?, ?, ?)`,
              [templateId, assetId, req.user.id]
            );
          }
        }

        if (sections) {
          // Delete old sections (cascade deletes questions via FK)
          await conn.execute("DELETE FROM logsheet_sections WHERE template_id = ?", [templateId]);

          for (let sIdx = 0; sIdx < sections.length; sIdx += 1) {
            const section = sections[sIdx];
            const [secRows] = await conn.execute(
              `INSERT INTO logsheet_sections (template_id, section_name, order_index)
               VALUES (?, ?, ?) RETURNING id`,
              [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
            );
            const sectionId = secRows[0]?.id;

            if (section.questions?.length) {
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
          }
        }

        await conn.commit();
        res.status(204).send();
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

// ── Grid view: full data structure for DG-log-sheet monthly grid ──────────────
router.get(
  "/:id/grid",
  validate([
    param("id").isInt({ min: 1 }),
    query("assetId").optional().isInt({ min: 1 }).toInt(),
    query("month").optional().isInt({ min: 1, max: 12 }).toInt(),
    query("year").optional().isInt({ min: 2000, max: 2100 }).toInt(),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const now = new Date();
    const {
      assetId,
      month = now.getMonth() + 1,
      year = now.getFullYear(),
    } = req.query;

    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      // Full template with sections + questions
      const [tmplRows] = await pool.query(
        `SELECT lt.id, lt.company_id AS companyId, lt.template_name AS templateName,
                lt.asset_type AS assetType, lt.asset_model AS assetModel, lt.frequency,
                lt.asset_id AS defaultAssetId, lt.header_config AS headerConfig, lt.description
         FROM logsheet_templates lt WHERE lt.id = ?`,
        [templateId]
      );
      const tmpl = tmplRows[0];
      if (!tmpl) return res.status(404).json({ message: "Template not found" });
      tmpl.headerConfig = safeParse(tmpl.headerConfig) ?? {};

      const [sections] = await pool.query(
        `SELECT id, section_name AS sectionName, order_index AS orderIndex
         FROM logsheet_sections WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
        [templateId]
      );

      const sectionIds = sections.map((s) => s.id);
      let questions = [];
      if (sectionIds.length) {
        const [qRows] = await pool.query(
          `SELECT id, section_id AS sectionId, question_text AS questionText, specification,
                  answer_type AS answerType, rule_json AS ruleJson, priority, is_mandatory AS isMandatory,
                  order_index AS orderIndex
           FROM logsheet_questions
           WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
           ORDER BY order_index ASC, id ASC`,
          sectionIds
        );
        questions = qRows;
      }

      const structuredTemplate = {
        ...tmpl,
        sections: sections.map((s) => ({
          ...s,
          questions: questions
            .filter((q) => q.sectionId === s.id)
            .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
        })),
      };

      // Resolve effective assetId
      const effectiveAssetId = assetId || tmpl.defaultAssetId;

      // Asset info (optional — may not be linked)
      let asset = null;
      if (effectiveAssetId) {
        const [aRows] = await pool.query(
          `SELECT id, asset_name AS assetName, asset_type AS assetType, asset_id AS assetTag
           FROM assets WHERE id = ?`,
          [effectiveAssetId]
        );
        asset = aRows[0] || null;
      }

      // Find the entry for this asset+month+year
      const entryParams = [templateId, Number(month), Number(year)];
      let entryWhere = "le.template_id = ? AND le.month = ? AND le.year = ?";
      if (effectiveAssetId) {
        entryWhere += " AND le.asset_id = ?";
        entryParams.push(effectiveAssetId);
      }

      const [entryRows] = await pool.query(
        `SELECT le.id, le.asset_id AS assetId, le.shift, le.header_values AS headerValues,
                le.submitted_at AS submittedAt, le.status,
                cu.full_name AS submittedByName
         FROM logsheet_entries le
         LEFT JOIN company_users cu ON cu.id = le.company_user_id
         WHERE ${entryWhere}
         ORDER BY le.submitted_at DESC NULLS LAST
         LIMIT 1`,
        entryParams
      );

      const entry = entryRows[0] || null;
      let answers = [];

      if (entry) {
        entry.headerValues = safeParse(entry.headerValues) ?? {};
        const [ansRows] = await pool.query(
          `SELECT question_id AS questionId, date_column AS day, answer_value AS value,
                  is_issue AS isIssue, issue_reason AS issueReason
           FROM logsheet_answers WHERE entry_id = ?
           ORDER BY question_id ASC, date_column ASC`,
          [entry.id]
        );
        answers = ansRows;
      }

      // Build answer map: { [questionId]: { [day]: { value, isIssue, issueReason } } }
      const answerMap = {};
      for (const a of answers) {
        if (!answerMap[a.questionId]) answerMap[a.questionId] = {};
        answerMap[a.questionId][a.day] = {
          value: a.value,
          isIssue: !!a.isIssue,
          issueReason: a.issueReason || null,
        };
      }

      res.json({
        template: structuredTemplate,
        asset,
        month: Number(month),
        year: Number(year),
        entry: entry
          ? {
              id: entry.id,
              shift: entry.shift,
              submittedAt: entry.submittedAt,
              status: entry.status,
              submittedByName: entry.submittedByName,
              headerValues: entry.headerValues,
            }
          : null,
        answerMap,
        daysInMonth: new Date(Number(year), Number(month), 0).getDate(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Delete template ────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    try {
      const owned = await ensureTemplateOwned(templateId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Template not found" });

      await pool.execute("DELETE FROM logsheet_templates WHERE id = ?", [templateId]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;

