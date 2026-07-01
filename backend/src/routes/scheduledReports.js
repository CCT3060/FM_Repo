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
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = express.Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

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
  const provider = (process.env.MAIL_PROVIDER || "gmail").toLowerCase();

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

  // Default: Gmail via explicit SMTP (port 465 SSL)
  // IMPORTANT: MAIL_PASS must be a Gmail App Password (not your account password).
  // To generate: myaccount.google.com â†’ Security â†’ 2-Step Verification â†’ App Passwords
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
function computeNextSend(frequency, sendTime, scheduledDay, scheduleConfig = {}) {
  const cfg = typeof scheduleConfig === "string" ? (JSON.parse(scheduleConfig || "{}") || {}) : (scheduleConfig || {});
  const [hours, minutes] = sendTime.split(":").map(Number);
  const now = new Date();

  switch (frequency) {
    case "daily": {
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }
    case "weekly": {
      const weeklyDays = cfg.weeklyDays;
      if (weeklyDays && weeklyDays.length > 0) {
        const sortedDays = [...weeklyDays].map(Number).sort((a, b) => a - b);
        const todayDay = now.getDay();
        const todayMins = now.getHours() * 60 + now.getMinutes();
        const targetMins = hours * 60 + minutes;
        let bestDiff = null;
        for (const d of sortedDays) {
          const dayDiff = (d - todayDay + 7) % 7;
          // Skip if today and target time already passed
          if (dayDiff === 0 && targetMins <= todayMins) continue;
          if (bestDiff === null || dayDiff < bestDiff) bestDiff = dayDiff;
        }
        // No future slot this week â€” go to first selected day next week
        if (bestDiff === null) {
          const firstDay = sortedDays[0];
          bestDiff = (firstDay - todayDay + 7) % 7 || 7;
        }
        const next = new Date(now);
        next.setDate(now.getDate() + bestDiff);
        next.setHours(hours, minutes, 0, 0);
        return next;
      } else {
        // Legacy: single day
        const targetDay = scheduledDay != null ? Number(scheduledDay) : 1;
        const diff = (targetDay - now.getDay() + 7) % 7 || 7;
        const next = new Date(now);
        next.setDate(now.getDate() + diff);
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
    }
    case "monthly": {
      const wantDay = Number(scheduledDay || 1);
      // Clamp to last day of target month to handle 29/30/31
      const clampDay = (year, month, d) => {
        const lastDay = new Date(year, month + 1, 0).getDate();
        return Math.min(d, lastDay);
      };
      const next = new Date(now);
      next.setDate(clampDay(next.getFullYear(), next.getMonth(), wantDay));
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(clampDay(next.getFullYear(), next.getMonth(), wantDay));
        next.setHours(hours, minutes, 0, 0);
      }
      return next;
    }
    case "quarterly": {
      const intervalMonths = cfg.quarterlyMonths ? Number(cfg.quarterlyMonths) : 3;
      const day = scheduledDay || cfg.monthlyDay || 1;
      const next = new Date(now);
      next.setMonth(next.getMonth() + intervalMonths);
      next.setDate(day);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }
    case "yearly": {
      const month = cfg.yearlyMonth ? Number(cfg.yearlyMonth) - 1 : now.getMonth();
      const day   = cfg.yearlyDay  ? Number(cfg.yearlyDay)  : (scheduledDay || 1);
      const next  = new Date(now);
      next.setMonth(month, day);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) next.setFullYear(next.getFullYear() + 1, month, day);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }
    default: {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(hours, minutes, 0, 0);
      return next;
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
       (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND status NOT IN ('closed','resolved')) AS open_soft,
       (SELECT COUNT(*) FROM checklist_submissions cs JOIN checklist_templates ct ON ct.id=cs.template_id WHERE ct.company_id = ? AND cs.submitted_at >= CURRENT_DATE) AS filled_today,
       (SELECT COUNT(*) FROM checklist_templates WHERE company_id = ? AND is_active=1) AS total_templates`,
    [companyId, companyId, companyId, companyId, companyId, companyId]
  );

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
    ["Checklists Filled Today", dashRow?.filled_today ?? 0],
    ["Total Active Templates", dashRow?.total_templates ?? 0],
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
       (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND status NOT IN ('closed','resolved')) AS open_soft,
       (SELECT COUNT(*) FROM checklist_submissions cs JOIN checklist_templates ct ON ct.id=cs.template_id WHERE ct.company_id = ? AND cs.submitted_at >= CURRENT_DATE) AS filled_today,
       (SELECT COUNT(*) FROM checklist_templates WHERE company_id = ? AND is_active=1) AS total_templates`,
    [companyId, companyId, companyId, companyId, companyId, companyId]
  );

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
    { metric: "Checklists Filled Today", value: dashRow?.filled_today ?? 0 },
    { metric: "Total Active Templates", value: dashRow?.total_templates ?? 0 },
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
       (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND status NOT IN ('closed','resolved')) AS open_soft,
       (SELECT COUNT(*) FROM checklist_submissions cs JOIN checklist_templates ct ON ct.id=cs.template_id WHERE ct.company_id = ? AND cs.submitted_at >= CURRENT_DATE) AS filled_today,
       (SELECT COUNT(*) FROM checklist_templates WHERE company_id = ? AND is_active=1) AS total_templates`,
    [companyId, companyId, companyId, companyId]
  );
  // Site score for today only — matches dashboard when date is set to today
  const [siteScoreRows] = await pool.query(
    `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS date,
       ROUND(
         COALESCE(
           (SELECT COUNT(DISTINCT cs.template_id)
            FROM checklist_submissions cs
            JOIN checklist_templates ct ON ct.id = cs.template_id
            WHERE ct.company_id = ? AND cs.submitted_at::date = CURRENT_DATE
              AND cs.status NOT IN ('rejected')), 0
         )::numeric
         / GREATEST(
           (SELECT COUNT(*) FROM checklist_templates
            WHERE company_id = ? AND COALESCE(status,'active') != 'inactive'), 1
         ) * 100, 1
       ) AS score`,
    [companyId, companyId]
  );
  // Today's submissions — same query as /checklist-submissions/recent, filtered to today
  const [todaySubmissions] = await pool.query(
    `SELECT cs.id, cs.template_id, ct.template_name,
       COALESCE(r.room_name, '—') AS room_name,
       cs.status, cs.submitted_at,
       cu.full_name AS submitted_by
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON ct.id = cs.template_id
     LEFT JOIN rooms r ON r.id = ct.room_id
     LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
     WHERE ct.company_id = ? AND cs.submitted_at::date = CURRENT_DATE
     ORDER BY cs.submitted_at DESC`,
    [companyId]
  );
  const submittedTplIds = new Set(todaySubmissions.map(s => s.template_id));
  // Active templates not yet submitted today — matches dashboard "not_submitted" rows
  const [activeTemplates] = await pool.query(
    `SELECT ct.id, ct.template_name, COALESCE(r.room_name, '—') AS room_name
     FROM checklist_templates ct
     LEFT JOIN rooms r ON r.id = ct.room_id
     WHERE ct.company_id = ? AND COALESCE(ct.status, 'active') != 'inactive'
     ORDER BY ct.template_name`,
    [companyId]
  );
  const notSubmittedRows = activeTemplates
    .filter(t => !submittedTplIds.has(t.id))
    .map(t => ({ id: null, template_id: t.id, template_name: t.template_name, room_name: t.room_name, status: 'not_submitted', submitted_by: null, submitted_at: null }));
  const allChecklistRows = [...todaySubmissions, ...notSubmittedRows];
  const [softReqs] = await pool.query(
    `SELECT ssr.id, ssr.status, ssr.raised_at, l.name AS location_name, cu.full_name AS raised_by
     FROM soft_service_requests ssr LEFT JOIN locations l ON l.id = ssr.location_id
     LEFT JOIN company_users cu ON cu.id = ssr.raised_by_user_id
     WHERE ssr.company_id = ? AND ssr.status NOT IN ('closed','resolved')
     ORDER BY ssr.raised_at DESC NULLS LAST LIMIT 10`,
    [companyId]
  );
  const [notifications] = await pool.query(
    `SELECT title, message, created_at, type FROM notifications WHERE company_id = ? AND created_at::date = CURRENT_DATE ORDER BY created_at DESC LIMIT 6`,
    [companyId]
  ).catch(() => [[]]);

  const filledToday     = Number(dashRow?.filled_today    ?? 0);
  const totalTemplates  = Number(dashRow?.total_templates ?? 0);
  const pendingToday    = Math.max(0, totalTemplates - filledToday);
  const siteScorePct    = totalTemplates > 0 ? Math.round((filledToday / totalTemplates) * 100) : 0;
  const activeLocations = Number(dashRow?.active_locations ?? 0);
  const openSoft        = Number(dashRow?.open_soft ?? 0);
  const companyName     = co?.company_name ?? "Company";

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
    const nowDate   = new Date();
    const timeStr   = nowDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const dateShort = nowDate.toLocaleDateString("en-GB");
    const dateLong  = nowDate.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    // Blue header
    doc.rect(0, 0, W, 56).fill(BLUE);
    doc.fillColor("#fff").fontSize(8).font("Helvetica")
       .text(dateShort + ", " + timeStr, M, 10)
       .text("FM App", W - M - 40, 10, { width: 40, align: "right" });
    doc.fillColor("#fff").fontSize(18).font("Helvetica-Bold")
       .text("Welcome back, " + companyName, M, 22);
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
    doc.fillColor(GRAY).fontSize(7).font("Helvetica").text(filledToday + " of " + totalTemplates + " checklists filled today", M + 10, y + 46, { width: cardW - 20 });
    // Card 4: Total Filled Checklists
    doc.roundedRect(c2x, y, cardW, 58, 6).fillAndStroke("#fff", "#e2e8f0");
    doc.fillColor(LGRAY).fontSize(7).font("Helvetica").text("TOTAL FILLED CHECKLISTS", c2x + 10, y + 8, { width: cardW - 20 });
    doc.fillColor(DARK).fontSize(26).font("Helvetica-Bold").text(String(filledToday), c2x + 10, y + 17, { width: cardW - 20 });
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
      { dot: GREEN,     label: "Filled Checklists",  val: String(filledToday),  pct: totalTemplates > 0 ? Math.round((filledToday / totalTemplates) * 100) + "%" : "0%" },
      { dot: "#bbf7d0", label: "Pending Checklists", val: String(pendingToday), pct: totalTemplates > 0 ? Math.round((pendingToday / totalTemplates) * 100) + "%" : "0%" },
      { dot: BLUE,      label: "Site Score",         val: siteScorePct + "%",   pct: filledToday + "/" + totalTemplates },
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

    // Notifications
    if (Array.isArray(notifications) && notifications.length > 0) {
      const notifH = Math.min(notifications.length, 5) * 30 + 32;
      if (y + notifH > H - 40) { doc.addPage(); y = 32; }
      doc.roundedRect(M, y, IW, notifH, 6).fillAndStroke("#fff", "#e2e8f0");
      doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Notifications", M + 12, y + 10);
      doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Latest alerts & reminders", W - M - 140, y + 12, { width: 140, align: "right" });
      let ny = y + 32;
      for (const n of notifications.slice(0, 5)) {
        const dotCol = n.type === "checklist_reminder" ? "#d97706" : BLUE;
        doc.circle(M + 15, ny + 5, 3).fill(dotCol);
        doc.fillColor(dotCol).fontSize(7).font("Helvetica-Bold").text(n.type === "checklist_reminder" ? "Checklist" : "Alert", M + 22, ny, { width: 50 });
        doc.fillColor(DARK).fontSize(8).font("Helvetica-Bold").text(n.title ?? "-", M + 75, ny, { width: IW - 120, ellipsis: true });
        doc.fillColor(LGRAY).fontSize(7).text(n.created_at ? new Date(n.created_at).toLocaleDateString("en-GB") : "", W - M - 44, ny, { width: 44, align: "right" });
        doc.fillColor(LGRAY).fontSize(7.5).font("Helvetica").text(n.message ?? "", M + 22, ny + 13, { width: IW - 52, ellipsis: true });
        ny += 30;
      }
      y += notifH + 10;
    }

    // ── Site Score Overview (last 7 days bar chart) ──────────────────────────
    if (Array.isArray(siteScoreRows) && siteScoreRows.length > 0) {
      const chartH = 90;
      const chartPad = 12;
      const sectionH = chartH + 46;
      if (y + sectionH > H - 40) { doc.addPage(); y = 32; }
      doc.roundedRect(M, y, IW, sectionH, 6).fillAndStroke("#fff", "#e2e8f0");
      doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Site Score Overview", M + 12, y + 10);
      doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text("Today \u2014 Daily checklist completion rate", M + 12, y + 24);
      const barAreaX = M + chartPad + 28;
      const barAreaW = IW - chartPad * 2 - 28;
      const barAreaY = y + 38;
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

    // Recent Submissions table — matches dashboard: today's submissions + not-yet-submitted templates
    if (allChecklistRows.length > 0) {
      if (y + 80 > H - 40) { doc.addPage(); y = 32; }
      doc.fillColor(BLUE).fontSize(12).font("Helvetica-Bold").text("Recent Submissions", M, y);
      doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text(dateShort, M + doc.widthOfString("Recent Submissions") + 8, y + 2);
      y += 18;
      const cols = [
        { x: M + 2,   w: 18,  t: "#" },
        { x: M + 24,  w: 145, t: "Template" },
        { x: M + 173, w: 100, t: "Room" },
        { x: M + 277, w: 60,  t: "Status" },
        { x: M + 341, w: 100, t: "Filled By" },
        { x: M + 445, w: 80,  t: "Submitted" },
      ];
      doc.rect(M, y, IW, 18).fill("#EFF6FF");
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(7.5);
      for (const col of cols) doc.text(col.t, col.x, y + 5, { width: col.w });
      y += 20;
      const statusColor = (st) => {
        if (!st || st === "not_submitted" || st === "rejected" || st === "overdue") return "#dc2626";
        if (st === "submitted" || st === "approved") return GREEN;
        if (st === "pending") return "#d97706";
        return GRAY;
      };
      const statusLabel = (st) => {
        if (st === "not_submitted") return "Not Submitted";
        return st ? st.charAt(0).toUpperCase() + st.slice(1) : "—";
      };
      for (let i = 0; i < allChecklistRows.length; i++) {
        if (y > H - 50) { doc.addPage(); y = 32; }
        const s = allChecklistRows[i];
        doc.rect(M, y, IW, 16).fill(i % 2 === 0 ? LBG : "#fff");
        doc.fillColor(DARK).font("Helvetica").fontSize(7.5);
        doc.text(String(i + 1), cols[0].x, y + 3, { width: cols[0].w });
        doc.text(s.template_name ?? "-", cols[1].x, y + 3, { width: cols[1].w, ellipsis: true });
        doc.text(s.room_name ?? "—", cols[2].x, y + 3, { width: cols[2].w, ellipsis: true });
        doc.fillColor(statusColor(s.status)).text(statusLabel(s.status), cols[3].x, y + 3, { width: cols[3].w, ellipsis: true });
        doc.fillColor(s.submitted_by ? DARK : LGRAY).text(s.submitted_by ?? "—", cols[4].x, y + 3, { width: cols[4].w, ellipsis: true });
        doc.fillColor(DARK).text(s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB") : "—", cols[5].x, y + 3, { width: cols[5].w });
        y += 17;
      }
    }

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
  const dateLong = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const defaultSubject = `Daily Site Report - ${companyName} - ${new Date().toLocaleDateString("en-GB")}`;
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
    from: `"FM App - ${companyName}" <${process.env.MAIL_USER}>`,
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
      hint = "Gmail rejected the password. MAIL_PASS must be a Gmail App Password (16-char code), " +
             "NOT your regular account password. " +
             "Go to myaccount.google.com \u2192 Security \u2192 2-Step Verification \u2192 App Passwords \u2192 Generate.";
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

