/**
 * submissionReports.js
 * ──────────────────────────────────────────────────────────────────────────
 * Read-only submission list + detail routes that accept BOTH a company-user
 * JWT (cp_token) AND a main-platform JWT (company_portal_token).
 *
 * These are registered in app.js BEFORE the templateAssignmentsRouter so they
 * take precedence for /api/template-assignments/submissions/* paths.
 *
 * companyId is sourced from:
 *   1. JWT payload (cp_token)   → req.companyUser.companyId
 *   2. Query param              → ?companyId=N  (for main platform admin)
 */

import { Router }     from "express";
import { param, query } from "express-validator";
import pool            from "../db.js";
import { validate }    from "../validators.js";
import { flexCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();

// helpers
const flexCid = (req) =>
  req.companyUser?.companyId || (req.query.companyId ? parseInt(req.query.companyId, 10) : null);

/* ── GET /submissions/checklists ── */
router.get(
  "/submissions/checklists",
  flexCompanyAuth,
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { dateFrom, dateTo, period } = req.query;
      const conditions = ["ct.company_id = ?"];
      const params     = [companyId];

      if (period === "week") {
        conditions.push("cs.submitted_at >= NOW() - INTERVAL '7 days'");
      } else if (period === "month") {
        conditions.push("DATE_TRUNC('month', cs.submitted_at) = DATE_TRUNC('month', NOW())");
      } else if (period === "year") {
        conditions.push("DATE_TRUNC('year', cs.submitted_at) = DATE_TRUNC('year', NOW())");
      }
      if (dateFrom) { conditions.push("cs.submitted_at >= ?"); params.push(dateFrom); }
      if (dateTo)   { conditions.push("cs.submitted_at <= ?"); params.push(dateTo + " 23:59:59"); }

      const [rows] = await pool.query(
        `SELECT
           cs.id,
           cs.template_id          AS "templateId",
           ct.template_name        AS "templateName",
           cs.asset_id             AS "assetId",
           a.asset_name            AS "assetName",
           cs.status,
           cs.submitted_at         AS "submittedAt",
           cu.full_name            AS "submittedBy"
         FROM checklist_submissions cs
         JOIN checklist_templates ct ON cs.template_id = ct.id
         LEFT JOIN assets a          ON a.id = cs.asset_id
         LEFT JOIN company_users cu  ON cu.id = cs.company_user_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY cs.submitted_at DESC NULLS LAST
         LIMIT 500`,
        params
      );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

/* ── GET /submissions/logsheets ── */
router.get(
  "/submissions/logsheets",
  flexCompanyAuth,
  async (req, res, next) => {
    try {
      const companyId = flexCid(req);
      if (!companyId || isNaN(companyId))
        return res.status(400).json({ message: "companyId required" });

      const { dateFrom, dateTo, period } = req.query;
      const conditions = ["lt.company_id = ?"];
      const params     = [companyId];

      if (period === "week") {
        conditions.push("COALESCE(le.submitted_at, le.entry_date) >= NOW() - INTERVAL '7 days'");
      } else if (period === "month") {
        conditions.push("le.month = EXTRACT(MONTH FROM NOW()) AND le.year = EXTRACT(YEAR FROM NOW())");
      } else if (period === "year") {
        conditions.push("le.year = EXTRACT(YEAR FROM NOW())");
      }
      if (dateFrom) { conditions.push("COALESCE(le.submitted_at, le.entry_date) >= ?"); params.push(dateFrom); }
      if (dateTo)   { conditions.push("COALESCE(le.submitted_at, le.entry_date) <= ?"); params.push(dateTo + " 23:59:59"); }

      const [rows] = await pool.query(
        `SELECT
           le.id,
           le.template_id               AS "templateId",
           lt.template_name             AS "templateName",
           le.asset_id                  AS "assetId",
           a.asset_name                 AS "assetName",
           le.status,
           COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
           le.shift,
           le.month,
           le.year,
           cu.full_name                 AS "submittedBy"
         FROM logsheet_entries le
         JOIN logsheet_templates lt      ON lt.id = le.template_id
         LEFT JOIN assets a              ON a.id = le.asset_id
         LEFT JOIN company_users cu      ON cu.id = le.company_user_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY le.submitted_at DESC NULLS LAST, le.entry_date DESC
         LIMIT 500`,
        params
      );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

/* ── GET /submissions/checklists/:id ── */
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

/* ── GET /submissions/logsheets/:id ── */
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
           le.asset_id                 AS "assetId",
           a.asset_name                AS "assetName",
           le.status,
           le.shift,
           le.month,
           le.year,
           COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
           le.data,
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
           la.question_id   AS "questionId",
           lq.question_text AS "questionText",
           lq.answer_type   AS "answerType",
           la.answer_value  AS "answerValue"
         FROM logsheet_answers la
         JOIN logsheet_questions lq ON lq.id = la.question_id
         WHERE la.entry_id = ?
         ORDER BY lq.order_index ASC`,
        [id]
      );
      res.json({ ...submission, answers });
    } catch (err) { next(err); }
  }
);

export default router;
