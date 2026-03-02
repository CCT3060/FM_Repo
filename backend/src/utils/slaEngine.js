/**
 * slaEngine.js
 * ─────────────────────────────────────────────────────────────────
 * SLA tracking, breach detection and compliance reporting.
 *
 * Default SLA hours per severity (overridden by company config):
 *   critical → Response: 1h,  Resolution: 4h
 *   high     → Response: 2h,  Resolution: 12h
 *   medium   → Response: 4h,  Resolution: 24h
 *   low      → Response: 8h,  Resolution: 48h
 *
 * Main exports:
 *   createSlaRecord(flagId, severity, companyId, conn)
 *   recordFirstResponse(flagId, conn)
 *   recordResolution(flagId, conn)
 *   checkSlaBreaches(conn)          – called by cron
 *   getComplianceStats(companyId, conn)
 */

import pool from "../db.js";
import { createNotification } from "./notificationsHelper.js";

const DEFAULT_SLA = {
  critical: { response: 1,  resolution: 4  },
  high:     { response: 2,  resolution: 12 },
  medium:   { response: 4,  resolution: 24 },
  low:      { response: 8,  resolution: 48 },
};

async function getSlaHours(severity, companyId, conn) {
  try {
    const [[cfg]] = await conn.query(
      `SELECT response_hours, resolution_hours
       FROM escalation_config
       WHERE company_id = ? AND severity = ?
       LIMIT 1`,
      [companyId, severity]
    );
    if (cfg) return { response: Number(cfg.response_hours), resolution: Number(cfg.resolution_hours) };
  } catch { /* table may not exist */ }
  return DEFAULT_SLA[severity] || DEFAULT_SLA.medium;
}

// ─── Create SLA record when a flag is created ────────────────────────────────

export async function createSlaRecord(flagId, severity, companyId, conn = pool) {
  try {
    const sla = await getSlaHours(severity, companyId, conn);
    await conn.query(
      `INSERT IGNORE INTO sla_tracking
         (flag_id, company_id, response_sla_hours, resolution_sla_hours, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [flagId, companyId, sla.response, sla.resolution]
    );
  } catch (err) {
    console.error("[SlaEngine] createSlaRecord error:", err.message);
  }
}

// ─── Record first response ───────────────────────────────────────────────────

export async function recordFirstResponse(flagId, conn = pool) {
  try {
    const [[sla]] = await conn.query(
      `SELECT st.*, f.created_at AS flagCreatedAt, f.company_id AS companyId
       FROM sla_tracking st
       JOIN flags f ON f.id = st.flag_id
       WHERE st.flag_id = ? AND st.first_response_at IS NULL`,
      [flagId]
    );
    if (!sla) return;

    const now      = new Date();
    const created  = new Date(sla.flagCreatedAt);
    const respHrs  = (now - created) / 3_600_000;
    const met      = respHrs <= sla.response_sla_hours;

    await conn.query(
      `UPDATE sla_tracking
       SET first_response_at = NOW(),
           response_time_hours = ?,
           response_met = ?,
           response_breached_at = ?,
           updated_at = NOW()
       WHERE flag_id = ?`,
      [respHrs.toFixed(2), met ? 1 : 0, met ? null : now, flagId]
    );

    // Also update flag for quick read
    await conn.query(
      `UPDATE flags SET first_response_at = NOW() WHERE id = ?`,
      [flagId]
    );
  } catch (err) {
    console.error("[SlaEngine] recordFirstResponse error:", err.message);
  }
}

// ─── Record resolution ───────────────────────────────────────────────────────

export async function recordResolution(flagId, conn = pool) {
  try {
    const [[sla]] = await conn.query(
      `SELECT st.*, f.created_at AS flagCreatedAt
       FROM sla_tracking st
       JOIN flags f ON f.id = st.flag_id
       WHERE st.flag_id = ? AND st.resolved_at IS NULL`,
      [flagId]
    );
    if (!sla) return;

    const now     = new Date();
    const created = new Date(sla.flagCreatedAt);
    const resHrs  = (now - created) / 3_600_000;
    const met     = resHrs <= sla.resolution_sla_hours;

    await conn.query(
      `UPDATE sla_tracking
       SET resolved_at = NOW(),
           resolution_time_hours = ?,
           resolution_met = ?,
           resolution_breached_at = ?,
           updated_at = NOW()
       WHERE flag_id = ?`,
      [resHrs.toFixed(2), met ? 1 : 0, met ? null : now, flagId]
    );
  } catch (err) {
    console.error("[SlaEngine] recordResolution error:", err.message);
  }
}

// ─── Scan for SLA breaches (cron) ────────────────────────────────────────────

export async function checkSlaBreaches(conn = pool) {
  try {
    // Find response SLA breaches
    const [respBreaches] = await conn.query(
      `SELECT st.flag_id, st.company_id, st.response_sla_hours,
              f.severity, f.asset_id, f.supervisor_id,
              a.asset_name, f.description
       FROM sla_tracking st
       JOIN flags f ON f.id = st.flag_id
       LEFT JOIN assets a ON a.id = f.asset_id
       WHERE st.first_response_at IS NULL
         AND st.response_met IS NULL
         AND TIMESTAMPDIFF(HOUR, st.created_at, NOW()) >= st.response_sla_hours
         AND f.status IN ('open','in_progress')`
    );

    // Find resolution SLA breaches
    const [resBreaches] = await conn.query(
      `SELECT st.flag_id, st.company_id, st.resolution_sla_hours,
              f.severity, f.asset_id, f.supervisor_id,
              a.asset_name, f.description
       FROM sla_tracking st
       JOIN flags f ON f.id = st.flag_id
       LEFT JOIN assets a ON a.id = f.asset_id
       WHERE st.resolved_at IS NULL
         AND st.resolution_met IS NULL
         AND TIMESTAMPDIFF(HOUR, st.created_at, NOW()) >= st.resolution_sla_hours
         AND f.status NOT IN ('resolved','closed')`
    );

    // Mark response breaches
    for (const b of respBreaches) {
      await conn.query(
        `UPDATE sla_tracking
         SET response_met = 0, response_breached_at = NOW(), updated_at = NOW()
         WHERE flag_id = ?`,
        [b.flag_id]
      );
      if (b.supervisor_id) {
        await createNotification({
          companyId:  b.company_id,
          userId:     b.supervisor_id,
          type:       "sla_breach",
          title:      `SLA Response Breached – ${b.severity.toUpperCase()}`,
          body:       `Flag #${b.flag_id} on "${b.asset_name}" has exceeded the ${b.response_sla_hours}h response SLA.`,
          entityType: "flag",
          entityId:   b.flag_id,
        }, conn);
      }
    }

    // Mark resolution breaches
    for (const b of resBreaches) {
      await conn.query(
        `UPDATE sla_tracking
         SET resolution_met = 0, resolution_breached_at = NOW(), updated_at = NOW()
         WHERE flag_id = ?`,
        [b.flag_id]
      );
      // Log in flag_history
      await conn.query(
        `INSERT INTO flag_history (flag_id, old_status, new_status, remark, changed_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [b.flag_id, "open", "open", `SLA Resolution breached (target: ${b.resolution_sla_hours}h)`]
      ).catch(() => {});
    }

    return { responseBreaches: respBreaches.length, resolutionBreaches: resBreaches.length };
  } catch (err) {
    console.error("[SlaEngine] checkSlaBreaches error:", err.message);
    return { responseBreaches: 0, resolutionBreaches: 0 };
  }
}

// ─── Compliance reporting ────────────────────────────────────────────────────

export async function getComplianceStats(companyId, days = 30, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT
       COUNT(*)                                                   AS total,
       SUM(response_met IS NOT NULL)                             AS resp_evaluated,
       SUM(response_met = 1)                                     AS resp_met,
       SUM(resolution_met IS NOT NULL)                           AS res_evaluated,
       SUM(resolution_met = 1)                                   AS res_met,
       AVG(response_time_hours)                                  AS avg_response_hrs,
       AVG(resolution_time_hours)                                AS avg_resolution_hrs
     FROM sla_tracking
     WHERE company_id = ?
       AND created_at >= NOW() - INTERVAL ? DAY`,
    [companyId, days]
  );
  const respPct = row.resp_evaluated > 0 ? (row.resp_met / row.resp_evaluated) * 100 : null;
  const resPct  = row.res_evaluated  > 0 ? (row.res_met  / row.res_evaluated)  * 100 : null;
  return {
    total:               Number(row.total              || 0),
    responseCompliancePct: respPct != null ? +respPct.toFixed(1) : null,
    resolutionCompliancePct: resPct != null ? +resPct.toFixed(1) : null,
    avgResponseHours:    row.avg_response_hrs   ? +Number(row.avg_response_hrs).toFixed(1)   : null,
    avgResolutionHours:  row.avg_resolution_hrs ? +Number(row.avg_resolution_hrs).toFixed(1) : null,
  };
}
