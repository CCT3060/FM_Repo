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

// Helper to get company ID
const cid = (req) => req.companyUser.companyId;

// Self-migration: ensure company_user_id columns exist on relevant tables
// so that submission history works even if migrations were not run manually.
(async () => {
  const migrations = [
    `ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL`,
    `ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL`,
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch (_) { /* ignore if already exists */ }
  }
})();

/* ── Helper: is this shift's time window currently active? ──────────────────
   Handles overnight shifts (end_time < start_time).                          */
const isShiftActive = (startTime, endTime) => {
  const now = new Date();
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const startMin = toMin(startTime);
  const endMin   = toMin(endTime);
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  } else {
    return nowMin >= startMin || nowMin < endMin;
  }
};

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
         ct.frequency AS "checklistFrequency",
         ct.shift_id AS "checklistShiftId",
         s_ct.name AS "checklistShiftName",
         lt.template_name AS "logsheetName",
         lt.description AS "logsheetDescription",
         lt.asset_type AS "logsheetAssetType",
         lt.frequency AS "logsheetFrequency",
         lta.asset_id AS "logsheetAssetId",
         a_lt.asset_name AS "logsheetAssetName",
         lt.shift_id AS "logsheetShiftId",
         s_lt.name AS "logsheetShiftName"
       FROM template_user_assignments tua
       LEFT JOIN company_users cu_by ON tua.assigned_by = cu_by.id
       LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.company_id = tua.company_id
      LEFT JOIN assets a_ct ON ct.asset_id = a_ct.id
      LEFT JOIN shifts s_ct ON ct.shift_id = s_ct.id
       LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id AND lt.company_id = tua.company_id
       LEFT JOIN logsheet_template_assignments lta ON tua.template_type = 'logsheet' AND lta.template_id = tua.template_id
       LEFT JOIN assets a_lt ON lta.asset_id = a_lt.id
       LEFT JOIN shifts s_lt ON lt.shift_id = s_lt.id
       WHERE tua.assigned_to = ?
         AND tua.company_id = ?
         AND (
           -- Checklists: hide once submitted after the assignment date
           (tua.template_type = 'checklist' AND NOT EXISTS (
             SELECT 1 FROM checklist_submissions cs
             WHERE cs.template_id = tua.template_id
               AND cs.company_user_id = tua.assigned_to
               AND cs.submitted_at >= tua.created_at
           ))
           OR
           -- Logsheets are recurring so they are ALWAYS shown once assigned
           (tua.template_type = 'logsheet' AND lt.id IS NOT NULL)
         )
         AND (
           -- Template has no shift restriction → always visible (also guards against deleted templates)
           (tua.template_type = 'checklist' AND ct.id IS NOT NULL AND ct.shift_id IS NULL)
           OR
           -- Logsheets: always visible -- they are recurring and the technician must be able to fill
           -- them even outside shift hours (daily logsheets need full-day access)
           (tua.template_type = 'logsheet' AND lt.id IS NOT NULL)
           OR
           -- Checklist belongs to a shift → show if the user is in that shift AND the shift is currently active
           (tua.template_type = 'checklist' AND ct.shift_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM employee_shifts es
             JOIN shifts sh ON sh.id = es.shift_id
             WHERE es.company_user_id = tua.assigned_to
               AND es.shift_id = ct.shift_id
               AND sh.status = 'active'
               AND (
                 (sh.start_time <= sh.end_time
                   AND CURRENT_TIME BETWEEN sh.start_time AND sh.end_time)
                 OR
                 (sh.start_time > sh.end_time
                   AND (CURRENT_TIME >= sh.start_time OR CURRENT_TIME <= sh.end_time))
               )
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
      frequency: a.templateType === 'checklist' ? (a.checklistFrequency || null) : (a.logsheetFrequency || null),
      assetId: a.templateType === 'checklist' ? (a.checklistAssetId || null) : (a.logsheetAssetId || null),
      assetName: a.templateType === 'checklist' ? (a.checklistAssetName || null) : (a.logsheetAssetName || null),
      shiftId: a.templateType === 'checklist' ? (a.checklistShiftId || null) : (a.logsheetShiftId || null),
      shiftName: a.templateType === 'checklist' ? (a.checklistShiftName || null) : (a.logsheetShiftName || null),
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
                  COALESCE(lt.layout_type, 'standard') AS "layoutType",
                  lt.header_config AS "headerConfig",
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

        // Parse headerConfig JSON
        let parsedHeaderConfig = {};
        try {
          parsedHeaderConfig = template.headerConfig
            ? (typeof template.headerConfig === 'string' ? JSON.parse(template.headerConfig) : template.headerConfig)
            : {};
        } catch (_) {}

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

        const { headerConfig: _hc, ...templateData } = template;
        res.json({ ...templateData, headerConfig: parsedHeaderConfig, questions });
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
      const { templateId, assetId, answers } = req.body;

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

      // ── Shift Enforcement ────────────────────────────────────────────────
      // Tech users (non-admin, non-supervisor) can only submit during their
      // active shift window. Admins and supervisors are exempt.
      if (req.companyUser.role !== 'admin' && req.companyUser.role !== 'supervisor') {
        const [[shiftInfo]] = await pool.query(
          `SELECT s.id, s.name AS "shiftName", s.start_time AS "startTime",
                  s.end_time AS "endTime", s.status AS "shiftStatus",
                  es.id AS "employeeShiftId"
           FROM checklist_templates ct
           JOIN shifts s ON s.id = ct.shift_id
           LEFT JOIN employee_shifts es
             ON es.shift_id = s.id AND es.company_user_id = ?
           WHERE ct.id = ? AND ct.company_id = ?`,
          [req.companyUser.id, templateId, cid(req)]
        ).catch(() => [[null]]);

        if (shiftInfo) {
          if (!shiftInfo.employeeShiftId) {
            return res.status(403).json({
              message: `You are not assigned to the "${shiftInfo.shiftName}" shift.`,
              shiftLocked: true,
              shiftName: shiftInfo.shiftName,
            });
          }
          if (shiftInfo.shiftStatus !== 'active' || !isShiftActive(shiftInfo.startTime, shiftInfo.endTime)) {
            return res.status(403).json({
              message: `The "${shiftInfo.shiftName}" shift is not currently active (${shiftInfo.startTime}–${shiftInfo.endTime}).`,
              shiftLocked: true,
              shiftName: shiftInfo.shiftName,
            });
          }
        }
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
      const [csResult] = await pool.query(
        `INSERT INTO checklist_submissions
         (template_id, asset_id, submitted_by, company_user_id, status, completion_pct, submitted_at)
         VALUES (?, ?, NULL, ?, 'submitted', 100, NOW())
         RETURNING id`,
        [templateId, effectiveAssetId, req.companyUser.id]
      ).catch(() =>
        // Fallback if company_user_id column doesn't exist yet (migration not run)
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
      const { templateId, assetId, answers } = req.body;

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

      // ── Shift Enforcement ────────────────────────────────────────────────
      if (req.companyUser.role !== 'admin' && req.companyUser.role !== 'supervisor') {
        const [[shiftInfo]] = await pool.query(
          `SELECT s.id, s.name AS "shiftName", s.start_time AS "startTime",
                  s.end_time AS "endTime", s.status AS "shiftStatus",
                  es.id AS "employeeShiftId"
           FROM logsheet_templates lt
           JOIN shifts s ON s.id = lt.shift_id
           LEFT JOIN employee_shifts es
             ON es.shift_id = s.id AND es.company_user_id = ?
           WHERE lt.id = ? AND lt.company_id = ?`,
          [req.companyUser.id, templateId, cid(req)]
        ).catch(() => [[null]]);

        if (shiftInfo) {
          if (!shiftInfo.employeeShiftId) {
            return res.status(403).json({
              message: `You are not assigned to the "${shiftInfo.shiftName}" shift.`,
              shiftLocked: true,
              shiftName: shiftInfo.shiftName,
            });
          }
          if (shiftInfo.shiftStatus !== 'active' || !isShiftActive(shiftInfo.startTime, shiftInfo.endTime)) {
            return res.status(403).json({
              message: `The "${shiftInfo.shiftName}" shift is not currently active (${shiftInfo.startTime}–${shiftInfo.endTime}).`,
              shiftLocked: true,
              shiftName: shiftInfo.shiftName,
            });
          }
        }
      }

      // Create logsheet entry — month/year derived from current date.
      // asset_id is nullable after migration 2026-02-27-submissions-nullable-asset.sql.
      const _now = new Date();
      const currentMonth = _now.getMonth() + 1;
      const currentYear  = _now.getFullYear();
      const currentDay   = _now.getDate();

      const [leResult] = await pool.query(
        `INSERT INTO logsheet_entries
         (template_id, asset_id, submitted_by, company_user_id, entry_date, month, year, status, data, submitted_at)
         VALUES (?, ?, NULL, ?, CURRENT_DATE, ?, ?, 'submitted', ?, NOW())
         RETURNING id`,
        [templateId, assetId || null, req.companyUser.id, currentMonth, currentYear, JSON.stringify(answers || [])]
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
   GET /my-today-progress  – today's submission count for current user
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/my-today-progress", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const [[{ checklistsDone }]] = await pool.query(
      `SELECT COUNT(*) AS "checklistsDone"
       FROM checklist_submissions cs
       WHERE (cs.company_user_id = ? OR (cs.company_user_id IS NULL AND cs.submitted_by IN (
         SELECT u.id FROM users u JOIN company_users cu ON cu.email = u.email WHERE cu.id = ?
       )))
       AND cs.submitted_at >= CURRENT_DATE`,
      [userId, userId]
    );
    const [[{ logsheetsDone }]] = await pool.query(
      `SELECT COUNT(*) AS "logsheetsDone"
       FROM logsheet_entries le
       WHERE (le.company_user_id = ? OR (le.company_user_id IS NULL AND le.submitted_by IN (
         SELECT u.id FROM users u JOIN company_users cu ON cu.email = u.email WHERE cu.id = ?
       )))
       AND le.submitted_at >= CURRENT_DATE`,
      [userId, userId]
    );
    res.json({
      checklistsDone: Number(checklistsDone) || 0,
      logsheetsDone: Number(logsheetsDone) || 0,
      totalDone: (Number(checklistsDone) || 0) + (Number(logsheetsDone) || 0),
    });
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   GET /my-submission-history  – recent submissions by current user
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/my-submission-history", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const companyId = cid(req);
    const limit = Math.min(parseInt(req.query.limit) || 30, 200);
    const [checklists] = await pool.query(
      `SELECT cs.id, 'checklist' AS type, ct.template_name AS "templateName",
              a.asset_name AS "assetName", cs.submitted_at AS "submittedAt",
              cs.status, cs.template_id AS "templateId"
       FROM checklist_submissions cs
       JOIN checklist_templates ct ON cs.template_id = ct.id
       LEFT JOIN assets a ON cs.asset_id = a.id
       WHERE ct.company_id = ?
         AND (
           cs.company_user_id = ?
           OR (cs.company_user_id IS NULL AND cs.submitted_by IN (
             SELECT u.id FROM users u
             JOIN company_users cu ON cu.email = u.email
             WHERE cu.id = ?
           ))
         )
       ORDER BY cs.submitted_at DESC LIMIT ?`,
      [companyId, userId, userId, limit]
    );
    const [logsheets] = await pool.query(
      `SELECT le.id, 'logsheet' AS type, lt.template_name AS "templateName",
              a.asset_name AS "assetName",
              COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
              'submitted' AS status, le.template_id AS "templateId"
       FROM logsheet_entries le
       JOIN logsheet_templates lt ON le.template_id = lt.id
       LEFT JOIN assets a ON le.asset_id = a.id
       WHERE lt.company_id = ?
         AND (
           le.company_user_id = ?
           OR (le.company_user_id IS NULL AND le.submitted_by IN (
             SELECT u.id FROM users u
             JOIN company_users cu ON cu.email = u.email
             WHERE cu.id = ?
           ))
         )
       ORDER BY COALESCE(le.submitted_at, le.entry_date) DESC LIMIT ?`,
      [companyId, userId, userId, limit]
    );
    const combined = [...checklists, ...logsheets]
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
      .slice(0, limit);
    res.json(combined);
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   GET /my-warnings  – flags / warnings for the current tech user
   Returns open flags raised by this user OR related to assets they have active
   assignments for, newest first, capped at 50.
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/my-warnings", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const companyId = cid(req);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const [rows] = await pool.query(
      `SELECT f.id, f.severity, f.status, f.description, f.source,
              f.created_at AS "createdAt", f.resolved_at AS "resolvedAt",
              f.escalated,
              a.asset_name AS "assetName", a.asset_code AS "assetCode"
       FROM flags f
       LEFT JOIN assets a ON f.asset_id = a.id
       WHERE f.company_id = ?
         AND (
           f.raised_by = ?
           OR f.asset_id IN (
             SELECT DISTINCT tua.asset_id
             FROM template_user_assignments tua
             WHERE tua.assigned_to = ? AND tua.company_id = ? AND tua.asset_id IS NOT NULL
           )
         )
       ORDER BY f.created_at DESC
       LIMIT ?`,
      [companyId, userId, userId, companyId, limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   GET /my-submission-detail/:type/:id  – full detail of a single submission
   type = checklist | logsheet
   Returns the submission meta + all answers/responses
   ──────────────────────────────────────────────────────────────────────────── */
router.get("/my-submission-detail/:type/:id", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const companyId = cid(req);
    const { type, id } = req.params;

    if (type === "checklist") {
      const [[sub]] = await pool.query(
        `SELECT cs.id, ct.template_name AS name, a.asset_name AS "assetName",
                cs.status, cs.completion_pct AS "completionPct",
                COALESCE(cs.submitted_at, cs.created_at) AS "submittedAt",
                cs.shift
         FROM checklist_submissions cs
         JOIN checklist_templates ct ON ct.id = cs.template_id
         LEFT JOIN assets a ON a.id = cs.asset_id
         WHERE cs.id = ? AND cs.company_user_id = ? AND ct.company_id = ?`,
        [id, userId, companyId]
      );
      if (!sub) return res.status(404).json({ message: "Submission not found" });
      const [answers] = await pool.query(
        `SELECT question_text AS question, input_type AS "inputType",
                answer_json AS "answerJson", option_selected AS answer
         FROM checklist_submission_answers WHERE submission_id = ? ORDER BY id`,
        [id]
      ).catch(() => [[]]);
      const mapped = answers.map(a => ({
        question: a.question,
        type: a.inputType,
        answer: a.answer || (a.answerJson ? (typeof a.answerJson === "object" ? JSON.stringify(a.answerJson) : a.answerJson) : "—")
      }));
      return res.json({ ...sub, type: "checklist", answers: mapped });

    } else if (type === "logsheet") {
      const [[entry]] = await pool.query(
        `SELECT le.id, lt.template_name AS name, a.asset_name AS "assetName",
                le.shift, le.entry_date AS "entryDate",
                le.submitted_at AS "submittedAt", le.data
         FROM logsheet_entries le
         JOIN logsheet_templates lt ON lt.id = le.template_id
         LEFT JOIN assets a ON a.id = le.asset_id
         WHERE le.id = ? AND le.company_user_id = ? AND lt.company_id = ?`,
        [id, userId, companyId]
      );
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      const rawData = entry.data ? (typeof entry.data === "string" ? JSON.parse(entry.data) : entry.data) : {};
      const answers = Object.entries(rawData).map(([k, v]) => ({ question: k, type: "text", answer: v != null ? String(v) : "—" }));
      const { data: _d, ...clean } = entry;
      return res.json({ ...clean, type: "logsheet", answers });
    }
    return res.status(400).json({ message: "Invalid type, use checklist or logsheet" });
  } catch (err) { next(err); }
});

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
         COALESCE(ct.asset_id,     lt.asset_id)       AS "assetId",
         COALESCE(a_ct.asset_name, a_lt.asset_name)   AS "assetName"
       FROM template_user_assignments tua
       LEFT JOIN checklist_templates ct
         ON ct.id = tua.template_id AND tua.template_type = 'checklist' AND ct.company_id = ?
       LEFT JOIN logsheet_templates lt
         ON lt.id = tua.template_id AND tua.template_type = 'logsheet'  AND lt.company_id = ?
       LEFT JOIN assets a_ct ON a_ct.id = ct.asset_id
       LEFT JOIN assets a_lt ON a_lt.id = lt.asset_id
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
       LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.company_id = tua.company_id
       LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id AND lt.company_id = tua.company_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY tua.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ────────────────────────────────────────────────────────────────────────────
   GET: Checklist monthly grid data
   Returns all submissions for a template in a given month/year,
   keyed by day for a grid display (questions × days).
──────────────────────────────────────────────────────────────────────────── */
router.get(
  "/checklist-grid/:templateId",
  validate([param("templateId").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const { templateId } = req.params;
      const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
      const year  = parseInt(req.query.year)  || new Date().getFullYear();

      // Get template + asset name
      const [[tmpl]] = await pool.query(
        `SELECT ct.id, ct.template_name AS "templateName",
                ct.asset_id AS "assetId", a.asset_name AS "assetName",
                ct.questions
         FROM checklist_templates ct
         LEFT JOIN assets a ON a.id = ct.asset_id
         WHERE ct.id = ? AND ct.company_id = ?`,
        [templateId, cid(req)]
      );
      if (!tmpl) return res.status(404).json({ message: "Template not found" });

      // Parse questions (JSONB column or fallback table)
      const rawQs = tmpl.questions;
      let qs = rawQs ? (Array.isArray(rawQs) ? rawQs : JSON.parse(rawQs)) : [];
      if (qs.length === 0) {
        const [tableQs] = await pool.query(
          `SELECT id, question_text AS "questionText", input_type AS "inputType", order_index AS "orderIndex"
           FROM checklist_template_questions WHERE template_id = ?
           ORDER BY order_index ASC, id ASC`,
          [templateId]
        );
        qs = tableQs.map(q => ({
          id: q.id, questionText: q.questionText,
          inputType: q.inputType || 'text', orderIndex: q.orderIndex,
        }));
      }
      const questions = qs.map((q, idx) => ({
        id: q.id ?? idx,
        questionText: q.questionText || q.text || `Q${idx + 1}`,
        answerType: q.inputType || q.answerType || 'text',
        displayOrder: q.orderIndex ?? q.order ?? idx,
      }));

      // Days in month
      const daysInMonth = new Date(year, month, 0).getDate();

      // All submissions for this template in the given month/year
      const [subs] = await pool.query(
        `SELECT cs.id, cs.submitted_at AS "submittedAt", cu.full_name AS "submittedBy"
         FROM checklist_submissions cs
         LEFT JOIN company_users cu ON cu.id = cs.company_user_id
         WHERE cs.template_id = ?
           AND EXTRACT(MONTH FROM cs.submitted_at) = ?
           AND EXTRACT(YEAR  FROM cs.submitted_at) = ?
         ORDER BY cs.submitted_at ASC`,
        [templateId, month, year]
      );

      // Fetch answers for each submission
      const submissions = [];
      for (const sub of subs) {
        const [answers] = await pool.query(
          `SELECT question_text AS "questionText",
                  option_selected AS "answerValue",
                  answer_json     AS "answerJson"
           FROM checklist_submission_answers WHERE submission_id = ?`,
          [sub.id]
        );
        const day = new Date(sub.submittedAt).getDate();
        const answerMap = {};
        for (const a of answers) {
          const val = a.answerValue ||
            (a.answerJson
              ? (typeof a.answerJson === 'string'
                  ? JSON.parse(a.answerJson)?.value
                  : a.answerJson?.value)
              : null) || '';
          answerMap[a.questionText] = val;
        }
        submissions.push({ id: sub.id, day, date: sub.submittedAt, submittedBy: sub.submittedBy, answers: answerMap });
      }

      const { questions: _dropQs, ...templateInfo } = tmpl;
      res.json({ template: { ...templateInfo, id: Number(templateId) }, questions, submissions, month, year, daysInMonth });
    } catch (err) { next(err); }
  }
);

export default router;
