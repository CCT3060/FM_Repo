/**
 * notificationsHelper.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Helpers for the in-app notification system.
 *
 * Exports:
 *   createNotification()        – insert one notification row
 *   dispatchFlagNotifications() – find stakeholders and notify them
 *   markNotificationRead()      – mark a single notification read
 */

import pool from "../db.js";

// ── Create a single notification ──────────────────────────────────────────────
/**
 * @param {object} params
 * @param {number}  params.companyId
 * @param {number}  params.recipientId   – company_users.id
 * @param {number|null} [params.flagId]
 * @param {string}  [params.type]        – flag_raised|flag_escalated|flag_resolved
 * @param {string}  params.title
 * @param {string}  params.message
 * @param {object}  [conn]               – optional pool/transaction connection
 * @returns {number|null} notification id
 */
export async function createNotification(
  { companyId, recipientId, flagId = null, type = "flag_raised", title, message },
  conn = pool
) {
  try {
    const [result] = await conn.query(
      `INSERT INTO notifications (company_id, recipient_id, flag_id, type, title, message)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [companyId, recipientId, flagId, type, title, message]
    );
    return result.insertId || result[0]?.id || null;
  } catch (err) {
    // Non-fatal – log and continue
    console.error("[Notifications] createNotification failed:", err.message);
    return null;
  }
}

// ── Dispatch all notifications for a flag ─────────────────────────────────────
/**
 * Identifies every stakeholder (supervisor, company-admin users, client admin)
 * and inserts a notification for each based on what the rule requested.
 *
 * @param {object} params
 * @param {number}  params.flagId
 * @param {number}  params.companyId
 * @param {number}  params.assetId
 * @param {string}  [params.assetName]
 * @param {string}  [params.location]
 * @param {string}  [params.questionText]
 * @param {string|number} [params.enteredValue]
 * @param {string}  [params.expectedRange]    – human-readable expected rule text
 * @param {string}  [params.severity]
 * @param {number}  [params.raisedBy]         – company_users.id of submitter
 * @param {object}  [params.ruleActions]      – { notifySupervisor, notifyAdmin, notifyClient }
 * @param {string}  [params.notificationType] – default: "flag_raised"
 * @param {object}  [conn]
 */
export async function dispatchFlagNotifications(
  {
    flagId,
    companyId,
    assetId,
    assetName = "Asset",
    location = "",
    questionText = "",
    enteredValue = "",
    expectedRange = "",
    severity = "medium",
    raisedBy = null,
    ruleActions = {},
    notificationType = "flag_raised",
  },
  conn = pool
) {
  const {
    notifySupervisor = true,
    notifyAdmin      = true,
    notifyClient     = false,
  } = ruleActions;

  if (!notifySupervisor && !notifyAdmin && !notifyClient) return;

  const severityEmoji = { low: "🟡", medium: "🟠", high: "🔴", critical: "🚨" };
  const emoji = severityEmoji[severity] || "⚠️";

  const title = `${emoji} ${severity.toUpperCase()} Flag – ${assetName}`;
  const message =
    `A ${severity} flag was raised for asset "${assetName}"` +
    (location ? ` (${location})` : "") +
    (questionText ? `\nQuestion: ${questionText}` : "") +
    (enteredValue !== "" ? `\nEntered value: ${enteredValue}` : "") +
    (expectedRange ? `\nExpected: ${expectedRange}` : "") +
    `\nTime: ${new Date().toLocaleString()}`;

  const recipientIds = new Set();

  try {
    // ── 1. Supervisor of the submitter ──────────────────────────────────────
    if (notifySupervisor && raisedBy) {
      const [[submitter]] = await conn.query(
        `SELECT supervisor_id FROM company_users WHERE id = ? AND company_id = ?`,
        [raisedBy, companyId]
      );
      if (submitter?.supervisor_id) recipientIds.add(submitter.supervisor_id);
    }

    // ── 2. Supervisor directly assigned to the asset ────────────────────────
    if (notifySupervisor) {
      const [assetSupervisors] = await conn.query(
        `SELECT DISTINCT supervisor_id AS id
         FROM company_users
         WHERE company_id = ?
           AND role = 'supervisor'
           AND id NOT IN (SELECT id FROM company_users WHERE id NOT IN
             (SELECT DISTINCT supervisor_id FROM company_users WHERE company_id = ? AND supervisor_id IS NOT NULL))
         LIMIT 10`,
        [companyId, companyId]
      ).catch(() => [[]]);

      // Simpler fallback: get all supervisors in the company
      if (!assetSupervisors.length) {
        const [allSupervisors] = await conn.query(
          `SELECT id FROM company_users WHERE company_id = ? AND role = 'supervisor' LIMIT 10`,
          [companyId]
        );
        allSupervisors.forEach((r) => recipientIds.add(r.id));
      } else {
        assetSupervisors.forEach((r) => recipientIds.add(r.id));
      }
    }

    // ── 3. All company admins ───────────────────────────────────────────────
    if (notifyAdmin) {
      const [admins] = await conn.query(
        `SELECT id FROM company_users WHERE company_id = ? AND role = 'admin' LIMIT 20`,
        [companyId]
      );
      admins.forEach((r) => recipientIds.add(r.id));
    }

    // ── 4. Client admin (system-level users linked to this company) ─────────
    if (notifyClient) {
      const [clients] = await conn.query(
        `SELECT cu.id
         FROM company_users cu
         JOIN companies co ON co.id = cu.company_id
         WHERE cu.company_id = ? AND cu.role = 'admin'`,
        [companyId]
      ).catch(() => [[]]);
      clients.forEach((r) => recipientIds.add(r.id));
    }

    // Don't notify the person who raised the flag
    if (raisedBy) recipientIds.delete(raisedBy);

    // Insert one notification per unique recipient
    for (const recipientId of recipientIds) {
      await createNotification(
        { companyId, recipientId, flagId, type: notificationType, title, message },
        conn
      );
    }
  } catch (err) {
    console.error("[Notifications] dispatchFlagNotifications failed:", err.message);
  }
}

// ── Mark a notification as read ───────────────────────────────────────────────
export async function markNotificationRead(notificationId, recipientId, conn = pool) {
  await conn.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_id = ?`,
    [notificationId, recipientId]
  );
}
