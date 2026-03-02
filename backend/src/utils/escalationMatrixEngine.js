/**
 * escalationMatrixEngine.js
 * ─────────────────────────────────────────────────────────────────
 * Matrix-based escalation system.
 *
 * Evaluates the admin-defined escalation_matrix against a flag
 * and fires the appropriate action when conditions are met.
 *
 * Trigger types:
 *   severity       – matches flag.severity
 *   time_open_hours – flag has been open > N hours
 *   repeat_count   – flag.repeat_count > N
 *   risk_score     – asset risk_score > N
 *
 * Actions:
 *   notify             – send in-app notification
 *   reassign           – change flag.supervisor_id
 *   create_wo          – trigger smart work order
 *   notify_client      – mark flag as client_visible
 *   escalate_severity  – upgrade severity one step
 *
 * Main exports:
 *   runMatrixEscalation(flag, conn)
 *   → { levels: EscalationResult[], actionsExecuted: string[] }
 */

import pool from "../db.js";
import { createNotification } from "./notificationsHelper.js";

const SEV_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
const SEV_UP    = { low: "medium", medium: "high", high: "critical", critical: "critical" };

// ─── Trigger evaluator ───────────────────────────────────────────────────────

function isTriggerMet(matrixRow, flag, ageHours, assetRiskScore) {
  const { trigger_type, trigger_value } = matrixRow;
  const tv = trigger_value;

  switch (trigger_type) {
    case "severity":
      return (SEV_ORDER[flag.severity] ?? 0) >= (SEV_ORDER[tv] ?? 0);

    case "time_open_hours":
      return ageHours >= Number(tv);

    case "repeat_count":
      return (flag.repeat_count ?? 0) >= Number(tv);

    case "risk_score":
      return (assetRiskScore ?? 0) >= Number(tv);

    default:
      return false;
  }
}

// ─── Action executor ─────────────────────────────────────────────────────────

async function executeAction(matrixRow, flag, conn) {
  const { action, target_type, target_role, target_user_id, target_dept_id } = matrixRow;
  const results = [];

  // Collect users to notify
  let userIds = [];
  if (target_type === "user" && target_user_id) {
    userIds = [target_user_id];
  } else if (target_type === "role" && target_role) {
    const [users] = await conn.query(
      `SELECT id FROM company_users WHERE company_id = ? AND role = ? AND status = 'active'`,
      [flag.companyId || flag.company_id, target_role]
    );
    userIds = users.map((u) => u.id);
  } else if (target_type === "department" && target_dept_id) {
    const [users] = await conn.query(
      `SELECT id FROM company_users
       WHERE company_id = ? AND department_id = ? AND status = 'active'`,
      [flag.companyId || flag.company_id, target_dept_id]
    );
    userIds = users.map((u) => u.id);
  }

  switch (action) {
    case "notify": {
      for (const uid of userIds) {
        await createNotification({
          companyId:  flag.companyId || flag.company_id,
          userId:     uid,
          type:       "flag_escalation",
          title:      `Flag Escalated – Level ${matrixRow.level}`,
          body:       `Flag #${flag.id} on ${flag.assetName || "asset"} has been escalated to Level ${matrixRow.level} (${matrixRow.level_label}).`,
          entityType: "flag",
          entityId:   flag.id,
        }, conn);
      }
      results.push(`Notified ${userIds.length} user(s) at level ${matrixRow.level}`);
      break;
    }

    case "reassign": {
      if (userIds.length) {
        await conn.query(
          `UPDATE flags SET supervisor_id = ?, updated_at = NOW() WHERE id = ?`,
          [userIds[0], flag.id]
        );
        results.push(`Reassigned to user #${userIds[0]}`);
      }
      break;
    }

    case "escalate_severity": {
      const newSev = SEV_UP[flag.severity] || flag.severity;
      if (newSev !== flag.severity) {
        await conn.query(
          `UPDATE flags SET severity = ?, escalated = 1, escalated_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [newSev, flag.id]
        );
        flag.severity = newSev; // update local copy
        results.push(`Severity escalated to ${newSev}`);
      }
      break;
    }

    case "notify_client": {
      await conn.query(
        `UPDATE flags SET client_visible = 1, visibility_mode = 'client_visible', updated_at = NOW() WHERE id = ?`,
        [flag.id]
      );
      results.push("Flag visibility set to client_visible");
      break;
    }

    case "create_wo": {
      // Delegate to flagOrchestrator/workOrderTrigger (called externally)
      results.push("work_order_trigger_requested");
      break;
    }
  }

  return { userIds, results };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Run all applicable escalation matrix rules against a single flag.
 *
 * @param {object} flag  – full flag row with assetId, severity, repeat_count, companyId
 * @param {object} [conn]
 * @returns {Promise<{ levelsTriggered: number[], actionsExecuted: string[] }>}
 */
export async function runMatrixEscalation(flag, conn = pool) {
  try {
    const companyId = flag.companyId || flag.company_id;

    // Get asset risk score
    const [[riskRow]] = await conn.query(
      `SELECT risk_score FROM asset_risk_scores WHERE asset_id = ?`,
      [flag.assetId || flag.asset_id]
    ).catch(() => [[{ risk_score: 0 }]]);
    const assetRiskScore = Number(riskRow?.risk_score ?? 0);

    // Age of flag in hours
    const createdAt = new Date(flag.createdAt || flag.created_at || Date.now());
    const ageHours  = (Date.now() - createdAt.getTime()) / 3_600_000;

    // Load company escalation matrix
    const [matrix] = await conn.query(
      `SELECT * FROM escalation_matrix
       WHERE company_id = ? AND is_active = 1
       ORDER BY level ASC`,
      [companyId]
    );

    if (!matrix.length) return { levelsTriggered: [], actionsExecuted: [] };

    // Load already-executed escalation levels for this flag
    const [done] = await conn.query(
      `SELECT matrix_level FROM flag_escalations WHERE flag_id = ?`,
      [flag.id]
    );
    const doneSet = new Set(done.map((r) => r.matrix_level));

    const levelsTriggered = [];
    const actionsExecuted = [];

    for (const row of matrix) {
      if (doneSet.has(row.level)) continue; // already escalated at this level
      if (!isTriggerMet(row, flag, ageHours, assetRiskScore)) continue;

      const { userIds, results } = await executeAction(row, flag, conn);
      actionsExecuted.push(...results);
      levelsTriggered.push(row.level);

      // Log escalation
      await conn.query(
        `INSERT INTO flag_escalations
           (flag_id, matrix_level, triggered_by, trigger_type, trigger_value,
            action_taken, notified_users_json, escalated_at)
         VALUES (?, ?, 'auto', ?, ?, ?, ?, NOW())`,
        [
          flag.id, row.level,
          row.trigger_type, row.trigger_value,
          row.action,
          JSON.stringify(userIds),
        ]
      );

      // Also log in legacy flag_history for backwards compat
      await conn.query(
        `INSERT INTO flag_history (flag_id, old_status, new_status, remark, changed_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          flag.id,
          flag.status,
          flag.status,
          `Matrix escalation Level ${row.level}: ${results.join("; ")}`,
        ]
      ).catch(() => {});
    }

    return { levelsTriggered, actionsExecuted };
  } catch (err) {
    console.error("[EscalationMatrix] runMatrixEscalation error:", err.message);
    return { levelsTriggered: [], actionsExecuted: [] };
  }
}

/**
 * Get escalation history for a flag (for detail views).
 */
export async function getFlagEscalationHistory(flagId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT fe.*, cu.full_name AS triggeredByName
     FROM flag_escalations fe
     LEFT JOIN company_users cu ON cu.id = fe.triggered_by
     WHERE fe.flag_id = ?
     ORDER BY fe.escalated_at ASC`,
    [flagId]
  );
  return rows;
}
