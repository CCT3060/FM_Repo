/**
 * escalationJob.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Background job that scans for open/in_progress flags past their escalation
 * threshold and:
 *   1. Marks them escalated = TRUE, severity upgraded one step
 *   2. Logs in flag_history
 *   3. Sends in-app notifications to the flag's supervisor + company admins
 *
 * Per-severity thresholds (company-level config from escalation_config table
 * overrides the env-var defaults):
 *   critical  → 2 h
 *   high      → 8 h
 *   medium    → 24 h
 *   low       → 48 h
 *
 * Env vars:
 *   FLAG_ESCALATION_INTERVAL_MS – how often the job runs (default: 30 min)
 */

import pool from "../db.js";
import { createNotification } from "./notificationsHelper.js";
import { runMatrixEscalation } from "./escalationMatrixEngine.js";
import { checkSlaBreaches } from "./slaEngine.js";

const RUN_INTERVAL_MS = Number(process.env.FLAG_ESCALATION_INTERVAL_MS || 30 * 60 * 1000);

// Default hours before escalation, per severity
const DEFAULT_ESCALATION_HOURS = {
  critical: 2,
  high:     8,
  medium:   24,
  low:      48,
};

const SEVERITY_UPGRADE = {
  low:      "medium",
  medium:   "high",
  high:     "critical",
  critical: "critical",
};

async function runEscalationCheck() {
  try {
    // Load per-company escalation config overrides (if table exists)
    let companyConfigs = {};
    try {
      const [cfgRows] = await pool.query(
        `SELECT company_id AS cid, severity, escalation_hours AS hours FROM escalation_config`
      );
      for (const r of cfgRows) {
        if (!companyConfigs[r.cid]) companyConfigs[r.cid] = {};
        companyConfigs[r.cid][r.severity] = Number(r.hours);
      }
    } catch { /* table may not exist yet – use defaults */ }

    // Find un-escalated open flags; include company_id and supervisor_id for notifications
    const [staleFlags] = await pool.query(
      `SELECT f.id, f.asset_id AS assetId, f.company_id AS companyId,
              f.severity, f.status, f.supervisor_id AS supervisorId,
              f.description,
              a.asset_name AS assetName,
              EXTRACT(EPOCH FROM (NOW() - f.created_at)) / 3600 AS ageHours
       FROM flags f
       LEFT JOIN assets a ON a.id = f.asset_id
       WHERE f.status IN ('open', 'in_progress')
         AND f.escalated = FALSE`
    );

    if (!staleFlags.length) return;

    const escalated = [];

    for (const flag of staleFlags) {
      // Determine threshold for this flag's severity + company
      const cc = companyConfigs[flag.companyId] || {};
      const thresholdHours = cc[flag.severity] ?? DEFAULT_ESCALATION_HOURS[flag.severity] ?? 24;

      if (Number(flag.ageHours) < thresholdHours) continue;

      const newSeverity = SEVERITY_UPGRADE[flag.severity] || flag.severity;

      // Update the flag
      await pool.query(
        `UPDATE flags
         SET escalated    = TRUE,
             escalated_at = NOW(),
             severity     = ?,
             updated_at   = NOW()
         WHERE id = ?`,
        [newSeverity, flag.id]
      );

      // Audit trail
      await pool.query(
        `INSERT INTO flag_history (flag_id, old_status, new_status, remark, changed_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          flag.id,
          flag.status,
          flag.status,
          `Auto-escalated after ${thresholdHours}h. Severity: ${flag.severity} → ${newSeverity}`,
        ]
      );

      // Notify supervisor
      if (flag.supervisorId) {
        await createNotification({
          companyId:   flag.companyId,
          recipientId: flag.supervisorId,
          flagId:      flag.id,
          type:        "flag_escalated",
          title:       `⚠️ Flag Escalated – ${flag.assetName || "Asset"}`,
          message:     `Flag has been unresolved for ${Math.round(flag.ageHours)}h and was escalated to ${newSeverity.toUpperCase()}.\n${flag.description || ""}`.trim(),
        }).catch(() => {});
      }

      // Notify company admins
      const [admins] = await pool.query(
        `SELECT id FROM company_users WHERE company_id = ? AND role = 'admin' LIMIT 10`,
        [flag.companyId]
      ).catch(() => [[]]);

      for (const admin of admins) {
        await createNotification({
          companyId:   flag.companyId,
          recipientId: admin.id,
          flagId:      flag.id,
          type:        "flag_escalated",
          title:       `⚠️ Flag Escalated – ${flag.assetName || "Asset"}`,
          message:     `Flag escalated to ${newSeverity.toUpperCase()} after ${Math.round(flag.ageHours)}h unresolved.\n${flag.description || ""}`.trim(),
        }).catch(() => {});
      }

      escalated.push(flag.id);
    }

    if (escalated.length) {
      console.log(`[EscalationJob] Escalated ${escalated.length} flag(s):`, escalated.join(", "));
    }

    // ── Matrix escalation: evaluate all open flags against the company matrix ──
    try {
      const [openFlags] = await pool.query(
        `SELECT f.id, f.company_id AS companyId, f.asset_id AS assetId,
                f.severity, f.status, f.repeat_count, f.created_at, f.description
         FROM flags f
         WHERE f.status IN ('open','in_progress','acknowledged','investigating')
         LIMIT 500`
      );
      await Promise.allSettled(
        openFlags.map((f) => runMatrixEscalation(f, pool).catch(() => {}))
      );
    } catch (matrixErr) {
      console.error("[EscalationJob] Matrix escalation error:", matrixErr.message);
    }

    // ── SLA breach detection ──────────────────────────────────────────────────
    try {
      const slaResult = await checkSlaBreaches(pool);
      if (slaResult.responseBreaches + slaResult.resolutionBreaches > 0) {
        console.log(`[EscalationJob] SLA breaches detected – response: ${slaResult.responseBreaches}, resolution: ${slaResult.resolutionBreaches}`);
      }
    } catch (slaErr) {
      console.error("[EscalationJob] SLA check error:", slaErr.message);
    }
  } catch (err) {
    console.error("[EscalationJob] Error during escalation check:", err.message);
  }
}

/**
 * Start the escalation background job.
 * Call once from server startup (app.js or server.js).
 */
export function startEscalationJob() {
  setTimeout(runEscalationCheck, 10_000);
  setInterval(runEscalationCheck, RUN_INTERVAL_MS);
  console.log(
    `[EscalationJob] Started – per-severity thresholds (critical 2h / high 8h / medium 24h / low 48h). ` +
    `Runs every ${RUN_INTERVAL_MS / 60_000} min`
  );
}
