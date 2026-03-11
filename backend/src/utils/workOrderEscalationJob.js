/**
 * workOrderEscalationJob.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Background job that scans for open/in_progress work orders that have passed
 * their escalation deadline and automatically re-assigns them up the supervisor
 * hierarchy, logging every escalation event.
 *
 * Escalation deadline formula:
 *   Next escalation due at = expected_completion_at
 *                          + (escalation_interval_minutes × (escalation_level + 1))
 *
 * So:
 *   - Level 0 → escalates at:  deadline + 1×interval
 *   - Level 1 → escalates at:  deadline + 2×interval
 *   etc. up to MAX_ESCALATION_LEVEL (default 5)
 *
 * Env vars:
 *   WO_ESCALATION_INTERVAL_MS – how often the job runs (default: 5 min)
 *   WO_MAX_ESCALATION_LEVEL   – max times a WO can be escalated (default: 5)
 */

import pool from "../db.js";
import { createNotification } from "./notificationsHelper.js";

const RUN_INTERVAL_MS    = Number(process.env.WO_ESCALATION_INTERVAL_MS || 5 * 60 * 1000);
const MAX_ESCALATION_LEVEL = Number(process.env.WO_MAX_ESCALATION_LEVEL || 5);

async function runWorkOrderEscalationCheck() {
  try {
    // Find work orders that are overdue for escalation.
    // The next escalation fires when:
    //   NOW() >= expected_completion_at + interval_minutes*(level+1) minutes
    const [overdueWOs] = await pool.query(
      `SELECT wo.id,
              wo.work_order_number AS "workOrderNumber",
              wo.company_id        AS "companyId",
              wo.cp_assigned_to    AS "assignedTo",
              wo.issue_description AS "issueDescription",
              wo.escalation_level  AS "escalationLevel",
              wo.escalation_interval_minutes AS "intervalMinutes",
              cu.full_name         AS "assignedToName",
              cu.supervisor_id     AS "supervisorId"
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       WHERE wo.status IN ('open', 'in_progress')
         AND wo.expected_completion_at IS NOT NULL
         AND wo.escalation_level < ?
         AND NOW() >= wo.expected_completion_at
                     + (wo.escalation_interval_minutes * (wo.escalation_level + 1))
                     * INTERVAL '1 minute'`,
      [MAX_ESCALATION_LEVEL]
    );

    if (!overdueWOs.length) return;

    const escalated = [];

    for (const wo of overdueWOs) {
      try {
        const newLevel        = Number(wo.escalationLevel) + 1;
        const prevAssigneeId  = wo.assignedTo;
        const prevAssigneeName = wo.assignedToName || null;

        // Walk up the supervisor chain for the new assignee
        let newAssigneeId   = null;
        let newAssigneeName = null;

        if (wo.supervisorId) {
          const [[sup]] = await pool.query(
            `SELECT id, full_name AS "fullName" FROM company_users WHERE id = ? AND company_id = ?`,
            [wo.supervisorId, wo.companyId]
          );
          if (sup) {
            newAssigneeId   = sup.id;
            newAssigneeName = sup.fullName;
          }
        }

        // If no supervisor found, try to find any admin/technical_lead to escalate to
        if (!newAssigneeId) {
          const [[fallback]] = await pool.query(
            `SELECT id, full_name AS "fullName"
             FROM company_users
             WHERE company_id = ? AND role IN ('admin', 'technical_lead')
             ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'technical_lead' THEN 2 ELSE 3 END
             LIMIT 1`,
            [wo.companyId]
          ).catch(() => [[]]);
          if (fallback) {
            newAssigneeId   = fallback.id;
            newAssigneeName = fallback.fullName;
          }
        }

        const reason = newAssigneeId
          ? `Auto-escalated (level ${newLevel}) — deadline overdue. Re-assigned from ${prevAssigneeName || "unassigned"} to ${newAssigneeName}.`
          : `Auto-escalated (level ${newLevel}) — deadline overdue. No supervisor found; assignee unchanged.`;

        // Update work order
        await pool.execute(
          `UPDATE work_orders
           SET escalation_level = ?,
               cp_assigned_to   = COALESCE(?, cp_assigned_to),
               escalation_note  = ?,
               updated_at       = NOW()
           WHERE id = ?`,
          [newLevel, newAssigneeId, reason, wo.id]
        );

        // Log in work_order_history
        await pool.execute(
          `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
           VALUES (?, ?, NULL, ?)`,
          [wo.id, "in_progress", reason]
        );

        // Insert escalation history record
        await pool.execute(
          `INSERT INTO work_order_escalation_history
             (work_order_id, escalation_level, escalated_at,
              previous_assignee_id, previous_assignee_name,
              new_assignee_id, new_assignee_name, reason)
           VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)`,
          [wo.id, newLevel, prevAssigneeId || null, prevAssigneeName,
           newAssigneeId, newAssigneeName, reason]
        );

        // Notify the previous assignee (if there was one)
        if (prevAssigneeId) {
          await createNotification({
            companyId:   wo.companyId,
            recipientId: prevAssigneeId,
            type:        "work_order_escalated",
            title:       `⏫ Work Order Escalated — ${wo.workOrderNumber}`,
            message:     `Work order "${wo.issueDescription?.slice(0, 80)}" has been escalated (Level ${newLevel}) due to missed deadline.`,
          }).catch(() => {});
        }

        // Notify the new assignee
        if (newAssigneeId && newAssigneeId !== prevAssigneeId) {
          await createNotification({
            companyId:   wo.companyId,
            recipientId: newAssigneeId,
            type:        "work_order_assigned",
            title:       `🔧 Work Order Escalated to You — ${wo.workOrderNumber}`,
            message:     `You have been assigned an escalated work order (Level ${newLevel}): "${wo.issueDescription?.slice(0, 80)}".`,
          }).catch(() => {});
        }

        // Also notify all company admins if we've reached a high escalation level
        if (newLevel >= 3) {
          const [admins] = await pool.query(
            `SELECT id FROM company_users WHERE company_id = ? AND role = 'admin' LIMIT 10`,
            [wo.companyId]
          ).catch(() => [[]]);
          for (const admin of admins) {
            if (admin.id === newAssigneeId) continue; // already notified above
            await createNotification({
              companyId:   wo.companyId,
              recipientId: admin.id,
              type:        "work_order_escalated",
              title:       `🚨 High Escalation Alert — ${wo.workOrderNumber}`,
              message:     `Work order has reached escalation level ${newLevel}. Immediate attention required.`,
            }).catch(() => {});
          }
        }

        escalated.push(wo.id);
      } catch (woErr) {
        console.error(`[WOEscalationJob] Error escalating WO ${wo.id}:`, woErr.message);
      }
    }

    if (escalated.length) {
      console.log(`[WOEscalationJob] Escalated ${escalated.length} work order(s): ${escalated.join(", ")}`);
    }
  } catch (err) {
    console.error("[WOEscalationJob] Error during check:", err.message);
  }
}

/**
 * Start the work-order escalation background job.
 * Call once from server startup.
 */
export function startWorkOrderEscalationJob() {
  setTimeout(runWorkOrderEscalationCheck, 15_000); // initial run 15s after startup
  setInterval(runWorkOrderEscalationCheck, RUN_INTERVAL_MS);
  console.log(
    `[WOEscalationJob] Started — runs every ${RUN_INTERVAL_MS / 60_000} min, max level ${MAX_ESCALATION_LEVEL}.`
  );
}
