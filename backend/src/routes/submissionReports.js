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
      const userId = req.user?.id;
      if (!companyId && !userId)
        return res.status(400).json({ message: "Authentication required" });

      const { type } = req.params;
      if (!["checklists", "logsheets"].includes(type))
        return res.status(400).json({ message: "type must be checklists or logsheets" });

      // Build scope condition: single company or all companies belonging to this portal user
      const cCond  = companyId ? "= ?" : "IN (SELECT id FROM companies WHERE user_id = ?)";
      const cParam = companyId || userId;

      if (type === "checklists") {
        const [templates] = await pool.query(
          `SELECT id, template_name AS "templateName"
           FROM checklist_templates WHERE company_id ${cCond}
           ORDER BY template_name`,
          [cParam]
        );
        const [employees] = await pool.query(
          `SELECT id, full_name AS "fullName"
           FROM company_users
           WHERE company_id ${cCond} AND full_name IS NOT NULL
           ORDER BY full_name`,
          [cParam]
        );
        const [assets] = await pool.query(
          `SELECT id, asset_name AS "assetName"
           FROM assets
           WHERE company_id ${cCond}
           ORDER BY asset_name`,
          [cParam]
        );
        const [buildingRows] = await pool.query(
          `SELECT DISTINCT name AS building FROM buildings WHERE company_id ${cCond} AND name IS NOT NULL AND name <> ''
           UNION
           SELECT DISTINCT a.building FROM assets a WHERE a.company_id ${cCond} AND a.building IS NOT NULL AND a.building <> ''
           ORDER BY building`,
          [cParam, cParam]
        );
        const [floorRows] = await pool.query(
          `SELECT DISTINCT floor_number AS floor FROM floors WHERE company_id ${cCond} AND floor_number IS NOT NULL AND floor_number <> ''
           UNION
           SELECT DISTINCT a.floor FROM assets a WHERE a.company_id ${cCond} AND a.floor IS NOT NULL AND a.floor <> ''
           ORDER BY floor`,
          [cParam, cParam]
        );
        const [roomRows] = await pool.query(
          `SELECT DISTINCT room_name AS room FROM rooms WHERE company_id ${cCond} AND room_name IS NOT NULL AND room_name <> ''
           UNION
           SELECT DISTINCT a.room FROM assets a WHERE a.company_id ${cCond} AND a.room IS NOT NULL AND a.room <> ''
           ORDER BY room`,
          [cParam, cParam]
        );
        return res.json({ templates, employees, assets, shifts: [], buildings: buildingRows.map((r) => r.building), floors: floorRows.map((r) => r.floor), rooms: roomRows.map((r) => r.room) });
      }

      // logsheets
      const [templates] = await pool.query(
        `SELECT id, template_name AS "templateName"
         FROM logsheet_templates WHERE company_id ${cCond}
         ORDER BY template_name`,
        [cParam]
      );
      const [employees] = await pool.query(
        `SELECT id, full_name AS "fullName"
         FROM company_users
         WHERE company_id ${cCond} AND full_name IS NOT NULL
         ORDER BY full_name`,
        [cParam]
      );
      const [assets] = await pool.query(
        `SELECT id, asset_name AS "assetName"
         FROM assets
         WHERE company_id ${cCond}
         ORDER BY asset_name`,
        [cParam]
      );
      const [shiftRows] = await pool.query(
        `SELECT DISTINCT le.shift
         FROM logsheet_entries le
         INNER JOIN logsheet_templates lt ON lt.id = le.template_id
         WHERE lt.company_id ${cCond} AND le.shift IS NOT NULL AND le.shift <> ''
         ORDER BY le.shift`,
        [cParam]
      );
      const [buildingRows] = await pool.query(
        `SELECT DISTINCT name AS building FROM buildings WHERE company_id ${cCond} AND name IS NOT NULL AND name <> ''
         UNION
         SELECT DISTINCT a.building FROM assets a WHERE a.company_id ${cCond} AND a.building IS NOT NULL AND a.building <> ''
         ORDER BY building`,
        [cParam, cParam]
      );
      const [floorRows] = await pool.query(
        `SELECT DISTINCT floor_number AS floor FROM floors WHERE company_id ${cCond} AND floor_number IS NOT NULL AND floor_number <> ''
         UNION
         SELECT DISTINCT a.floor FROM assets a WHERE a.company_id ${cCond} AND a.floor IS NOT NULL AND a.floor <> ''
         ORDER BY floor`,
        [cParam, cParam]
      );
      const [roomRows] = await pool.query(
        `SELECT DISTINCT room_name AS room FROM rooms WHERE company_id ${cCond} AND room_name IS NOT NULL AND room_name <> ''
         UNION
         SELECT DISTINCT a.room FROM assets a WHERE a.company_id ${cCond} AND a.room IS NOT NULL AND a.room <> ''
         ORDER BY room`,
        [cParam, cParam]
      );
      res.json({ templates, employees, assets, shifts: shiftRows.map((r) => r.shift), buildings: buildingRows.map((r) => r.building), floors: floorRows.map((r) => r.floor), rooms: roomRows.map((r) => r.room) });
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
      const userId = req.user?.id;
      if (!companyId && !userId)
        return res.status(400).json({ message: "Authentication required" });

      const { dateFrom, dateTo, period, templateId, assetId, building, floor, room, status, submittedBy, search } = req.query;
      const conditions = companyId ? ["ct.company_id = ?"] : ["co.user_id = ?"];
      const params     = companyId ? [companyId] : [userId];

      if (period === "today") {
        conditions.push("DATE(cs.submitted_at) = CURRENT_DATE");
      } else if (period === "week") {
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
      if (building)    { conditions.push("(a.building ILIKE ? OR b.name ILIKE ?)");     params.push(building, building); }
      if (floor)       { conditions.push("(a.floor ILIKE ? OR f.floor_number ILIKE ?)"); params.push(floor, floor); }
      if (room)        { conditions.push("(a.room ILIKE ? OR r.room_name ILIKE ?)");     params.push(room, room); }
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
           ct.service_type         AS "serviceType",
           cs.asset_id             AS "assetId",
           a.asset_name            AS "assetName",
           COALESCE(b.name, a.building) AS "buildingName",
           COALESCE(f.floor_number, a.floor) AS "floorName",
           COALESCE(r.room_name, a.room) AS "roomName",
           a.building              AS "assetBuilding",
           a.floor                 AS "assetFloor",
           a.room                  AS "assetRoom",
           d.name                  AS "assetDepartment",
           ct.location_id          AS "locationId",
           loc.name                AS "locationName",
           co.company_name         AS "companyName",
           cs.status,
           cs.submitted_at         AS "submittedAt",
           cu.full_name            AS "submittedBy",
           cu.id                   AS "submittedById",
           cs.latitude, cs.longitude, cs.device_ip AS "deviceIp",
           cs.location_address     AS "locationAddress"
         FROM checklist_submissions cs
         JOIN checklist_templates ct ON cs.template_id = ct.id
         JOIN companies co           ON co.id = ct.company_id
         LEFT JOIN assets a          ON a.id = cs.asset_id
         LEFT JOIN departments d     ON d.id = a.department_id
         LEFT JOIN locations loc     ON loc.id = ct.location_id
         LEFT JOIN buildings b       ON b.id = ct.building_id
         LEFT JOIN floors f          ON f.id = ct.floor_id
         LEFT JOIN rooms r           ON r.id = ct.room_id
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
      const userId = req.user?.id;
      if (!companyId && !userId)
        return res.status(400).json({ message: "Authentication required" });

      const { dateFrom, dateTo, period, templateId, assetId, building, floor, room, status, shift, submittedBy, search } = req.query;
      const conditions = companyId ? ["lt.company_id = ?"] : ["co.user_id = ?"];
      const params     = companyId ? [companyId] : [userId];
      const dateExpr   = "COALESCE(le.submitted_at, le.entry_date)";

      if (period === "today") {
        conditions.push(`DATE(${dateExpr}) = CURRENT_DATE`);
      } else if (period === "week") {
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
      if (building)    { conditions.push("a.building ILIKE ?");     params.push(building); }
      if (floor)       { conditions.push("a.floor ILIKE ?");         params.push(floor); }
      if (room)        { conditions.push("a.room ILIKE ?");          params.push(room); }
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
           a.building                   AS "buildingName",
           a.floor                      AS "floorName",
           a.room                       AS "roomName",
           a.building                   AS "assetBuilding",
           a.floor                      AS "assetFloor",
           a.room                       AS "assetRoom",
           d.name            AS "assetDepartment",
           co.company_name              AS "companyName",
           le.status,
           COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
           le.shift,
           le.month,
           le.year,
           cu.full_name                 AS "submittedBy",
           cu.id                        AS "submittedById",
           le.latitude, le.longitude, le.device_ip AS "deviceIp",
           le.location_address          AS "locationAddress"
         FROM logsheet_entries le
         JOIN logsheet_templates lt      ON lt.id = le.template_id
         JOIN companies co               ON co.id = lt.company_id
         LEFT JOIN assets a              ON a.id = le.asset_id
         LEFT JOIN departments d         ON d.id = a.department_id
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
      const userId = req.user?.id;
      if (!companyId && !userId)
        return res.status(400).json({ message: "Authentication required" });

      const { id } = req.params;
      const scopeCond  = companyId ? "ct.company_id = ?" : "co.user_id = ?";
      const scopeParam = companyId || userId;
      const [[submission]] = await pool.query(
        `SELECT
           cs.id,
           cs.template_id       AS "templateId",
           ct.template_name     AS "templateName",
           cs.asset_id          AS "assetId",
           a.asset_name         AS "assetName",
           a.building           AS "assetBuilding",
           a.floor              AS "assetFloor",
           a.room               AS "assetRoom",
           d.name    AS "assetDepartment",
           cs.status,
           cs.submitted_at      AS "submittedAt",
           cu.full_name         AS "submittedBy",
           cs.latitude, cs.longitude, cs.device_ip AS "deviceIp",
           cs.location_address  AS "locationAddress"
         FROM checklist_submissions cs
         JOIN checklist_templates ct  ON ct.id = cs.template_id
         JOIN companies co            ON co.id = ct.company_id
         LEFT JOIN assets a           ON a.id  = cs.asset_id
         LEFT JOIN departments d      ON d.id  = a.department_id
         LEFT JOIN company_users cu   ON cu.id = cs.company_user_id
         WHERE cs.id = ? AND ${scopeCond}`,
        [id, scopeParam]
      );
      if (!submission) return res.status(404).json({ message: "Submission not found" });

      const [answers] = await pool.query(
        `SELECT
           csa.id,
           csa.question_text   AS "questionText",
           csa.input_type      AS "answerType",
           csa.answer_json     AS "answerJson",
           csa.option_selected AS "answerValue",
           ctq.question_image_url AS "questionImageUrl"
         FROM checklist_submission_answers csa
         LEFT JOIN checklist_template_questions ctq ON ctq.id = csa.question_id
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
      const userId = req.user?.id;
      if (!companyId && !userId)
        return res.status(400).json({ message: "Authentication required" });

      const { id } = req.params;
      const scopeCond  = companyId ? "lt.company_id = ?" : "co.user_id = ?";
      const scopeParam = companyId || userId;
      const [[submission]] = await pool.query(
        `SELECT
           le.id,
           le.template_id              AS "templateId",
           lt.template_name            AS "templateName",
           lt.layout_type              AS "layoutType",
           le.asset_id                 AS "assetId",
           a.asset_name                AS "assetName",
           a.building                  AS "assetBuilding",
           a.floor                     AS "assetFloor",
           a.room                      AS "assetRoom",
           d.name           AS "assetDepartment",
           le.status,
           le.shift,
           le.month,
           le.year,
           COALESCE(le.submitted_at, le.entry_date) AS "submittedAt",
           le.data,
           le.header_values            AS "headerValues",
           cu.full_name                AS "submittedBy",
           le.latitude, le.longitude, le.device_ip AS "deviceIp",
           le.location_address         AS "locationAddress"
         FROM logsheet_entries le
         JOIN logsheet_templates lt     ON lt.id = le.template_id
         JOIN companies co              ON co.id = lt.company_id
         LEFT JOIN assets a             ON a.id  = le.asset_id
         LEFT JOIN departments d        ON d.id  = a.department_id
         LEFT JOIN company_users cu     ON cu.id = le.company_user_id
         WHERE le.id = ? AND ${scopeCond}`,
        [id, scopeParam]
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
