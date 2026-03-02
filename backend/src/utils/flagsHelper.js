/**
 * flagsHelper.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Centralised helpers for the Rule-Based Flag & Alert Engine:
 *   - createFlag()                – insert flag + asset health + auto WO + repeat count
 *   - updateAssetHealth()         – recalculate open_flags_count & health_status
 *   - checkAndUpdateAssetRisk()   – repeat-violation risk scoring (unstable/high_risk)
 *   - autoCreateWorkOrder()       – create WO for critical/forced flags
 *   - evaluateRule()              – full rule engine: all operators + yes_no
 *   - buildExpectedRuleText()     – human-readable description of a rule
 *   - calculateLogsheetSeverity() – deviation-based severity from min/max bounds
 *   - detectChecklistFlags()      – scan submission answers + rule_json → flag list
 */

import pool from "../db.js";

// ── Asset health rules ────────────────────────────────────────────────────────
//   0 open flags → green
//   1-2 open flags → yellow
//   3+  open flags → red

/**
 * Recalculate and persist open_flags_count + health_status for one asset.
 * @param {number|string} assetId
 * @param {object} [conn]  – pool or transaction connection; defaults to pool
 * @returns {{ openFlagsCount: number, healthStatus: string }}
 */
export async function updateAssetHealth(assetId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM flags
     WHERE asset_id = ? AND status IN ('open', 'in_progress')`,
    [assetId]
  );
  const cnt = Number(row?.cnt ?? 0);
  const health = cnt === 0 ? "green" : cnt <= 2 ? "yellow" : "red";

  await conn.query(
    `UPDATE assets SET open_flags_count = ?, health_status = ?, updated_at = NOW() WHERE id = ?`,
    [cnt, health, assetId]
  );
  return { openFlagsCount: cnt, healthStatus: health };
}

// ── Severity calculation ──────────────────────────────────────────────────────
// Deviation thresholds from the acceptable range:
//   ≤10 %  → low
//   10-25% → medium
//   25-50% → high
//   >50%   → critical

/**
 * Determine severity of a logsheet value that falls outside [min, max].
 * @param {number|string} value
 * @param {number|null}   min   – from rule_json.min
 * @param {number|null}   max   – from rule_json.max
 * @returns {'low'|'medium'|'high'|'critical'}
 */
export function calculateLogsheetSeverity(value, min, max) {
  const numVal = Number(value);
  if (!Number.isFinite(numVal)) return "medium";

  // Range used as denominator for deviation %
  const range = Math.abs((max ?? min * 2 ?? 1) - (min ?? 0)) || 1;

  if (Number.isFinite(min) && numVal < min) {
    const deviation = Math.abs(min - numVal) / range;
    if (deviation > 0.5)  return "critical";
    if (deviation > 0.25) return "high";
    if (deviation > 0.1)  return "medium";
    return "low";
  }

  if (Number.isFinite(max) && numVal > max) {
    const deviation = Math.abs(numVal - max) / range;
    if (deviation > 0.5)  return "critical";
    if (deviation > 0.25) return "high";
    if (deviation > 0.1)  return "medium";
    return "low";
  }

  return "medium"; // value is within range – caller should not call this
}

// ── Full rule evaluation engine ───────────────────────────────────────────────

/**
 * Evaluate a question's rule_json against the submitted answer.
 *
 * Supported operators (numeric): gt | lt | gte | lte | between | outside | eq | neq
 * Supported for yes_no / ok_not_ok: use operator "yes_no"/"ok_not_ok" + triggerValue
 *
 * @param {object}        rule     – parsed rule_json object
 * @param {string|number} rawValue – answer submitted by user
 * @returns {{ violated: boolean, severity: string, expectedText: string }}
 */
export function evaluateRule(rule, rawValue) {
  if (!rule) return { violated: false, severity: "medium", expectedText: "" };

  const operator    = (rule.operator || "between").toLowerCase();
  const ruleSev     = rule.severity || null;

  // Yes/No and ok_not_ok
  if (operator === "yes_no" || operator === "ok_not_ok") {
    const triggerVal  = (rule.triggerValue || "no").toLowerCase().trim();
    const answerLower = String(rawValue ?? "").toLowerCase().trim();
    const violated    = answerLower === triggerVal
      || (triggerVal === "no"     && ["n", "false", "0"].includes(answerLower))
      || (triggerVal === "not_ok" && ["not ok", "notok"].includes(answerLower));
    if (!violated) return { violated: false, severity: "medium", expectedText: "" };
    return {
      violated: true,
      severity: ruleSev || "high",
      expectedText: `Answer must NOT be "${triggerVal}"`,
    };
  }

  // Numeric operators
  const num = Number(rawValue);
  if (!Number.isFinite(num)) return { violated: false, severity: "medium", expectedText: "" };

  const min = rule.minValue != null ? Number(rule.minValue) : null;
  const max = rule.maxValue != null ? Number(rule.maxValue) : null;
  const tv  = rule.triggerValue != null ? Number(rule.triggerValue) : null;

  let violated = false;
  let expectedText = "";

  switch (operator) {
    case "gt":  violated = num <= (tv ?? max ?? 0); expectedText = `Must be > ${tv ?? max}`; break;
    case "lt":  violated = num >= (tv ?? min ?? 0); expectedText = `Must be < ${tv ?? min}`; break;
    case "gte": violated = num <  (tv ?? min ?? 0); expectedText = `Must be ≥ ${tv ?? min}`; break;
    case "lte": violated = num >  (tv ?? max ?? 0); expectedText = `Must be ≤ ${tv ?? max}`; break;
    case "eq":  violated = num !== tv; expectedText = `Must equal ${tv}`; break;
    case "neq": violated = num === tv; expectedText = `Must not equal ${tv}`; break;
    case "outside":
      violated    = (min != null && num < min) || (max != null && num > max);
      expectedText = `Acceptable range: [${min ?? "–"}, ${max ?? "–"}]`;
      break;
    case "between":
    default:
      violated    = (min != null && num < min) || (max != null && num > max);
      expectedText = `Acceptable range: [${min ?? "–"}, ${max ?? "–"}]`;
      break;
  }

  if (!violated) return { violated: false, severity: "medium", expectedText: "" };
  return {
    violated: true,
    severity: ruleSev || calculateLogsheetSeverity(num, min, max),
    expectedText,
  };
}

/**
 * Build a human-readable description of a rule for storage in flags.expected_rule.
 */
export function buildExpectedRuleText(rule) {
  if (!rule) return "";
  const op  = (rule.operator || "between").toLowerCase();
  if (op === "yes_no" || op === "ok_not_ok") return `Answer should NOT be "${rule.triggerValue || "no"}"`;
  const min = rule.minValue != null ? rule.minValue : null;
  const max = rule.maxValue != null ? rule.maxValue : null;
  if (min != null && max != null) return `Acceptable range: [${min}, ${max}]`;
  if (min != null) return `Must be ≥ ${min}`;
  if (max != null) return `Must be ≤ ${max}`;
  return "";
}

// ── Repeat-violation risk scoring ─────────────────────────────────────────────

/**
 * Update assets.risk_level based on violation frequency.
 *   ≥3 flags in 7 days  → unstable
 *   ≥5 flags in 30 days → high_risk
 *   Otherwise           → normal
 */
export async function checkAndUpdateAssetRisk(assetId, companyId, conn = pool) {
  try {
    const [[r7]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM flags
       WHERE asset_id = ? AND company_id = ?
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [assetId, companyId]
    );
    const [[r30]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM flags
       WHERE asset_id = ? AND company_id = ?
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [assetId, companyId]
    );
    const cnt7 = Number(r7?.cnt ?? 0), cnt30 = Number(r30?.cnt ?? 0);
    const riskLevel = cnt30 >= 5 ? "high_risk" : cnt7 >= 3 ? "unstable" : "normal";
    await conn.query(
      `UPDATE assets SET risk_level = ?, updated_at = NOW() WHERE id = ?`,
      [riskLevel, assetId]
    );
    return riskLevel;
  } catch (err) {
    console.error("[FlagSystem] checkAndUpdateAssetRisk failed:", err.message);
    return "normal";
  }
}

// ── Work Order auto-creation ──────────────────────────────────────────────────

function generateWONumber() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WO-FLAG-${ts}-${rand}`;
}

/**
 * Create a Work Order linked to a flag (called automatically for critical flags).
 * Updates the flag record with the resulting work_order_id.
 *
 * @param {object} opts
 * @param {number} opts.flagId
 * @param {number} opts.assetId
 * @param {string} [opts.assetName]
 * @param {string} [opts.location]
 * @param {string} [opts.description]
 * @param {number|null} [opts.createdBy]  – company_users.id of the creator
 * @param {object} [conn]
 * @returns {number|null} workOrderId or null on failure
 */
export async function autoCreateWorkOrder(
  { flagId, assetId, assetName, location, description, createdBy },
  conn = pool
) {
  const woNumber = generateWONumber();
  try {
    const [result] = await conn.query(
      `INSERT INTO work_orders
         (work_order_number, asset_id, asset_name, location,
          issue_source, issue_description, priority, status, flag_id, created_at)
       VALUES (?, ?, ?, ?, 'flag', ?, 'critical', 'open', ?, NOW())
       RETURNING id`,
      [woNumber, assetId, assetName || null, location || null, description || null, flagId]
    );
    const workOrderId = result.insertId || result[0]?.id;

    // Back-link the flag
    if (workOrderId) {
      await conn.query(
        `UPDATE flags SET work_order_id = ?, updated_at = NOW() WHERE id = ?`,
        [workOrderId, flagId]
      );
    }
    return workOrderId;
  } catch (err) {
    // WO creation failure is non-fatal – log and continue
    console.error("[autoCreateWorkOrder] failed:", err.message);
    return null;
  }
}

// ── Core flag creation ────────────────────────────────────────────────────────

/**
 * Create a flag record, update asset health, and auto-create a Work Order
 * when severity is 'critical'.
 *
 * @param {object} params
 * @param {'checklist'|'logsheet'|'manual'} params.source
 * @param {number}  params.companyId
 * @param {number}  params.assetId
 * @param {number}  [params.checklistId]
 * @param {number}  [params.submissionId]
 * @param {number}  [params.questionId]
 * @param {number}  [params.logsheetEntryId]
 * @param {number}  [params.logsheetAnswerId]
 * @param {number}  [params.raisedBy]          – company_users.id
 * @param {number}  [params.supervisorId]       – auto-resolved from raisedBy if omitted
 * @param {string}  params.description
 * @param {'low'|'medium'|'high'|'critical'} params.severity
 * @param {string}  [params.enteredValue]  – actual value that violated the rule
 * @param {string}  [params.expectedRule]  – human-readable expected rule text
 * @param {boolean} [params.forceWorkOrder] – create WO even when not critical
 *
 * @param {object} [assetInfo]                  – { assetName, location } for WO text
 * @param {object} [conn]                        – pool or transaction connection
 * @returns {number} flagId
 */
export async function createFlag(params, assetInfo = {}, conn = pool) {
  const {
    source           = "manual",
    companyId,
    assetId,
    checklistId      = null,
    submissionId     = null,
    questionId       = null,
    logsheetEntryId  = null,
    logsheetAnswerId = null,
    raisedBy         = null,
    supervisorId: _supervisorId = null,
    description      = null,
    severity         = "medium",
    enteredValue     = null,
    expectedRule     = null,
    forceWorkOrder   = false,
  } = params;

  // Auto-resolve supervisor from the submitter's profile
  let supervisorId = _supervisorId;
  if (!supervisorId && raisedBy) {
    try {
      const [[cu]] = await conn.query(
        `SELECT supervisor_id FROM company_users WHERE id = ?`,
        [raisedBy]
      );
      supervisorId = cu?.supervisor_id || null;
    } catch {
      // non-fatal
    }
  }

  // Count prior violations on same question+asset for repeat_count
  let repeatCount = 1;
  if (questionId && assetId) {
    try {
      const [[rc]] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM flags WHERE asset_id = ? AND question_id = ? AND company_id = ?`,
        [assetId, questionId, companyId]
      );
      repeatCount = Number(rc?.cnt ?? 0) + 1;
    } catch { /* non-fatal */ }
  }

  // Auto-escalate severity on repeated violations (same question → same problem recurring)
  const effectiveSeverity = (() => {
    if (repeatCount >= 5 && severity !== "critical") return "critical";
    if (repeatCount >= 3 && severity === "low")      return "medium";
    return severity;
  })();


  const [result] = await conn.query(
    `INSERT INTO flags
       (company_id, asset_id, source, checklist_id, submission_id, question_id,
        logsheet_entry_id, logsheet_answer_id, raised_by, supervisor_id,
        description, severity, status,
        entered_value, expected_rule, repeat_count,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NOW(), NOW())
     RETURNING id`,
    [
      companyId, assetId, source,
      checklistId, submissionId, questionId,
      logsheetEntryId, logsheetAnswerId,
      raisedBy, supervisorId,
      description, effectiveSeverity,
      enteredValue ? String(enteredValue).slice(0, 255) : null,
      expectedRule ? String(expectedRule).slice(0, 500) : null,
      repeatCount,
    ]
  );
  const flagId = result.insertId || result[0]?.id;

  // Recompute asset health
  await updateAssetHealth(assetId, conn);

  // Recompute asset risk level
  await checkAndUpdateAssetRisk(assetId, companyId, conn);

  // Auto work order for critical flags or when rule forces it
  if ((effectiveSeverity === "critical" || forceWorkOrder) && flagId) {
    await autoCreateWorkOrder(
      {
        flagId,
        assetId,
        assetName: assetInfo.assetName || null,
        location:  assetInfo.location  || null,
        description,
        createdBy: raisedBy || null,
      },
      conn
    );
  }

  return flagId;
}

// ── Checklist flag detection ──────────────────────────────────────────────────
// Combines rule_json-based evaluation (per question) with heuristic patterns:
//   yes_no answer = "no"   → RED  (unless rule_json overrides)
//   ok_not_ok = "not_ok"   → RED
//   remark with content    → YELLOW
//   answer contains issue keywords → YELLOW

const ISSUE_KEYWORDS = /\b(issue|fault|defect|broken|damage|fail|error|leak|not work|problem)\b/i;

/**
 * Analyse checklist submission answers and return an array of flag param objects
 * (one per triggering answer).  Does NOT persist – callers call createFlag() themselves.
 *
 * @param {Array}  answers   – rows from checklist_submission_answers
 * @param {object} context   – { companyId, assetId, checklistId, submissionId, raisedBy }
 * @param {object} [ruleMap] – { [questionId]: parsedRuleJson } pre-loaded by caller
 * @returns {Array<object>}   – array of params ready for createFlag()
 */
export function detectChecklistFlags(answers, context, ruleMap = {}) {
  const { companyId, assetId, checklistId, submissionId, raisedBy } = context;
  const flags = [];

  for (const ans of answers) {
    const inputType = (ans.input_type || ans.inputType || "").toLowerCase();
    const selected  = (ans.option_selected || "").toLowerCase().trim();
    let   answerText = "";

    // Unpack answer_json
    try {
      const parsed = typeof ans.answer_json === "string"
        ? JSON.parse(ans.answer_json)
        : ans.answer_json;
      answerText = String(parsed?.value ?? "").toLowerCase().trim();
    } catch {
      answerText = String(ans.option_selected || "").toLowerCase().trim();
    }

    const combinedText = `${selected} ${answerText}`.trim();
    const qId          = ans.question_id || null;
    const questionRule = qId ? (ruleMap[qId] || null) : null;

    // ── Rule-based evaluation (takes priority over heuristics) ──────────────
    if (questionRule) {
      const rawVal   = answerText || selected;
      const ruleEval = evaluateRule(questionRule, rawVal);
      if (ruleEval.violated) {
        flags.push({
          source: "checklist",
          companyId, assetId, checklistId, submissionId,
          questionId:    qId,
          raisedBy,
          description:   `Rule violation: "${ans.question_text || ans.questionText}" – value: ${rawVal}`,
          severity:      ruleEval.severity,
          enteredValue:  String(rawVal).slice(0, 255),
          expectedRule:  ruleEval.expectedText,
          forceWorkOrder: !!questionRule.autoWorkOrder,
        });
        continue;
      }
    }

    // yes_no → NO → RED flag
    if (inputType === "yes_no" && (selected === "no" || answerText === "no")) {
      flags.push({
        source: "checklist",
        companyId, assetId, checklistId, submissionId,
        questionId:   ans.question_id || null,
        raisedBy,
        description:  `Checklist NO answer: "${ans.question_text}"`,
        severity:     "high",
        enteredValue: "no",
        expectedRule: 'Expected "yes"',
      });
      continue;
    }

    // ok_not_ok → not_ok → RED flag
    if (inputType === "ok_not_ok" && (selected === "not_ok" || selected === "not ok" || answerText === "not_ok")) {
      flags.push({
        source: "checklist",
        companyId, assetId, checklistId, submissionId,
        questionId:   ans.question_id || null,
        raisedBy,
        description:  `Checklist NOT OK answer: "${ans.question_text}"`,
        severity:     "high",
        enteredValue: "not_ok",
        expectedRule: 'Expected "ok"',
      });
      continue;
    }

    // remark field with content → YELLOW flag
    if (inputType === "remark" && combinedText.length > 2) {
      flags.push({
        source: "checklist",
        companyId, assetId, checklistId, submissionId,
        questionId:   ans.question_id || null,
        raisedBy,
        description:  `Checklist remark flagged: "${ans.question_text}" – ${combinedText.slice(0, 200)}`,
        severity:     "medium",
        enteredValue: combinedText.slice(0, 255),
      });
      continue;
    }

    // Any text answer containing issue keywords → YELLOW flag
    if (ISSUE_KEYWORDS.test(combinedText)) {
      flags.push({
        source: "checklist",
        companyId, assetId, checklistId, submissionId,
        questionId:   ans.question_id || null,
        raisedBy,
        description:  `Issue detected in answer: "${ans.question_text}" – ${combinedText.slice(0, 200)}`,
        severity:     "medium",
        enteredValue: combinedText.slice(0, 255),
      });
    }
  }

  return flags;
}
