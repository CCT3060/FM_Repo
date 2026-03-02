/**
 * flagRules.js
 * ─────────────────────────────────────────────────────────────────
 * REST API endpoints for managing Flag Rule Groups and Conditions.
 *
 * Base path (mounted in app.js):
 *   /api/flag-rules
 *
 * Routes:
 *   GET    /groups                       – list rule groups (filterable by template)
 *   POST   /groups                       – create rule group
 *   GET    /groups/:id                   – get single group + conditions
 *   PUT    /groups/:id                   – update group
 *   DELETE /groups/:id                   – soft-delete group
 *
 *   GET    /groups/:id/conditions        – list conditions for group
 *   POST   /groups/:id/conditions        – add condition
 *   PUT    /conditions/:condId           – update condition
 *   DELETE /conditions/:condId           – delete condition
 *
 *   GET    /escalation-matrix            – list company escalation matrix
 *   POST   /escalation-matrix            – create matrix entry
 *   PUT    /escalation-matrix/:id        – update matrix entry
 *   DELETE /escalation-matrix/:id        – delete matrix entry
 *
 *   GET    /sla-compliance               – get SLA compliance stats
 *   GET    /risk-assets                  – high/critical risk assets
 *   GET    /correlation-events           – recent cross-asset events
 *   GET    /flag-escalations/:flagId     – escalation history for flag
 */

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import pool from "../db.js";
import { getComplianceStats } from "../utils/slaEngine.js";
import { getHighRiskAssets } from "../utils/riskScoreEngine.js";
import { getCorrelationEvents } from "../utils/correlationEngine.js";
import { getFlagEscalationHistory } from "../utils/escalationMatrixEngine.js";

const router = express.Router();

// ─── Middleware ───────────────────────────────────────────────────────────────

// All routes require company-level auth at minimum
router.use(requireCompanyAuth);

// ─── Rule Groups ─────────────────────────────────────────────────────────────

// GET /flag-rules/groups
router.get("/groups", async (req, res) => {
  try {
    const { companyId } = req;
    const { templateType, templateId, isActive } = req.query;

    const conditions = ["frg.company_id = ?"];
    const params     = [companyId];

    if (templateType === "checklist" && templateId) {
      conditions.push("frg.checklist_template_id = ?");
      params.push(templateId);
    } else if (templateType === "logsheet" && templateId) {
      conditions.push("frg.logsheet_template_id = ?");
      params.push(templateId);
    }
    if (isActive !== undefined) {
      conditions.push("frg.is_active = ?");
      params.push(isActive === "true" ? 1 : 0);
    }

    const [groups] = await pool.query(
      `SELECT frg.*,
              COUNT(frc.id) AS conditionCount
       FROM flag_rule_groups frg
       LEFT JOIN flag_rule_conditions frc ON frc.group_id = frg.id
       WHERE ${conditions.join(" AND ")}
       GROUP BY frg.id
       ORDER BY frg.created_at DESC`,
      params
    );

    res.json({ success: true, groups });
  } catch (err) {
    console.error("[FlagRules] GET /groups error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /flag-rules/groups
router.post("/groups", async (req, res) => {
  try {
    const { companyId } = req;
    const {
      name, description, checklistTemplateId, logsheetTemplateId,
      logicOperator = "AND", appliesTo, severityOverride,
      autoCreateWo = false, autoWoThreshold = "high",
      clientVisible = false, visibilityMode = "internal",
    } = req.body;

    if (!name) return res.status(400).json({ success: false, error: "name is required" });
    if (!checklistTemplateId && !logsheetTemplateId) {
      return res.status(400).json({ success: false, error: "checklistTemplateId or logsheetTemplateId required" });
    }

    const [result] = await pool.query(
      `INSERT INTO flag_rule_groups
         (company_id, checklist_template_id, logsheet_template_id,
          name, description, logic_operator, applies_to, severity_override,
          auto_create_wo, auto_wo_threshold, client_visible, visibility_mode,
          is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        companyId,
        checklistTemplateId || null,
        logsheetTemplateId  || null,
        name, description || null,
        logicOperator, appliesTo || null, severityOverride || null,
        autoCreateWo ? 1 : 0, autoWoThreshold,
        clientVisible ? 1 : 0, visibilityMode,
      ]
    );

    res.status(201).json({ success: true, groupId: result.insertId });
  } catch (err) {
    console.error("[FlagRules] POST /groups error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /flag-rules/groups/:id
router.get("/groups/:id", async (req, res) => {
  try {
    const { companyId } = req;
    const [[group]] = await pool.query(
      `SELECT * FROM flag_rule_groups WHERE id = ? AND company_id = ?`,
      [req.params.id, companyId]
    );
    if (!group) return res.status(404).json({ success: false, error: "Not found" });

    const [conditions] = await pool.query(
      `SELECT * FROM flag_rule_conditions WHERE group_id = ? ORDER BY condition_order ASC`,
      [group.id]
    );

    res.json({ success: true, group: { ...group, conditions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /flag-rules/groups/:id
router.put("/groups/:id", async (req, res) => {
  try {
    const { companyId } = req;
    const {
      name, description, logicOperator, appliesTo, severityOverride,
      autoCreateWo, autoWoThreshold, clientVisible, visibilityMode, isActive,
    } = req.body;

    const [result] = await pool.query(
      `UPDATE flag_rule_groups SET
         name              = COALESCE(?, name),
         description       = COALESCE(?, description),
         logic_operator    = COALESCE(?, logic_operator),
         applies_to        = COALESCE(?, applies_to),
         severity_override = COALESCE(?, severity_override),
         auto_create_wo    = COALESCE(?, auto_create_wo),
         auto_wo_threshold = COALESCE(?, auto_wo_threshold),
         client_visible    = COALESCE(?, client_visible),
         visibility_mode   = COALESCE(?, visibility_mode),
         is_active         = COALESCE(?, is_active),
         updated_at        = NOW()
       WHERE id = ? AND company_id = ?`,
      [
        name ?? null, description ?? null, logicOperator ?? null,
        appliesTo ?? null, severityOverride ?? null,
        autoCreateWo !== undefined ? (autoCreateWo ? 1 : 0) : null,
        autoWoThreshold ?? null,
        clientVisible !== undefined ? (clientVisible ? 1 : 0) : null,
        visibilityMode ?? null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        req.params.id, companyId,
      ]
    );

    if (!result.affectedRows) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /flag-rules/groups/:id  (soft delete)
router.delete("/groups/:id", async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE flag_rule_groups SET is_active = 0, updated_at = NOW()
       WHERE id = ? AND company_id = ?`,
      [req.params.id, req.companyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Conditions ───────────────────────────────────────────────────────────────

// GET /flag-rules/groups/:id/conditions
router.get("/groups/:id/conditions", async (req, res) => {
  try {
    const [[group]] = await pool.query(
      `SELECT id FROM flag_rule_groups WHERE id = ? AND company_id = ?`,
      [req.params.id, req.companyId]
    );
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });

    const [conditions] = await pool.query(
      `SELECT * FROM flag_rule_conditions WHERE group_id = ? ORDER BY condition_order ASC`,
      [group.id]
    );
    res.json({ success: true, conditions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /flag-rules/groups/:id/conditions
router.post("/groups/:id/conditions", async (req, res) => {
  try {
    const { companyId } = req;
    const [[group]] = await pool.query(
      `SELECT id FROM flag_rule_groups WHERE id = ? AND company_id = ?`,
      [req.params.id, companyId]
    );
    if (!group) return res.status(404).json({ success: false, error: "Group not found" });

    const {
      questionId, sourceType = "question",
      operator, compareTo = "value",
      value1, value2, pctThreshold, triggerValue,
      baselineValue, rollingWindow,
      compareToQuestionId, parentConditionId,
      subLogicOperator, conditionOrder = 0,
    } = req.body;

    if (!operator) return res.status(400).json({ success: false, error: "operator is required" });

    const [result] = await pool.query(
      `INSERT INTO flag_rule_conditions
         (group_id, question_id, source_type, operator, compare_to,
          value1, value2, pct_threshold, trigger_value,
          baseline_value, rolling_window, compare_to_question_id,
          parent_condition_id, sub_logic_operator, condition_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        group.id, questionId || null, sourceType, operator, compareTo,
        value1 ?? null, value2 ?? null, pctThreshold ?? null, triggerValue ?? null,
        baselineValue ?? null, rollingWindow ?? null, compareToQuestionId ?? null,
        parentConditionId ?? null, subLogicOperator ?? null, conditionOrder,
      ]
    );

    res.status(201).json({ success: true, conditionId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /flag-rules/conditions/:condId
router.put("/conditions/:condId", async (req, res) => {
  try {
    const {
      operator, compareTo, value1, value2, pctThreshold,
      triggerValue, baselineValue, rollingWindow,
      compareToQuestionId, conditionOrder,
    } = req.body;

    await pool.query(
      `UPDATE flag_rule_conditions SET
         operator               = COALESCE(?, operator),
         compare_to             = COALESCE(?, compare_to),
         value1                 = COALESCE(?, value1),
         value2                 = COALESCE(?, value2),
         pct_threshold          = COALESCE(?, pct_threshold),
         trigger_value          = COALESCE(?, trigger_value),
         baseline_value         = COALESCE(?, baseline_value),
         rolling_window         = COALESCE(?, rolling_window),
         compare_to_question_id = COALESCE(?, compare_to_question_id),
         condition_order        = COALESCE(?, condition_order)
       WHERE id = ?`,
      [
        operator ?? null, compareTo ?? null,
        value1 ?? null, value2 ?? null, pctThreshold ?? null,
        triggerValue ?? null, baselineValue ?? null, rollingWindow ?? null,
        compareToQuestionId ?? null, conditionOrder ?? null,
        req.params.condId,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /flag-rules/conditions/:condId
router.delete("/conditions/:condId", async (req, res) => {
  try {
    await pool.query(`DELETE FROM flag_rule_conditions WHERE id = ?`, [req.params.condId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Escalation Matrix ───────────────────────────────────────────────────────

// GET /flag-rules/escalation-matrix
router.get("/escalation-matrix", async (req, res) => {
  try {
    const [matrix] = await pool.query(
      `SELECT * FROM escalation_matrix WHERE company_id = ? ORDER BY level ASC`,
      [req.companyId]
    );
    res.json({ success: true, matrix });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /flag-rules/escalation-matrix
router.post("/escalation-matrix", async (req, res) => {
  try {
    const { companyId } = req;
    const {
      level, levelLabel, targetType, targetRole, targetUserId, targetDeptId,
      triggerType, triggerValue, action, isActive = true,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO escalation_matrix
         (company_id, level, level_label, target_type, target_role,
          target_user_id, target_dept_id, trigger_type, trigger_value,
          action, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        companyId, level, levelLabel || null, targetType,
        targetRole || null, targetUserId || null, targetDeptId || null,
        triggerType, triggerValue, action, isActive ? 1 : 0,
      ]
    );

    res.status(201).json({ success: true, matrixId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /flag-rules/escalation-matrix/:id
router.put("/escalation-matrix/:id", async (req, res) => {
  try {
    const { levelLabel, targetType, targetRole, targetUserId, targetDeptId,
            triggerType, triggerValue, action, isActive } = req.body;

    await pool.query(
      `UPDATE escalation_matrix SET
         level_label    = COALESCE(?, level_label),
         target_type    = COALESCE(?, target_type),
         target_role    = COALESCE(?, target_role),
         target_user_id = COALESCE(?, target_user_id),
         target_dept_id = COALESCE(?, target_dept_id),
         trigger_type   = COALESCE(?, trigger_type),
         trigger_value  = COALESCE(?, trigger_value),
         action         = COALESCE(?, action),
         is_active      = COALESCE(?, is_active),
         updated_at     = NOW()
       WHERE id = ? AND company_id = ?`,
      [
        levelLabel ?? null, targetType ?? null, targetRole ?? null,
        targetUserId ?? null, targetDeptId ?? null,
        triggerType ?? null, triggerValue ?? null, action ?? null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        req.params.id, req.companyId,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /flag-rules/escalation-matrix/:id
router.delete("/escalation-matrix/:id", async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM escalation_matrix WHERE id = ? AND company_id = ?`,
      [req.params.id, req.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Analytics / reporting ───────────────────────────────────────────────────

// GET /flag-rules/sla-compliance?days=30
router.get("/sla-compliance", async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const stats = await getComplianceStats(req.companyId, days, pool);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /flag-rules/risk-assets
router.get("/risk-assets", async (req, res) => {
  try {
    const assets = await getHighRiskAssets(req.companyId, pool);
    res.json({ success: true, assets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /flag-rules/correlation-events?limit=20
router.get("/correlation-events", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const events = await getCorrelationEvents(req.companyId, limit, pool);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /flag-rules/flag-escalations/:flagId
router.get("/flag-escalations/:flagId", async (req, res) => {
  try {
    const history = await getFlagEscalationHistory(req.params.flagId, pool);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
