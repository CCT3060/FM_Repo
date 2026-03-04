import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";
import { orchestrateFlag } from "../utils/flagOrchestrator.js";

const router = Router();
router.use(requireAuth);

// pg returns JSONB columns as already-parsed JS objects; guard against re-parsing
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
};

const templateInputTypes = [
  "text",
  "yes_no",
  "dropdown",
  "number",
  "photo",
  "signature",
  "ok_not_ok",
  "remark",
];
const assetTypes = ["soft", "technical", "fleet", "building", "room", "generic"];
const frequencies = ["Daily", "Weekly", "Monthly", "Custom"];
const assignmentTargets = ["asset", "location", "department", "user"];

const ensureTemplateOwned = async (templateId, userId) => {
  const [rows] = await pool.query(
    `SELECT ct.id, ct.company_id AS "companyId"
     FROM checklist_templates ct
     JOIN companies c ON ct.company_id = c.id
     WHERE ct.id = ? AND c.user_id = ?`,
    [templateId, userId]
  );
  return rows[0];
};

const ensureAssetOwned = async (assetId, userId) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.company_id AS "companyId"
     FROM assets a
     JOIN companies c ON a.company_id = c.id
     WHERE a.id = ? AND c.user_id = ?`,
    [assetId, userId]
  );
  return rows[0];
};

router.post(
  "/",
  validate([
    body("companyId").isInt({ min: 1 }),
    body("templateName").trim().notEmpty(),
    body("assetType").isString().trim().notEmpty(),
    body("category").optional().isString(),
    body("description").optional().isString(),
    body("frequency").optional().isIn(frequencies),
    body("shift").optional().isString(),
    body("status").optional().isIn(["active", "inactive"]),
    body("isActive").optional().isBoolean().toBoolean(),
    body("assetId").optional({ nullable: true }).isInt({ min: 1 }),
    body("questions").isArray({ min: 1 }),
    body("questions.*.questionText").trim().notEmpty(),
    body("questions.*.inputType").isIn(templateInputTypes),
    body("questions.*.isRequired").optional().isBoolean().toBoolean(),
    body("questions.*.orderIndex").optional().isInt(),
    body("questions.*.options").optional().isArray(),
    body("questions.*.meta").optional().isObject(),
    body("questions.*.flagRule").optional().isObject(),
    body("questions.*.flagRule.enabled").optional().isBoolean().toBoolean(),
    body("questions.*.flagRule.operator").optional().isString(),
    body("questions.*.flagRule.triggerValue").optional(),
    body("questions.*.flagRule.value1").optional().toFloat(),
    body("questions.*.flagRule.value2").optional().toFloat(),
    body("questions.*.flagRule.pctThreshold").optional().toFloat(),
    body("questions.*.flagRule.compareTo").optional().isIn(["value","previous","rolling_avg","baseline","another_question"]),
    body("questions.*.flagRule.severity").optional().isIn(["low","medium","high","critical"]),
    body("questions.*.flagRule.autoCreateWo").optional().isBoolean().toBoolean(),
    body("questions.*.flagRule.clientVisible").optional().isBoolean().toBoolean(),
    body("questions.*.flagRule.rollingWindow").optional().isInt({ min: 1, max: 30 }),
    body("questions.*.flagRule.baselineValue").optional().toFloat(),
    body("questions.*.flagRule.label").optional().isString(),
  ]),
  async (req, res, next) => {
    const {
      companyId,
      templateName,
      assetType,
      assetId,
      category,
      description,
      frequency = "Daily",
      shift,
      status = "active",
      isActive = true,
      questions,
    } = req.body;

    try {
      const [companyRows] = await pool.query(
        "SELECT id FROM companies WHERE id = ? AND user_id = ?",
        [companyId, req.user.id]
      );
      if (companyRows.length === 0) return res.status(404).json({ message: "Company not found" });

      const conn = pool;
      const [templateResult] = await conn.execute(
        `INSERT INTO checklist_templates (
            company_id, template_name, asset_type, asset_id, category, description, frequency, shift, status, is_active, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id` ,
        [
          companyId,
          templateName,
          assetType,
          assetId || null,
          category || null,
          description || null,
          frequency,
          shift || null,
          status,
          isActive ? 1 : 0,
          req.user.id,
        ]
      );
      const templateId = templateResult.insertId;

      const values = questions.map((q, idx) => [
        templateId,
        q.questionText,
        q.inputType,
        q.isRequired ? 1 : 0,
        Number.isInteger(q.orderIndex) ? q.orderIndex : idx,
        q.options ? JSON.stringify(q.options) : null,
        JSON.stringify({ ...(q.meta || {}), ...(q.rule ? { rule: q.rule } : {}) }) || null,
        q.flagRule ? JSON.stringify(q.flagRule) : null,
      ]);

      await conn.query(
        `INSERT INTO checklist_template_questions
           (template_id, question_text, input_type, is_required, order_index, options_json, meta, flag_rule_json)
         VALUES ?`,
        [values]
      );

      // Fetch inserted question IDs to link flag_rule_conditions
      const [insertedQs] = await conn.query(
        `SELECT id, order_index AS orderIndex FROM checklist_template_questions
         WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
        [templateId]
      );
      const questionsWithIds = questions.map((q, idx) => ({
        ...q,
        id: insertedQs[idx]?.id,
      }));

      await syncQuestionFlagRules(templateId, companyId, questionsWithIds, conn);

      res.status(201).json({ id: templateId });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/",
  validate([
    query("companyId").optional().isInt({ min: 1 }),
    query("assetType").optional().isString(),
    query("category").optional().isString(),
    query("status").optional().isIn(["active", "inactive"]),
    query("includeQuestions").optional().isBoolean().toBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const { companyId, assetType, category, status, includeQuestions = false } = req.query;
      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";
      if (companyId) {
        where += " AND ct.company_id = ?";
        params.push(companyId);
      }
      if (assetType) {
        where += " AND ct.asset_type = ?";
        params.push(assetType);
      }
      if (category) {
        where += " AND ct.category = ?";
        params.push(category);
      }
      if (status) {
        where += " AND ct.status = ?";
        params.push(status);
      }

      const [templates] = await pool.query(
        `SELECT ct.id, ct.company_id AS "companyId", ct.template_name AS "templateName", ct.asset_type AS "assetType",
          ct.asset_id AS "assetId", a.asset_name AS "assetName",
          ct.category, ct.description, ct.frequency, ct.shift, ct.status, ct.is_active AS "isActive",
          ct.questions, ct.created_at AS "createdAt"
         FROM checklist_templates ct
         JOIN companies c ON ct.company_id = c.id
         LEFT JOIN assets a ON ct.asset_id = a.id
         ${where}
         ORDER BY ct.created_at DESC`,
        params
      );

      if (!includeQuestions || templates.length === 0) return res.json(templates);

      const templateIds = templates.map((t) => t.id);
      const [questions] = await pool.query(
        `SELECT id, template_id AS "templateId", question_text AS "questionText", input_type AS "inputType",
                is_required AS "isRequired", order_index AS "orderIndex", options_json AS "optionsJson", meta
         FROM checklist_template_questions
         WHERE template_id IN (${templateIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        templateIds
      );

      const withQuestions = templates.map((t) => ({
        ...t,
        questions: questions
          .filter((q) => q.templateId === t.id)
          .map((q) => {
            const parsedMeta = q.meta ? JSON.parse(q.meta) : {};
            return {
              ...q,
              meta: parsedMeta,
              rule: parsedMeta.rule || undefined,
              options: q.optionsJson ? JSON.parse(q.optionsJson) : undefined,
            };
          }),
      }));

      res.json(withQuestions);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/assign",
  validate([
    param("id").isInt({ min: 1 }),
    body("assignedToType").isIn(assignmentTargets),
    body("assignedToId").isInt({ min: 1 }),
    body("frequency").optional().isIn(frequencies),
    body("startDate").optional().isISO8601(),
    body("dueTime").optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body("status").optional().isIn(["active", "inactive"]),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { assignedToType, assignedToId, frequency = "Daily", startDate, dueTime, status = "active" } = req.body;

    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      await pool.query(
        `INSERT INTO checklist_assignments (template_id, assigned_to_type, assigned_to_id, frequency, start_date, due_time, status, attached_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (template_id, assigned_to_type, assigned_to_id)
         DO UPDATE SET frequency = EXCLUDED.frequency, start_date = EXCLUDED.start_date, due_time = EXCLUDED.due_time, status = EXCLUDED.status`,
        [templateId, assignedToType, assignedToId, frequency, startDate || null, dueTime || null, status, req.user.id]
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/assignments",
  validate([
    query("companyId").optional().isInt({ min: 1 }),
    query("assignedToType").optional().isIn(assignmentTargets),
    query("assignedToId").optional().isInt({ min: 1 }),
    query("status").optional().isIn(["active", "inactive"]),
  ]),
  async (req, res, next) => {
    try {
      const { companyId, assignedToType, assignedToId, status } = req.query;
      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";
      if (companyId) {
        where += " AND ct.company_id = ?";
        params.push(companyId);
      }
      if (assignedToType) {
        where += " AND ca.assigned_to_type = ?";
        params.push(assignedToType);
      }
      if (assignedToId) {
        where += " AND ca.assigned_to_id = ?";
        params.push(assignedToId);
      }
      if (status) {
        where += " AND ca.status = ?";
        params.push(status);
      }

      const [rows] = await pool.query(
        `SELECT ca.id, ca.template_id AS "templateId", ca.assigned_to_type AS "assignedToType", ca.assigned_to_id AS "assignedToId",
                ca.frequency, ca.start_date AS "startDate", ca.due_time AS "dueTime", ca.status, ca.attached_at AS "attachedAt",
                ct.template_name AS "templateName", ct.asset_type AS "assetType", ct.category
         FROM checklist_assignments ca
         JOIN checklist_templates ct ON ca.template_id = ct.id
         JOIN companies c ON ct.company_id = c.id
         ${where}
         ORDER BY ca.attached_at DESC`,
        params
      );

      res.json(rows);
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
        `SELECT ca.id AS "assignmentId", ca.template_id AS "templateId", ct.template_name AS "templateName", ct.asset_type AS "assetType",
                ct.frequency, ct.shift, ct.status, ct.is_active AS "isActive", ca.frequency AS "assignmentFrequency",
                ca.start_date AS "startDate", ca.due_time AS "dueTime"
         FROM checklist_assignments ca
         JOIN checklist_templates ct ON ca.template_id = ct.id
         WHERE ca.assigned_to_type = 'asset' AND ca.assigned_to_id = ? AND ca.status = 'active'
         ORDER BY ct.template_name ASC`,
        [assetId]
      );

      if (templates.length === 0) return res.json([]);

      const templateIds = templates.map((t) => t.templateId);
      const [questions] = await pool.query(
        `SELECT id, template_id AS "templateId", question_text AS "questionText", input_type AS "inputType",
                is_required AS "isRequired", order_index AS "orderIndex", options_json AS "optionsJson", meta
         FROM checklist_template_questions
         WHERE template_id IN (${templateIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        templateIds
      );

      const result = templates.map((t) => ({
        ...t,
        questions: questions
          .filter((q) => q.templateId === t.templateId)
          .map((q) => {
            const parsedMeta = q.meta ? JSON.parse(q.meta) : {};
            return {
              ...q,
              meta: parsedMeta,
              rule: parsedMeta.rule || undefined,
              options: q.optionsJson ? JSON.parse(q.optionsJson) : undefined,
            };
          }),
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

const ensureAssignmentOwned = async (assignmentId, userId) => {
  const [rows] = await pool.query(
    `SELECT ca.id, ca.template_id AS "templateId", ca.assigned_to_type AS "assignedToType", ca.assigned_to_id AS "assignedToId",
            ca.frequency, ca.start_date AS "startDate", ca.due_time AS "dueTime", ca.status,
            ct.company_id AS "companyId", ct.asset_type AS "assetType", ct.category, ct.template_name AS "templateName"
     FROM checklist_assignments ca
     JOIN checklist_templates ct ON ca.template_id = ct.id
     JOIN companies c ON ct.company_id = c.id
     WHERE ca.id = ? AND c.user_id = ?`,
    [assignmentId, userId]
  );
  return rows[0];
};

const fetchQuestionsForTemplate = async (templateId) => {
  const [questions] = await pool.query(
    `SELECT id, question_text AS "questionText", input_type AS "inputType", is_required AS "isRequired",
            order_index AS "orderIndex", options_json AS "optionsJson", meta, flag_rule_json AS "flagRuleJson"
     FROM checklist_template_questions
     WHERE template_id = ?
     ORDER BY order_index ASC, id ASC`,
    [templateId]
  );
  return questions.map((q) => {
    const parsedMeta = q.meta ? JSON.parse(q.meta) : {};
    const flagRule = q.flagRuleJson
      ? (typeof q.flagRuleJson === 'string' ? JSON.parse(q.flagRuleJson) : q.flagRuleJson)
      : undefined;
    return {
      ...q,
      options:     q.optionsJson ? JSON.parse(q.optionsJson) : undefined,
      meta:        parsedMeta,
      rule:        parsedMeta.rule || undefined,
      flagRule:    flagRule || undefined,
      flagRuleJson: undefined, // remove raw column from output
    };
  });
};

/**
 * Auto-sync question-level flagRules into flag_rule_groups + flag_rule_conditions.
 * Called after every template create / update.
 * One flag_rule_groups record is created per question that has flagRule.enabled = true.
 */
const syncQuestionFlagRules = async (templateId, companyId, questionsWithIds, conn) => {
  // Delete all existing auto-generated rule groups for this template
  await conn.query(
    `DELETE FROM flag_rule_groups
     WHERE checklist_template_id = ? AND company_id = ? AND (created_by IS NULL OR created_by = 0)`,
    [templateId, companyId]
  ).catch(() => {}); // table may not exist yet during first migration run

  const enabledRules = questionsWithIds.filter(
    (q) => q.flagRule && q.flagRule.enabled !== false
  );
  if (!enabledRules.length) return;

  for (const q of enabledRules) {
    const fr = q.flagRule;
    const severity = fr.severity || 'medium';
    const label    = fr.label || q.questionText || `Q${q.id} flag rule`;

    try {
      // Create group
      const [grpResult] = await conn.query(
        `INSERT INTO flag_rule_groups
           (company_id, checklist_template_id, name, logic_operator, applies_to,
            severity_override, auto_create_wo, auto_wo_threshold,
            client_visible, visibility_mode, is_active, created_by, created_at)
         VALUES (?, ?, ?, 'AND', 'checklist', ?, ?, ?,
                 ?, 'internal', true, 0, NOW())`,
        [
          companyId, templateId,
          label.slice(0, 200),
          severity,
          fr.autoCreateWo   ? true  : false,
          fr.autoWoThreshold || 'high',
          fr.clientVisible  ? true  : false,
        ]
      );
      const groupId = grpResult.insertId;

      // Create condition
      await conn.query(
        `INSERT INTO flag_rule_conditions
           (group_id, condition_order, source_type, question_id,
            compare_to, rolling_window, baseline_value,
            operator, value1, value2, pct_threshold, trigger_value,
            created_at)
         VALUES (?, 0, 'question', ?,
                 ?, ?, ?,
                 ?, ?, ?, ?, ?,
                 NOW())`,
        [
          groupId, q.id,
          fr.compareTo     || 'value',
          fr.rollingWindow || 3,
          fr.baselineValue ?? null,
          fr.operator      || 'yes_no',
          fr.value1        ?? null,
          fr.value2        ?? null,
          fr.pctThreshold  ?? null,
          fr.triggerValue  ?? null,
        ]
      );
    } catch (err) {
      console.error('[syncQuestionFlagRules] error for question', q.id, err.message);
    }
  }
};

router.get(
  "/assignments/:assignmentId/form",
  validate([param("assignmentId").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const assignment = await ensureAssignmentOwned(assignmentId, req.user.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const questions = await fetchQuestionsForTemplate(assignment.templateId);
      res.json({ assignment, questions });
    } catch (err) {
      next(err);
    }
  }
);

const validateAnswers = (questions, answers, strictRequired) => {
  const requiredIds = questions.filter((q) => q.isRequired).map((q) => q.id);
  const answeredRequired = new Set();
  const normalized = [];

  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const a of answers || []) {
    const q = byId.get(Number(a.questionId)) || null;
    const inputType = a.inputType || q?.inputType || "text";
    const questionText = a.questionText || q?.questionText || "";
    const options = q?.options || [];

    if (!questionText) {
      throw new Error("questionText is required for each answer");
    }

    if (q && q.isRequired) {
      const hasValue = a.value !== undefined && a.value !== null && String(a.value).trim() !== "";
      const hasPhoto = a.photoUrl && a.photoUrl.trim() !== "";
      if (inputType === "photo" && !hasPhoto && strictRequired) {
        throw new Error(`Photo required for question: ${questionText}`);
      }
      if (!hasValue && !hasPhoto && strictRequired) {
        throw new Error(`Answer required for question: ${questionText}`);
      }
      if (hasValue || hasPhoto) {
        answeredRequired.add(q.id);
      }
    }

    if (inputType === "dropdown" && options?.length) {
      if (a.optionSelected && !options.includes(a.optionSelected)) {
        throw new Error(`Invalid option for question: ${questionText}`);
      }
    }

    normalized.push({
      questionId: a.questionId || null,
      questionText,
      inputType,
      value: a.value,
      remark: a.remark,
      photoUrl: a.photoUrl,
      optionSelected: a.optionSelected,
    });
  }

  const completionPct = requiredIds.length === 0 ? 100 : Math.round((answeredRequired.size / requiredIds.length) * 100);

  if (strictRequired && answeredRequired.size < requiredIds.length) {
    throw new Error("All mandatory questions must be answered");
  }

  return { normalized, completionPct };
};

const createSubmission = async ({
  assignment,
  assetId,
  questions,
  answers,
  status,
  userId,
  shift,
  gpsLat,
  gpsLng,
}) => {
  const { normalized, completionPct } = validateAnswers(questions, answers, status === "submitted");

  const conn = pool;
  const [submissionResult] = await conn.execute(
    `INSERT INTO checklist_submissions (
        template_id, assignment_id, asset_id, submitted_by, shift, status, completion_pct, gps_lat, gps_lng, submitted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id` ,
    [
      assignment.templateId,
      assignment.id,
      assignment.assignedToType === "asset" ? assetId || assignment.assignedToId : null,
      userId,
      shift || null,
      status,
      completionPct,
      gpsLat || null,
      gpsLng || null,
      status === "submitted" ? new Date() : null,
    ]
  );
  const submissionId = submissionResult.insertId;

  if (normalized.length) {
    const values = normalized.map((a) => [
      submissionId,
      a.questionId,
      a.questionText,
      a.inputType,
      JSON.stringify({ value: a.value, remark: a.remark, photoUrl: a.photoUrl }),
      a.optionSelected || null,
    ]);
    await conn.query(
      `INSERT INTO checklist_submission_answers
         (submission_id, question_id, question_text, input_type, answer_json, option_selected)
       VALUES ?`,
      [values]
    );
  }

  return { id: submissionId, completionPct };
};

router.post(
  "/assignments/:assignmentId/draft",
  validate([
    param("assignmentId").isInt({ min: 1 }),
    body("answers").isArray(),
    body("shift").optional().isString(),
    body("gpsLat").optional().isFloat(),
    body("gpsLng").optional().isFloat(),
  ]),
  async (req, res, next) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const { answers, shift, gpsLat, gpsLng } = req.body;
      const assignment = await ensureAssignmentOwned(assignmentId, req.user.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const questions = await fetchQuestionsForTemplate(assignment.templateId);
      const submission = await createSubmission({
        assignment,
        assetId: assignment.assignedToType === "asset" ? assignment.assignedToId : null,
        questions,
        answers,
        status: "draft",
        userId: req.user.id,
        shift,
        gpsLat,
        gpsLng,
      });

      res.status(201).json({ submissionId: submission.id, completionPct: submission.completionPct });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/assignments/:assignmentId/submit",
  validate([
    param("assignmentId").isInt({ min: 1 }),
    body("answers").isArray({ min: 1 }),
    body("shift").optional().isString(),
    body("gpsLat").optional().isFloat(),
    body("gpsLng").optional().isFloat(),
  ]),
  async (req, res, next) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const { answers, shift, gpsLat, gpsLng } = req.body;
      const assignment = await ensureAssignmentOwned(assignmentId, req.user.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const questions = await fetchQuestionsForTemplate(assignment.templateId);
      const submission = await createSubmission({
        assignment,
        assetId: assignment.assignedToType === "asset" ? assignment.assignedToId : null,
        questions,
        answers,
        status: "submitted",
        userId: req.user.id,
        shift,
        gpsLat,
        gpsLng,
      });

      res.status(201).json({ submissionId: submission.id, completionPct: submission.completionPct });

      // ── Advanced Flag Intelligence: fire orchestrator asynchronously ──────
      const assetId = assignment.assignedToType === "asset" ? (answers[0]?.assetId || assignment.assignedToId) : null;
      if (assetId && assignment.companyId) {
        const orchAnswers = (answers || []).map((a) => ({
          questionId: a.questionId,
          answerJson: { value: a.value ?? a.answerValue },
        }));
        orchestrateFlag({
          companyId:    assignment.companyId,
          assetId,
          templateId:   assignment.templateId,
          templateType: "checklist",
          submissionId: submission.id,
          answers:      orchAnswers,
          raisedBy:     req.user.id,
        }).catch((e) => console.error("[Checklist] orchestrateFlag error:", e.message));
      }
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/submissions/:id/status",
  validate([
    param("id").isInt({ min: 1 }),
    body("status").isIn(["approved", "rejected"]),
    body("supervisorNote").optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const submissionId = Number(req.params.id);
      const { status, supervisorNote } = req.body;

      const [rows] = await pool.query(
        `SELECT cs.id, cs.assignment_id AS "assignmentId", ca.template_id AS "templateId", ct.company_id AS "companyId"
         FROM checklist_submissions cs
         JOIN checklist_assignments ca ON cs.assignment_id = ca.id
         JOIN checklist_templates ct ON ca.template_id = ct.id
         JOIN companies c ON ct.company_id = c.id
         WHERE cs.id = ? AND c.user_id = ?`,
        [submissionId, req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Submission not found" });

      await pool.execute(
        `UPDATE checklist_submissions
         SET status = ?, supervisor_note = ?, supervisor_by = ?, approved_at = NOW()
         WHERE id = ?`,
        [status, supervisorNote || null, req.user.id, submissionId]
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/assignments/:assignmentId/history",
  validate([
    param("assignmentId").isInt({ min: 1 }),
    query("status").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 500 }),
  ]),
  async (req, res, next) => {
    try {
      const assignmentId = Number(req.params.assignmentId);
      const { status, limit = 100 } = req.query;
      const assignment = await ensureAssignmentOwned(assignmentId, req.user.id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const params = [assignmentId];
      let where = "WHERE cs.assignment_id = ?";
      if (status) {
        where += " AND cs.status = ?";
        params.push(status);
      }

      const [rows] = await pool.query(
        `SELECT cs.id, cs.status, cs.completion_pct AS "completionPct", cs.shift, cs.submitted_by AS "submittedBy",
                cs.submitted_at AS "submittedAt", cs.approved_at AS "approvedAt", cs.supervisor_note AS "supervisorNote"
         FROM checklist_submissions cs
         ${where}
         ORDER BY cs.submitted_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/submissions",
  validate([
    query("assignmentId").optional().isInt({ min: 1 }),
    query("assetId").optional().isInt({ min: 1 }),
    query("userId").optional().isInt({ min: 1 }),
    query("status").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 500 }),
  ]),
  async (req, res, next) => {
    try {
      const { assignmentId, assetId, userId, status, limit = 100 } = req.query;
      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";
      if (assignmentId) {
        where += " AND cs.assignment_id = ?";
        params.push(assignmentId);
      }
      if (assetId) {
        where += " AND cs.asset_id = ?";
        params.push(assetId);
      }
      if (userId) {
        where += " AND cs.submitted_by = ?";
        params.push(userId);
      }
      if (status) {
        where += " AND cs.status = ?";
        params.push(status);
      }

      const [rows] = await pool.query(
        `SELECT cs.id, cs.assignment_id AS "assignmentId", cs.asset_id AS "assetId", cs.status, cs.completion_pct AS "completionPct",
                cs.shift, cs.submitted_by AS "submittedBy", cs.submitted_at AS "submittedAt"
         FROM checklist_submissions cs
         JOIN checklist_assignments ca ON cs.assignment_id = ca.id
         JOIN checklist_templates ct ON ca.template_id = ct.id
         JOIN companies c ON ct.company_id = c.id
         ${where}
         ORDER BY cs.submitted_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/submit",
  validate([
    param("id").isInt({ min: 1 }),
    body("assetId").isInt({ min: 1 }),
    body("shift").optional().isString(),
    body("answers").isArray({ min: 1 }),
    body("answers.*.questionId").optional().isInt({ min: 1 }),
    body("answers.*.questionText").optional().isString(),
    body("answers.*.inputType").optional().isIn(templateInputTypes),
    body("answers.*.value").exists(),
    body("answers.*.remark").optional().isString(),
    body("answers.*.photoUrl").optional().isString(),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { assetId, shift, answers } = req.body;
    try {
      const template = await ensureTemplateOwned(templateId, req.user.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const asset = await ensureAssetOwned(assetId, req.user.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      if (template.companyId !== asset.companyId) {
        return res.status(400).json({ message: "Template and asset must belong to the same company" });
      }

      const [questions] = await pool.query(
        `SELECT id, question_text AS "questionText", input_type AS "inputType" FROM checklist_template_questions WHERE template_id = ?`,
        [templateId]
      );
      const questionMap = new Map(questions.map((q) => [Number(q.id), q]));

      const conn = pool;
      const [submissionResult] = await conn.execute(
        `INSERT INTO checklist_submissions (template_id, asset_id, submitted_by, shift)
         VALUES (?, ?, ?, ?)
         RETURNING id` ,
        [templateId, assetId, req.user.id, shift || null]
      );
      const submissionId = submissionResult.insertId;

      if (answers?.length) {
        const values = answers.map((a) => {
          const q = a.questionId ? questionMap.get(Number(a.questionId)) : undefined;
          const questionText = a.questionText || q?.questionText || "";
          const inputType = a.inputType || q?.inputType || "text";
          const payload = {
            value: a.value,
            remark: a.remark,
            photoUrl: a.photoUrl,
          };
          return [submissionId, a.questionId || null, questionText, inputType, JSON.stringify(payload)];
        });
        await conn.query(
          `INSERT INTO checklist_submission_answers
             (submission_id, question_id, question_text, input_type, answer_json)
           VALUES ?`,
          [values]
        );
      }

      res.status(201).json({ id: submissionId });
    } catch (err) {
      next(err);
    }
  }
);

// ── Single template with questions ────────────────────────────────────────────
router.get(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    try {
      const owned = await ensureTemplateOwned(templateId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Template not found" });

      const [rows] = await pool.query(
        `SELECT ct.id, ct.company_id AS "companyId", ct.template_name AS "templateName", ct.asset_type AS "assetType",
                ct.category, ct.description, ct.frequency, ct.shift, ct.status, ct.is_active AS "isActive",
                ct.created_at AS "createdAt"
         FROM checklist_templates ct WHERE ct.id = ?`,
        [templateId]
      );
      const tmpl = rows[0];
      if (!tmpl) return res.status(404).json({ message: "Template not found" });

      const questions = await fetchQuestionsForTemplate(templateId);
      res.json({ ...tmpl, questions });
    } catch (err) {
      next(err);
    }
  }
);

// ── Update template (rebuild questions) ───────────────────────────────────────
router.put(
  "/:id",
  validate([
    param("id").isInt({ min: 1 }),
    body("templateName").optional().trim().notEmpty(),
    body("assetType").optional().isString(),
    body("category").optional().isString(),
    body("description").optional().isString(),
    body("frequency").optional().isIn(frequencies),
    body("shift").optional().isString(),
    body("status").optional().isIn(["active", "inactive"]),
    body("isActive").optional().isBoolean().toBoolean(),
    body("questions").optional().isArray({ min: 1 }),
    body("questions.*.questionText").optional().trim().notEmpty(),
    body("questions.*.inputType").optional().isIn(templateInputTypes),
    body("questions.*.isRequired").optional().isBoolean().toBoolean(),
    body("questions.*.orderIndex").optional().isInt(),
    body("questions.*.options").optional().isArray(),
    body("questions.*.meta").optional().isObject(),
    body("questions.*.flagRule").optional().isObject(),
    body("questions.*.flagRule.enabled").optional().isBoolean().toBoolean(),
    body("questions.*.flagRule.operator").optional().isString(),
    body("questions.*.flagRule.triggerValue").optional(),
    body("questions.*.flagRule.value1").optional().toFloat(),
    body("questions.*.flagRule.value2").optional().toFloat(),
    body("questions.*.flagRule.pctThreshold").optional().toFloat(),
    body("questions.*.flagRule.compareTo").optional().isIn(["value","previous","rolling_avg","baseline","another_question"]),
    body("questions.*.flagRule.severity").optional().isIn(["low","medium","high","critical"]),
    body("questions.*.flagRule.autoCreateWo").optional().isBoolean().toBoolean(),
    body("questions.*.flagRule.clientVisible").optional().isBoolean().toBoolean(),
    body("questions.*.flagRule.rollingWindow").optional().isInt({ min: 1, max: 30 }),
    body("questions.*.flagRule.baselineValue").optional().toFloat(),
    body("questions.*.flagRule.label").optional().isString(),
  ]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    const { templateName, assetType, category, description, frequency, shift, status, isActive, questions } = req.body;
    try {
      const owned = await ensureTemplateOwned(templateId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Template not found" });

      const setClauses = [];
      const setParams = [];
      if (templateName !== undefined) { setClauses.push("template_name = ?"); setParams.push(templateName); }
      if (assetType !== undefined) { setClauses.push("asset_type = ?"); setParams.push(assetType); }
      if (category !== undefined) { setClauses.push("category = ?"); setParams.push(category || null); }
      if (description !== undefined) { setClauses.push("description = ?"); setParams.push(description || null); }
      if (frequency !== undefined) { setClauses.push("frequency = ?"); setParams.push(frequency); }
      if (shift !== undefined) { setClauses.push("shift = ?"); setParams.push(shift || null); }
      if (status !== undefined) { setClauses.push("status = ?"); setParams.push(status); }
      if (isActive !== undefined) { setClauses.push("is_active = ?"); setParams.push(isActive ? 1 : 0); }

      if (setClauses.length) {
        await pool.execute(
          `UPDATE checklist_templates SET ${setClauses.join(", ")} WHERE id = ?`,
          [...setParams, templateId]
        );
      }

      if (questions) {
        await pool.execute("DELETE FROM checklist_template_questions WHERE template_id = ?", [templateId]);
        if (questions.length) {
          const values = questions.map((q, idx) => [
            templateId,
            q.questionText,
            q.inputType,
            q.isRequired ? 1 : 0,
            Number.isInteger(q.orderIndex) ? q.orderIndex : idx,
            q.options ? JSON.stringify(q.options) : null,
            JSON.stringify({ ...(q.meta || {}), ...(q.rule ? { rule: q.rule } : {}) }) || null,
            q.flagRule ? JSON.stringify(q.flagRule) : null,
          ]);
          await pool.query(
            `INSERT INTO checklist_template_questions
               (template_id, question_text, input_type, is_required, order_index, options_json, meta, flag_rule_json)
             VALUES ?`,
            [values]
          );

          // Re-fetch IDs to sync flag rules
          const [insertedQs] = await pool.query(
            `SELECT id, order_index AS orderIndex FROM checklist_template_questions
             WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
            [templateId]
          );
          const questionsWithIds = questions.map((q, idx) => ({
            ...q,
            id: insertedQs[idx]?.id,
          }));

          // Load companyId for this template
          const [[tmpl]] = await pool.query(
            `SELECT company_id AS "companyId" FROM checklist_templates WHERE id = ?`, [templateId]
          );
          await syncQuestionFlagRules(templateId, tmpl.companyId, questionsWithIds, pool);
        }
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ── Recent checklist submissions (admin dashboard) ────────────────────────────
router.get("/submissions/recent", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cs.id, cs.submitted_at AS "submittedAt",
              ct.template_name AS "templateName", ct.id AS "templateId", ct.frequency,
              a.asset_name AS "assetName", a.id AS "assetId",
              c.company_name AS "companyName", c.id AS "companyId",
              cs.status, cs.completion_pct AS "completionPct",
              cu.full_name AS "submittedBy"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       LEFT JOIN companies c ON c.id = ct.company_id
       WHERE c.user_id = ?
       ORDER BY cs.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Single checklist submission detail (admin) ──────────────────────────── */
router.get("/submissions/:id", async (req, res, next) => {
  const submissionId = Number(req.params.id);
  try {
    const [[submission]] = await pool.query(
      `SELECT cs.id, cs.status, cs.completion_pct AS "completionPct",
              cs.submitted_at AS "submittedAt",
              ct.template_name AS "templateName", ct.id AS "templateId", ct.frequency,
              a.asset_name AS "assetName", a.id AS "assetId",
              c.company_name AS "companyName",
              cu.full_name AS "submittedBy"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       LEFT JOIN companies c ON c.id = ct.company_id
       WHERE cs.id = ? AND c.user_id = ?`,
      [submissionId, req.user.id]
    );
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const [answers] = await pool.query(
      `SELECT csa.id, csa.question_text AS "questionText", csa.input_type AS "inputType",
              csa.answer_json AS "answerJson", csa.option_selected AS "optionSelected"
       FROM checklist_submission_answers csa
       WHERE csa.submission_id = ?
       ORDER BY csa.id ASC`,
      [submissionId]
    );

    const safeParse = (v) => {
      if (v == null) return null;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
      return v;
    };

    res.json({
      ...submission,
      answers: answers.map((a) => ({ ...a, answerJson: safeParse(a.answerJson) })),
    });
  } catch (err) {
    next(err);
  }
});

// ── Delete template ────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    const templateId = Number(req.params.id);
    try {
      const owned = await ensureTemplateOwned(templateId, req.user.id);
      if (!owned) return res.status(404).json({ message: "Template not found" });

      await pool.execute("DELETE FROM checklist_templates WHERE id = ?", [templateId]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;

