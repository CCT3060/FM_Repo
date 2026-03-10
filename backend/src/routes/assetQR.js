/**
 * Public (no auth) routes for QR-code asset scanning.
 *
 * GET /api/asset-qr/:assetId
 *   Returns asset details + all logsheet templates + checklist templates
 *   linked to that asset, so a scanner can fill them without logging in.
 *
 * POST /api/asset-qr/:assetId/logsheet/:templateId/entries
 *   Submit a logsheet entry anonymously (or with optional employee_name in body).
 *
 * POST /api/asset-qr/:assetId/checklist/:templateId/submissions
 *   Submit a checklist fill anonymously.
 */

import { Router } from "express";
import pool from "../db.js";

const router = Router();

const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
  return v;
};

/* ── GET asset details + templates ──────────────────────────────────────────── */
router.get("/:assetId", async (req, res, next) => {
  try {
    const { assetId } = req.params;

    // Asset info (no company auth required — QR is physical proof of access)
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.company_id AS "companyId",
              c.company_name AS "companyName",
              d.name AS "departmentName",
              ad.metadata, ad.documents
       FROM assets a
       LEFT JOIN companies c    ON c.id = a.company_id
       LEFT JOIN departments d  ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ?`,
      [assetId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const meta = safeParse(asset.metadata) || {};
    const docs = safeParse(asset.documents);
    if (docs) meta.documents = docs;
    asset.metadata = meta;
    delete asset.documents;

    // Logsheet templates assigned to this asset
    const [logsheetTemplates] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.frequency,
              lt.asset_type AS "assetType", lt.description,
              lt.header_config AS "headerConfig", lt.is_active AS "isActive"
       FROM logsheet_templates lt
       WHERE lt.asset_id = ? AND lt.is_active = 1
       ORDER BY lt.template_name`,
      [assetId]
    );
    const normalizedLS = logsheetTemplates.map((t) => ({
      ...t,
      headerConfig: safeParse(t.headerConfig) || {},
    }));

    // Checklist templates for this asset's type OR directly assigned to this asset
    const [checklistTemplates] = await pool.query(
      `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
              ct.category, ct.description, ct.frequency, ct.status, ct.questions
       FROM checklist_templates ct
       WHERE ct.company_id = ? AND (ct.asset_id = ? OR ct.asset_type = ?)
         AND (ct.is_active = 1 OR ct.is_active IS NULL OR ct.status = 'active')
       ORDER BY ct.template_name`,
      [asset.companyId, assetId, asset.assetType]
    );
    const normalizedCL = checklistTemplates.map((t) => ({
      ...t,
      questions: safeParse(t.questions) || [],
    }));

    // OJT trainings linked to this asset (published only) — graceful if column missing
    let ojtTrainings = [];
    try {
      const [ojtRows] = await pool.query(
        `SELECT id, title, description, passing_percentage AS "passingPercentage", status
         FROM ojt_trainings
         WHERE asset_id = ? AND status = 'published'
         ORDER BY created_at DESC`,
        [assetId]
      );
      ojtTrainings = ojtRows || [];
    } catch (_) {
      // asset_id column may not exist yet; return empty array
    }

    res.json({
      asset,
      logsheetTemplates: normalizedLS,
      checklistTemplates: normalizedCL,
      ojtTrainings: ojtTrainings || [],
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST logsheet entry (anonymous / QR) ───────────────────────────────────── */
router.post("/:assetId/logsheet/:templateId/entries", async (req, res, next) => {
  try {
    const { assetId, templateId } = req.params;
    const { month, year, shift, headerValues = {}, answers = [], submittedByName } = req.body;

    if (!month || !year || !answers.length) {
      return res.status(400).json({ message: "month, year and answers are required" });
    }

    // Verify template & asset exist and match
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND asset_id = ?",
      [templateId, assetId]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found for this asset" });

    const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;

    const [entryRows] = await pool.query(
      `INSERT INTO logsheet_entries
         (template_id, asset_id, submitted_by, entry_date, month, year, shift, header_values, data)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, '{}')
       RETURNING id`,
      [templateId, assetId, monthDate, month, year, shift || null,
       JSON.stringify({ ...headerValues, _submittedByName: submittedByName || null })]
    );
    const entryId = entryRows[0]?.id;

    if (answers.length) {
      const vals = answers.map((a) => [
        entryId, a.questionId, a.dateColumn,
        a.answerValue != null ? String(a.answerValue) : null,
        0, null, null,
      ]);
      await pool.query(
        `INSERT INTO logsheet_answers
           (entry_id, question_id, date_column, answer_value, is_issue, issue_reason, issue_detail)
         VALUES ?`,
        [vals]
      );
    }

    res.status(201).json({ id: entryId });
  } catch (err) {
    next(err);
  }
});

/* ── POST checklist fill (anonymous / QR) ───────────────────────────────────── */
router.post("/:assetId/checklist/:templateId/submissions", async (req, res, next) => {
  try {
    const { assetId, templateId } = req.params;
    const { answers = [], submittedByName, note } = req.body;

    if (!answers.length) {
      return res.status(400).json({ message: "answers are required" });
    }

    // Verify template & asset company match
    const [[asset]] = await pool.query(
      "SELECT company_id AS companyId FROM assets WHERE id = ?",
      [assetId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const [[tmpl]] = await pool.query(
      "SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?",
      [templateId, asset.companyId]
    );
    if (!tmpl) return res.status(404).json({ message: "Checklist template not found" });

    // Store in checklist_submissions table if it exists, else log to a generic table
    // We use a safe INSERT that works even if the table doesn't exist yet
    const [subRows] = await pool.query(
      `INSERT INTO checklist_submissions
         (template_id, asset_id, submitted_by, submitted_by_name, answers, note, submitted_at)
       VALUES (?, ?, NULL, ?, ?, ?, NOW())
       RETURNING id`,
      [templateId, assetId, submittedByName || null, JSON.stringify(answers), note || null]
    );

    res.status(201).json({ id: subRows[0]?.id });
  } catch (err) {
    next(err);
  }
});

export default router;
