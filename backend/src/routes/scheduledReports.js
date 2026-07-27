/**
 * Scheduled Email Reports
 * Endpoint prefix: /api/company-portal/scheduled-reports
 *
 * Provides CRUD for report schedules and handles email dispatch
 * (nodemailer via Gmail or Outlook SMTP).
 * A node-cron job fires every minute and sends any due reports.
 */

import express from "express";
import nodemailer from "nodemailer";
import cron from "node-cron";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import pool from "../db.js";
import { computeSiteScore, computeSiteScoreRange } from "../utils/siteScore.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = express.Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;
const MAIL_FROM_ADDRESS = process.env.MAIL_FROM || "system.user@cctindia.in";

/* â”€â”€ Startup migration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_report_configs (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL,
        frequency     VARCHAR(20) NOT NULL,          -- daily|weekly|monthly|quarterly|yearly
        scheduled_day SMALLINT DEFAULT NULL,          -- day-of-month for monthly
        send_time     TIME NOT NULL DEFAULT '08:00',  -- HH:MM local time for dispatch
        recipients    TEXT NOT NULL,                  -- JSON array of email strings
        formats       TEXT NOT NULL,                  -- JSON array: pdf|csv|excel
        schedule_config TEXT DEFAULT NULL,            -- JSON: weeklyDays, quarterlyMonths, yearlyMonth, yearlyDay
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        last_sent_at  TIMESTAMPTZ DEFAULT NULL,
        next_send_at  TIMESTAMPTZ DEFAULT NULL,
        created_by    INTEGER,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Ensure schedule_config column exists on older tables
    await pool.query(`ALTER TABLE scheduled_report_configs ADD COLUMN IF NOT EXISTS schedule_config TEXT DEFAULT NULL`);
  } catch (e) {
    console.warn("[scheduled-reports] migration warning:", e.message);
  }
})();

/* â”€â”€ Helper: build nodemailer transporter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function buildTransporter() {
  const provider = (process.env.MAIL_PROVIDER || "office365").toLowerCase();

  if (provider === "outlook" || provider === "hotmail" || provider === "office365") {
    return nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
      tls: { ciphers: "SSLv3" },
    });
  }

  // Fallback SMTP transport (used when MAIL_PROVIDER is not set to Outlook/Office365)
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
}

/* â”€â”€ Helper: compute next send date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/* -- Helper: compute next send date (all times treated as IST, UTC+5:30) --- */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000 ms

function computeNextSend(frequency, sendTime, scheduledDay, scheduleConfig = {}) {
  const cfg = typeof scheduleConfig === "string" ? (JSON.parse(scheduleConfig || "{}") || {}) : (scheduleConfig || {});
  const [hours, minutes] = sendTime.split(":").map(Number);
  const targetMins = hours * 60 + minutes;
  const utcNow  = Date.now();
  const istNow  = new Date(utcNow + IST_OFFSET_MS);
  const istY    = istNow.getUTCFullYear();
  const istMon  = istNow.getUTCMonth();
  const istD    = istNow.getUTCDate();
  const istDow  = istNow.getUTCDay();
  const istCurMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const makeUTC = (y, mo, d, h, m) => new Date(Date.UTC(y, mo, d, h, m, 0, 0) - IST_OFFSET_MS);
  const addDays = (y, mo, d, n) => { const dt = new Date(Date.UTC(y, mo, d + n)); return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth(), d: dt.getUTCDate() }; };
  switch (frequency) {
    case "daily": {
      const todayTarget = makeUTC(istY, istMon, istD, hours, minutes);
      if (todayTarget > new Date(utcNow)) return todayTarget;
      const { y, mo, d } = addDays(istY, istMon, istD, 1);
      return makeUTC(y, mo, d, hours, minutes);
    }
    case "weekly": {
      const weeklyDays = cfg.weeklyDays;
      if (weeklyDays && weeklyDays.length > 0) {
        const sortedDays = [...weeklyDays].map(Number).sort((a, b) => a - b);
        let bestDiff = null;
        for (const wd of sortedDays) {
          const dayDiff = (wd - istDow + 7) % 7;
          if (dayDiff === 0 && targetMins <= istCurMins) continue;
          if (bestDiff === null || dayDiff < bestDiff) bestDiff = dayDiff;
        }
        if (bestDiff === null) { const firstDay = sortedDays[0]; bestDiff = (firstDay - istDow + 7) % 7 || 7; }
        const { y, mo, d } = addDays(istY, istMon, istD, bestDiff);
        return makeUTC(y, mo, d, hours, minutes);
      } else {
        const targetDay = scheduledDay != null ? Number(scheduledDay) : 1;
        const diff = (targetDay - istDow + 7) % 7 || 7;
        const { y, mo, d } = addDays(istY, istMon, istD, diff);
        return makeUTC(y, mo, d, hours, minutes);
      }
    }
    case "monthly": {
      const wantDay = Number(scheduledDay || 1);
      const clampDay = (y, mo, day) => { const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return Math.min(day, last); };
      let clamped   = clampDay(istY, istMon, wantDay);
      let candidate = makeUTC(istY, istMon, clamped, hours, minutes);
      if (candidate > new Date(utcNow)) return candidate;
      const nm = new Date(Date.UTC(istY, istMon + 1, 1));
      const ny = nm.getUTCFullYear(), nmo = nm.getUTCMonth();
      clamped = clampDay(ny, nmo, wantDay);
      return makeUTC(ny, nmo, clamped, hours, minutes);
    }
    case "quarterly": {
      const intervalMonths = cfg.quarterlyMonths ? Number(cfg.quarterlyMonths) : 3;
      const day = Number(scheduledDay || cfg.monthlyDay || 1);
      const nm  = new Date(Date.UTC(istY, istMon + intervalMonths, 1));
      return makeUTC(nm.getUTCFullYear(), nm.getUTCMonth(), day, hours, minutes);
    }
    case "yearly": {
      const month = cfg.yearlyMonth ? Number(cfg.yearlyMonth) - 1 : istMon;
      const day   = cfg.yearlyDay  ? Number(cfg.yearlyDay)  : Number(scheduledDay || 1);
      let candidate = makeUTC(istY, month, day, hours, minutes);
      if (candidate <= new Date(utcNow)) { candidate = makeUTC(istY + 1, month, day, hours, minutes); }
      return candidate;
    }
    default: {
      const { y, mo, d } = addDays(istY, istMon, istD, 1);
      return makeUTC(y, mo, d, hours, minutes);
    }
  }
}

/* â”€â”€ Helper: generate dashboard CSV buffer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function generateCSV(companyId) {
  const [[dashRow]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM assets WHERE company_id = ?) AS total_assets,
       (SELECT COUNT(*) FROM assets WHERE company_id = ? AND status = 'Active') AS active_assets,
       (SELECT COUNT(*) FROM work_orders WHERE company_id = ? AND status NOT IN ('closed','completed','cancelled')) AS open_requests,
      (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('closed','resolved','cancelled','rejected')) AS open_soft`,
    [companyId, companyId, companyId, companyId]
  );

  // Slot-based filled/total for today
  const [[nowRowCSV]] = await pool.query(
    `SELECT EXTRACT(HOUR FROM NOW())::int AS h, EXTRACT(MINUTE FROM NOW())::int AS m`
  );
  const nowMinsCSV = Number(nowRowCSV.h) * 60 + Number(nowRowCSV.m);
  const [templatesCSV] = await pool.query(
    `SELECT id, frequency, hourly_interval AS "hourlyInterval", start_time AS "startTime", end_time AS "endTime"
     FROM checklist_templates WHERE company_id = ? AND is_active = 1`,
    [companyId]
  );
  let totalExpectedCSV = 0;
  const tplExpCSV = {};
  for (const t of templatesCSV) {
    const freq = (t.frequency || 'Daily').toLowerCase();
    let exp = 1;
    if (freq === 'hourly') {
      const interval = Math.max(1, Number(t.hourlyInterval) || 1);
      if (t.startTime && t.endTime) {
        const [sh, sm = 0] = t.startTime.split(':').map(Number);
        const [eh, em = 0] = t.endTime.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        // Full-day slot count — not capped by current time
        if (endMins > startMins) {
          exp = Math.max(1, Math.floor((endMins - startMins) / (interval * 60)));
        }
      } else {
        exp = Math.max(1, Math.floor(1440 / (interval * 60)));
      }
    }
    tplExpCSV[t.id] = exp;
    totalExpectedCSV += exp;
  }
  const [subCountsCSV] = await pool.query(
    `SELECT cs.template_id AS "templateId", COUNT(*) AS "count"
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON cs.template_id = ct.id
     WHERE ct.company_id = ? AND cs.submitted_at::date = CURRENT_DATE
       AND ct.is_active = 1 AND cs.status NOT IN ('rejected')
       AND (
         LOWER(COALESCE(ct.frequency, 'daily')) != 'hourly'
         OR ct.start_time IS NULL OR ct.end_time IS NULL
         OR (
           (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
             >= (EXTRACT(HOUR FROM ct.start_time::time)*60+EXTRACT(MINUTE FROM ct.start_time::time))
           AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
             < (EXTRACT(HOUR FROM ct.end_time::time)*60+EXTRACT(MINUTE FROM ct.end_time::time))
         )
       )
     GROUP BY cs.template_id`,
    [companyId]
  );
  let filledSlotsCSV = 0;
  for (const row of subCountsCSV) {
    const exp = tplExpCSV[row.templateId] ?? 1;
    filledSlotsCSV += Math.min(Number(row.count) || 0, exp);
  }

  const [submissions] = await pool.query(
    `SELECT cs.id, ct.template_name, cu.full_name AS submitted_by, cs.status, cs.submitted_at
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON ct.id = cs.template_id
     LEFT JOIN company_users cu ON cu.id = cs.company_user_id
     WHERE ct.company_id = ?
     ORDER BY cs.submitted_at DESC NULLS LAST`,
    [companyId]
  );

  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const dateStr = new Date().toLocaleDateString("en-GB");

  const rows = [
    ["FM Dashboard Report", dateStr],
    [""],
    ["SUMMARY"],
    ["Metric", "Value"],
    ["Total Assets", dashRow?.total_assets ?? 0],
    ["Active Assets", dashRow?.active_assets ?? 0],
    ["Open Work Orders", dashRow?.open_requests ?? 0],
    ["Open Soft Requests", dashRow?.open_soft ?? 0],
    ["Checklists Filled Today (Slots)", filledSlotsCSV],
    ["Total Expected Slots Today", totalExpectedCSV],
    ["Generated At", new Date().toLocaleString("en-IN")],
    [""],
    ["CHECKLIST SUBMISSIONS"],
    ["ID", "Template", "Submitted By", "Status", "Submitted At"],
    ...submissions.map((s) => [
      s.id,
      s.template_name ?? "",
      s.submitted_by ?? "",
      s.status ?? "",
      s.submitted_at ? new Date(s.submitted_at).toLocaleString("en-IN") : "",
    ]),
  ];

  return Buffer.from(
    rows.map((r) => r.map(escape).join(",")).join("\n"),
    "utf-8"
  );
}

/* â”€â”€ Helper: generate Excel buffer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function generateExcel(companyId) {
  const [[dashRow]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM assets WHERE company_id = ?) AS total_assets,
       (SELECT COUNT(*) FROM assets WHERE company_id = ? AND status = 'Active') AS active_assets,
       (SELECT COUNT(*) FROM work_orders WHERE company_id = ? AND status NOT IN ('closed','completed','cancelled')) AS open_requests,
      (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('closed','resolved','cancelled','rejected')) AS open_soft`,
    [companyId, companyId, companyId, companyId]
  );

  // Slot-based filled/total for today
  const [[nowRowXl]] = await pool.query(
    `SELECT EXTRACT(HOUR FROM NOW())::int AS h, EXTRACT(MINUTE FROM NOW())::int AS m`
  );
  const nowMinsXl = Number(nowRowXl.h) * 60 + Number(nowRowXl.m);
  const [templatesXl] = await pool.query(
    `SELECT id, frequency, hourly_interval AS "hourlyInterval", start_time AS "startTime", end_time AS "endTime"
     FROM checklist_templates WHERE company_id = ? AND is_active = 1`,
    [companyId]
  );
  let totalExpectedXl = 0;
  const tplExpXl = {};
  for (const t of templatesXl) {
    const freq = (t.frequency || 'Daily').toLowerCase();
    let exp = 1;
    if (freq === 'hourly') {
      const interval = Math.max(1, Number(t.hourlyInterval) || 1);
      if (t.startTime && t.endTime) {
        const [sh, sm = 0] = t.startTime.split(':').map(Number);
        const [eh, em = 0] = t.endTime.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        // Full-day slot count — not capped by current time
        if (endMins > startMins) {
          exp = Math.max(1, Math.floor((endMins - startMins) / (interval * 60)));
        }
      } else {
        exp = Math.max(1, Math.floor(1440 / (interval * 60)));
      }
    }
    tplExpXl[t.id] = exp;
    totalExpectedXl += exp;
  }
  const [subCountsXl] = await pool.query(
    `SELECT cs.template_id AS "templateId", COUNT(*) AS "count"
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON cs.template_id = ct.id
     WHERE ct.company_id = ? AND cs.submitted_at::date = CURRENT_DATE
       AND ct.is_active = 1 AND cs.status NOT IN ('rejected')
       AND (
         LOWER(COALESCE(ct.frequency, 'daily')) != 'hourly'
         OR ct.start_time IS NULL OR ct.end_time IS NULL
         OR (
           (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
             >= (EXTRACT(HOUR FROM ct.start_time::time)*60+EXTRACT(MINUTE FROM ct.start_time::time))
           AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
             < (EXTRACT(HOUR FROM ct.end_time::time)*60+EXTRACT(MINUTE FROM ct.end_time::time))
         )
       )
     GROUP BY cs.template_id`,
    [companyId]
  );
  let filledSlotsXl = 0;
  for (const row of subCountsXl) {
    const exp = tplExpXl[row.templateId] ?? 1;
    filledSlotsXl += Math.min(Number(row.count) || 0, exp);
  }

  // All checklist submissions
  const [submissions] = await pool.query(
    `SELECT cs.id, ct.template_name, cu.full_name AS submitted_by, cs.status, cs.submitted_at
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON ct.id = cs.template_id
     LEFT JOIN company_users cu ON cu.id = cs.company_user_id
     WHERE ct.company_id = ?
     ORDER BY cs.submitted_at DESC NULLS LAST`,
    [companyId]
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "FM App";
  wb.created = new Date();

  // Summary sheet
  const ws1 = wb.addWorksheet("Dashboard Summary");
  ws1.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 20 },
  ];
  ws1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };

  ws1.addRows([
    { metric: "Total Assets", value: dashRow?.total_assets ?? 0 },
    { metric: "Active Assets", value: dashRow?.active_assets ?? 0 },
    { metric: "Open Work Orders", value: dashRow?.open_requests ?? 0 },
    { metric: "Open Soft Requests", value: dashRow?.open_soft ?? 0 },
    { metric: "Checklists Filled Today (Slots)", value: filledSlotsXl },
    { metric: "Total Expected Slots Today", value: totalExpectedXl },
    { metric: "Generated At", value: new Date().toLocaleString("en-IN") },
  ]);

  // Submissions sheet
  const ws2 = wb.addWorksheet("Recent Submissions");
  ws2.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Template", key: "template_name", width: 35 },
    { header: "Submitted By", key: "submitted_by", width: 25 },
    { header: "Status", key: "status", width: 15 },
    { header: "Submitted At", key: "submitted_at", width: 22 },
  ];
  ws2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0891B2" } };

  for (const s of submissions) {
    ws2.addRow({
      id: s.id,
      template_name: s.template_name,
      submitted_by: s.submitted_by,
      status: s.status,
      submitted_at: s.submitted_at ? new Date(s.submitted_at).toLocaleString("en-IN") : "",
    });
  }

  return await wb.xlsx.writeBuffer();
}

/* â”€â”€ Helper: generate PDF buffer (rich dashboard-style layout) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function generatePDF(companyId) {
  const [[co]] = await pool.query("SELECT company_name FROM companies WHERE id = ?", [companyId]);
  const [[dashRow]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM locations WHERE company_id = ? AND LOWER(COALESCE(status,'Active')) = 'active') AS active_locations,
      (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('closed','resolved','cancelled','rejected')) AS open_soft`,
    [companyId, companyId]
  );

  // Use PREVIOUS day as the report date (yesterday's data is fully finalized)
  // Night-shift submissions (e.g. 10 PM–6 AM) spanning midnight are attributed to the shift-start date
  const [[nowRow]] = await pool.query(`SELECT to_char(NOW() - INTERVAL '1 day', 'YYYY-MM-DD') AS today`);
  const todayDbStr = nowRow.today;

  // Slot-based site score — uses shared computeSiteScore utility (same as dashboard)
  const scoreData = await computeSiteScore(companyId, todayDbStr);
  const totalExpected = scoreData.totalExpected;
  const filledSlots   = scoreData.filledSlots;
  const pendingSlots  = scoreData.pendingSlots;
  const siteScorePct  = scoreData.siteScorePct;

  // Site Score history — last 7 days using computeSiteScoreRange
  const _sevenDaysAgo = (() => {
    const d = new Date(todayDbStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const _histDates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDbStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i);
    _histDates.push(d.toISOString().slice(0, 10));
  }
  const _histScores = await (async () => { try { return await computeSiteScoreRange(companyId, _histDates); } catch { return []; } })();
  const siteScoreRows = _histScores.map(r => ({ date: r.date, score: r.siteScore ?? r.pct ?? 0 }));

  // Helper: format minutes → 'H:MM AM/PM'
  const fmtTime = (mins) => {
    const h24 = Math.floor(mins / 60) % 24;
    const m   = mins % 60;
    const h12 = h24 % 12 || 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + (h24 < 12 ? 'AM' : 'PM');
  };
  const toMins = (t) => { if (!t) return 0; const [h, m = 0] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

  // Fetch today's submissions — scoped by location_id for correct room matching
  const [todaySubmissions] = await pool.query(
    `SELECT cs.id, cs.template_id, ct.template_name,
       cs.location_id,
       cs.status, cs.submitted_at,
       cu.full_name AS submitted_by,
       EXTRACT(HOUR FROM cs.submitted_at)::int * 60 + EXTRACT(MINUTE FROM cs.submitted_at)::int AS sub_mins,
       to_char(cs.submitted_at, 'DD/MM/YY HH12:MI AM') AS submitted_time
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON ct.id = cs.template_id
     LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
     WHERE ct.company_id = ? AND cs.submitted_at::date = ?::date
       AND COALESCE(cs.is_soft_raise, FALSE) = FALSE
     ORDER BY cs.submitted_at ASC`,
    [companyId, todayDbStr]
  );

  // Group submissions by location_id+template_id (new model) and template_id-only (old model fallback)
  const subsByLocTpl = {}; // key: `${locationId}_${templateId}`
  const subsByTplOnly = {}; // key: templateId (for old-model fallback)
  for (const s of todaySubmissions) {
    const lk = `${s.location_id || 'null'}_${s.template_id}`;
    if (!subsByLocTpl[lk]) subsByLocTpl[lk] = [];
    subsByLocTpl[lk].push(s);
    if (!subsByTplOnly[s.template_id]) subsByTplOnly[s.template_id] = [];
    subsByTplOnly[s.template_id].push(s);
  }

  // Fetch active locations with checklist + scheduling (new Phase 2+ model)
  const [locationsWithChecklist] = await pool.query(
    `SELECT l.id, l.name, l.room, l.building, l.floor,
            l.checklist_id, ct.template_name,
            l.frequency, l.hourly_interval AS "hourlyInterval",
            COALESCE(l.shift_ids, '[]'::jsonb) AS "shiftIds"
     FROM locations l
     JOIN checklist_templates ct ON ct.id = l.checklist_id
     WHERE l.company_id = ? AND LOWER(COALESCE(l.status,'active')) = 'active'
       AND l.checklist_id IS NOT NULL
       AND COALESCE(ct.status,'active') != 'inactive'
     ORDER BY l.name`,
    [companyId]
  );

  // Fetch shifts for slot expansion
  const [activeShifts] = await pool.query(
    `SELECT id, name, start_time AS "startTime", end_time AS "endTime"
     FROM shifts WHERE company_id = ? AND status = 'active'`,
    [companyId]
  );
  const shiftById = Object.fromEntries((activeShifts || []).map(s => [Number(s.id), s]));

  // Build slot-expanded rows using location model (mirrors dashboard Recent Submissions)
  const _usedSubIds = new Set();
  const locationCoveredTplIds = new Set(locationsWithChecklist.map(l => String(l.checklist_id)).filter(Boolean));
  const allChecklistRows = [];

  for (const loc of locationsWithChecklist) {
    const locFreq = (loc.frequency || '').toLowerCase();
    const shiftIdsRaw = Array.isArray(loc.shiftIds) ? loc.shiftIds
      : (typeof loc.shiftIds === 'string' ? JSON.parse(loc.shiftIds || '[]') : []);
    const shiftIds = shiftIdsRaw.map(Number).filter(Boolean);
    const locInterval = Math.max(1, Number(loc.hourlyInterval) || 1);
    const locSubs = (subsByLocTpl[`${loc.id}_${loc.checklist_id}`] || []).sort((a, b) => a.sub_mins - b.sub_mins);
    const roomLabel = loc.name || loc.room || '—';

    // Sort shifts chronologically
    const sortedShiftIds = [...shiftIds].sort((a, b) =>
      toMins(shiftById[a]?.startTime) - toMins(shiftById[b]?.startTime));
    const windows = sortedShiftIds.map(sid => {
      const sh = shiftById[sid];
      return sh ? { start: toMins(sh.startTime), end: toMins(sh.endTime) } : null;
    }).filter(Boolean);

    if (locFreq === 'hourly' && windows.length > 0) {
      for (const win of windows) {
        for (let s = win.start; s < win.end; s += locInterval * 60) {
          const slotEnd = Math.min(s + locInterval * 60, win.end);
          const slotLabel = fmtTime(s) + ' – ' + fmtTime(slotEnd);
          const matchSub = locSubs.find(sub => {
            if (_usedSubIds.has(sub.id)) return false;
            const sm = Number(sub.sub_mins);
            return sm >= s && sm < slotEnd;
          });
          if (matchSub) _usedSubIds.add(matchSub.id);
          allChecklistRows.push({
            template_name: loc.template_name,
            room_name: roomLabel,
            slot: slotLabel,
            status: matchSub ? (matchSub.status || 'submitted') : 'not_submitted',
            submitted_by: matchSub?.submitted_by || null,
            submitted_time: matchSub?.submitted_time || null,
          });
        }
      }
      // Extra subs genuinely outside all windows
      for (const sub of locSubs) {
        if (_usedSubIds.has(sub.id)) continue;
        _usedSubIds.add(sub.id);
        const inAnyWin = windows.some(w => Number(sub.sub_mins) >= w.start && Number(sub.sub_mins) < w.end);
        if (inAnyWin) continue;
        allChecklistRows.push({
          template_name: loc.template_name,
          room_name: roomLabel,
          slot: fmtTime(Number(sub.sub_mins)) + ' (outside window)',
          status: sub.status || 'submitted',
          submitted_by: sub.submitted_by, submitted_time: sub.submitted_time,
        });
      }
    } else if (locFreq !== 'hourly' && windows.length > 0) {
      for (const win of windows) {
        const slotLabel = fmtTime(win.start) + ' – ' + fmtTime(win.end);
        const matchSub = locSubs.find(sub => {
          if (_usedSubIds.has(sub.id)) return false;
          const sm = Number(sub.sub_mins);
          return sm >= win.start && sm < win.end;
        });
        if (matchSub) _usedSubIds.add(matchSub.id);
        allChecklistRows.push({
          template_name: loc.template_name,
          room_name: roomLabel,
          slot: slotLabel,
          status: matchSub ? (matchSub.status || 'submitted') : 'not_submitted',
          submitted_by: matchSub?.submitted_by || null, submitted_time: matchSub?.submitted_time || null,
        });
      }
    } else {
      if (locSubs.length > 0) {
        for (const sub of locSubs) {
          _usedSubIds.add(sub.id);
          allChecklistRows.push({
            template_name: loc.template_name, room_name: roomLabel, slot: null,
            status: sub.status || 'submitted',
            submitted_by: sub.submitted_by, submitted_time: sub.submitted_time,
          });
        }
      } else {
        allChecklistRows.push({
          template_name: loc.template_name, room_name: roomLabel, slot: null,
          status: 'not_submitted', submitted_by: null, submitted_time: null,
        });
      }
    }
  }

  // Old-model standalone templates (not covered by location model)
  const [oldModelTpls] = await pool.query(
    `SELECT ct.id, ct.template_name, COALESCE(r.room_name, '—') AS room_name,
            ct.frequency, ct.hourly_interval AS "hourlyInterval",
            ct.start_time AS "startTime", ct.end_time AS "endTime"
     FROM checklist_templates ct
     LEFT JOIN rooms r ON r.id = ct.room_id
     WHERE ct.company_id = ? AND COALESCE(ct.status,'active') != 'inactive'
       AND (ct.location_id IS NULL OR ct.location_id = 0)
       AND ct.id NOT IN (
         SELECT DISTINCT checklist_id FROM locations
         WHERE company_id = ? AND checklist_id IS NOT NULL
       )
     ORDER BY ct.template_name`,
    [companyId, companyId]
  );
  for (const tpl of (oldModelTpls || [])) {
    const freq = (tpl.frequency || 'daily').toLowerCase();
    const subs = (subsByTplOnly[tpl.id] || []).filter(s => !_usedSubIds.has(s.id));
    if (freq === 'hourly' && tpl.startTime && tpl.endTime) {
      const interval  = Math.max(1, Number(tpl.hourlyInterval) || 1);
      const startMins = toMins(tpl.startTime), endMins = toMins(tpl.endTime);
      const usedOld = new Set();
      for (let sl = startMins; sl < endMins; sl += interval * 60) {
        const slotEnd = sl + interval * 60;
        const slotLabel = fmtTime(sl) + ' – ' + fmtTime(slotEnd);
        const matchSub = subs.find(s => { if (usedOld.has(s.id)) return false; const sm = Number(s.sub_mins); return sm >= sl && sm < slotEnd; });
        if (matchSub) usedOld.add(matchSub.id);
        allChecklistRows.push({
          template_name: tpl.template_name, room_name: tpl.room_name, slot: slotLabel,
          status: matchSub ? (matchSub.status || 'submitted') : 'not_submitted',
          submitted_by: matchSub?.submitted_by || null, submitted_time: matchSub?.submitted_time || null,
        });
      }
    } else {
      if (subs.length > 0) {
        for (const s of subs) { _usedSubIds.add(s.id); allChecklistRows.push({ template_name: tpl.template_name, room_name: tpl.room_name, slot: null, status: s.status || 'submitted', submitted_by: s.submitted_by, submitted_time: s.submitted_time }); }
      } else {
        allChecklistRows.push({ template_name: tpl.template_name, room_name: tpl.room_name, slot: null, status: 'not_submitted', submitted_by: null, submitted_time: null });
      }
    }
  }
  const [softReqs] = await pool.query(
    `SELECT ssr.id, ssr.status, ssr.raised_at, l.name AS location_name, cu.full_name AS raised_by
     FROM soft_service_requests ssr LEFT JOIN locations l ON l.id = ssr.location_id
     LEFT JOIN company_users cu ON cu.id = ssr.raised_by_user_id
     WHERE ssr.company_id = ?
       AND LOWER(TRIM(COALESCE(ssr.status, ''))) NOT IN ('closed','resolved','cancelled','rejected')
     ORDER BY ssr.raised_at DESC NULLS LAST LIMIT 10`,
    [companyId]
  );
  const [notifications] = await pool.query(
    `SELECT title, message, created_at, type FROM notifications WHERE company_id = ? AND created_at::date = ?::date ORDER BY created_at DESC LIMIT 6`,
    [companyId, todayDbStr]
  ).catch(() => [[]]);

  const activeLocations = Number(dashRow?.active_locations ?? 0);
  const openSoft        = Number(dashRow?.open_soft ?? 0);
  const companyName     = co?.company_name ?? "Company";

  // ── Shift Wise Site Score (same logic as /dashboard/shift-site-score endpoint) ──
  let shiftScoreData = [];
  try {
    const [pdfShifts] = await pool.query(
      `SELECT id, name, start_time AS "startTime", end_time AS "endTime"
       FROM shifts WHERE company_id = ? AND status = 'active' ORDER BY start_time`,
      [companyId]
    );
    if (pdfShifts && pdfShifts.length > 0) {
      const [pdfLocPairs] = await pool.query(`
        SELECT l.id AS "locationId", ct.id AS "templateId",
               COALESCE(l.frequency, ct.frequency, 'Daily') AS frequency,
               COALESCE(l.hourly_interval, ct.hourly_interval, 1) AS "hourlyInterval",
               COALESCE(l.shift_ids, '[]'::jsonb) AS "shiftIds"
        FROM locations l
        JOIN checklist_templates ct ON ct.id = l.checklist_id
        WHERE l.company_id = ? AND LOWER(COALESCE(l.status,'active')) = 'active'
          AND COALESCE(ct.status,'active') != 'inactive'`, [companyId]);
      const _ssToMins = (t) => { const [h, m = 0] = String(t || '00:00').split(':').map(Number); return h * 60 + m; };
      const expForShift = (pair, shift) => {
        const sIds = Array.isArray(pair.shiftIds) ? pair.shiftIds.map(Number)
          : JSON.parse(typeof pair.shiftIds === 'string' ? pair.shiftIds : '[]').map(Number);
        if (!sIds.includes(Number(shift.id))) return 0;
        const freq = (pair.frequency || 'Daily').toLowerCase();
        if (freq !== 'hourly') return 1;
        const interval = Math.max(0.25, Number(pair.hourlyInterval) || 1);
        const sS = _ssToMins(shift.startTime), sE = _ssToMins(shift.endTime);
        return Math.max(1, Math.floor((sE <= sS ? (1440 - sS) + sE : sE - sS) / (interval * 60)));
      };
      const [pdfSubs] = await pool.query(`
        SELECT cs.location_id AS "locationId", cs.template_id AS "templateId",
               s.id AS "shiftId", COUNT(*) AS count
        FROM checklist_submissions cs
        JOIN checklist_templates ct ON ct.id = cs.template_id
        JOIN locations l ON l.id = cs.location_id
        JOIN shifts s ON s.company_id = ct.company_id AND s.status = 'active'
          AND s.id::bigint = ANY(ARRAY(SELECT jsonb_array_elements_text(l.shift_ids))::bigint[])
          AND (
            (s.end_time::time > s.start_time::time
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                  >= (EXTRACT(HOUR FROM s.start_time::time)*60+EXTRACT(MINUTE FROM s.start_time::time))
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                  <  (EXTRACT(HOUR FROM s.end_time::time)*60+EXTRACT(MINUTE FROM s.end_time::time)))
            OR
            (s.end_time::time <= s.start_time::time
              AND ((EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                    >= (EXTRACT(HOUR FROM s.start_time::time)*60+EXTRACT(MINUTE FROM s.start_time::time))
                OR  (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                    <  (EXTRACT(HOUR FROM s.end_time::time)*60+EXTRACT(MINUTE FROM s.end_time::time))))
          )
        WHERE ct.company_id = ?
          AND (
            cs.submitted_at::date = ?::date
            OR (
              cs.submitted_at::date = (?::date + INTERVAL '1 day')::date
              AND s.end_time::time <= s.start_time::time
              AND (EXTRACT(HOUR FROM cs.submitted_at)*60+EXTRACT(MINUTE FROM cs.submitted_at))
                  < (EXTRACT(HOUR FROM s.end_time::time)*60+EXTRACT(MINUTE FROM s.end_time::time))
            )
          )
          AND cs.location_id IS NOT NULL AND cs.status NOT IN ('rejected')
          AND COALESCE(cs.is_soft_raise, FALSE) = FALSE
          AND COALESCE(ct.status,'active') != 'inactive'
        GROUP BY cs.location_id, cs.template_id, s.id`,
        [companyId, todayDbStr, todayDbStr]
      );
      const pdfSubMap = {};
      for (const s of pdfSubs) {
        if (!pdfSubMap[s.shiftId]) pdfSubMap[s.shiftId] = {};
        pdfSubMap[s.shiftId][`${s.locationId}_${s.templateId}`] = Number(s.count) || 0;
      }
      shiftScoreData = pdfShifts.map(shift => {
        let total = 0, filled = 0;
        for (const pair of pdfLocPairs) {
          const exp = expForShift(pair, shift);
          if (exp <= 0) continue;
          total += exp;
          filled += Math.min((pdfSubMap[shift.id] || {})[`${pair.locationId}_${pair.templateId}`] || 0, exp);
        }
        return { shiftName: shift.name, startTime: shift.startTime, endTime: shift.endTime,
          total, filled, pending: Math.max(0, total - filled),
          pct: total > 0 ? Math.round((filled / total) * 100) : 0 };
      });
    }
  } catch (shiftErr) {
    console.warn('[PDF] Shift score error:', shiftErr.message);
  }

  const drawDonut = (doc, cx, cy, outerR, innerR, pct, fillColor, bgColor) => {
    doc.circle(cx, cy, outerR).fill(bgColor);
    if (pct > 0) {
      if (pct >= 100) {
        doc.circle(cx, cy, outerR).fill(fillColor);
      } else {
        const s = -Math.PI / 2;
        const e = s + (pct / 100) * 2 * Math.PI;
        const x1 = cx + outerR * Math.cos(s), y1 = cy + outerR * Math.sin(s);
        const x2 = cx + outerR * Math.cos(e), y2 = cy + outerR * Math.sin(e);
        doc.path(
          "M " + cx + " " + cy +
          " L " + x1.toFixed(1) + " " + y1.toFixed(1) +
          " A " + outerR + " " + outerR + " 0 " + (pct > 50 ? 1 : 0) + " 1 " +
          x2.toFixed(1) + " " + y2.toFixed(1) + " Z"
        ).fill(fillColor);
      }
    }
    doc.circle(cx, cy, innerR).fill("#fff");
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W     = doc.page.width;
    const H     = doc.page.height;
    const BLUE  = "#2563EB";
    const GREEN = "#16a34a";
    const DARK  = "#0f172a";
    const GRAY  = "#64748B";
    const LGRAY = "#94a3b8";
    const LBG   = "#F8FAFC";
    const M     = 28;
    const IW    = W - M * 2;
    const nowDate    = new Date();
    // reportDate is yesterday — the finalized reporting date for this PDF
    const reportDate = new Date(todayDbStr + 'T00:00:00Z');
    const timeStr   = nowDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const dateShort = reportDate.toLocaleDateString("en-GB");
    const dateLong  = reportDate.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    // Blue header
    doc.rect(0, 0, W, 56).fill(BLUE);
    doc.fillColor("#fff").fontSize(8).font("Helvetica")
       .text(dateShort + ", " + timeStr, M, 10)
       .text("FM App", W - M - 40, 10, { width: 40, align: "right" });
    doc.fillColor("#fff").fontSize(18).font("Helvetica-Bold")
       .text("Welcome " + companyName, M, 22);
    let y = 68;

    // Company + date line
    const cnW = doc.widthOfString(companyName, { fontSize: 11 });
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(companyName, M, y);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("  — " + dateLong, M + cnW, y + 1);
    y += 22;

    const cardW = (IW - 10) / 2;
    const c2x   = M + cardW + 10;

    // Card 1: Active Locations
    doc.roundedRect(M, y, cardW, 64, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Active Locations", M + 12, y + 10, { width: cardW - 24 });
    doc.fillColor(DARK).fontSize(30).font("Helvetica-Bold").text(String(activeLocations), M + 12, y + 20, { width: cardW - 24 });
    doc.fillColor(GREEN).fontSize(8).font("Helvetica").text("Location records", M + 12, y + 53, { width: cardW - 24 });
    // Card 2: Open HK Requests
    doc.roundedRect(c2x, y, cardW, 64, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Open HK Requests", c2x + 12, y + 10, { width: cardW - 24 });
    doc.fillColor(DARK).fontSize(30).font("Helvetica-Bold").text(String(openSoft), c2x + 12, y + 20, { width: cardW - 24 });
    doc.fillColor(openSoft > 0 ? "#dc2626" : GREEN).fontSize(8).font("Helvetica")
       .text(openSoft > 0 ? "Needs attention" : "All clear", c2x + 12, y + 53, { width: cardW - 24 });
    y += 74;

    // Card 3: Today's Site Score
    doc.roundedRect(M, y, cardW, 58, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(LGRAY).fontSize(7).font("Helvetica").text("TODAY'S SITE SCORE", M + 10, y + 8, { width: cardW - 20 });
    doc.fillColor(GREEN).fontSize(26).font("Helvetica-Bold").text(siteScorePct + "%", M + 10, y + 17, { width: cardW - 20 });
    doc.fillColor(GRAY).fontSize(7).font("Helvetica").text(filledSlots + " of " + totalExpected + " checklists filled today", M + 10, y + 46, { width: cardW - 20 });
    // Card 4: Total Filled Checklists
    doc.roundedRect(c2x, y, cardW, 58, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(LGRAY).fontSize(7).font("Helvetica").text("TOTAL FILLED CHECKLISTS", c2x + 10, y + 8, { width: cardW - 20 });
    doc.fillColor(DARK).fontSize(26).font("Helvetica-Bold").text(String(filledSlots), c2x + 10, y + 17, { width: cardW - 20 });
    doc.fillColor(GRAY).fontSize(7).font("Helvetica").text("Filled checklists for selected date", c2x + 10, y + 46, { width: cardW - 20 });
    y += 68;

    // Submission Overview (donut chart + legend)
    doc.roundedRect(M, y, IW, 140, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Submission Overview", M + 12, y + 10);
    doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Data for " + dateShort, M + 12, y + 25);
    const donutCx = M + 88, donutCy = y + 82;
    drawDonut(doc, donutCx, donutCy, 50, 30, siteScorePct, GREEN, "#dcfce7");
    doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(siteScorePct + "%", donutCx - 17, donutCy - 10, { width: 34, align: "center" });
    doc.fillColor(LGRAY).fontSize(6).font("Helvetica").text("SITE SCORE", donutCx - 17, donutCy + 6, { width: 34, align: "center" });
    const lx = M + 158;
    const legendItems = [
      { dot: GREEN,     label: "Filled Checklists",  val: String(filledSlots),   pct: totalExpected > 0 ? Math.round((filledSlots / totalExpected) * 100) + "%" : "0%" },
      { dot: "#bbf7d0", label: "Pending Checklists", val: String(pendingSlots),  pct: totalExpected > 0 ? Math.round((pendingSlots / totalExpected) * 100) + "%" : "0%" },
      { dot: BLUE,      label: "Site Score",         val: siteScorePct + "%",    pct: filledSlots + "/" + totalExpected },
    ];
    let ly = y + 44;
    for (const item of legendItems) {
      doc.circle(lx + 4, ly + 4, 4).fill(item.dot);
      doc.fillColor(DARK).fontSize(8).font("Helvetica").text(item.label, lx + 12, ly, { width: 120 });
      doc.fillColor(LGRAY).fontSize(8).text(item.val, lx + 135, ly, { width: 40 });
      doc.fillColor(LGRAY).fontSize(8).text(item.pct, lx + 178, ly, { width: 50 });
      ly += 22;
    }
    y += 152;

    // HK Request panel
    const hkH = softReqs.length > 0 ? Math.min(softReqs.length * 20 + 42, 104) : 54;
    if (y + hkH > H - 40) { doc.addPage(); y = 32; }
    doc.roundedRect(M, y, IW, hkH, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("HK Request", M + 12, y + 10);
    doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Open requests raised by supervisors", M + 12, y + 24);
    if (softReqs.length === 0) {
      doc.fillColor(GREEN).fontSize(8).font("Helvetica").text("✓  No open soft service requests", M + 12, y + 38);
    } else {
      let ry = y + 38;
      for (let i = 0; i < Math.min(softReqs.length, 3); i++) {
        doc.fillColor(GRAY).fontSize(7.5).text(
          "• " + (softReqs[i].location_name ?? "-") + " — " + (softReqs[i].raised_by ?? "-") + " (" + (softReqs[i].status ?? "-") + ")",
          M + 12, ry, { width: IW - 24, ellipsis: true }
        );
        ry += 18;
      }
    }
    y += hkH + 10;

    /* Notifications section intentionally omitted from PDF report */

    // ── Shift Wise Site Score section ────────────────────────────────────────
    if (Array.isArray(shiftScoreData) && shiftScoreData.length > 0) {
      const shiftColW = Math.floor((IW - (shiftScoreData.length - 1) * 8) / shiftScoreData.length);
      const shiftSectH = 110;
      if (y + shiftSectH + 22 > H - 40) { doc.addPage(); y = 32; }
      doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text("Shift Wise Site Score", M, y);
      y += 16;
      const reportDateLabel = (() => { try { const d = new Date(todayDbStr + 'T00:00:00Z'); return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return todayDbStr; } })();
      doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Data for " + reportDateLabel, M, y);
      y += 10;
      const fmtShiftT = (t) => { if (!t) return '—'; const [h, m = '00'] = t.split(':'); const hh = parseInt(h); const ap = hh >= 12 ? 'PM' : 'AM'; return `${hh % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`; };
      for (let i = 0; i < shiftScoreData.length; i++) {
        const sh = shiftScoreData[i];
        const sx = M + i * (shiftColW + 8);
        const pctColor = sh.pct >= 75 ? "#16a34a" : sh.pct >= 40 ? "#d97706" : "#dc2626";
        doc.roundedRect(sx, y, shiftColW, shiftSectH, 6).fillAndStroke("#fafafa", "#e2e8f0");
        doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold").text(sh.shiftName, sx + 6, y + 8, { width: shiftColW - 12, align: "center", ellipsis: true });
        doc.fillColor(LGRAY).fontSize(7).font("Helvetica").text(fmtShiftT(sh.startTime) + " – " + fmtShiftT(sh.endTime), sx + 6, y + 21, { width: shiftColW - 12, align: "center" });
        doc.fillColor(pctColor).fontSize(22).font("Helvetica-Bold").text(sh.pct + "%", sx + 6, y + 34, { width: shiftColW - 12, align: "center" });
        doc.roundedRect(sx + 6, y + 62, shiftColW - 12, 40, 4).fill("#f1f5f9");
        doc.fillColor("#475569").fontSize(7).font("Helvetica");
        doc.text("Total: " + sh.total,    sx + 10, y + 66, { width: shiftColW - 20 });
        doc.fillColor("#16a34a").text("Filled: " + sh.filled,   sx + 10, y + 77, { width: shiftColW - 20 });
        doc.fillColor("#dc2626").text("Pending: " + sh.pending, sx + 10, y + 88, { width: shiftColW - 20 });
      }
      y += shiftSectH + 14;
    }

    // ── Site Performance Trend (last 7 days bar chart) ──────────────────────────
    if (Array.isArray(siteScoreRows) && siteScoreRows.length > 0) {
      const chartH = 90;
      const chartPad = 12;
      const sectionH = chartH + 46;
      if (y + sectionH > H - 40) { doc.addPage(); y = 32; }
      doc.roundedRect(M, y, IW, sectionH, 6).fillAndStroke("#fff", "#e2e8f0");
      doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Site Performance Trend", M + 12, y + 8);
      doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Last 7 days (" + _sevenDaysAgo + " to " + todayDbStr + ") \u2014 Slot-based completion rate", M + 12, y + 21);
      const barAreaX = M + chartPad + 28;
      const barAreaW = IW - chartPad * 2 - 28;
      const barAreaY = y + 40;
      const barAreaH = chartH - 12;
      const ORANGE    = "#f97316";
      const BAR_DARK  = "#ea580c";
      const n7 = siteScoreRows.length;
      const slot = barAreaW / n7;
      const bW   = Math.min(40, Math.max(8, slot * 0.6));
      // Y-axis tick lines at 0, 25, 50, 75, 100
      for (const pct of [0, 25, 50, 75, 100]) {
        const ty = barAreaY + barAreaH - (pct / 100) * barAreaH;
        doc.moveTo(barAreaX - 4, ty).lineTo(barAreaX + barAreaW, ty)
           .stroke(pct === 0 ? "#cbd5e1" : "#f1f5f9");
        doc.fillColor(LGRAY).fontSize(6).font("Helvetica")
           .text(String(pct), M + chartPad, ty - 3, { width: 22, align: "right" });
      }
      for (let i = 0; i < n7; i++) {
        const sc   = Number(siteScoreRows[i].score) || 0;
        const bH   = Math.max((sc / 100) * barAreaH, sc > 0 ? 2 : 0);
        const bX   = barAreaX + slot * i + (slot - bW) / 2;
        const bY   = barAreaY + barAreaH - bH;
        if (bH > 0) doc.rect(bX, bY, bW, bH).fill(ORANGE);
        if (sc > 0) {
          doc.fillColor(BAR_DARK).fontSize(6).font("Helvetica-Bold")
             .text(sc + "%", bX - 2, bY - 9, { width: bW + 4, align: "center" });
        }
        // X-axis date label (DD/MM)
        const rawDate = siteScoreRows[i].date;
        const parts = (rawDate instanceof Date ? rawDate.toISOString().slice(0,10) : String(rawDate)).split("-");
        const dateLabel = parts[2] + "/" + parts[1];
        doc.fillColor(LGRAY).fontSize(6).font("Helvetica")
           .text(dateLabel, bX - 2, barAreaY + barAreaH + 3, { width: bW + 4, align: "center" });
      }
      y += sectionH + 10;
    }

    /* Recent Submissions section omitted from PDF report */

    // Page footers
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      doc.rect(0, H - 26, W, 26).fill("#f1f5f9");
      doc.fillColor(LGRAY).fontSize(7).font("Helvetica")
         .text("Generated by FM App  •  " + companyName + "  •  " + new Date().toLocaleString("en-IN"), M, H - 17, { width: IW - 40 });
      doc.text((p + 1) + " / " + range.count, W - M - 30, H - 17, { width: 30, align: "right" });
    }
    doc.end();
  });
}



/* â”€â”€ Helper: send one scheduled report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function sendScheduledReport(config) {
  const recipients = JSON.parse(config.recipients || "[]");
  const formats    = JSON.parse(config.formats    || "[]");
  if (!recipients.length || !formats.length) return;

  const transporter = buildTransporter();
  const attachments = [];

  const dateStr = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");

  if (formats.includes("csv")) {
    const buf = await generateCSV(config.company_id);
    attachments.push({ filename: `dashboard-report-${dateStr}.csv`, content: buf, contentType: "text/csv" });
  }
  if (formats.includes("excel")) {
    const buf = await generateExcel(config.company_id);
    attachments.push({ filename: `dashboard-report-${dateStr}.xlsx`, content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  if (formats.includes("pdf")) {
    const buf = await generatePDF(config.company_id);
    attachments.push({ filename: `dashboard-report-${dateStr}.pdf`, content: buf, contentType: "application/pdf" });
  }

  const [[co]] = await pool.query("SELECT company_name FROM companies WHERE id = ?", [config.company_id]);

  const cfg = config.schedule_config ? (typeof config.schedule_config === "string" ? JSON.parse(config.schedule_config) : config.schedule_config) : {};
  const ec = cfg.emailConfig || {};

  const companyName = co?.company_name ?? "Catalyst FM";
  // Report covers the previous day's finalized data
  const reportDateStr = new Date(Date.now() - 86400000).toLocaleDateString("en-GB");
  const dateLong = new Date(Date.now() - 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const defaultSubject = `Daily Site Report - ${companyName} - ${reportDateStr}`;
  const emailSubject = ec.subject || defaultSubject;
  const emailBody   = ec.body   || "Please find the attachment of daily site report.";

  // Handle regards logo as CID inline attachment (data: URIs are stripped by Gmail)
  let regardsLogoHtml = "";
  if (ec.regardsLogoDataUrl) {
    const m = ec.regardsLogoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      attachments.push({
        filename: "regards-logo.png",
        content: Buffer.from(m[2], "base64"),
        encoding: "base64",
        cid: "regards-logo-cid@fmapp",
        contentDisposition: "inline",
      });
      regardsLogoHtml = `<img src="cid:regards-logo-cid@fmapp" alt="Logo" style="height:40px;max-width:160px;object-fit:contain;display:block;margin-bottom:8px" />`;
    }
  }

  const regardsHtml = (ec.regardsText || ec.regardsLogoDataUrl)
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0">${regardsLogoHtml}${
        ec.regardsText ? `<p style="color:#475569;margin:0;font-size:14px">${ec.regardsText.replace(/\n/g, "<br/>")}</p>` : ""
      }</div>`
    : "";

  await transporter.sendMail({
    from: `"FM App - ${companyName}" <${MAIL_FROM_ADDRESS}>`,
    to: recipients.join(", "),
    subject: emailSubject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#2563EB;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">FM Dashboard Report</h2>
          <p style="color:#bfdbfe;margin:6px 0 0">${companyName} - ${dateLong}</p>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="color:#334155">${emailBody.replace(/\n/g, "<br/>")}</p>
          <p style="color:#64748b;font-size:13px">Attached format(s): <strong>${formats.join(", ").toUpperCase()}</strong>.</p>
          <p style="color:#94a3b8;font-size:12px">This is an automated report from FM App. To update or cancel this schedule, visit your Company Portal &gt; Dashboard &gt; Schedule Mail.</p>
          ${regardsHtml}
        </div>
      </div>
    `,
    attachments,
  });

  // Update last_sent_at and next_send_at
  const nextSend = computeNextSend(config.frequency, config.send_time, config.scheduled_day, cfg);
  await pool.query(
    `UPDATE scheduled_report_configs SET last_sent_at = NOW(), next_send_at = ?, updated_at = NOW() WHERE id = ?`,
    [nextSend.toISOString(), config.id]
  );

  console.log(`[scheduled-reports] Sent report #${config.id} to ${recipients.join(", ")}`);
}

/* â”€â”€ Cron: every minute, check for due reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
cron.schedule("* * * * *", async () => {
  try {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return; // skip if not configured

    const [due] = await pool.query(
      `SELECT * FROM scheduled_report_configs
       WHERE is_active = TRUE
         AND (next_send_at IS NULL OR next_send_at <= NOW())`
    );

    for (const config of due) {
      try {
        await sendScheduledReport(config);
      } catch (err) {
        console.error(`[scheduled-reports] Failed to send report #${config.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[scheduled-reports] Cron error:", err.message);
  }
});

/* ── Cron: daily at 08:05 IST, snapshot yesterday's site scores ───────────── */
/* Runs at 08:05 (after overnight shifts end) to capture all night-shift submissions */
cron.schedule("5 8 * * *", async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`[daily-snapshots] Creating snapshots for ${yesterdayStr}...`);

    // Get all active companies
    const [companies] = await pool.query(`SELECT id FROM companies WHERE COALESCE(status, 'Active') = 'Active'`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const co of companies) {
      try {
        const [[existing]] = await pool.query(
          `SELECT id FROM daily_checklist_snapshots WHERE company_id = ? AND snapshot_date = ?::date`,
          [co.id, yesterdayStr]
        );
        if (existing) { skipCount++; continue; }

        // Phase 4: use location-based scoring via shared utility
        const metrics = await computeSiteScore(co.id, yesterdayStr);

        await pool.query(
          `INSERT INTO daily_checklist_snapshots
           (company_id, snapshot_date, total_expected_slots, filled_slots, site_score_pct, template_breakdown)
           VALUES (?, ?::date, ?, ?, ?, ?::jsonb)
           ON CONFLICT (company_id, snapshot_date) DO UPDATE
             SET total_expected_slots = EXCLUDED.total_expected_slots,
                 filled_slots = EXCLUDED.filled_slots,
                 site_score_pct = EXCLUDED.site_score_pct,
                 template_breakdown = EXCLUDED.template_breakdown`,
          [co.id, yesterdayStr, metrics.totalExpected, metrics.filledSlots, metrics.siteScorePct, JSON.stringify(metrics.breakdown)]
        );
        successCount++;
      } catch (coErr) {
        errorCount++;
        console.error(`[daily-snapshots] Error for company ${co.id}:`, coErr.message);
      }
    }

    console.log(`[daily-snapshots] Complete: ${successCount} created, ${skipCount} skipped, ${errorCount} errors`);
  } catch (err) {
    console.error("[daily-snapshots] Cron error:", err.message);
  }
});

/* â”€â”€ GET /scheduled-reports â€” list all for company â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
router.get("/", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT * FROM scheduled_report_configs WHERE company_id = ? ORDER BY created_at DESC`,
      [companyId]
    );
    const safeJson = (v, fb) => {
      if (v == null) return fb;
      if (typeof v !== "string") return v;
      try { return JSON.parse(v); } catch { return fb; }
    };
    res.json(rows.map((r) => ({
      ...r,
      recipients:      safeJson(r.recipients,      []),
      formats:         safeJson(r.formats,         []),
      schedule_config: safeJson(r.schedule_config, {}),
    })));
  } catch (err) { next(err); }
});

/* â”€â”€ POST /scheduled-reports â€” create new schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
router.post("/", async (req, res, next) => {
  try {
    const { frequency, scheduledDay, sendTime, recipients, formats, scheduleConfig, emailConfig } = req.body;

    if (!frequency || !sendTime || !recipients?.length || !formats?.length) {
      return res.status(400).json({ message: "frequency, sendTime, recipients and formats are required" });
    }

    const cfg = scheduleConfig || {};
    if (emailConfig && typeof emailConfig === "object") cfg.emailConfig = emailConfig;
    const nextSend = computeNextSend(frequency, sendTime, scheduledDay ?? null, cfg);

    const [result] = await pool.query(
      `INSERT INTO scheduled_report_configs
         (company_id, frequency, scheduled_day, send_time, recipients, formats, schedule_config, is_active, next_send_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
      [
        cid(req),
        frequency,
        scheduledDay ?? null,
        sendTime,
        JSON.stringify(recipients),
        JSON.stringify(formats),
        JSON.stringify(cfg),
        nextSend.toISOString(),
        req.companyUser.id,
      ]
    );

    res.status(201).json({ id: result.insertId ?? result.rows?.[0]?.id, nextSendAt: nextSend.toISOString(), message: "Schedule saved" });
  } catch (err) { next(err); }
});

/* â”€â”€ PUT /scheduled-reports/:id â€” update schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
router.put("/:id", async (req, res, next) => {
  try {
    const { frequency, scheduledDay, sendTime, recipients, formats, isActive, scheduleConfig, emailConfig } = req.body;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const cfg = scheduleConfig || {};
    if (emailConfig && typeof emailConfig === "object") cfg.emailConfig = emailConfig;
    const nextSend = computeNextSend(
      frequency || "daily",
      sendTime || "08:00",
      scheduledDay ?? null,
      cfg
    );

    await pool.query(
      `UPDATE scheduled_report_configs
         SET frequency = COALESCE(?, frequency),
             scheduled_day = ?,
             send_time = COALESCE(?, send_time),
             recipients = COALESCE(?, recipients),
             formats = COALESCE(?, formats),
             schedule_config = ?,
             is_active = COALESCE(?, is_active),
             next_send_at = ?,
             updated_at = NOW()
       WHERE id = ? AND company_id = ?`,
      [
        frequency ?? null,
        scheduledDay ?? null,
        sendTime ?? null,
        recipients ? JSON.stringify(recipients) : null,
        formats    ? JSON.stringify(formats)    : null,
        JSON.stringify(cfg),
        isActive != null ? Boolean(isActive) : null,
        nextSend.toISOString(),
        id,
        cid(req),
      ]
    );

    res.json({ message: "Updated", nextSendAt: nextSend.toISOString() });
  } catch (err) { next(err); }
});

/* â”€â”€ DELETE /scheduled-reports/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await pool.query(
      "DELETE FROM scheduled_report_configs WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

/* â”€â”€ POST /scheduled-reports/:id/send-now â€” manual trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
router.post("/:id/send-now", async (req, res) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    return res.status(503).json({ message: "SMTP not configured. Set MAIL_USER and MAIL_PASS in .env and restart the server." });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  let config;
  try {
    [[config]] = await pool.query(
      "SELECT * FROM scheduled_report_configs WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!config) return res.status(404).json({ message: "Schedule not found" });
  } catch (dbErr) {
    console.error("[send-now] DB error:", dbErr);
    return res.status(500).json({ message: `Database error: ${dbErr.message}` });
  }

  // Verify SMTP connection first â€” surfaces the real auth error before generating reports
  const transporter = buildTransporter();
  try {
    await transporter.verify();
  } catch (smtpErr) {
    console.error("[send-now] SMTP verify failed:", smtpErr.message);
    let hint = smtpErr.message || "SMTP connection failed";
    if (/535|BadCredentials|Username and Password|Invalid login/i.test(hint)) {
      hint = "SMTP authentication failed. For Microsoft 365, set MAIL_PROVIDER=office365 and use valid MAIL_USER/MAIL_PASS credentials for the mailbox.";
    }
    return res.status(502).json({ message: hint });
  }

  try {
    await sendScheduledReport(config);
    return res.json({ message: "Report sent successfully" });
  } catch (err) {
    console.error("[send-now] Send error:", err);
    return res.status(500).json({ message: `Failed to send report: ${err.message}` });
  }
});

export default router;

