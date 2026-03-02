/**
 * trendEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Detects abnormal patterns in historical readings for an asset+question.
 *
 * Detection Types:
 *   consecutive_violation  – same rule fires X times in Y days
 *   increasing_trend       – values rising consistently
 *   sudden_spike           – single jump > N% above rolling avg
 *   gradual_deterioration  – slow downward/upward drift over window
 *   oscillating            – alternating high/low beyond threshold
 *
 * Main exports:
 *   detectTrends(assetId, questionId, currentValue, companyId, conn)
 *   → { patterns: TrendDetection[] }
 *
 *   logTrend(assetId, questionId, detectionType, values, severity, flagId, companyId, conn)
 */

import pool from "../db.js";

const DEFAULT_WINDOW = 7;    // readings
const SPIKE_THRESHOLD_PCT = 50;   // 50% above rolling avg = spike
const CONSEC_VIOLATION_MIN = 3;   // 3 consecutive violations = trend flag
const TREND_SLOPE_THRESHOLD = 0.15; // 15% consistent slope = trend

// ─── Fetch historical values ──────────────────────────────────────────────────

async function fetchHistory(assetId, questionId, limit, conn) {
  const [rows] = await conn.query(
    `SELECT csa.answer_json, cs.submitted_at AS ts
     FROM checklist_submission_answers csa
     JOIN checklist_submissions cs ON cs.id = csa.submission_id
     WHERE csa.question_id = ?
       AND cs.asset_id = ?
       AND cs.status != 'draft'
     ORDER BY cs.submitted_at DESC
     LIMIT ?`,
    [questionId, assetId, limit]
  );
  return rows
    .map((r) => {
      const parsed = r.answer_json ? JSON.parse(r.answer_json) : null;
      const val = Number(parsed?.value ?? parsed);
      return Number.isFinite(val) ? { value: val, ts: r.ts } : null;
    })
    .filter(Boolean)
    .reverse(); // oldest → newest
}

// ─── Pattern detectors ───────────────────────────────────────────────────────

function detectConsecutiveViolations(values, rule) {
  if (!rule || values.length < CONSEC_VIOLATION_MIN) return null;
  const { minValue, maxValue } = rule;
  let streak = 0;
  for (const { value } of [...values].reverse()) { // newest first
    const outside =
      (minValue != null && value < Number(minValue)) ||
      (maxValue != null && value > Number(maxValue));
    if (!outside) break;
    streak++;
  }
  if (streak >= CONSEC_VIOLATION_MIN) {
    const severity = streak >= 5 ? "critical" : streak >= 4 ? "high" : "medium";
    return {
      type: "consecutive_violation",
      severity,
      window: streak,
      message: `${streak} consecutive readings outside acceptable range`,
    };
  }
  return null;
}

function detectIncreasingTrend(values) {
  if (values.length < 3) return null;
  const slice = values.slice(-5); // last 5
  let rises = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].value > slice[i - 1].value) rises++;
  }
  const ratio = rises / (slice.length - 1);
  if (ratio >= 0.8) { // 80%+ readings are rising
    const first = slice[0].value, last = slice[slice.length - 1].value;
    const slope = (last - first) / Math.abs(first || 1);
    if (slope > TREND_SLOPE_THRESHOLD) {
      return {
        type: "increasing_trend",
        severity: slope > 0.5 ? "high" : "medium",
        window: slice.length,
        message: `Consistent increasing trend: ${(slope * 100).toFixed(1)}% rise over ${slice.length} readings`,
      };
    }
  }
  return null;
}

function detectSuddenSpike(values) {
  if (values.length < 3) return null;
  const recent = values.slice(-3);
  const prev   = values.slice(0, -1);

  const rollingAvg = prev.reduce((s, v) => s + v.value, 0) / prev.length;
  const latest     = recent[recent.length - 1].value;

  if (rollingAvg === 0) return null;
  const spikePct = Math.abs((latest - rollingAvg) / rollingAvg) * 100;

  if (spikePct > SPIKE_THRESHOLD_PCT) {
    return {
      type: "sudden_spike",
      severity: spikePct > 100 ? "critical" : spikePct > 70 ? "high" : "medium",
      window: prev.length,
      message: `Sudden spike: ${spikePct.toFixed(1)}% deviation from rolling average (${rollingAvg.toFixed(2)})`,
    };
  }
  return null;
}

function detectGradualDeterioration(values, rule) {
  if (values.length < 5) return null;
  const slice = values.slice(-8);
  // Fit a linear trend using least-squares slope
  const n = slice.length;
  const xs = slice.map((_, i) => i);
  const ys = slice.map((v) => v.value);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const mean  = sumY / n;
  const normalizedSlope = Math.abs(slope / (mean || 1));

  if (normalizedSlope > 0.05 && n >= 5) {
    const direction = slope > 0 ? "upward" : "downward";
    // Deterioration depends on whether rule cares about high or low values
    const isDeterioration =
      (!rule) ||
      (slope > 0 && rule.maxValue != null) ||  // trending towards max violation
      (slope < 0 && rule.minValue != null);     // trending towards min violation

    if (isDeterioration) {
      return {
        type: "gradual_deterioration",
        severity: normalizedSlope > 0.15 ? "high" : "medium",
        window: n,
        message: `Gradual ${direction} deterioration detected over ${n} readings (slope ${normalizedSlope.toFixed(3)})`,
      };
    }
  }
  return null;
}

function detectOscillating(values) {
  if (values.length < 6) return null;
  const slice = values.slice(-6);
  let swings = 0;
  for (let i = 1; i < slice.length - 1; i++) {
    const prev = slice[i - 1].value, curr = slice[i].value, next = slice[i + 1].value;
    if ((curr > prev && curr > next) || (curr < prev && curr < next)) swings++;
  }
  if (swings >= 3) {
    return {
      type: "oscillating",
      severity: "medium",
      window: slice.length,
      message: `Oscillating behavior detected: ${swings} direction reversals in last ${slice.length} readings`,
    };
  }
  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Analyze historical readings for a question+asset and return detected patterns.
 *
 * @param {number}  assetId
 * @param {number}  questionId
 * @param {number}  currentValue  – the value just submitted
 * @param {object}  rule          – rule_json { minValue, maxValue, ... }
 * @param {object}  [conn]
 * @returns {Promise<{ patterns: Array<{ type, severity, window, message }> }>}
 */
export async function detectTrends(assetId, questionId, currentValue, rule, conn = pool) {
  try {
    const history = await fetchHistory(assetId, questionId, DEFAULT_WINDOW, conn);
    const withCurrent = [...history, { value: currentValue, ts: new Date() }];

    const patterns = [
      detectConsecutiveViolations(withCurrent, rule),
      detectIncreasingTrend(withCurrent),
      detectSuddenSpike(withCurrent),
      detectGradualDeterioration(withCurrent, rule),
      detectOscillating(withCurrent),
    ].filter(Boolean);

    return { patterns, history: withCurrent };
  } catch (err) {
    console.error("[TrendEngine] detectTrends error:", err.message);
    return { patterns: [], history: [] };
  }
}

/**
 * Persist a detected trend to trend_analysis_log.
 */
export async function logTrend({
  assetId, questionId, questionKey, sourceType = "checklist",
  detectionType, windowSize, values, severity, flagId, companyId, conn = pool,
}) {
  try {
    await conn.query(
      `INSERT INTO trend_analysis_log
         (asset_id, company_id, source_type, question_id, question_key,
          detection_type, window_size, values_json, severity, flag_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        assetId, companyId, sourceType,
        questionId || null, questionKey || null,
        detectionType, windowSize,
        JSON.stringify(values), severity,
        flagId || null,
      ]
    );
  } catch (err) {
    console.error("[TrendEngine] logTrend error:", err.message);
  }
}

/**
 * Get trend summary for a single asset (used in risk scoring).
 * @returns {Promise<{ totalPatterns, criticalPatterns, recentPatterns }>}
 */
export async function getAssetTrendSummary(assetId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT
       COUNT(*) AS total,
       SUM(severity = 'critical') AS critical_cnt,
       SUM(detected_at >= NOW() - INTERVAL 7 DAY) AS recent
     FROM trend_analysis_log
     WHERE asset_id = ?`,
    [assetId]
  );
  return {
    totalPatterns: Number(row.total || 0),
    criticalPatterns: Number(row.critical_cnt || 0),
    recentPatterns: Number(row.recent || 0),
  };
}
