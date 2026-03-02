/**
 * flagOrchestrator.js
 * ─────────────────────────────────────────────────────────────────
 * Central entry point for the Advanced Flag Intelligence Engine.
 *
 * Called after every checklist / logsheet submission.
 * Chains all sub-engines in the correct order:
 *   1. evaluateAllRulesForTemplate  → which rule groups fired
 *   2. computeFromViolation         → dynamic severity score per group
 *   3. detectTrends                 → pattern detection on history
 *   4. createFlag                   → persist flag row (enhanced)
 *   5. createSlaRecord              → SLA tracking setup
 *   6. computeAndSaveAssetRisk      → refresh asset risk score
 *   7. runMatrixEscalation          → matrix-based escalation
 *   8. maybeCreateWorkOrder         → smart WO creation
 *   9. runCorrelationCheck          → cross-asset pattern check
 *
 * Main exports:
 *   orchestrateFlag(params, conn) → FlagOrchestrationResult
 */

import pool from "../db.js";
import {
  evaluateAllRulesForTemplate,
} from "./advancedRuleEngine.js";
import {
  detectTrends,
  logTrend,
} from "./trendEngine.js";
import {
  computeFromViolation,
  applyTrendBoost,
  scoreToLevel,
} from "./severityEngine.js";
import { computeAndSaveAssetRisk } from "./riskScoreEngine.js";
import { createSlaRecord, recordFirstResponse, recordResolution } from "./slaEngine.js";
import { runMatrixEscalation } from "./escalationMatrixEngine.js";
import { maybeCreateWorkOrder } from "./workOrderTrigger.js";
import { runCorrelationCheck } from "./correlationEngine.js";
import { createNotification } from "./notificationsHelper.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createEnhancedFlag(params, conn) {
  const {
    companyId, assetId, templateId, templateType,
    submissionId, source,
    severity, severityScore, groupId,
    description, raisedBy,
    trendFlag, patternType, repeatCount,
    departmentId, clientVisible, visibilityMode,
  } = params;

  // Get current repeat count for this asset + description pattern
  const [[repeatRow]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM flags
     WHERE asset_id = ? AND company_id = ?
       AND created_at >= NOW() - INTERVAL 30 DAY`,
    [assetId, companyId]
  );
  const repeat = repeatCount ?? Number(repeatRow.cnt ?? 0);

  const [result] = await conn.query(
    `INSERT INTO flags
       (company_id, asset_id,
        ${templateType === "checklist" ? "checklist_template_id" : "logsheet_template_id"},
        ${templateType === "checklist" ? "checklist_submission_id" : "logsheet_submission_id"},
        source, severity, severity_score, rule_group_id,
        description, raised_by,
        trend_flag, pattern_type, repeat_count,
        department_id, client_visible, visibility_mode,
        status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NOW())`,
    [
      companyId, assetId, templateId, submissionId,
      source || templateType, severity, severityScore ?? null, groupId ?? null,
      description, raisedBy ?? null,
      trendFlag ? 1 : 0,
      patternType ?? null,
      repeat, departmentId ?? null,
      clientVisible ? 1 : 0,
      visibilityMode || "internal",
    ]
  );

  const flagId = result.insertId;

  // Update asset.open_flags_count
  await conn.query(
    `UPDATE assets
     SET open_flags_count = COALESCE(open_flags_count, 0) + 1,
         health_status = CASE
           WHEN ? = 'critical' THEN 'critical'
           WHEN ? = 'high' AND health_status != 'critical' THEN 'at_risk'
           ELSE health_status
         END,
         updated_at = NOW()
     WHERE id = ?`,
    [severity, severity, assetId]
  );

  // Log in flag_history
  await conn.query(
    `INSERT INTO flag_history (flag_id, old_status, new_status, remark, changed_at)
     VALUES (?, NULL, 'open', 'Flag created by orchestrator', NOW())`,
    [flagId]
  ).catch(() => {});

  return flagId;
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * Orchestrate the full flag intelligence pipeline for a single submission.
 *
 * @param {{
 *   companyId:    number,
 *   assetId:      number,
 *   templateId:   number,
 *   templateType: 'checklist' | 'logsheet',
 *   submissionId: number,
 *   answers:      Array<{ questionId, answerJson|answer_value }>,
 *   raisedBy:     number|null,
 * }} params
 * @param {object} [conn]
 * @returns {Promise<{
 *   flags: Array,
 *   trends: Array,
 *   riskScore: number,
 *   riskLevel: string,
 *   workOrders: Array,
 *   correlationEvents: Array,
 * }>}
 */
export async function orchestrateFlag(params, conn = pool) {
  const {
    companyId, assetId, templateId, templateType,
    submissionId, answers = [], raisedBy,
  } = params;

  const createdFlags  = [];
  const allTrends     = [];
  const workOrders    = [];

  try {
    // ── Step 1: Evaluate all rule groups for this template ──────────────────
    const violatedGroups = await evaluateAllRulesForTemplate(
      templateId, templateType, answers, assetId, conn
    );

    if (!violatedGroups.length) {
      // No violations – but still refresh risk (cheaper async path)
      computeAndSaveAssetRisk(assetId, companyId, conn).catch(() => {});
      return { flags: [], trends: [], riskScore: null, riskLevel: null, workOrders: [], correlationEvents: [] };
    }

    // ── Step 2–4: For each violated group, compute severity + create flag ──
    for (const vg of violatedGroups) {
      const { group, severity: ruleSeverity, triggeredConditions, groupName } = vg;

      // Get first answer value for primary question (best-effort)
      const primaryAnswer = answers[0];
      const rawValue = primaryAnswer?.answerJson?.value
        ?? primaryAnswer?.answer_value
        ?? null;

      // Step 2: Dynamic severity score
      const { score, level, breakdown } = await computeFromViolation(
        rawValue,
        { severity: ruleSeverity },
        assetId, companyId, conn
      );

      // Step 3: Trend analysis
      const primaryQId = answers[0]?.questionId ?? answers[0]?.question_id;
      let trendResult = { patterns: [] };
      if (primaryQId && rawValue != null) {
        trendResult = await detectTrends(assetId, primaryQId, Number(rawValue), null, conn);
      }

      // Boost score if trend patterns found
      const { score: boostedScore, level: finalLevel } = applyTrendBoost(score, trendResult.patterns);
      const hasTrend    = trendResult.patterns.length > 0;
      const patternType = trendResult.patterns[0]?.type ?? null;
      allTrends.push(...trendResult.patterns);

      // Step 4: Create enhanced flag
      const description = [
        groupName ? `[${groupName}]` : "",
        triggeredConditions.slice(0, 3).join("; ") ||
          `Severity: ${finalLevel} (score: ${boostedScore.toFixed(0)})`,
        hasTrend ? `Pattern: ${patternType}` : "",
      ].filter(Boolean).join(" – ");

      const flagId = await createEnhancedFlag({
        companyId, assetId, templateId, templateType, submissionId,
        severity:      finalLevel,
        severityScore: boostedScore,
        groupId:       vg.groupId,
        description,
        raisedBy,
        trendFlag:     hasTrend,
        patternType,
        clientVisible: group.client_visible ?? false,
        visibilityMode: group.visibility_mode || "internal",
      }, conn);

      const flagObj = {
        id: flagId, companyId, assetId, severity: finalLevel,
        severityScore: boostedScore, trend_flag: hasTrend, pattern_type: patternType,
        repeat_count: 0, status: "open", description,
        created_at: new Date(),
      };

      createdFlags.push(flagObj);

      // Step 5: SLA record
      await createSlaRecord(flagId, finalLevel, companyId, conn);

      // Log detected trends
      for (const p of trendResult.patterns) {
        await logTrend({
          assetId, questionId: primaryQId || null,
          sourceType: templateType,
          detectionType: p.type, windowSize: p.window,
          values: trendResult.history?.map((h) => h.value) ?? [],
          severity: p.severity, flagId, companyId, conn,
        }).catch(() => {});
      }

      // Step 7: Escalation matrix
      runMatrixEscalation(flagObj, conn).catch((e) =>
        console.error("[Orchestrator] escalation error:", e.message)
      );

      // Step 8: Work order
      const woResult = await maybeCreateWorkOrder(
        { ...flagObj, assetName: null },
        {
          severityThreshold: "high",
          repeatThreshold:   3,
          ruleGroupAutoWo:   group.auto_create_wo ?? false,
          forceTrigger:      hasTrend && finalLevel === "critical",
        },
        conn
      );
      if (woResult.workOrderId) workOrders.push(woResult);

      // Notify supervisors for high/critical
      if (["high", "critical"].includes(finalLevel)) {
        const [supervisors] = await conn.query(
          `SELECT id FROM company_users
           WHERE company_id = ? AND role IN ('admin','supervisor') AND status = 'active'
           LIMIT 5`,
          [companyId]
        );
        for (const sup of supervisors) {
          createNotification({
            companyId, userId: sup.id,
            type:       "flag_created",
            title:      `${finalLevel.toUpperCase()} Flag – ${woResult.workOrderId ? "WO Created" : "Action Required"}`,
            body:       description.slice(0, 160),
            entityType: "flag", entityId: flagId,
          }, conn).catch(() => {});
        }
      }
    }

    // ── Step 6: Refresh asset risk score (after all flags created) ──────────
    const { riskScore, riskLevel } = await computeAndSaveAssetRisk(assetId, companyId, conn);

    // ── Step 9: Correlation check (fire and forget) ─────────────────────────
    const correlationResult = await runCorrelationCheck(companyId, 60, conn).catch(() => ({ events: [] }));

    return {
      flags:             createdFlags,
      trends:            allTrends,
      riskScore,
      riskLevel,
      workOrders,
      correlationEvents: correlationResult.events,
    };
  } catch (err) {
    console.error("[Orchestrator] orchestrateFlag error:", err.message, err.stack);
    return { flags: createdFlags, trends: allTrends, riskScore: null, riskLevel: null, workOrders, correlationEvents: [] };
  }
}

/**
 * Convenience: update flag lifecycle state and fire SLA / escalation hooks.
 *
 * @param {number} flagId
 * @param {string} newStatus  – 'acknowledged'|'investigating'|'resolved'|'closed'|'ignored'
 * @param {object} extra      – { reason, userId }
 * @param {object} [conn]
 */
export async function updateFlagLifecycle(flagId, newStatus, extra = {}, conn = pool) {
  const allowedTransitions = ["acknowledged", "investigating", "linked_to_wo", "resolved", "closed", "ignored"];
  if (!allowedTransitions.includes(newStatus)) return;

  const tsMap = {
    acknowledged: "acknowledged_at",
    investigating: "investigating_at",
    resolved:      "resolved_at",
    closed:        "closed_at",
    ignored:       "ignored_at",
  };

  const tsCol  = tsMap[newStatus];
  const clause = tsCol ? `, ${tsCol} = NOW()` : "";
  const ignoredClause = newStatus === "ignored" && extra.reason
    ? `, ignored_reason = ?` : "";
  const params = [newStatus];
  if (newStatus === "ignored" && extra.reason) params.push(extra.reason);
  params.push(flagId);

  await conn.query(
    `UPDATE flags SET status = ?, updated_at = NOW() ${clause} ${ignoredClause} WHERE id = ?`,
    params
  );

  // SLA hooks
  if (newStatus === "acknowledged") await recordFirstResponse(flagId, conn);
  if (newStatus === "resolved")     await recordResolution(flagId, conn);

  // History log
  await conn.query(
    `INSERT INTO flag_history (flag_id, old_status, new_status, remark, changed_at)
     VALUES (?, NULL, ?, ?, NOW())`,
    [flagId, newStatus, extra.reason || `Status changed to ${newStatus}`]
  ).catch(() => {});
}
