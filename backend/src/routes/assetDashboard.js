/**
 * Asset Management Dashboard – Analytics API
 * Provides aggregated metrics, KPIs, health scores, depreciation, and history
 * for the enterprise asset dashboard.
 *
 * All endpoints require standard JWT auth (requireAuth).
 * companyId must be passed as a query param (scoped to the logged-in user).
 */

import { Router } from "express";
import { query, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

/* ─── helpers ──────────────────────────────────────────────────── */
const cqParam = [
  query("companyId").optional().isInt({ min: 1 }),
  query("departmentId").optional().isInt({ min: 1 }),
  query("assetType").optional().isString(),
  query("building").optional().isString(),
  query("months").optional().isInt({ min: 1, max: 120 }),
];

/** Build WHERE clause that always scopes to the authenticated user's companies */
function scopeWhere(userId, companyId, extra = "") {
  const params = [userId];
  let w = "WHERE c.user_id = ?";
  if (companyId) { w += " AND a.company_id = ?"; params.push(companyId); }
  if (extra) w += extra;
  return { w, params };
}

/** Compute a simple asset health score 0-100 from counters */
function healthScore({ workOrdersOpen = 0, workOrdersTotal = 0, checklistFails = 0, checklistTotal = 0, ageYears = 0 }) {
  let score = 100;
  // penalise open work orders (up to -30)
  if (workOrdersTotal > 0) score -= Math.min(30, (workOrdersOpen / workOrdersTotal) * 30);
  // penalise checklist failures (up to -25)
  if (checklistTotal > 0) score -= Math.min(25, (checklistFails / checklistTotal) * 25);
  // penalise age > 5 years (up to -20)
  score -= Math.min(20, ageYears * 2);
  return Math.max(0, Math.round(score));
}

/** Depreciation: straight-line */
function depreciationStraightLine(purchaseValue, usefulLifeYears, ageYears) {
  if (!purchaseValue || !usefulLifeYears) return null;
  const annual = purchaseValue / usefulLifeYears;
  const accumulated = Math.min(purchaseValue, annual * ageYears);
  return { accumulated, currentValue: purchaseValue - accumulated, annual };
}

/* ─── 1. Summary KPI Cards ─────────────────────────────────────── */
router.get("/summary", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, departmentId, assetType, building } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (departmentId) { where += " AND a.department_id = ?"; p.push(departmentId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }
    if (building) { where += " AND a.building = ?"; p.push(building); }

    const [assetRows] = await pool.query(
      `SELECT a.id, a.status, a.asset_type AS assetType, a.building, ad.metadata
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       ${where}`,
      p
    );

    const total = assetRows.length;
    const active = assetRows.filter((a) => (a.status || "Active").toLowerCase() === "active").length;
    const inactive = total - active;

    // Purchase value & depreciation from metadata
    let totalPurchaseValue = 0;
    let totalCurrentValue = 0;
    let totalDepreciation = 0;
    let assetsNearEndOfLife = 0;
    const now = new Date();

    assetRows.forEach((a) => {
      const meta = a.metadata
        ? (typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata)
        : {};
      const pv = parseFloat(meta.purchaseValue || meta.purchase_value || 0);
      const ul = parseFloat(meta.usefulLifeYears || meta.useful_life_years || 10);
      const installDate = meta.installationDate || meta.install_date;
      const ageYears = installDate
        ? (now - new Date(installDate)) / (1000 * 60 * 60 * 24 * 365)
        : 0;

      if (pv > 0) {
        totalPurchaseValue += pv;
        const dep = depreciationStraightLine(pv, ul, ageYears);
        if (dep) {
          totalDepreciation += dep.accumulated;
          totalCurrentValue += dep.currentValue;
        } else {
          totalCurrentValue += pv;
        }
      }
      // near EOL: age > 80% of useful life
      if (ul > 0 && ageYears / ul >= 0.8) assetsNearEndOfLife++;
    });

    // Open work orders count
    let params2 = [req.user.id];
    let wo_where = "WHERE c.user_id = ?";
    if (companyId) { wo_where += " AND a.company_id = ?"; params2.push(companyId); }
    const [[{ openWO }]] = await pool.query(
      `SELECT COUNT(wo.id) AS openWO
       FROM work_orders wo
       JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${wo_where} AND wo.status IN ('open','in_progress')`,
      params2
    );

    // Maintenance cost from work order details (if resolution_cost exists), else fallback 0
    let totalMaintenanceCost = 0;
    try {
      const [[{ mc }]] = await pool.query(
        `SELECT COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(resolution_details,'$.cost'))+0),0) AS mc
         FROM work_orders wo
         JOIN assets a ON wo.asset_id = a.id
         JOIN companies c ON a.company_id = c.id
         WHERE c.user_id = ? ${companyId ? "AND a.company_id = ?" : ""}`,
        companyId ? [req.user.id, companyId] : [req.user.id]
      );
      totalMaintenanceCost = mc || 0;
    } catch (_) { /* column may not exist */ }

    res.json({
      total,
      active,
      inactive,
      assetsNearEndOfLife,
      openWorkOrders: Number(openWO),
      totalPurchaseValue: Math.round(totalPurchaseValue),
      totalCurrentValue: Math.round(totalCurrentValue),
      totalDepreciation: Math.round(totalDepreciation),
      totalMaintenanceCost: Math.round(totalMaintenanceCost),
    });
  } catch (err) { next(err); }
});

/* ─── 2. Asset Distribution by Type & Location ─────────────────── */
router.get("/distribution", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, assetType, building } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }
    if (building) { where += " AND a.building = ?"; p.push(building); }

    const [byType] = await pool.query(
      `SELECT a.asset_type AS type, COUNT(*) AS count
       FROM assets a JOIN companies c ON a.company_id = c.id
       ${where} GROUP BY a.asset_type ORDER BY count DESC`,
      p
    );
    const [byBuilding] = await pool.query(
      `SELECT COALESCE(a.building,'Unknown') AS location, COUNT(*) AS count
       FROM assets a JOIN companies c ON a.company_id = c.id
       ${where} GROUP BY a.building ORDER BY count DESC LIMIT 20`,
      p
    );
    const [byDept] = await pool.query(
      `SELECT COALESCE(d.name,'Unknown') AS department, COUNT(*) AS count
       FROM assets a JOIN companies c ON a.company_id = c.id
       LEFT JOIN departments d ON a.department_id = d.id
       ${where} GROUP BY d.name ORDER BY count DESC LIMIT 20`,
      p
    );
    const [byStatus] = await pool.query(
      `SELECT a.status, COUNT(*) AS count
       FROM assets a JOIN companies c ON a.company_id = c.id
       ${where} GROUP BY a.status`,
      p
    );

    res.json({ byType, byBuilding, byDept, byStatus });
  } catch (err) { next(err); }
});

/* ─── 3. Asset Performance & Health Scores ──────────────────────── */
router.get("/performance", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, assetType, building } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }
    if (building) { where += " AND a.building = ?"; p.push(building); }

    // Base asset list
    const [assetRows] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.asset_type AS assetType,
              a.building, a.status, a.created_at AS createdAt, ad.metadata
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       ${where} ORDER BY a.asset_name`,
      p
    );

    if (assetRows.length === 0) return res.json([]);

    const assetIds = assetRows.map((r) => r.id);
    const placeholders = assetIds.map(() => "?").join(",");

    // Work orders per asset
    const [woRows] = await pool.query(
      `SELECT asset_id, COUNT(*) AS total,
              SUM(CASE WHEN status IN ('open','in_progress') THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN status IN ('completed','closed') THEN 1 ELSE 0 END) AS closed_count
       FROM work_orders WHERE asset_id IN (${placeholders}) GROUP BY asset_id`,
      assetIds
    );
    const woMap = Object.fromEntries(woRows.map((r) => [r.asset_id, r]));

    // Checklist submissions per asset 
    let csMap = {};
    try {
      const [csRows] = await pool.query(
        `SELECT cs.asset_id,
                COUNT(*) AS total,
                SUM(CASE WHEN cs.status='rejected' THEN 1 ELSE 0 END) AS fails
         FROM checklist_submissions cs
         WHERE cs.asset_id IN (${placeholders}) GROUP BY cs.asset_id`,
        assetIds
      );
      csMap = Object.fromEntries(csRows.map((r) => [r.asset_id, r]));
    } catch (_) {}

    const now = new Date();
    const result = assetRows.map((a) => {
      const meta = a.metadata
        ? (typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata)
        : {};
      const installDate = meta.installationDate || meta.install_date || a.createdAt;
      const ageYears = installDate
        ? (now - new Date(installDate)) / (1000 * 60 * 60 * 24 * 365)
        : 0;

      const wo = woMap[a.id] || { total: 0, open_count: 0, closed_count: 0 };
      const cs = csMap[a.id] || { total: 0, fails: 0 };

      const score = healthScore({
        workOrdersOpen: Number(wo.open_count),
        workOrdersTotal: Number(wo.total),
        checklistFails: Number(cs.fails),
        checklistTotal: Number(cs.total),
        ageYears,
      });

      const scoreLabel =
        score >= 90 ? "Excellent" :
        score >= 70 ? "Good" :
        score >= 50 ? "Needs Attention" : "Critical";

      const pv = parseFloat(meta.purchaseValue || 0);
      const ul = parseFloat(meta.usefulLifeYears || 10);
      const dep = pv > 0 ? depreciationStraightLine(pv, ul, ageYears) : null;

      return {
        id: a.id,
        assetName: a.assetName,
        assetType: a.assetType,
        building: a.building,
        status: a.status,
        healthScore: score,
        healthLabel: scoreLabel,
        ageYears: Math.round(ageYears * 10) / 10,
        workOrdersTotal: Number(wo.total),
        workOrdersOpen: Number(wo.open_count),
        workOrdersClosed: Number(wo.closed_count),
        checklistTotal: Number(cs.total),
        checklistFails: Number(cs.fails),
        purchaseValue: pv,
        currentValue: dep ? Math.round(dep.currentValue) : pv,
        depreciation: dep ? Math.round(dep.accumulated) : 0,
        installationDate: meta.installationDate || meta.install_date || null,
        warrantyExpiry: meta.warrantyExpiry || null,
        nextServiceDate: meta.nextServiceDate || null,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

/* ─── 4. Work Order Analytics (frequency, MTBF, trends) ────────── */
router.get("/work-orders", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, assetType, building, months = 12 } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }
    if (building) { where += " AND a.building = ?"; p.push(building); }

    // Monthly WO trend
    const [trend] = await pool.query(
      `SELECT DATE_FORMAT(wo.created_at,'%Y-%m') AS month, COUNT(*) AS count
       FROM work_orders wo
       JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} AND wo.created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
       GROUP BY month ORDER BY month`,
      [...p, Number(months)]
    );

    // By priority
    const [byPriority] = await pool.query(
      `SELECT wo.priority, COUNT(*) AS count
       FROM work_orders wo JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} GROUP BY wo.priority`,
      p
    );

    // By status
    const [byStatus] = await pool.query(
      `SELECT wo.status, COUNT(*) AS count
       FROM work_orders wo JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} GROUP BY wo.status`,
      p
    );

    // Top failing assets
    const [topFailing] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.building,
              COUNT(wo.id) AS workOrderCount,
              SUM(CASE WHEN wo.status IN ('open','in_progress') THEN 1 ELSE 0 END) AS openCount
       FROM work_orders wo JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} GROUP BY a.id ORDER BY workOrderCount DESC LIMIT 10`,
      p
    );

    // MTBF: avg days between closed work orders per asset (approx via stddev of dates)
    const [mtbfRows] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName,
              MIN(wo.created_at) AS first_date,
              MAX(wo.created_at) AS last_date,
              COUNT(wo.id) AS total_failures
       FROM work_orders wo JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} AND wo.status IN ('completed','closed') AND wo.issue_source = 'logsheet'
       GROUP BY a.id HAVING total_failures > 1 ORDER BY total_failures DESC LIMIT 10`,
      p
    );

    const mtbf = mtbfRows.map((r) => {
      const days = (new Date(r.last_date) - new Date(r.first_date)) / (1000 * 60 * 60 * 24);
      return {
        ...r,
        mtbfDays: Math.round(days / (r.total_failures - 1)),
      };
    });

    res.json({ trend, byPriority, byStatus, topFailing, mtbf });
  } catch (err) { next(err); }
});

/* ─── 5. Maintenance Cost Analytics ────────────────────────────── */
router.get("/maintenance-cost", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, assetType, building, months = 12 } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }

    // Since work_orders may not have a cost column, compute from metadata
    // We pull work_order count per asset as a maintenance-frequency proxy
    const [perAsset] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.asset_type AS assetType,
              a.building, COUNT(wo.id) AS maintenanceCount
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN work_orders wo ON wo.asset_id = a.id
       ${where}
       GROUP BY a.id ORDER BY maintenanceCount DESC LIMIT 20`,
      p
    );

    const [perType] = await pool.query(
      `SELECT a.asset_type AS assetType, COUNT(wo.id) AS maintenanceCount
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN work_orders wo ON wo.asset_id = a.id
       ${where}
       GROUP BY a.asset_type ORDER BY maintenanceCount DESC`,
      p
    );

    const [monthlyTrend] = await pool.query(
      `SELECT DATE_FORMAT(wo.created_at,'%Y-%m') AS month,
              COUNT(wo.id) AS count
       FROM work_orders wo
       JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} AND wo.created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
       GROUP BY month ORDER BY month`,
      [...p, Number(months)]
    );

    const [perBuilding] = await pool.query(
      `SELECT COALESCE(a.building,'Unknown') AS building, COUNT(wo.id) AS count
       FROM assets a JOIN companies c ON a.company_id = c.id
       LEFT JOIN work_orders wo ON wo.asset_id = a.id
       ${where} GROUP BY a.building ORDER BY count DESC LIMIT 10`,
      p
    );

    res.json({ perAsset, perType, monthlyTrend, perBuilding });
  } catch (err) { next(err); }
});

/* ─── 6. Asset History / Timeline ──────────────────────────────── */
router.get(
  "/:assetId/history",
  validate([param("assetId").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const { assetId } = req.params;
      // verify ownership
      const [own] = await pool.query(
        "SELECT a.id FROM assets a JOIN companies c ON a.company_id = c.id WHERE a.id = ? AND c.user_id = ?",
        [assetId, req.user.id]
      );
      if (!own.length) return res.status(404).json({ message: "Asset not found" });

      // asset_history rows
      const [histRows] = await pool.query(
        `SELECT ah.id, ah.action, ah.details, ah.created_at AS createdAt,
                COALESCE(u.name, u.email) AS createdBy
         FROM asset_history ah
         LEFT JOIN users u ON ah.created_by = u.id
         WHERE ah.asset_id = ?
         ORDER BY ah.created_at DESC LIMIT 100`,
        [assetId]
      );

      // Work orders for this asset
      const [woRows] = await pool.query(
        `SELECT wo.id, wo.work_order_number AS woNumber, wo.issue_description AS description,
                wo.priority, wo.status, wo.created_at AS createdAt
         FROM work_orders wo WHERE wo.asset_id = ? ORDER BY wo.created_at DESC LIMIT 50`,
        [assetId]
      );

      // Checklist submissions for this asset
      let csRows = [];
      try {
        const [r] = await pool.query(
          `SELECT cs.id, ct.name AS templateName, cs.status, cs.created_at AS createdAt
           FROM checklist_submissions cs
           JOIN checklist_templates ct ON cs.template_id = ct.id
           WHERE cs.asset_id = ? ORDER BY cs.created_at DESC LIMIT 30`,
          [assetId]
        );
        csRows = r;
      } catch (_) {}

      // Logsheet entries for this asset
      let leRows = [];
      try {
        const [r] = await pool.query(
          `SELECT le.id, lt.name AS templateName, le.status, le.created_at AS createdAt
           FROM logsheet_entries le
           JOIN logsheet_templates lt ON le.template_id = lt.id
           WHERE le.asset_id = ? ORDER BY le.created_at DESC LIMIT 30`,
          [assetId]
        );
        leRows = r;
      } catch (_) {}

      // Merge and sort timeline
      const timeline = [
        ...histRows.map((r) => ({
          type: "history",
          date: r.createdAt,
          title: r.action,
          description: (() => {
            try { const d = typeof r.details === "string" ? JSON.parse(r.details) : r.details; return d?.assetName || r.action; } catch (_) { return r.action; }
          })(),
          actor: r.createdBy,
          id: `h-${r.id}`,
        })),
        ...woRows.map((r) => ({
          type: "workorder",
          date: r.createdAt,
          title: `Work Order: ${r.woNumber}`,
          description: r.description || "—",
          status: r.status,
          priority: r.priority,
          id: `wo-${r.id}`,
        })),
        ...csRows.map((r) => ({
          type: "checklist",
          date: r.createdAt,
          title: `Checklist: ${r.templateName}`,
          description: `Status: ${r.status}`,
          id: `cs-${r.id}`,
        })),
        ...leRows.map((r) => ({
          type: "logsheet",
          date: r.createdAt,
          title: `Logsheet: ${r.templateName}`,
          description: `Status: ${r.status}`,
          id: `le-${r.id}`,
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      res.json(timeline.slice(0, 100));
    } catch (err) { next(err); }
  }
);

/* ─── 7. Depreciation Schedule for an asset or all assets ──────── */
router.get("/depreciation", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, assetType } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }

    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.asset_type AS assetType,
              a.created_at AS createdAt, ad.metadata
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       ${where}`,
      p
    );

    const now = new Date();
    const result = rows
      .map((a) => {
        const meta = a.metadata
          ? (typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata)
          : {};
        const pv = parseFloat(meta.purchaseValue || meta.purchase_value || 0);
        if (!pv) return null;
        const ul = parseFloat(meta.usefulLifeYears || 10);
        const installDate = meta.installationDate || meta.install_date || a.createdAt;
        const ageYears = (now - new Date(installDate)) / (1000 * 60 * 60 * 24 * 365);
        const dep = depreciationStraightLine(pv, ul, ageYears);

        // Build year-by-year schedule (up to useful life)
        const schedule = [];
        const startYear = new Date(installDate).getFullYear();
        for (let y = 0; y <= Math.ceil(ul); y++) {
          const dep_y = depreciationStraightLine(pv, ul, y);
          schedule.push({
            year: startYear + y,
            bookValue: dep_y ? Math.round(dep_y.currentValue) : pv,
            depreciation: dep_y ? Math.round(dep_y.accumulated) : 0,
          });
        }

        return {
          id: a.id,
          assetName: a.assetName,
          assetType: a.assetType,
          purchaseValue: pv,
          usefulLifeYears: ul,
          installationDate: installDate,
          ageYears: Math.round(ageYears * 10) / 10,
          accumulated: dep ? Math.round(dep.accumulated) : 0,
          currentValue: dep ? Math.round(dep.currentValue) : pv,
          annualRate: dep ? Math.round(dep.annual) : 0,
          schedule,
        };
      })
      .filter(Boolean);

    res.json(result);
  } catch (err) { next(err); }
});

/* ─── 8. Smart Alerts ───────────────────────────────────────────── */
router.get("/alerts", validate(cqParam), async (req, res, next) => {
  try {
    const { companyId, assetType } = req.query;
    let where = "WHERE c.user_id = ?";
    const p = [req.user.id];
    if (companyId) { where += " AND a.company_id = ?"; p.push(companyId); }
    if (assetType) { where += " AND a.asset_type = ?"; p.push(assetType); }

    const [assetRows] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.asset_type AS assetType,
              a.building, a.status, a.created_at AS createdAt, ad.metadata
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       ${where}`,
      p
    );

    const alerts = [];
    const now = new Date();

    for (const a of assetRows) {
      const meta = a.metadata
        ? (typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata)
        : {};

      // Warranty expiry warning
      if (meta.warrantyExpiry) {
        const exp = new Date(meta.warrantyExpiry);
        const daysLeft = (exp - now) / (1000 * 60 * 60 * 24);
        if (daysLeft < 30 && daysLeft > -1) {
          alerts.push({
            assetId: a.id, assetName: a.assetName, type: "warranty",
            severity: daysLeft < 7 ? "critical" : "high",
            message: `Warranty expires in ${Math.ceil(daysLeft)} days`,
          });
        }
      }

      // Next service overdue
      if (meta.nextServiceDate) {
        const svc = new Date(meta.nextServiceDate);
        if (svc < now) {
          const overdueDays = Math.floor((now - svc) / (1000 * 60 * 60 * 24));
          alerts.push({
            assetId: a.id, assetName: a.assetName, type: "maintenance_overdue",
            severity: overdueDays > 30 ? "critical" : "high",
            message: `Service overdue by ${overdueDays} day${overdueDays !== 1 ? "s" : ""}`,
          });
        }
      }

      // End of life (age > 80% useful life)
      const ul = parseFloat(meta.usefulLifeYears || 10);
      const installDate = meta.installationDate || a.createdAt;
      const ageYears = (now - new Date(installDate)) / (1000 * 60 * 60 * 24 * 365);
      if (ageYears / ul >= 0.8) {
        alerts.push({
          assetId: a.id, assetName: a.assetName, type: "end_of_life",
          severity: ageYears >= ul ? "critical" : "medium",
          message: ageYears >= ul
            ? `Asset has exceeded its ${ul}-year useful life`
            : `Asset is at ${Math.round((ageYears / ul) * 100)}% of its useful life`,
        });
      }

      // Insurance expiry (fleet)
      if (meta.insuranceExpiry) {
        const ins = new Date(meta.insuranceExpiry);
        const daysLeft = (ins - now) / (1000 * 60 * 60 * 24);
        if (daysLeft < 30 && daysLeft > -1) {
          alerts.push({
            assetId: a.id, assetName: a.assetName, type: "insurance_expiry",
            severity: daysLeft < 7 ? "critical" : "medium",
            message: `Insurance expires in ${Math.ceil(daysLeft)} days`,
          });
        }
      }
    }

    // Open work orders stale > 7 days
    const [staleWO] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, wo.work_order_number AS woNumber,
              wo.priority, DATEDIFF(NOW(), wo.created_at) AS ageDays
       FROM work_orders wo
       JOIN assets a ON wo.asset_id = a.id
       JOIN companies c ON a.company_id = c.id
       ${where} AND wo.status IN ('open','in_progress') AND wo.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY ageDays DESC LIMIT 20`,
      p
    );
    staleWO.forEach((r) => {
      alerts.push({
        assetId: r.id, assetName: r.assetName, type: "stale_work_order",
        severity: r.priority === "critical" ? "critical" : r.ageDays > 14 ? "high" : "medium",
        message: `Work order ${r.woNumber} open for ${r.ageDays} days`,
      });
    });

    // Sort by severity
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    res.json(alerts.slice(0, 50));
  } catch (err) { next(err); }
});

/* ─── 9. Asset comparison ───────────────────────────────────────── */
router.get("/compare", validate([
  ...cqParam,
  query("ids").notEmpty().withMessage("ids is required"),
]), async (req, res, next) => {
  try {
    const { ids, companyId } = req.query;
    const idList = String(ids).split(",").map(Number).filter(Boolean);
    if (!idList.length) return res.status(400).json({ message: "Provide at least one asset id" });

    const placeholders = idList.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.asset_type AS assetType, a.building,
              a.status, a.created_at AS createdAt, ad.metadata
       FROM assets a
       JOIN companies c ON a.company_id = c.id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id IN (${placeholders}) AND c.user_id = ?`,
      [...idList, req.user.id]
    );

    const [woRows] = await pool.query(
      `SELECT asset_id,
              COUNT(*) AS total,
              SUM(CASE WHEN status IN ('open','in_progress') THEN 1 ELSE 0 END) AS open_count
       FROM work_orders WHERE asset_id IN (${placeholders}) GROUP BY asset_id`,
      idList
    );
    const woMap = Object.fromEntries(woRows.map((r) => [r.asset_id, r]));

    const now = new Date();
    const result = rows.map((a) => {
      const meta = a.metadata
        ? (typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata)
        : {};
      const pv = parseFloat(meta.purchaseValue || 0);
      const ul = parseFloat(meta.usefulLifeYears || 10);
      const installDate = meta.installationDate || a.createdAt;
      const ageYears = (now - new Date(installDate)) / (1000 * 60 * 60 * 24 * 365);
      const dep = pv > 0 ? depreciationStraightLine(pv, ul, ageYears) : null;
      const wo = woMap[a.id] || { total: 0, open_count: 0 };
      const score = healthScore({ workOrdersOpen: Number(wo.open_count), workOrdersTotal: Number(wo.total), ageYears });

      return {
        id: a.id, assetName: a.assetName, assetType: a.assetType,
        building: a.building, status: a.status,
        healthScore: score, ageYears: Math.round(ageYears * 10) / 10,
        workOrdersTotal: Number(wo.total), workOrdersOpen: Number(wo.open_count),
        purchaseValue: pv, currentValue: dep ? Math.round(dep.currentValue) : pv,
        depreciation: dep ? Math.round(dep.accumulated) : 0,
        brand: meta.brand, model: meta.modelNumber, warranty: meta.warrantyExpiry,
        nextService: meta.nextServiceDate,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

export default router;
