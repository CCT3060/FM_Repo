/**
 * riskScoreEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Per-asset risk score computation and persistence.
 *
 * Risk Score = weighted combination of:
 *   - Open flags count        (35%)
 *   - Critical flags count    (25%)
 *   - Repeat issue count      (15%)
 *   - WO backlog              (10%)
 *   - MTTR (mean time resolve) (10%)
 *   - SLA breach count        (5%)
 *
 * Thresholds:
 *   0–40  → low
 *   41–70 → medium
 *   71–85 → high
 *   86–100 → critical
 *
 * Main exports:
 *   computeAndSaveAssetRisk(assetId, companyId, conn)
 *   getAssetRiskSummary(companyId, conn)
 */

import pool from "../db.js";

function riskScoreToLevel(score) {
  if (score >= 86) return "critical";
  if (score >= 71) return "high";
  if (score >= 41) return "medium";
  return "low";
}

// ─── Metric loaders ──────────────────────────────────────────────────────────

async function loadMetrics(assetId, companyId, conn) {
  // 1. Open flag counts
  const [[flagRow]] = await conn.query(
    `SELECT
       COUNT(*)                                          AS total_open,
       SUM(severity = 'critical')                       AS critical_cnt,
       SUM(created_at >= NOW() - INTERVAL 30 DAY)       AS repeat_30d
     FROM flags
     WHERE asset_id = ? AND company_id = ?
       AND status IN ('open','in_progress','investigating')`,
    [assetId, companyId]
  );

  // 2. Work order backlog
  const [[woRow]] = await conn.query(
    `SELECT COUNT(*) AS backlog
     FROM work_orders
     WHERE asset_id = ?
       AND status IN ('open','in_progress','pending')`,
    [assetId]
  ).catch(() => [[{ backlog: 0 }]]);

  // 3. MTTR – average hours taken to resolve flags
  const [[mttrRow]] = await conn.query(
    `SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) AS mttr
     FROM flags
     WHERE asset_id = ? AND company_id = ?
       AND resolved_at IS NOT NULL
       AND created_at >= NOW() - INTERVAL 90 DAY`,
    [assetId, companyId]
  );

  // 4. SLA breaches
  const [[slaRow]] = await conn.query(
    `SELECT COUNT(*) AS breaches
     FROM sla_tracking st
     JOIN flags f ON f.id = st.flag_id
     WHERE f.asset_id = ? AND f.company_id = ?
       AND (st.response_met = 0 OR st.resolution_met = 0)
       AND st.created_at >= NOW() - INTERVAL 30 DAY`,
    [assetId, companyId]
  ).catch(() => [[{ breaches: 0 }]]);

  return {
    openFlags:    Number(flagRow.total_open  ?? 0),
    criticalFlags: Number(flagRow.critical_cnt ?? 0),
    repeatIssues:  Number(flagRow.repeat_30d  ?? 0),
    woBacklog:     Number(woRow.backlog      ?? 0),
    mttr:          Number(mttrRow.mttr       ?? 0),
    slaBreaches:   Number(slaRow.breaches    ?? 0),
  };
}

// ─── Score computation ───────────────────────────────────────────────────────

function computeRiskScore(metrics) {
  const {
    openFlags, criticalFlags, repeatIssues,
    woBacklog, mttr, slaBreaches,
  } = metrics;

  // Normalize each metric to 0-100
  const openScore      = Math.min(openFlags    * 10,  100); // 10+ open = 100
  const critScore      = Math.min(criticalFlags * 25, 100); // 4+ critical = 100
  const repeatScore    = Math.min(repeatIssues  * 7,  100); // 15+ repeats = 100
  const woScore        = Math.min(woBacklog     * 10, 100); // 10+ WOs = 100
  const mttrScore      = Math.min(mttr / 72 * 100,   100); // 72h+ MTTR = 100
  const slaScore       = Math.min(slaBreaches  * 12,  100); // 8+ breaches = 100

  const raw =
    openScore   * 0.35 +
    critScore   * 0.25 +
    repeatScore * 0.15 +
    woScore     * 0.10 +
    mttrScore   * 0.10 +
    slaScore    * 0.05;

  return Math.round(Math.min(100, raw) * 100) / 100;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Recompute and persist the risk score for a single asset.
 *
 * @param {number} assetId
 * @param {number} companyId
 * @param {object} [conn]
 * @returns {Promise<{ riskScore, riskLevel, metrics }>}
 */
export async function computeAndSaveAssetRisk(assetId, companyId, conn = pool) {
  try {
    const metrics   = await loadMetrics(assetId, companyId, conn);
    const riskScore = computeRiskScore(metrics);
    const riskLevel = riskScoreToLevel(riskScore);

    // Upsert into asset_risk_scores
    await conn.query(
      `INSERT INTO asset_risk_scores
         (asset_id, company_id, open_flags_count, critical_flags_count,
          repeat_issue_count, wo_backlog_count, mttr_hours, sla_breach_count,
          risk_score, risk_level, last_computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         open_flags_count     = VALUES(open_flags_count),
         critical_flags_count = VALUES(critical_flags_count),
         repeat_issue_count   = VALUES(repeat_issue_count),
         wo_backlog_count     = VALUES(wo_backlog_count),
         mttr_hours           = VALUES(mttr_hours),
         sla_breach_count     = VALUES(sla_breach_count),
         risk_score           = VALUES(risk_score),
         risk_level           = VALUES(risk_level),
         last_computed_at     = NOW()`,
      [
        assetId, companyId,
        metrics.openFlags,
        metrics.criticalFlags,
        metrics.repeatIssues,
        metrics.woBacklog,
        metrics.mttr,
        metrics.slaBreaches,
        riskScore, riskLevel,
      ]
    );

    // Also update assets.risk_score and assets.risk_level
    await conn.query(
      `UPDATE assets SET risk_score = ?, risk_level = ?, updated_at = NOW() WHERE id = ?`,
      [riskScore, riskLevel, assetId]
    );

    return { riskScore, riskLevel, metrics };
  } catch (err) {
    console.error("[RiskScoreEngine] computeAndSaveAssetRisk error:", err.message);
    return { riskScore: 0, riskLevel: "low", metrics: {} };
  }
}

/**
 * Batch-refresh all assets in a company (called by cron job).
 */
export async function refreshAllAssetRisks(companyId, conn = pool) {
  const [assets] = await conn.query(
    `SELECT id FROM assets WHERE company_id = ? AND status = 'Active'`,
    [companyId]
  );
  const results = await Promise.allSettled(
    assets.map((a) => computeAndSaveAssetRisk(a.id, companyId, conn))
  );
  return {
    total: assets.length,
    updated: results.filter((r) => r.status === "fulfilled").length,
  };
}

/**
 * Get high-risk / critical assets for dashboard.
 */
export async function getHighRiskAssets(companyId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT
       a.id, a.asset_name AS assetName, a.building, a.floor,
       a.asset_type AS assetType, a.criticality,
       ars.risk_score AS riskScore, ars.risk_level AS riskLevel,
       ars.open_flags_count AS openFlags,
       ars.critical_flags_count AS criticalFlags,
       ars.mttr_hours AS mttrHours,
       ars.last_computed_at AS lastComputedAt
     FROM asset_risk_scores ars
     JOIN assets a ON a.id = ars.asset_id
     WHERE ars.company_id = ?
       AND ars.risk_level IN ('high', 'critical')
     ORDER BY ars.risk_score DESC
     LIMIT 20`,
    [companyId]
  );
  return rows;
}
