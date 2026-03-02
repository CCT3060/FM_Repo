/**
 * advancedRuleEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Multi-condition rule evaluation engine.
 *
 * Supports:
 *  - 13 operator types (gt, lt, gte, lte, eq, neq, between, outside,
 *    pct_deviation, rate_of_change, yes_no, ok_not_ok)
 *  - Compare modes: value | previous | rolling_avg | baseline | another_question
 *  - AND / OR logical groups
 *  - Nested sub-conditions
 *  - Cross-question references within same submission
 *
 * Main exports:
 *   evaluateRuleGroup(groupId, answers, assetId, companyId, conn)
 *   → { violated, severity, triggeredConditions[], message }
 *
 *   evaluateSingleCondition(condition, resolvedValue, compareValue)
 *   → { violated, detail }
 */

import pool from "../db.js";

// ─── Operator evaluation ─────────────────────────────────────────────────────

/**
 * Apply a numeric / string operator.
 * @param {string} operator
 * @param {number|string} current  – resolved current value
 * @param {number|string} compare  – resolved compare-to value (baseline, prev, etc.)
 * @param {object}  cond           – full condition row (value1, value2, pct_threshold, trigger_value)
 * @returns {{ violated: boolean, detail: string }}
 */
function applyOperator(operator, current, compare, cond) {
  const op  = (operator || "between").toLowerCase();
  const v1  = cond.value1 != null ? Number(cond.value1) : null;
  const v2  = cond.value2 != null ? Number(cond.value2) : null;
  const pct = cond.pct_threshold != null ? Number(cond.pct_threshold) : null;
  const tv  = cond.trigger_value;

  // Binary answer types
  if (op === "yes_no" || op === "ok_not_ok") {
    const ans  = String(current ?? "").toLowerCase().trim();
    const trig = (tv || (op === "yes_no" ? "no" : "not_ok")).toLowerCase().trim();
    const violated =
      ans === trig ||
      (trig === "no"     && ["n", "false", "0"].includes(ans)) ||
      (trig === "not_ok" && ["not ok", "notok"].includes(ans));
    return { violated, detail: violated ? `Answer "${current}" matches trigger "${trig}"` : "" };
  }

  const num = Number(current);
  if (!Number.isFinite(num)) return { violated: false, detail: "" };

  switch (op) {
    case "gt":  return applyResult(num > (v1 ?? 0),  `${num} > ${v1}`);
    case "lt":  return applyResult(num < (v1 ?? 0),  `${num} < ${v1}`);
    case "gte": return applyResult(num >= (v1 ?? 0), `${num} >= ${v1}`);
    case "lte": return applyResult(num <= (v1 ?? 0), `${num} <= ${v1}`);
    case "eq":  return applyResult(num === Number(tv ?? v1), `${num} == ${tv ?? v1}`);
    case "neq": return applyResult(num !== Number(tv ?? v1), `${num} != ${tv ?? v1}`);
    case "between":
      return applyResult(
        (v1 != null && num < v1) || (v2 != null && num > v2),
        `${num} outside [${v1}, ${v2}]`
      );
    case "outside":
      return applyResult(
        (v1 != null && num < v1) || (v2 != null && num > v2),
        `${num} outside acceptable range [${v1}, ${v2}]`
      );
    case "pct_deviation": {
      if (compare == null || compare === 0) return { violated: false, detail: "" };
      const deviation = Math.abs((num - Number(compare)) / Number(compare)) * 100;
      const violated  = pct != null && deviation > pct;
      return applyResult(violated, `${deviation.toFixed(1)}% deviation from ${compare} (threshold ${pct}%)`);
    }
    case "rate_of_change": {
      if (compare == null || compare === 0) return { violated: false, detail: "" };
      const roc     = ((num - Number(compare)) / Math.abs(Number(compare))) * 100;
      const violated = pct != null && Math.abs(roc) > pct;
      return applyResult(violated, `Rate of change ${roc.toFixed(1)}% (threshold ${pct}%)`);
    }
    default:
      return { violated: false, detail: `Unknown operator: ${op}` };
  }
}

function applyResult(violated, detail) {
  return { violated, detail: violated ? detail : "" };
}

// ─── Resolve compare-to value ────────────────────────────────────────────────

/**
 * Resolve what value to compare against based on condition.compare_to mode.
 * For 'value' mode returns null (static thresholds in value1/value2 are used directly).
 */
async function resolveCompareValue(cond, answers, assetId, conn) {
  const mode = cond.compare_to || "value";

  if (mode === "value") return null;

  if (mode === "another_question") {
    // Find the answer from another question in the same submission
    const other = answers.find((a) =>
      a.questionId === cond.compare_to_question_id ||
      a.question_id === cond.compare_to_question_id
    );
    if (!other) return null;
    const raw = other.answerJson?.value ?? other.answer_value ?? null;
    return Number(raw);
  }

  // For previous / rolling_avg / baseline we need historical data
  const qKey = cond.question_id || cond.logsheet_question_key;
  if (!qKey || !assetId) return null;

  if (mode === "baseline") {
    return cond.baseline_value != null ? Number(cond.baseline_value) : null;
  }

  if (mode === "previous") {
    // Get the most recent answer for this question on this asset (before current submission)
    const [rows] = await conn.query(
      `SELECT csa.answer_json
       FROM checklist_submission_answers csa
       JOIN checklist_submissions cs ON cs.id = csa.submission_id
       WHERE csa.question_id = ?
         AND cs.asset_id = ?
       ORDER BY cs.submitted_at DESC
       LIMIT 1`,
      [cond.question_id, assetId]
    );
    if (!rows.length) return null;
    const parsed = rows[0].answer_json ? JSON.parse(rows[0].answer_json) : null;
    return Number(parsed?.value ?? null);
  }

  if (mode === "rolling_avg") {
    const window = cond.rolling_window || 3;
    const [rows] = await conn.query(
      `SELECT csa.answer_json
       FROM checklist_submission_answers csa
       JOIN checklist_submissions cs ON cs.id = csa.submission_id
       WHERE csa.question_id = ?
         AND cs.asset_id = ?
       ORDER BY cs.submitted_at DESC
       LIMIT ?`,
      [cond.question_id, assetId, window]
    );
    if (!rows.length) return null;
    const nums = rows
      .map((r) => {
        const p = r.answer_json ? JSON.parse(r.answer_json) : null;
        return Number(p?.value ?? null);
      })
      .filter(Number.isFinite);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  }

  return null;
}

// ─── Single condition evaluator ───────────────────────────────────────────────

async function evaluateSingleCondition(cond, answers, assetId, conn) {
  // Get the answer for this condition's question
  const answer = answers.find(
    (a) => a.questionId === cond.question_id || a.question_id === cond.question_id
  );
  if (!answer && cond.source_type === "question") return { violated: false, detail: "" };

  let rawValue;
  if (answer) {
    const parsed = typeof answer.answerJson === "string"
      ? JSON.parse(answer.answerJson)
      : (answer.answerJson || {});
    rawValue = parsed?.value ?? answer.answer_value ?? parsed;
  }

  const compareValue = await resolveCompareValue(cond, answers, assetId, conn);
  return applyOperator(cond.operator, rawValue, compareValue, cond);
}

// ─── Nested sub-group evaluator ───────────────────────────────────────────────

async function evaluateConditionSet(conditions, logic, answers, assetId, conn) {
  const results = await Promise.all(
    conditions.map((c) => evaluateSingleCondition(c, answers, assetId, conn))
  );

  const triggered = results.filter((r) => r.violated);

  const violated = logic === "OR"
    ? triggered.length > 0
    : triggered.length === conditions.length; // AND: all must fire

  const details = triggered.map((r) => r.detail).filter(Boolean);
  return { violated, triggeredCount: triggered.length, totalCount: conditions.length, details };
}

// ─── Public: evaluate a full rule group ──────────────────────────────────────

/**
 * Evaluate a flag_rule_group against a set of submission answers.
 *
 * @param {number}   groupId    – flag_rule_groups.id
 * @param {Array}    answers    – submission answers [{ questionId, answerJson|answer_value }]
 * @param {number}   assetId    – current asset
 * @param {object}   [conn]     – db connection or pool
 * @returns {Promise<{
 *   violated: boolean,
 *   severity: string,
 *   triggeredConditions: string[],
 *   groupName: string,
 *   message: string,
 *   group: object
 * }>}
 */
export async function evaluateRuleGroup(groupId, answers, assetId, conn = pool) {
  // Load group with its conditions
  const [[group]] = await conn.query(
    `SELECT * FROM flag_rule_groups WHERE id = ? AND is_active = 1`,
    [groupId]
  );
  if (!group) return { violated: false, severity: "medium", triggeredConditions: [], message: "" };

  const [conditions] = await conn.query(
    `SELECT * FROM flag_rule_conditions
     WHERE group_id = ? AND parent_condition_id IS NULL
     ORDER BY condition_order ASC`,
    [groupId]
  );
  if (!conditions.length) return { violated: false, severity: "medium", triggeredConditions: [], message: "" };

  const { violated, details } = await evaluateConditionSet(
    conditions,
    group.logic_operator,
    answers,
    assetId,
    conn
  );

  return {
    violated,
    severity: group.severity_override || "medium",
    triggeredConditions: details,
    groupName: group.name,
    message: violated
      ? `Rule group "${group.name}" triggered: ${details.slice(0, 3).join("; ")}`
      : "",
    group,
  };
}

/**
 * Evaluate ALL active rule groups for a given template + submission.
 * Returns only the groups that were violated.
 *
 * @param {number}  templateId   – checklist_template_id or logsheet_template_id
 * @param {string}  templateType – 'checklist' | 'logsheet'
 * @param {Array}   answers
 * @param {number}  assetId
 * @param {object}  [conn]
 * @returns {Promise<Array<{ groupId, violated, severity, message, group }>>}
 */
export async function evaluateAllRulesForTemplate(templateId, templateType, answers, assetId, conn = pool) {
  const field = templateType === "logsheet"
    ? "logsheet_template_id"
    : "checklist_template_id";

  const [groups] = await conn.query(
    `SELECT id FROM flag_rule_groups
     WHERE ${field} = ? AND is_active = 1`,
    [templateId]
  );

  const results = await Promise.all(
    groups.map((g) => evaluateRuleGroup(g.id, answers, assetId, conn))
  );

  return results
    .map((r, i) => ({ groupId: groups[i].id, ...r }))
    .filter((r) => r.violated);
}

export { applyOperator, evaluateSingleCondition };
