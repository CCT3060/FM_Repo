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
  const [[co]] = await pool.query(
    "SELECT company_name FROM companies WHERE id = ?",
    [companyId]
  );
  const [[dashRow]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM assets WHERE company_id = ?) AS total_assets,
       (SELECT COUNT(*) FROM assets WHERE company_id = ? AND status = 'Active') AS active_assets,
       (SELECT COUNT(*) FROM work_orders WHERE company_id = ? AND status NOT IN ('closed','completed','cancelled')) AS open_requests,
       (SELECT COUNT(*) FROM soft_service_requests WHERE company_id = ? AND status NOT IN ('closed','resolved')) AS open_soft,
       (SELECT COUNT(*) FROM checklist_submissions cs JOIN checklist_templates ct ON ct.id=cs.template_id WHERE ct.company_id = ? AND cs.submitted_at >= CURRENT_DATE) AS filled_today,
       (SELECT COUNT(*) FROM checklist_templates WHERE company_id = ? AND is_active=1) AS total_templates,
       (SELECT COUNT(*) FROM checklist_submissions cs2 JOIN checklist_templates ct2 ON ct2.id=cs2.template_id WHERE ct2.company_id = ? AND cs2.submitted_at >= CURRENT_DATE) AS checklists_filled_today,
       (SELECT COUNT(*) FROM checklist_templates WHERE company_id = ? AND is_active=1) AS total_active_templates`,
    [companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId]
  );

  const [submissions] = await pool.query(
    `SELECT cs.id, ct.template_name, cu.full_name AS submitted_by, cs.status, cs.submitted_at
     FROM checklist_submissions cs
     JOIN checklist_templates ct ON ct.id = cs.template_id
     LEFT JOIN company_users cu ON cu.id = cs.company_user_id
     WHERE ct.company_id = ?
     ORDER BY cs.submitted_at DESC NULLS LAST
     LIMIT 20`,
    [companyId]
  );

  const [workOrders] = await pool.query(
    `SELECT wo.id, wo.issue_description AS title, wo.priority, wo.status, wo.created_at,
            cu.full_name AS assigned_to
     FROM work_orders wo
     LEFT JOIN company_users cu ON cu.id = wo.assigned_to
     WHERE wo.company_id = ? AND wo.status NOT IN ('closed','completed','cancelled')
     ORDER BY wo.created_at DESC NULLS LAST
     LIMIT 10`,
    [companyId]
  );

  const [softReqs] = await pool.query(
    `SELECT ssr.id, ssr.status, ssr.raised_at,
            l.name AS location_name,
            cu.full_name AS raised_by
     FROM soft_service_requests ssr
     LEFT JOIN locations l ON l.id = ssr.location_id
     LEFT JOIN company_users cu ON cu.id = ssr.raised_by_user_id
     WHERE ssr.company_id = ? AND ssr.status NOT IN ('closed','resolved')
     ORDER BY ssr.raised_at DESC NULLS LAST
     LIMIT 10`,
    [companyId]
  );

  const filledToday   = Number(dashRow?.checklists_filled_today ?? dashRow?.filled_today ?? 0);
  const totalTemplates= Number(dashRow?.total_active_templates  ?? dashRow?.total_templates ?? 0);
  const siteScorePct  = totalTemplates > 0 ? Math.round((filledToday / totalTemplates) * 100) : 0;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W    = doc.page.width;   // 595
    const H    = doc.page.height;  // 842
    const BLUE = "#2563EB";
    const DARK = "#0f172a";
    const GRAY = "#64748B";
    const LGRAY= "#94a3b8";
    const LBG  = "#F8FAFC";
    const M    = 32; // left/right margin
    const IW   = W - M * 2; // inner width
    const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const companyName = co?.company_name ?? "Company";

    /* â”€ Header bar â”€ */
    doc.rect(0, 0, W, 68).fill(BLUE);
    doc.fillColor("#fff").fontSize(20).font("Helvetica-Bold").text("FM Dashboard Report", M, 16);
    doc.fontSize(10).font("Helvetica").fillColor("#bfdbfe")
       .text(`${companyName}  â€”  ${date}`, M, 42);

    let y = 84;

    /* â”€ Stat cards row (3 wide + 3 wide) â”€ */
    const stats = [
      { label: "Total Assets",           val: dashRow?.total_assets ?? 0 },
      { label: "Active Assets",          val: dashRow?.active_assets ?? 0 },
      { label: "Open Work Orders",       val: dashRow?.open_requests ?? 0 },
      { label: "Open Soft Requests",     val: dashRow?.open_soft ?? 0 },
      { label: "Checklists Filled Today",val: filledToday },
      { label: "Total Active Templates", val: totalTemplates },
    ];
    const cardW = (IW - 10 * 2) / 3;
    const cardH = 52;
    for (let i = 0; i < stats.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx  = M + col * (cardW + 10);
      const cy  = y + row * (cardH + 8);
      doc.roundedRect(cx, cy, cardW, cardH, 6).fillAndStroke("#fff", "#e2e8f0");
      doc.fillColor(LGRAY).fontSize(8).font("Helvetica").text(stats[i].label.toUpperCase(), cx + 10, cy + 8, { width: cardW - 20 });
      doc.fillColor(BLUE).fontSize(22).font("Helvetica-Bold").text(String(stats[i].val), cx + 10, cy + 20, { width: cardW - 20 });
    }
    y += 2 * (cardH + 8) + 16;

    /* â”€ Site Score bar â”€ */
    doc.roundedRect(M, y, IW, 44, 6).fillAndStroke(LBG, "#e2e8f0");
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Today's Site Score", M + 12, y + 8);
    doc.fillColor(BLUE).fontSize(20).font("Helvetica-Bold").text(`${siteScorePct}%`, M + 12, y + 22);
    const barX = M + 130, barY = y + 19, barW = IW - 150, barH = 12;
    doc.roundedRect(barX, barY, barW, barH, 4).fill("#e2e8f0");
    const fillW = Math.max(0, Math.min(barW, Math.round((siteScorePct / 100) * barW)));
    if (fillW > 0) doc.roundedRect(barX, barY, fillW, barH, 4).fill("#16a34a");
    doc.fillColor(GRAY).fontSize(9).font("Helvetica")
       .text(`${filledToday} of ${totalTemplates} templates filled`, M + 12, y + 30);
    y += 60;

    /* â”€ Recent Submissions â”€ */
    doc.fillColor(BLUE).fontSize(13).font("Helvetica-Bold").text("Recent Checklist Submissions", M, y);
    y += 18;
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(BLUE).lineWidth(1).stroke();
    y += 6;

    // Table header
    doc.rect(M, y, IW, 18).fill("#EFF6FF");
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8);
    const cols = [{ x: M+4, w: 28, t:"ID" }, { x: M+36, w: 200, t:"Template" }, { x: M+240, w: 130, t:"Submitted By" }, { x: M+374, w: 60, t:"Status" }, { x: M+438, w: 90, t:"Date" }];
    for (const c of cols) doc.text(c.t, c.x, y + 4, { width: c.w });
    y += 20;

    for (let i = 0; i < submissions.length; i++) {
      if (y > H - 90) { doc.addPage(); y = 40; }
      const s = submissions[i];
      doc.rect(M, y, IW, 16).fill(i % 2 === 0 ? LBG : "#fff");
      doc.fillColor(DARK).font("Helvetica").fontSize(7.5);
      doc.text(String(s.id), cols[0].x, y + 3, { width: cols[0].w });
      doc.text(s.template_name ?? "â€”", cols[1].x, y + 3, { width: cols[1].w, ellipsis: true });
      doc.text(s.submitted_by ?? "â€”", cols[2].x, y + 3, { width: cols[2].w, ellipsis: true });
      const stColor = s.status === "submitted" ? "#16a34a" : GRAY;
      doc.fillColor(stColor).text(s.status ?? "â€”", cols[3].x, y + 3, { width: cols[3].w });
      doc.fillColor(DARK).text(s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB") : "â€”", cols[4].x, y + 3, { width: cols[4].w });
      y += 17;
    }
    y += 12;

    /* â”€ Open Work Orders â”€ */
    if (workOrders.length > 0) {
      if (y > H - 120) { doc.addPage(); y = 40; }
      doc.fillColor(BLUE).fontSize(13).font("Helvetica-Bold").text("Open Work Orders", M, y);
      y += 18;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor(BLUE).lineWidth(1).stroke();
      y += 6;
      doc.rect(M, y, IW, 18).fill("#EFF6FF");
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8);
      const woCols = [{ x: M+4, w: 30, t:"ID" }, { x: M+38, w: 200, t:"Title" }, { x: M+242, w: 80, t:"Priority" }, { x: M+326, w: 80, t:"Status" }, { x: M+410, w: 120, t:"Assigned To" }];
      for (const c of woCols) doc.text(c.t, c.x, y + 4, { width: c.w });
      y += 20;
      for (let i = 0; i < workOrders.length; i++) {
        if (y > H - 90) { doc.addPage(); y = 40; }
        const wo = workOrders[i];
        doc.rect(M, y, IW, 16).fill(i % 2 === 0 ? LBG : "#fff");
        doc.fillColor(DARK).font("Helvetica").fontSize(7.5);
        doc.text(String(wo.id), woCols[0].x, y + 3, { width: woCols[0].w });
        doc.text(wo.title ?? "â€”", woCols[1].x, y + 3, { width: woCols[1].w, ellipsis: true });
        const priColor = { critical:"#dc2626", high:"#ea580c", medium:"#ca8a04", low:"#16a34a" }[wo.priority] || GRAY;
        doc.fillColor(priColor).text(wo.priority ?? "â€”", woCols[2].x, y + 3, { width: woCols[2].w });
        doc.fillColor(DARK).text(wo.status ?? "â€”", woCols[3].x, y + 3, { width: woCols[3].w });
        doc.text(wo.assigned_to ?? "Unassigned", woCols[4].x, y + 3, { width: woCols[4].w, ellipsis: true });
        y += 17;
      }
      y += 12;
    }

    /* â”€ Open Soft Requests â”€ */
    if (softReqs.length > 0) {
      if (y > H - 120) { doc.addPage(); y = 40; }
      doc.fillColor(BLUE).fontSize(13).font("Helvetica-Bold").text("Open Soft Service Requests", M, y);
      y += 18;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor(BLUE).lineWidth(1).stroke();
      y += 6;
      doc.rect(M, y, IW, 18).fill("#EFF6FF");
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8);
      const srCols = [{ x: M+4, w: 30, t:"ID" }, { x: M+38, w: 180, t:"Location" }, { x: M+222, w: 130, t:"Raised By" }, { x: M+356, w: 70, t:"Status" }, { x: M+430, w: 100, t:"Date" }];
      for (const c of srCols) doc.text(c.t, c.x, y + 4, { width: c.w });
      y += 20;
      for (let i = 0; i < softReqs.length; i++) {
        if (y > H - 90) { doc.addPage(); y = 40; }
        const sr = softReqs[i];
        doc.rect(M, y, IW, 16).fill(i % 2 === 0 ? LBG : "#fff");
        doc.fillColor(DARK).font("Helvetica").fontSize(7.5);
        doc.text(String(sr.id), srCols[0].x, y + 3, { width: srCols[0].w });
        doc.text(sr.location_name ?? "â€”", srCols[1].x, y + 3, { width: srCols[1].w, ellipsis: true });
        doc.text(sr.raised_by ?? "â€”", srCols[2].x, y + 3, { width: srCols[2].w, ellipsis: true });
        doc.fillColor("#7c3aed").text(sr.status ?? "â€”", srCols[3].x, y + 3, { width: srCols[3].w });
        doc.fillColor(DARK).text(sr.raised_at ? new Date(sr.raised_at).toLocaleDateString("en-GB") : "â€”", srCols[4].x, y + 3, { width: srCols[4].w });
        y += 17;
      }
    }

    /* â”€ Footer â”€ */
    doc.fillColor(LGRAY).fontSize(8).font("Helvetica")
       .text(`Generated by FM App â€” ${new Date().toLocaleString("en-IN")}`, M, H - 28, { align: "center", width: IW });

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

  await transporter.sendMail({
    from: `"FM App â€” ${co?.company_name ?? "Catalyst FM"}" <${process.env.MAIL_USER}>`,
    to: recipients.join(", "),
    subject: `[FM Report] ${config.frequency.charAt(0).toUpperCase() + config.frequency.slice(1)} Dashboard Report â€” ${dateStr}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#2563EB;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">FM Dashboard Report</h2>
          <p style="color:#bfdbfe;margin:6px 0 0">${co?.company_name ?? ""} â€” ${new Date().toLocaleDateString("en-GB", { day:"2-digit",month:"long",year:"numeric" })}</p>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="color:#334155">Please find the <strong>${config.frequency}</strong> dashboard report attached in the following format(s): <strong>${formats.join(", ").toUpperCase()}</strong>.</p>
          <p style="color:#64748b;font-size:13px">This is an automated report from FM App. To update or cancel this schedule, visit your Company Portal â†’ Dashboard â†’ Schedule Mail.</p>
        </div>
      </div>
    `,
    attachments,
  });

  // Update last_sent_at and next_send_at
  const cfg = config.schedule_config ? (typeof config.schedule_config === "string" ? JSON.parse(config.schedule_config) : config.schedule_config) : {};
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
    const [rows] = await pool.query(
      `SELECT * FROM scheduled_report_configs WHERE company_id = ? ORDER BY created_at DESC`,
      [cid(req)]
    );
    res.json(rows.map((r) => ({
      ...r,
      recipients:      JSON.parse(r.recipients      || "[]"),
      formats:         JSON.parse(r.formats         || "[]"),
      schedule_config: JSON.parse(r.schedule_config || "{}"),
    })));
  } catch (err) { next(err); }
});

/* â”€â”€ POST /scheduled-reports â€” create new schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
router.post("/", async (req, res, next) => {
  try {
    const { frequency, scheduledDay, sendTime, recipients, formats, scheduleConfig } = req.body;

    if (!frequency || !sendTime || !recipients?.length || !formats?.length) {
      return res.status(400).json({ message: "frequency, sendTime, recipients and formats are required" });
    }

    const cfg = scheduleConfig || {};
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
    const { frequency, scheduledDay, sendTime, recipients, formats, isActive, scheduleConfig } = req.body;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const cfg = scheduleConfig || {};
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

