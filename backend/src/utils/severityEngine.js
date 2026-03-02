/**
 * severityEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Dynamic severity scoring engine.
 *
 * Formula:
 *   SeverityScore = (ValueDeviationWeight × 0.40)
 *                 + (FrequencyWeight       × 0.30)
 *                 + (AssetCriticalityWeight × 0.20)
 *                 + (SafetyImpactWeight     × 0.10)
 *
 * Score → Level:
 *   0–30   → low
 *   31–60  → medium
 *   61–80  → high
 *   81–100 → critical
 *
 * Main exports:
 *   computeSeverityScore(params) → { score, level }
 *   computeFromViolation(value, rule, asset, repeatCount, conn) → { score, level }
 */

import pool from "../db.js";

// ─── Weight tables ────────────────────────────────────────────────────────────

const CRITICALITY_WEIGHT = {
  standard:  20,
  important: 60,
  critical:  100,
};

const SAFETY_IMPACT_WEIGHT = {
  none:   0,
  low:    33,
  medium: 66,
  high:   100,
};

// ─── Individual weight calculators ───────────────────────────────────────────

/**
 * Value deviation weight (0–100).
 * Based on how far the value is from the acceptable range.
 */
function valueDeviationWeight(value, min, max) {
  if (min == null && max == null) return 50; // no range defined, assume medium

  const numVal = Number(value);
  if (!Number.isFinite(numVal)) return 30;

  const range = Math.abs((max ?? min * 2 ?? 1) - (min ?? 0)) || 1;
  let deviation = 0;

  if (min != null && numVal < Number(min)) {
    deviation = Math.abs(Number(min) - numVal) / range;
  } else if (max != null && numVal > Number(max)) {
    deviation = Math.abs(numVal - Number(max)) / range;
  }

  // Clamp to [0, 1] and scale to 100
  return Math.min(deviation * 200, 100); // 50% deviation = 100
}

/**
 * Frequency weight (0–100).
 * Based on how many times this asset has been flagged recently.
 */
function frequencyWeight(repeats7d, repeats30d) {
  // 10+ flags in 7 days → 100; scale linearly
  const recent  = Math.min(repeats7d * 10, 100);
  const monthly = Math.min(repeats30d * 3, 100);
  return Math.max(recent, monthly);
}

/**
 * Score → level mapping.
 */
export function scoreToLevel(score) {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  return "low";
}

// ─── Main scoring function ───────────────────────────────────────────────────

/**
 * Compute a dynamic severity score.
 *
 * @param {{ value, min, max, repeats7d, repeats30d, criticality, safetyImpact }} params
 * @returns {{ score: number, level: string, breakdown: object }}
 */
export function computeSeverityScore({
  value    = null,
  min      = null,
  max      = null,
  repeats7d  = 0,
  repeats30d = 0,
  criticality  = "standard",
  safetyImpact = "none",
}) {
  const vdw  = valueDeviationWeight(value, min, max);
  const fw   = frequencyWeight(repeats7d, repeats30d);
  const acw  = CRITICALITY_WEIGHT[criticality] ?? 20;
  const siw  = SAFETY_IMPACT_WEIGHT[safetyImpact] ?? 0;

  const score = Math.min(
    100,
    vdw  * 0.40 +
    fw   * 0.30 +
    acw  * 0.20 +
    siw  * 0.10
  );

  return {
    score: Math.round(score * 100) / 100,
    level: scoreToLevel(score),
    breakdown: { valueDeviationWeight: vdw, frequencyWeight: fw, criticalityWeight: acw, safetyImpactWeight: siw },
  };
}

/**
 * Full fat version: loads asset metadata and recent flag history from DB.
 *
 * @param {number|string} value
 * @param {object}        rule     – { minValue, maxValue, severity }
 * @param {number}        assetId
 * @param {number}        companyId
 * @param {object}        [conn]
 * @returns {Promise<{ score, level, breakdown }>}
 */
export async function computeFromViolation(value, rule, assetId, companyId, conn = pool) {
  try {
    // Load asset criticality and safety_impact
    const [[asset]] = await conn.query(
      `SELECT criticality, safety_impact FROM assets WHERE id = ?`,
      [assetId]
    );

    // Load recent flag counts for this asset
    const [[freqRow]] = await conn.query(
      `SELECT
         SUM(created_at >= NOW() - INTERVAL 7 DAY)  AS cnt7,
         SUM(created_at >= NOW() - INTERVAL 30 DAY) AS cnt30
       FROM flags
       WHERE asset_id = ? AND company_id = ?`,
      [assetId, companyId]
    );

    // If rule has fixed severity override, return it directly (but still compute score)
    const fixedSev = rule?.severity;

    const result = computeSeverityScore({
      value,
      min:         rule?.minValue ?? null,
      max:         rule?.maxValue ?? null,
      repeats7d:   Number(freqRow?.cnt7  ?? 0),
      repeats30d:  Number(freqRow?.cnt30 ?? 0),
      criticality: asset?.criticality    ?? "standard",
      safetyImpact: asset?.safety_impact ?? "none",
    });

    // If rule has a fixed severity that's MORE severe, use that
    if (fixedSev) {
      const SEV_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
      const ruleLevel = SEV_ORDER[fixedSev] ?? 1;
      const calcLevel = SEV_ORDER[result.level] ?? 1;
      if (ruleLevel > calcLevel) {
        return { ...result, level: fixedSev, overriddenBy: "rule" };
      }
    }

    return result;
  } catch (err) {
    console.error("[SeverityEngine] computeFromViolation error:", err.message);
    return { score: 50, level: rule?.severity ?? "medium", breakdown: {} };
  }
}

/**
 * Boost severity if a trend pattern was also detected.
 */
export function applyTrendBoost(baseScore, patterns) {
  if (!patterns?.length) return { score: baseScore, level: scoreToLevel(baseScore) };
  const hasCritical = patterns.some((p) => p.severity === "critical");
  const hasHigh     = patterns.some((p) => p.severity === "high");
  const boost = hasCritical ? 25 : hasHigh ? 15 : 5;
  const newScore = Math.min(100, baseScore + boost);
  return { score: newScore, level: scoreToLevel(newScore) };
}
