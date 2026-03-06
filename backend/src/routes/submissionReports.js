/**
 * submissionReports.js
 * ──────────────────────────────────────────────────────────────────────────
 * Read-only submission list + detail + filter-meta routes.
 * Accepts BOTH a company-user JWT (cp_token) AND a main-platform JWT.
 *
 * Registered in app.js BEFORE templateAssignmentsRouter.
 *
 * companyId is sourced from:
 *   1. JWT payload (cp_token)   → req.companyUser.companyId
 *   2. Query param              → ?companyId=N  (for main platform admin)
 *
 * Advanced filters: dateFrom, dateTo, period, templateId, assetId,
 *                   status, shift, submittedBy, search
 */

import { Router }     from "express";
import { param }      from "express-validator";
import pool            from "../db.js";
import { validate }    from "../validators.js";
import { flexCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();

// helpers
const flexCid = (req) =>
  req.companyUser?.companyId || (req.query.companyId ? parseInt(req.query.companyId, 10) : null);

/*──────────────────────────────────────────────────────────────────────────────
  FILTER META  GET /submissions/filters/:type
  Returns distinct templates, employees, assets and shifts for UI dropdowns.
──────────────────────────────────────────────────────────────────────────────*/
router.get(
  "/submissions/filters/:type",
  flexCompanyAuth,
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { type } = req.params;
      if (!["checklists", "logsheets"].includes(type))
        return res.status(400).json({ message: "type must be checklists or logsheets" });

      if (type === "checklists") {
        const [templates] = await pool.query(
          `SELECT id, template_name AS "templateName"
           FROM checklist_templates WHERE company_id = ?
           ORDER BY template_name`,
          [companyId]
        );
        const [employees] = await pool.query(
          `SELECT id, full_name AS "fullName"
           FROM company_users
           WHERE company_id = ? AND full_name IS NOT NULL
           ORDER BY full_name`,
          [companyId]
        );
        const [assets] = await pool.query(
          `SELECT id, asset_name AS "assetName"
           FROM assets
           WHERE company_id = ?
           ORDER BY asset_name`,
          [companyId]
        );
        return res.json({ templates, employees, assets, shifts: [] });
      }

      // logsheets
      const [templates] = await pool.query(
        `SELECT id, template_name AS "templateName"
         FROM logsheet_templates WHERE company_id = ?
         ORDER BY template_name`,
        [companyId]
      );
      const [employees] = await pool.query(
        `SELECT id, full_name AS "fullName"
         FROM company_users
         WHERE company_id = ? AND full_name IS NOT NULL
         ORDER BY full_name`,
        [companyId]
      );
      const [assets] = await pool.query(
        `SELECT id, asset_name AS "assetName"
         FROM assets
         WHERE company_id = ?
         ORDER BY asset_name`,
        [companyId]
      );
      const [shiftRows] = await pool.query(
        `SELECT DISTINCT le.shift
         FROM logsheet_entries le
         INNER JOIN logsheet_templates lt ON lt.id = le.template_id
         WHERE lt.company_id = ? AND le.shift IS NOT NULL AND le.shift <> ''
         ORDER BY le.shift`,
        [companyId]
      );
      res.json({ templates, employees, assets, shifts: shiftRows.map((r) => r.shift) });
    } catch (err) { next(err); }
  }
);

/*──────────────────────────────────────────────────────────────────────────────
  GET /submissions/checklists
──────────────────────────────────────────────────────────────────────────────*/
router.get(
  "/submissions/checklists",
  flexCompanyAuth,
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { dateFrom, dateTo, period, templateId, assetId, status, submittedBy, search } = req.query;
      const conditions = ["ct.company_id = ?"];
      const params     = [companyId];

      if (period === "week") {
        conditions.push("cs.submitted_at >= NOW() - INTERVAL '7 days'");
      } else if (period === "month") {
        conditions.push("DATE_TRUNC('month', cs.submitted_at) = DATE_TRUNC('month', NOW())");
      } else if (period === "year") {
        conditions.push("DATE_TRUNC('year', cs.submitted_at) = DATE_TRUNC('year', NOW())");
      }
      if (dateFrom) { conditions.push("cs.submitted_at >= ?");  params.push(dateFrom); }
      if (dateTo)   { conditions.push("cs.submitted_at <= ?");  params.push(dateTo + " 23:59:59"); }
      if (templateId && !isNaN(Number(templateId))) { conditions.push("cs.template_id = ?");  params.push(Number(templateId)); }
      if (assetId    && !isNaN(Number(assetId)))    { conditions.push("cs.asset_id = ?");     params.push(Number(assetId)); }
      if (status)      { conditions.push("LOWER(cs.status) = LOWER(?)");  params.push(status); }
      if (submittedBy) { conditions.push("cu.full_name ILIKE ?");          params.push(`%${submittedBy}%`); }
      if (search) {
        conditions.push("(ct.template_name ILIKE ? OR a.asset_name ILIKE ? OR cu.full_name ILIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const [rows] = await pool.query(
        `SELECT
           cs.id,
           cs.template_id          AS "templateId",
           ct.template_name        AS "templateName",
           cs.asset_id             AS "assetId",
           a.asset_name            AS "assetName",
           cs.status,
           cs.submitted_at         AS "submittedAt",
           cu.full_name            AS "submittedBy",
           cu.id                   AS "submittedById"
         FROM checklist_submissions cs
         JOIN checklist_templates ct ON cs.template_id = ct.id
         LEFT JOIN assets a          ON a.id = cs.asset_id
         LEFT JOIN company_users cu  ON cu.id = cs.company_user_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY cs.submitted_at DESC NULLS LAST
         LIMIT 1000`,
        params
      );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

/*──────────────────────────────────────────────────────────────────────────────
  GET /submissions/logsheets
──────────────────────────────────────────────────────────────────────────────*/
router.get(
  "/submissions/logsheets",
  flexCompanyAuth,
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { dateFrom, dateTo, period, templateId, assetId, status, shift, submittedBy, search } = req.query;
      const conditions = ["lt.company_id = ?"];
      const params     = [companyId];
      const dateExpr   = "COALESCE(le.submitted_at, le.entry_date)";

      if (period === "week") {
        conditions.push(`${dateExpr} >= NOW() - INTERVAL '7 days'`);
      } else if (period === "month") {
        conditions.push("le.month = EXTRACT(MONTH FROM NOW()) AND le.year = EXTRACT(YEAR FROM NOW())");
      } else if (period === "year") {
        conditions.push("le.year = EXTRACT(YEAR FROM NOW())");
      }
      if (dateFrom) { conditions.push(`${dateExpr} >= ?`); params.push(dateFrom); }
      if (dateTo)   { conditions.push(`${dateExpr} <= ?`); params.push(dateTo + " 23:59:59"); }
      if (templateId && !isNaN(Number(templateId))) { conditions.push("le.template_id = ?"); params.push(Number(templateId)); }
      if (assetId    && !isNaN(Number(assetId)))    { conditions.push("le.asset_id = ?");    params.push(Number(assetId)); }
      if (status)      { conditions.push("LOWER(le.status) = LOWER(?)"); params.push(status); }
      if (shift)       { conditions.push("le.shift = ?");                params.push(shift); }
      if (submittedBy) { conditions.push("cu.full_name ILIKE ?");        params.push(`%${submittedBy}%`); }
      if (search) {
        conditions.push("(lt.template_name ILIKE ? OR a.asset_name ILIKE ? OR cu.full_name ILIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const [rows] = await pool.query(
        `SELECT
           le.id,
           le.template_id               AS "templateId",
           lt.template_name             AS "templateName",
           lt.layout_type               AS "layoutType",
           le.asset_id                  AS "assetId",
           a.asset_name                 AS "assetName",
           le.status,
           COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
           le.shift,
           le.month,
           le.year,
           cu.full_name                 AS "submittedBy",
           cu.id                        AS "submittedById"
         FROM logsheet_entries le
         JOIN logsheet_templates lt      ON lt.id = le.template_id
         LEFT JOIN assets a              ON a.id = le.asset_id
         LEFT JOIN company_users cu      ON cu.id = le.company_user_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY COALESCE(le.submitted_at, le.entry_date) DESC NULLS LAST
         LIMIT 1000`,
        params
      );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

/*──────────────────────────────────────────────────────────────────────────────
  GET /submissions/checklists/:id
──────────────────────────────────────────────────────────────────────────────*/
router.get(
  "/submissions/checklists/:id",
  flexCompanyAuth,
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { id } = req.params;
      const [[submission]] = await pool.query(
        `SELECT
           cs.id,
           cs.template_id       AS "templateId",
           ct.template_name     AS "templateName",
           cs.asset_id          AS "assetId",
           a.asset_name         AS "assetName",
           cs.status,
           cs.submitted_at      AS "submittedAt",
           cu.full_name         AS "submittedBy"
         FROM checklist_submissions cs
         JOIN checklist_templates ct  ON ct.id = cs.template_id
         LEFT JOIN assets a           ON a.id  = cs.asset_id
         LEFT JOIN company_users cu   ON cu.id = cs.company_user_id
         WHERE cs.id = ? AND ct.company_id = ?`,
        [id, companyId]
      );
      if (!submission) return res.status(404).json({ message: "Submission not found" });

      const [answers] = await pool.query(
        `SELECT
           csa.id,
           csa.question_text   AS "questionText",
           csa.input_type      AS "answerType",
           csa.answer_json     AS "answerJson",
           csa.option_selected AS "answerValue"
         FROM checklist_submission_answers csa
         WHERE csa.submission_id = ?
         ORDER BY csa.id ASC`,
        [id]
      );
      res.json({ ...submission, answers });
    } catch (err) { next(err); }
  }
);

/*──────────────────────────────────────────────────────────────────────────────
  GET /submissions/logsheets/:id
──────────────────────────────────────────────────────────────────────────────*/
router.get(
  "/submissions/logsheets/:id",
  flexCompanyAuth,
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { id } = req.params;
      const [[submission]] = await pool.query(
        `SELECT
           le.id,
           le.template_id              AS "templateId",
           lt.template_name            AS "templateName",
           lt.layout_type              AS "layoutType",
           le.asset_id                 AS "assetId",
           a.asset_name                AS "assetName",
           le.status,
           le.shift,
           le.month,
           le.year,
           COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
           le.data,
           le.header_values            AS "headerValues",
           cu.full_name                AS "submittedBy"
         FROM logsheet_entries le
         JOIN logsheet_templates lt     ON lt.id = le.template_id
         LEFT JOIN assets a             ON a.id  = le.asset_id
         LEFT JOIN company_users cu     ON cu.id = le.company_user_id
         WHERE le.id = ? AND lt.company_id = ?`,
        [id, companyId]
      );
      if (!submission) return res.status(404).json({ message: "Entry not found" });

      const [answers] = await pool.query(
        `SELECT
           la.id,
           la.question_id     AS "questionId",
           lq.question_text   AS "questionText",
           lq.answer_type     AS "answerType",
           la.answer_value    AS "answerValue",
           la.date_column     AS "dateColumn"
         FROM logsheet_answers la
         JOIN logsheet_questions lq ON lq.id = la.question_id
         WHERE la.entry_id = ?
         ORDER BY lq.order_index ASC, la.date_column ASC NULLS LAST`,
        [id]
      );

      // Parse tabular / header JSONB
      let tabularData = null;
      if (submission.data) {
        try { tabularData = typeof submission.data === "string" ? JSON.parse(submission.data) : submission.data; }
        catch { /* ignore */ }
      }
      let headerValues = null;
      if (submission.headerValues) {
        try { headerValues = typeof submission.headerValues === "string" ? JSON.parse(submission.headerValues) : submission.headerValues; }
        catch { /* ignore */ }
      }

      res.json({ ...submission, headerValues, answers, tabularData });
    } catch (err) { next(err); }
  }
);

export default router;
