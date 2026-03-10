import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import {
  createFlag,
  detectChecklistFlags,
  evaluateRule,
  buildExpectedRuleText,
  calculateLogsheetSeverity,
} from "../utils/flagsHelper.js";
import { dispatchFlagNotifications } from "../utils/notificationsHelper.js";

const router = Router();
router.use(requireCompanyAuth);

// Ensure location columns exist on submission tables
pool.query("ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS latitude FLOAT8 NULL").catch(() => {});
pool.query("ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS longitude FLOAT8 NULL").catch(() => {});
pool.query("ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS latitude FLOAT8 NULL").catch(() => {});
pool.query("ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS longitude FLOAT8 NULL").catch(() => {});

// Helper to get company ID
const cid = (req) => req.companyUser.companyId;

/* ────────────────────────────────────────────────────────────────────────────
   ADMIN: Assign checklist or logsheet templates to supervisors
   ──────────────────────────────────────────────────────────────────────────── */
router.post(
  "/assign",
  validate([
    body("templateType").isIn(["checklist", "logsheet"]).withMessage("Must be checklist or logsheet"),
    body("templateId").isInt({ min: 1 }).withMessage("templateId required"),
    body("assignedTo").isInt({ min: 1 }).withMessage("assignedTo user ID required"),
    body("note").optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const { templateType, templateId, assignedTo, note } = req.body;

      // Only admin can initially assign
      if (req.companyUser.role !== "admin") {
        return res.status(403).json({ message: "Only admin can assign templates" });
      }

      // Verify assignedTo user belongs to same company
      const [[targetUser]] = await pool.query(
        `SELECT id, role FROM company_users WHERE id = ? AND company_id = ?`,
        [assignedTo, cid(req)]
      );
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found in your company" });
      }

      // Verify template exists and belongs to company
      const tableName = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
      const [[template]] = await pool.query(
        `SELECT id FROM ${tableName} WHERE id = ? AND company_id = ?`,
        [templateId, cid(req)]
      );
      if (!template) {
        return res.status(404).json({ message: `${templateType} template not found` });
      }

      // Insert assignment (upsert to handle duplicates)
      const [result] = await pool.query(
        `INSERT INTO template_user_assignments 
         (company_id, template_type, template_id, assigned_to, assigned_by, note)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (template_type, template_id, assigned_to)
         DO UPDATE SET
           assigned_by = EXCLUDED.assigned_by,
           note = EXCLUDED.note,
           created_at = NOW()
         RETURNING id`,
        [cid(req), templateType, templateId, assignedTo, req.companyUser.id, note || null]
      );

      res.json({
        message: `${templateType} assigned successfully`,
        assignmentId: result.insertId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   GET: My assigned templates (supervisor/technician view)
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/my-assignments", async (req, res, next) => {
  try {
    const [assignments] = await pool.query(
      `SELECT 
         tua.id,
         tua.template_type AS "templateType",
         tua.template_id AS "templateId",
         tua.note,
         tua.created_at AS "assignedAt",
         cu_by.full_name AS "assignedByName",
         ct.template_name AS "templateName",
         ct.description,
         ct.asset_type AS "assetType",
         ct.asset_id AS "checklistAssetId",
         a_ct.asset_name AS "checklistAssetName",
         lt.template_name AS "logsheetName",
         lt.description AS "logsheetDescription",
         lt.asset_type AS "logsheetAssetType",
         lta.asset_id AS "logsheetAssetId",
         a_lt.asset_name AS "logsheetAssetName"
       FROM template_user_assignments tua
       LEFT JOIN company_users cu_by ON tua.assigned_by = cu_by.id
       LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id
       LEFT JOIN assets a_ct ON ct.asset_id = a_ct.id
       LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id
       LEFT JOIN logsheet_template_assignments lta ON tua.template_type = 'logsheet' AND lta.template_id = tua.template_id
       LEFT JOIN assets a_lt ON lta.asset_id = a_lt.id
       WHERE tua.assigned_to = ?
         AND tua.company_id = ?
         AND (
           (tua.template_type = 'checklist' AND NOT EXISTS (
             SELECT 1 FROM checklist_submissions cs
             WHERE cs.template_id = tua.template_id
               AND cs.company_user_id = tua.assigned_to
           ))
           OR
           (tua.template_type = 'logsheet' AND NOT EXISTS (
             SELECT 1 FROM logsheet_entries le
             WHERE le.template_id = tua.template_id
               AND le.company_user_id = tua.assigned_to
           ))
         )
       ORDER BY tua.created_at DESC`,
      [req.companyUser.id, cid(req)]
    );

    // Format response
    const formatted = assignments.map(a => ({
      assignmentId: a.id,
      templateType: a.templateType,
      templateId: a.templateId,
      templateName: a.templateType === 'checklist' ? a.templateName : a.logsheetName,
      description: a.templateType === 'checklist' ? a.description : a.logsheetDescription,
      assetType: a.templateType === 'checklist' ? a.assetType : a.logsheetAssetType,
      assetId: a.templateType === 'checklist' ? (a.checklistAssetId || null) : (a.logsheetAssetId || null),
      assetName: a.templateType === 'checklist' ? (a.checklistAssetName || null) : (a.logsheetAssetName || null),
      note: a.note,
      assignedAt: a.assignedAt,
      assignedBy: a.assignedByName,
    }));

    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   SUPERVISOR: Reassign to team member
   ──────────────────────────────────────────────────────────────────────────── */
router.post(
  "/reassign",
  validate([
    body("assignmentId").isInt({ min: 1 }).withMessage("assignmentId required"),
    body("assignedTo").isInt({ min: 1 }).withMessage("assignedTo user ID required"),
    body("note").optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const { assignmentId, assignedTo, note } = req.body;

      // Get the original assignment
      const [[assignment]] = await pool.query(
        `SELECT template_type, template_id FROM template_user_assignments 
         WHERE id = ? AND assigned_to = ? AND company_id = ?`,
        [assignmentId, req.companyUser.id, cid(req)]
      );
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found or not assigned to you" });
      }

      // Check target user is under this supervisor
      const [[targetUser]] = await pool.query(
        `SELECT id FROM company_users 
         WHERE id = ? AND company_id = ? AND supervisor_id = ?`,
        [assignedTo, cid(req), req.companyUser.id]
      );
      if (!targetUser) {
        return res.status(403).json({ message: "Can only assign to your team members" });
      }

      // Create new assignment for team member
      await pool.query(
        `INSERT INTO template_user_assignments 
         (company_id, template_type, template_id, assigned_to, assigned_by, note)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (template_type, template_id, assigned_to)
         DO UPDATE SET
           assigned_by = EXCLUDED.assigned_by,
           note = EXCLUDED.note,
           created_at = NOW()`,
        [cid(req), assignment.template_type, assignment.template_id, assignedTo, req.companyUser.id, note || null]
      );

      res.json({ message: "Reassigned successfully" });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   GET: Template details with questions
   ──────────────────────────────────────────────────────────────────────────── */
router.get(
  "/template/:type/:id",
  validate([
    param("type").isIn(["checklist", "logsheet"]),
    param("id").isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      const { type, id } = req.params;

      if (type === "checklist") {
        const [[template]] = await pool.query(
          `SELECT ct.id,
                  ct.template_name  AS "templateName",
                  ct.description,
                  ct.asset_type     AS "assetType",
                  ct.asset_id       AS "assetId",
                  a.asset_name      AS "assetName",
                  ct.questions
           FROM checklist_templates ct
           LEFT JOIN assets a ON ct.asset_id = a.id
           WHERE ct.id = ? AND ct.company_id = ?`,
          [id, cid(req)]
        );
        if (!template) return res.status(404).json({ message: "Template not found" });

        // Try JSONB column first (set by company portal), fall back to questions table
        const raw = template.questions;
        let qs = raw ? (Array.isArray(raw) ? raw : JSON.parse(raw)) : [];

        if (qs.length === 0) {
          // Questions created via /api/checklist-templates go to checklist_template_questions
          const [tableQs] = await pool.query(
            `SELECT id,
                    question_text  AS "questionText",
                    input_type     AS "inputType",
                    is_required    AS "isRequired",
                    options_json   AS "options",
                    order_index    AS "orderIndex"
             FROM checklist_template_questions
             WHERE template_id = ?
             ORDER BY order_index ASC, id ASC`,
            [id]
          );
          qs = tableQs.map(q => ({
            id:          q.id,
            questionText: q.questionText,
            inputType:   q.inputType || 'text',
            isRequired:  q.isRequired === 1 || q.isRequired === true,
            options:     q.options
              ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options)
              : [],
            orderIndex:  q.orderIndex,
          }));
        }

        // Normalize for mobile app
        const questions = qs.map((q, idx) => ({
          id:           q.id ?? idx,
          questionText: q.questionText || q.text || '',
          answerType:   q.inputType || q.answerType || 'text',
          isRequired:   q.isRequired ?? q.is_required ?? false,
          options:      Array.isArray(q.options) ? q.options : [],
          displayOrder: q.orderIndex ?? q.order ?? idx,
        }));

        const { questions: _drop, ...templateData } = template;
        res.json({ ...templateData, questions });
      } else {
        const [[template]] = await pool.query(
          `SELECT lt.id,
                  lt.template_name AS "templateName",
                  lt.description,
                  lt.asset_type AS "assetType",
                  lta.asset_id AS "assetId",
                  a.asset_name AS "assetName"
           FROM logsheet_templates lt
           LEFT JOIN logsheet_template_assignments lta ON lta.template_id = lt.id
           LEFT JOIN assets a ON lta.asset_id = a.id
           WHERE lt.id = ? AND lt.company_id = ?
           LIMIT 1`,
          [id, cid(req)]
        );
        if (!template) return res.status(404).json({ message: "Template not found" });

        // logsheet_questions are linked via logsheet_sections → template_id
        // column is is_mandatory (not is_required), and rule_json for options
        const [questions] = await pool.query(
          `SELECT lq.id,
                  lq.question_text  AS "questionText",
                  lq.answer_type    AS "answerType",
                  lq.is_mandatory   AS "isRequired",
                  lq.rule_json      AS "options",
                  lq.specification  AS "specification",
                  lq.order_index    AS "displayOrder",
                  ls.section_name   AS "sectionName",
                  ls.order_index    AS "sectionOrder"
           FROM logsheet_questions lq
           JOIN logsheet_sections ls ON ls.id = lq.section_id
           WHERE ls.template_id = ?
           ORDER BY ls.order_index ASC, lq.order_index ASC`,
          [id]
        );

        res.json({ ...template, questions });
      }
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   POST: Submit checklist response
   ──────────────────────────────────────────────────────────────────────────── */
router.post(
  "/submit-checklist",
  validate([
    body("templateId").isInt({ min: 1 }),
    body("assetId").optional({ nullable: true }).isInt({ min: 1 }),
    body("answers").isArray(),
  ]),
  async (req, res, next) => {
    try {
      const { templateId, assetId, answers, latitude, longitude } = req.body;

      // Supervisors can fill any company checklist directly; others need an assignment
      if (req.companyUser.role !== 'supervisor') {
        const [[assignment]] = await pool.query(
          `SELECT id FROM template_user_assignments 
           WHERE template_type = 'checklist' AND template_id = ? 
             AND assigned_to = ? AND company_id = ?`,
          [templateId, req.companyUser.id, cid(req)]
        );
        if (!assignment) {
          return res.status(403).json({ message: "Checklist not assigned to you" });
        }
      } else {
        // Verify the template actually belongs to their company
        const [[tmpl]] = await pool.query(
          `SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?`,
          [templateId, cid(req)]
        );
        if (!tmpl) return res.status(404).json({ message: "Checklist template not found" });
      }

      // Fetch template (includes asset_id + questions column)
      const [[tmplWithQ]] = await pool.query(
        `SELECT ct.questions, ct.asset_id AS assetId
         FROM checklist_templates ct WHERE ct.id = ?`,
        [templateId]
      );
      // Build question map by id for answer enrichment
      const raw2 = tmplWithQ?.questions;
      let tmplQs = raw2 ? (Array.isArray(raw2) ? raw2 : JSON.parse(raw2)) : [];
      if (tmplQs.length === 0) {
        const [tqRows] = await pool.query(
          `SELECT id, question_text AS questionText, input_type AS inputType
           FROM checklist_template_questions WHERE template_id = ?`,
          [templateId]
        );
        tmplQs = tqRows;
      }
      // keyed by id (real DB id or index)
      const qMap = {};
      tmplQs.forEach((q, idx) => { qMap[q.id ?? idx] = q; });

      // Use linked asset if none supplied
      const effectiveAssetId = assetId || tmplWithQ?.assetId || null;

      // Real schema: checklist_submissions(template_id, asset_id, submitted_by, status, completion_pct, submitted_at)
      // + company_user_id added by migration 2026-02-27-checklist-asset-submitter.sql
      const lat = typeof latitude === 'number' ? latitude : null;
      const lon = typeof longitude === 'number' ? longitude : null;
      const [csResult] = await pool.query(
        `INSERT INTO checklist_submissions
         (template_id, asset_id, submitted_by, company_user_id, status, completion_pct, latitude, longitude, submitted_at)
         VALUES (?, ?, NULL, ?, 'submitted', 100, ?, ?, NOW())
         RETURNING id`,
        [templateId, effectiveAssetId, req.companyUser.id, lat, lon]
      ).catch(() =>
        // Fallback without lat/lng columns if not yet migrated
        pool.query(
          `INSERT INTO checklist_submissions
           (template_id, asset_id, submitted_by, status, completion_pct, submitted_at)
           VALUES (?, ?, NULL, 'submitted', 100, NOW())
           RETURNING id`,
          [templateId, effectiveAssetId]
        )
      );
      const submissionId = csResult.insertId || csResult[0]?.id;

      // Insert answers — question_text and input_type are NOT NULL
      if (submissionId && answers && answers.length > 0) {
        for (const a of answers) {
          const q = qMap[a.questionId] || {};
          const questionText = (q.questionText || q.text || `Question ${a.questionId}`).slice(0, 500);
          const inputType = (q.inputType || q.answerType || 'text').slice(0, 64);
          await pool.query(
            `INSERT INTO checklist_submission_answers
             (submission_id, question_text, input_type, answer_json, option_selected)
             VALUES (?, ?, ?, ?, ?)`,
            [
              submissionId,
              questionText,
              inputType,
              JSON.stringify({ value: a.answer ?? null }),
              typeof a.answer === 'string' ? a.answer.slice(0, 255) : null,
            ]
          );
        }
      }

      // ── Flag & Alert Engine (checklist) ─────────────────────────────────
      // Build ruleMap from the JSONB questions already loaded in qMap.
      // Portal-created templates store rules inside checklist_templates.questions
      // as { flagOn, minValue, maxValue, severity, action } — NOT in the
      // separate checklist_template_questions table which may be empty.
      if (submissionId && answers?.length) {
        try {
          // Build ruleMap from qMap (JSONB rules from portal template builder)
          const ruleMap = {};
          for (const [qId, q] of Object.entries(qMap)) {
            const rule = q.rule || q.rule_json || null;
            if (!rule) continue;
            const inputType = (q.inputType || q.answerType || "text").toLowerCase();
            let normalized = null;
            if (inputType === "yes_no") {
              normalized = { operator: "yes_no", triggerValue: "no", severity: rule.severity || "high", autoWorkOrder: rule.action === "create_work_order" };
            } else if (inputType === "ok_not_ok") {
              normalized = { operator: "ok_not_ok", triggerValue: "not_ok", severity: rule.severity || "high", autoWorkOrder: rule.action === "create_work_order" };
            } else if (inputType === "number" && (rule.minValue !== "" && rule.minValue != null || rule.maxValue !== "" && rule.maxValue != null)) {
              normalized = { operator: "between", minValue: rule.minValue, maxValue: rule.maxValue, severity: rule.severity || "medium", autoWorkOrder: rule.action === "create_work_order" };
            } else if (inputType === "dropdown" && rule.flagOn) {
              normalized = { operator: "eq", triggerValue: rule.flagOn, severity: rule.severity || "medium", autoWorkOrder: rule.action === "create_work_order" };
            }
            if (normalized) ruleMap[qId] = normalized;
          }

          // Also merge any rules from the checklist_template_questions table
          // (for templates that were created via the old admin-side builder)
          const [qRuleRows] = await pool.query(
            `SELECT id, rule_json FROM checklist_template_questions WHERE template_id = ?`,
            [templateId]
          ).catch(() => [[]]);
          for (const qr of qRuleRows) {
            if (qr.rule_json && !ruleMap[qr.id]) {
              ruleMap[qr.id] = typeof qr.rule_json === "string"
                ? JSON.parse(qr.rule_json)
                : qr.rule_json;
            }
          }

          // Build answer objects in the shape detectChecklistFlags() expects
          const answerRows = answers.map((a) => {
            const q = qMap[a.questionId] || {};
            return {
              question_id:     a.questionId,
              question_text:   (q.questionText || q.text || `Question ${a.questionId}`),
              input_type:      (q.inputType || q.answerType || "text"),
              answer_json:     JSON.stringify({ value: a.answer ?? null }),
              option_selected: (typeof a.answer === "string" ? a.answer : null),
            };
          });

          const [[chkAsset]] = effectiveAssetId
            ? await pool.query(
                "SELECT asset_name, building, floor, room FROM assets WHERE id = ?",
                [effectiveAssetId]
              ).catch(() => [[null]])
            : [[null]];

          const flagParamsList = detectChecklistFlags(answerRows, {
            companyId:    cid(req),
            assetId:      effectiveAssetId,
            checklistId:  templateId,
            submissionId,
            raisedBy:     req.companyUser.id,
          }, ruleMap);

          const chkLocation = [chkAsset?.building, chkAsset?.floor, chkAsset?.room]
            .filter(Boolean).join(", ");

          for (const fp of flagParamsList) {
            const flagId = await createFlag(fp, {
              assetName: chkAsset?.asset_name,
              location:  chkLocation,
            }).catch((e) => { console.error("[FlagSystem] checklist flag error:", e.message); return null; });

            if (flagId) {
              const qRule = fp.questionId ? ruleMap[fp.questionId] : null;
              await dispatchFlagNotifications({
                flagId,
                companyId:    cid(req),
                assetId:      effectiveAssetId,
                assetName:    chkAsset?.asset_name,
                location:     chkLocation,
                questionText: fp.description?.replace(/^.*?:\s*"?/, "").replace(/".*/, "") || "",
                enteredValue: fp.enteredValue || "",
                expectedRange: fp.expectedRule || "",
                severity:     fp.severity,
                raisedBy:     req.companyUser.id,
                ruleActions:  qRule || { notifySupervisor: true, notifyAdmin: true },
              }).catch(() => {});
            }
          }
        } catch (flagErr) {
          console.error("[FlagSystem] checklist detection failed:", flagErr.message);
        }
      }

      res.json({ message: "Checklist submitted successfully", submissionId });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   POST: Submit logsheet entry
   ──────────────────────────────────────────────────────────────────────────── */
router.post(
  "/submit-logsheet",
  validate([
    body("templateId").isInt({ min: 1 }),
    body("assetId").optional({ nullable: true }).isInt({ min: 1 }),
    body("answers").isArray(),
  ]),
  async (req, res, next) => {
    try {
      const { templateId, assetId, answers, latitude, longitude } = req.body;

      // Supervisors can fill any company logsheet directly; others need an assignment
      if (req.companyUser.role !== 'supervisor') {
        const [[assignment]] = await pool.query(
          `SELECT id FROM template_user_assignments 
           WHERE template_type = 'logsheet' AND template_id = ? 
             AND assigned_to = ? AND company_id = ?`,
          [templateId, req.companyUser.id, cid(req)]
        );
        if (!assignment) {
          return res.status(403).json({ message: "Logsheet not assigned to you" });
        }
      } else {
        const [[tmpl]] = await pool.query(
          `SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?`,
          [templateId, cid(req)]
        );
        if (!tmpl) return res.status(404).json({ message: "Logsheet template not found" });
      }

      // Create logsheet entry — month/year derived from current date.
      // asset_id is nullable after migration 2026-02-27-submissions-nullable-asset.sql.
      const _now = new Date();
      const currentMonth = _now.getMonth() + 1;
      const currentYear  = _now.getFullYear();
      const currentDay   = _now.getDate();
      const lat = typeof latitude === 'number' ? latitude : null;
      const lon = typeof longitude === 'number' ? longitude : null;

      const [leResult] = await pool.query(
        `INSERT INTO logsheet_entries
         (template_id, asset_id, submitted_by, company_user_id, entry_date, month, year, status, data, latitude, longitude, submitted_at)
         VALUES (?, ?, NULL, ?, CURRENT_DATE, ?, ?, 'submitted', ?, ?, ?, NOW())
         RETURNING id`,
        [templateId, assetId || null, req.companyUser.id, currentMonth, currentYear, JSON.stringify(answers || []), lat, lon]
      ).catch(() =>
        pool.query(
          `INSERT INTO logsheet_entries
           (template_id, asset_id, submitted_by, company_user_id, entry_date, month, year, status, data, submitted_at)
           VALUES (?, ?, NULL, ?, CURRENT_DATE, ?, ?, 'submitted', ?, NOW())
           RETURNING id`,
          [templateId, assetId || null, req.companyUser.id, currentMonth, currentYear, JSON.stringify(answers || [])]
        )
      );
      const entryId = leResult.insertId || leResult[0]?.id;

      // Also insert into logsheet_answers row-by-row (PostgreSQL-compatible)
      if (entryId && answers && answers.length > 0) {
        for (const a of answers) {
          await pool.query(
            `INSERT INTO logsheet_answers (entry_id, question_id, date_column, answer_value) VALUES (?, ?, ?, ?)`,
            [entryId, a.questionId, currentDay, a.answer != null ? a.answer : null]
          ).catch(() => {});
        }
      }

      // ── Flag & Alert Engine ──────────────────────────────────────────────
      // Evaluate each answer against the question's rule_json.
      // Supports all operators, severity overrides, notification dispatch,
      // and auto work-order creation per rule configuration.
      if (entryId && answers?.length) {
        try {
          // Load questions with full rule_json for this template
          const [ruleQuestions] = await pool.query(
            `SELECT lq.id, lq.question_text, lq.rule_json, lq.answer_type
             FROM logsheet_questions lq
             JOIN logsheet_sections ls ON lq.section_id = ls.id
             WHERE ls.template_id = ?`,
            [templateId]
          );

          const qRuleMap = {};
          for (const q of ruleQuestions) {
            const rule = q.rule_json
              ? (typeof q.rule_json === "string" ? JSON.parse(q.rule_json) : q.rule_json)
              : null;
            qRuleMap[q.id] = { rule, text: q.question_text, answerType: q.answer_type };
          }

          const [[lsAsset]] = await pool.query(
            "SELECT asset_name, building, floor, room FROM assets WHERE id = ?",
            [assetId]
          ).catch(() => [[null]]);

          const lsLocation = [lsAsset?.building, lsAsset?.floor, lsAsset?.room]
            .filter(Boolean).join(", ");

          for (const a of answers) {
            const qInfo = qRuleMap[a.questionId];
            if (!qInfo?.rule) continue;

            const ruleEval = evaluateRule(qInfo.rule, a.answer);
            if (!ruleEval.violated) continue;

            const description =
              `Rule violation for "${qInfo.text}": ` +
              `entered=${a.answer}, ${ruleEval.expectedText}`;

            const flagId = await createFlag(
              {
                source:          "logsheet",
                companyId:       cid(req),
                assetId,
                logsheetEntryId: entryId,
                questionId:      a.questionId,
                raisedBy:        req.companyUser.id,
                description,
                severity:        ruleEval.severity,
                enteredValue:    String(a.answer),
                expectedRule:    ruleEval.expectedText,
                forceWorkOrder:  !!qInfo.rule.autoWorkOrder,
              },
              { assetName: lsAsset?.asset_name, location: lsLocation }
            ).catch((e) => { console.error("[FlagSystem] logsheet flag error:", e.message); return null; });

            if (flagId) {
              await dispatchFlagNotifications({
                flagId,
                companyId:    cid(req),
                assetId,
                assetName:    lsAsset?.asset_name,
                location:     lsLocation,
                questionText: qInfo.text,
                enteredValue: String(a.answer),
                expectedRange: ruleEval.expectedText,
                severity:     ruleEval.severity,
                raisedBy:     req.companyUser.id,
                ruleActions:  qInfo.rule,
              }).catch(() => {});
            }
          }
        } catch (flagErr) {
          console.error("[FlagSystem] logsheet detection failed:", flagErr.message);
        }
      }

      res.json({ message: "Logsheet submitted successfully", entryId });
    } catch (err) {
      next(err);
    }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   GET: Submission reports (Admin/Supervisor view)
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/submissions/checklists", async (req, res, next) => {
  try {
    const { dateFrom, dateTo, period } = req.query;
    const conditions = ["ct.company_id = ?"];
    const params = [cid(req)];

    // period shorthand: week / month / year
    if (period === 'week') {
      conditions.push("cs.submitted_at >= NOW() - INTERVAL '7 days'");
    } else if (period === 'month') {
      conditions.push("DATE_TRUNC('month', cs.submitted_at) = DATE_TRUNC('month', NOW())");
    } else if (period === 'year') {
      conditions.push("DATE_TRUNC('year', cs.submitted_at) = DATE_TRUNC('year', NOW())");
    }
    if (dateFrom) { conditions.push("cs.submitted_at >= ?"); params.push(dateFrom); }
    if (dateTo)   { conditions.push("cs.submitted_at <= ?"); params.push(dateTo + " 23:59:59"); }

    const [submissions] = await pool.query(
      `SELECT
         cs.id,
         cs.template_id          AS "templateId",
         ct.template_name        AS "templateName",
         cs.asset_id             AS "assetId",
         a.asset_name            AS "assetName",
         cs.status,
         cs.submitted_at         AS "submittedAt",
         cu.full_name            AS "submittedBy"
       FROM checklist_submissions cs
       JOIN checklist_templates ct ON cs.template_id = ct.id
       LEFT JOIN assets a ON cs.asset_id = a.id
       LEFT JOIN company_users cu ON cs.company_user_id = cu.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY cs.submitted_at DESC NULLS LAST
       LIMIT 500`,
      params
    );
    res.json(submissions);
  } catch (err) { next(err); }
});

router.get("/submissions/logsheets", async (req, res, next) => {
  try {
    const { dateFrom, dateTo, period } = req.query;
    const conditions = ["lt.company_id = ?"];
    const params = [cid(req)];

    if (period === 'week') {
      conditions.push("COALESCE(le.submitted_at, le.entry_date) >= NOW() - INTERVAL '7 days'");
    } else if (period === 'month') {
      conditions.push("le.month = EXTRACT(MONTH FROM NOW()) AND le.year = EXTRACT(YEAR FROM NOW())");
    } else if (period === 'year') {
      conditions.push("le.year = EXTRACT(YEAR FROM NOW())");
    }
    if (dateFrom) { conditions.push("COALESCE(le.submitted_at, le.entry_date) >= ?"); params.push(dateFrom); }
    if (dateTo)   { conditions.push("COALESCE(le.submitted_at, le.entry_date) <= ?"); params.push(dateTo + " 23:59:59"); }

    const [submissions] = await pool.query(
      `SELECT
         le.id,
         le.template_id               AS "templateId",
         lt.template_name             AS "templateName",
         le.asset_id                  AS "assetId",
         a.asset_name                 AS "assetName",
         le.status,
         COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
         le.shift,
         le.month,
         le.year,
         cu.full_name                 AS "submittedBy"
       FROM logsheet_entries le
       JOIN logsheet_templates lt ON le.template_id = lt.id
       LEFT JOIN assets a ON le.asset_id = a.id
       LEFT JOIN company_users cu ON le.company_user_id = cu.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY le.submitted_at DESC NULLS LAST, le.entry_date DESC
       LIMIT 500`,
      params
    );
    res.json(submissions);
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   GET: Single submission details with answers
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/submissions/checklists/:id", param("id").isInt(), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[submission]] = await pool.query(
      `SELECT
         cs.id,
         cs.template_id       AS "templateId",
         ct.template_name     AS "templateName",
         cs.asset_id          AS "assetId",
         a.asset_name         AS "assetName",
         cs.status,
         cs.submitted_at      AS "submittedAt",
         cu.full_name         AS "submittedBy"
       FROM checklist_submissions cs
       JOIN checklist_templates ct ON cs.template_id = ct.id
       LEFT JOIN assets a ON cs.asset_id = a.id
       LEFT JOIN company_users cu ON cs.company_user_id = cu.id
       WHERE cs.id = ? AND ct.company_id = ?`,
      [id, cid(req)]
    );
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const [answers] = await pool.query(
      `SELECT
         csa.id,
         csa.question_text  AS "questionText",
         csa.input_type     AS "answerType",
         csa.answer_json    AS "answerJson",
         csa.option_selected AS "answerValue"
       FROM checklist_submission_answers csa
       WHERE csa.submission_id = ?
       ORDER BY csa.id ASC`,
      [id]
    );

    res.json({ ...submission, answers });
  } catch (err) {
    next(err);
  }
});

router.get("/submissions/logsheets/:id", param("id").isInt(), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[submission]] = await pool.query(
      `SELECT
         le.id,
         le.template_id              AS "templateId",
         lt.template_name            AS "templateName",
         le.asset_id                 AS "assetId",
         a.asset_name                AS "assetName",
         le.status,
         le.shift,
         le.month,
         le.year,
         COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
         le.data,
         cu.full_name                AS "submittedBy"
       FROM logsheet_entries le
       JOIN logsheet_templates lt ON le.template_id = lt.id
       LEFT JOIN assets a ON le.asset_id = a.id
       LEFT JOIN company_users cu ON le.company_user_id = cu.id
       WHERE le.id = ? AND lt.company_id = ?`,
      [id, cid(req)]
    );
    if (!submission) return res.status(404).json({ message: "Entry not found" });

    const [answers] = await pool.query(
      `SELECT
         la.id,
         la.question_id   AS "questionId",
         lq.question_text AS "questionText",
         lq.answer_type   AS "answerType",
         la.answer_value  AS "answerValue"
       FROM logsheet_answers la
       JOIN logsheet_questions lq ON la.question_id = lq.id
       WHERE la.entry_id = ?
       ORDER BY lq.order_index ASC`,
      [id]
    );

    res.json({ ...submission, answers });
  } catch (err) {
    next(err);
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   SUPERVISOR: Directly assign a template to a team member (fresh assignment)
   ──────────────────────────────────────────────────────────────────────────── */
router.post(
  "/supervisor-assign",
  validate([
    body("templateType").isIn(["checklist", "logsheet"]),
    body("templateId").isInt({ min: 1 }),
    body("assignedTo").isInt({ min: 1 }),
    body("note").optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const { templateType, templateId, assignedTo, note } = req.body;
      if (req.companyUser.role !== "supervisor") {
        return res.status(403).json({ message: "Only supervisors can use this endpoint" });
      }
      // Target must be a team member under this supervisor
      const [[targetUser]] = await pool.query(
        `SELECT id FROM company_users WHERE id = ? AND company_id = ? AND supervisor_id = ?`,
        [assignedTo, cid(req), req.companyUser.id]
      );
      if (!targetUser) {
        return res.status(403).json({ message: "Can only assign to your direct team members" });
      }
      const tableName = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
      const [[template]] = await pool.query(
        `SELECT id FROM ${tableName} WHERE id = ? AND company_id = ?`,
        [templateId, cid(req)]
      );
      if (!template) return res.status(404).json({ message: `${templateType} template not found` });

      await pool.query(
        `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (template_type, template_id, assigned_to)
         DO UPDATE SET
           assigned_by = EXCLUDED.assigned_by,
           note = EXCLUDED.note,
           created_at = NOW()`,
        [cid(req), templateType, templateId, assignedTo, req.companyUser.id, note || null]
      );
      res.json({ message: "Template assigned successfully" });
    } catch (err) { next(err); }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   SUPERVISOR: Templates assigned TO the supervisor but NOT yet forwarded to
   any technician under them
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/my-unassigned-to-team", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Supervisor only" });
    }
    const supId = req.companyUser.id;
    const compId = cid(req);

    // Get all templates assigned to this supervisor
    // that have NOT been assigned to any team member under them
    const [rows] = await pool.query(
      `SELECT
         tua.id            AS "assignmentId",
         tua.template_type AS "templateType",
         tua.template_id   AS "templateId",
         tua.note,
         tua.created_at    AS "assignedAt",
         COALESCE(ct.template_name, lt.template_name) AS "templateName",
         COALESCE(ct.description,  lt.description)    AS "description",
         COALESCE(ct.asset_type,   lt.asset_type)     AS "assetType",
         COALESCE(ct.frequency,    lt.frequency)      AS "frequency",
         COALESCE(ct.asset_id,     lt.asset_id)       AS "assetId"
       FROM template_user_assignments tua
       LEFT JOIN checklist_templates ct
         ON ct.id = tua.template_id AND tua.template_type = 'checklist' AND ct.company_id = ?
       LEFT JOIN logsheet_templates lt
         ON lt.id = tua.template_id AND tua.template_type = 'logsheet'  AND lt.company_id = ?
       WHERE tua.assigned_to = ?
         AND tua.company_id  = ?
         AND NOT EXISTS (
           SELECT 1
           FROM template_user_assignments tua2
           INNER JOIN company_users cu ON cu.id = tua2.assigned_to
           WHERE tua2.template_type = tua.template_type
             AND tua2.template_id   = tua.template_id
             AND tua2.company_id    = ?
             AND cu.supervisor_id   = ?
         )
       ORDER BY "templateName"`,
      [compId, compId, supId, compId, compId, supId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   SUPERVISOR: Get all templates NOT yet assigned to anyone in the company
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/unassigned-templates", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Supervisor only" });
    }
    const { type } = req.query;
    const checklistsPromise = (!type || type === "checklist") ? pool.query(
      `SELECT ct.id, 'checklist' AS "templateType", ct.template_name AS "templateName",
              ct.description, ct.asset_type AS "assetType", ct.created_at AS "createdAt"
       FROM checklist_templates ct
       WHERE ct.company_id = ?
         AND ct.id NOT IN (
           SELECT template_id FROM template_user_assignments
           WHERE template_type = 'checklist' AND company_id = ?
         )
       ORDER BY ct.template_name`,
      [cid(req), cid(req)]
    ) : Promise.resolve([[]]);

    const logsheetsPromise = (!type || type === "logsheet") ? pool.query(
      `SELECT lt.id, 'logsheet' AS "templateType", lt.template_name AS "templateName",
              lt.description, lt.asset_type AS "assetType", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       WHERE lt.company_id = ?
         AND lt.id NOT IN (
           SELECT template_id FROM template_user_assignments
           WHERE template_type = 'logsheet' AND company_id = ?
         )
       ORDER BY lt.template_name`,
      [cid(req), cid(req)]
    ) : Promise.resolve([[]]);

    const [[checklists], [logsheets]] = await Promise.all([checklistsPromise, logsheetsPromise]);
    res.json([...checklists, ...logsheets]);
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   SUPERVISOR: Assignment count stats per team member
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/team-stats", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Supervisor only" });
    }
    const [stats] = await pool.query(
      `SELECT cu.id, cu.full_name AS "fullName", cu.role,
              SUM(CASE WHEN tua.template_type = 'checklist' THEN 1 ELSE 0 END) AS "checklistCount",
              SUM(CASE WHEN tua.template_type = 'logsheet' THEN 1 ELSE 0 END) AS "logsheetCount",
              COUNT(tua.id) AS "totalCount"
       FROM company_users cu
       LEFT JOIN template_user_assignments tua
         ON tua.assigned_to = cu.id AND tua.company_id = cu.company_id
       WHERE cu.company_id = ? AND cu.supervisor_id = ?
       GROUP BY cu.id, cu.full_name, cu.role
       ORDER BY cu.full_name`,
      [cid(req), req.companyUser.id]
    );
    res.json(stats);
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   SUPERVISOR: All team assignments with optional filters
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/team-assignments", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Supervisor only" });
    }
    const { type, assetType, dateFrom, dateTo } = req.query;
    const conditions = ["cu.supervisor_id = ?", "tua.company_id = ?"];
    const params = [req.companyUser.id, cid(req)];

    if (type) { conditions.push("tua.template_type = ?"); params.push(type); }
    if (assetType) { conditions.push("COALESCE(ct.asset_type, lt.asset_type) LIKE ?"); params.push(`%${assetType}%`); }
    if (dateFrom) { conditions.push("tua.created_at >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("tua.created_at <= ?"); params.push(dateTo + " 23:59:59"); }

    const [rows] = await pool.query(
      `SELECT tua.id AS "assignmentId",
              tua.template_type AS "templateType",
              tua.template_id AS "templateId",
              COALESCE(ct.template_name, lt.template_name) AS "templateName",
              COALESCE(ct.asset_type, lt.asset_type) AS "assetType",
              tua.note,
              tua.created_at AS "assignedAt",
              cu.id AS "assignedToId",
              cu.full_name AS "assignedToName",
              cu.role AS "assignedToRole"
       FROM template_user_assignments tua
       JOIN company_users cu ON tua.assigned_to = cu.id
       LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id
       LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY tua.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
