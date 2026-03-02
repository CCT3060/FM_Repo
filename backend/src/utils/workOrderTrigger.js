/**
 * workOrderTrigger.js
 * ─────────────────────────────────────────────────────────────────
 * Intelligent work order auto-creation from flags.
 *
 * Only creates WO if:
 *   a) Severity ≥ threshold (default: high)
 *   b) OR repeat_count ≥ configured threshold
 *   c) OR pattern/trend flag detected
 *   d) OR rule group has auto_create_wo = true
 *
 * Anti-duplication:
 *   Checks for open WOs on same asset with same description hash.
 *   If found: links flag to existing WO instead of creating duplicate.
 *
 * Main exports:
 *   maybeCreateWorkOrder(flag, options, conn)
 *   → { created: boolean, workOrderId, merged: boolean }
 */

import pool from "../db.js";
import crypto from "crypto";

const SEV_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Generate a short hash for deduplication.
 */
function descriptionHash(assetId, description) {
  return crypto
    .createHash("md5")
    .update(`${assetId}:${(description || "").toLowerCase().trim().slice(0, 80)}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Check for an existing open WO for the same asset + similar description.
 */
async function findExistingWO(assetId, descHash, conn) {
  try {
    const [rows] = await conn.query(
      `SELECT id, title, status
       FROM work_orders
       WHERE asset_id = ?
         AND description_hash = ?
         AND status IN ('open','in_progress','pending')
       LIMIT 1`,
      [assetId, descHash]
    );
    return rows[0] || null;
  } catch {
    // work_orders table might not have description_hash yet – graceful fallback
    return null;
  }
}

/**
 * Link a flag to an existing work order (merging).
 */
async function linkFlagToWO(flagId, workOrderId, conn) {
  await conn.query(
    `UPDATE flags SET work_order_id = ?, linked_wo_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [workOrderId, flagId]
  );
  // Update WO flag count if column exists
  await conn.query(
    `UPDATE work_orders SET flag_count = COALESCE(flag_count, 0) + 1, updated_at = NOW() WHERE id = ?`,
    [workOrderId]
  ).catch(() => {});
}

/**
 * Create a new work order row.
 */
async function createWO({ assetId, companyId, title, description, priority, raisedBy, descHash }, conn) {
  try {
    const [result] = await conn.query(
      `INSERT INTO work_orders
         (company_id, asset_id, title, description, priority, status,
          auto_generated, raised_by, description_hash, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', 1, ?, ?, NOW())`,
      [companyId, assetId, title, description, priority, raisedBy || null, descHash]
    );
    return result.insertId;
  } catch (err) {
    // Try without description_hash (older schema)
    const [result] = await conn.query(
      `INSERT INTO work_orders
         (company_id, asset_id, title, description, priority, status, auto_generated, raised_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', 1, ?, NOW())`,
      [companyId, assetId, title, description, priority, raisedBy || null]
    );
    return result.insertId;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Evaluate whether a flag should trigger a work order, then act.
 *
 * @param {object} flag  – full flag object
 * @param {{
 *   severityThreshold: string,   'medium'|'high'|'critical'
 *   repeatThreshold:   number,   e.g. 3
 *   forceTrigger:      boolean,  override threshold check
 *   ruleGroupAutoWo:   boolean,  from rule group config
 * }} options
 * @param {object} [conn]
 * @returns {Promise<{ created: boolean, workOrderId: number|null, merged: boolean }>}
 */
export async function maybeCreateWorkOrder(flag, options = {}, conn = pool) {
  try {
    const {
      severityThreshold = "high",
      repeatThreshold   = 3,
      forceTrigger      = false,
      ruleGroupAutoWo   = false,
    } = options;

    const assetId   = flag.assetId   || flag.asset_id;
    const companyId = flag.companyId || flag.company_id;
    const severity  = flag.severity  || "medium";
    const repeat    = flag.repeat_count ?? 0;
    const isTrend   = flag.trend_flag ?? false;

    // Decision logic
    const severityOk = SEV_ORDER[severity] >= SEV_ORDER[severityThreshold];
    const repeatOk   = repeat >= repeatThreshold;
    const shouldCreate = forceTrigger || ruleGroupAutoWo || severityOk || repeatOk || isTrend;

    if (!shouldCreate) return { created: false, workOrderId: null, merged: false };

    // Already has WO?
    if (flag.work_order_id || flag.workOrderId) {
      return { created: false, workOrderId: flag.work_order_id || flag.workOrderId, merged: false };
    }

    // Build WO details
    const priority  = SEV_ORDER[severity] >= 3 ? "critical"
                    : SEV_ORDER[severity] >= 2 ? "high"
                    : "medium";
    const title       = `[Auto] ${flag.description?.slice(0, 80) || "Flag-generated WO"} – ${flag.assetName || "Asset #" + assetId}`;
    const description = [
      `Auto-generated from Flag #${flag.id}`,
      `Severity: ${severity}`,
      flag.description || "",
      flag.pattern_type ? `Pattern detected: ${flag.pattern_type}` : "",
      `Repeat count: ${repeat}`,
    ].filter(Boolean).join("\n");

    const descHash = descriptionHash(assetId, flag.description);

    // Check for existing open WO (deduplication)
    const existingWO = await findExistingWO(assetId, descHash, conn);
    if (existingWO) {
      await linkFlagToWO(flag.id, existingWO.id, conn);
      return { created: false, workOrderId: existingWO.id, merged: true };
    }

    // Create new WO
    const woId = await createWO({ assetId, companyId, title, description, priority, raisedBy: flag.raised_by, descHash }, conn);

    // Link flag → WO
    if (woId) {
      await conn.query(
        `UPDATE flags SET work_order_id = ?, linked_wo_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [woId, flag.id]
      );
    }

    return { created: true, workOrderId: woId, merged: false };
  } catch (err) {
    console.error("[WorkOrderTrigger] maybeCreateWorkOrder error:", err.message);
    return { created: false, workOrderId: null, merged: false, error: err.message };
  }
}
