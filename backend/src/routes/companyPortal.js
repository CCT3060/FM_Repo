import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

// pg returns JSONB columns as already-parsed JS objects; guard against that
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
};

// Ensure questions column exists (safe to run on every start)
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS questions JSONB NULL").catch(() => {});

/* ── Dashboard ──────────────────────────────────────────────────────────────── */
router.get("/dashboard", async (req, res, next) => {
  try {
    const companyId  = cid(req);
    const { role, id: userId } = req.companyUser;

    // Base flag filter – admin sees all, supervisor sees their team's flags
    let flagWhere  = "f.company_id = ?";
    const flagParams = [companyId];
    if (role === "supervisor") {
      flagWhere += ` AND (f.supervisor_id = ? OR f.raised_by IN (
        SELECT id FROM company_users WHERE supervisor_id = ? AND company_id = ?
      ))`;
      flagParams.push(userId, userId, companyId);
    }

    const [
      [assetRows], [deptRows], [empRows], [activeAssets], [issueRows],
      [openFlags], [criticalFlags], [flagsBySeverity], [assetsHealth],
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ?", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM departments WHERE company_id = ?", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM company_users WHERE company_id = ? AND status = 'Active'", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ? AND status = 'Active'", [companyId]),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM work_orders wo
         JOIN assets a ON wo.asset_id = a.id
         WHERE a.company_id = ? AND wo.status = 'open'`,
        [companyId]
      ),
      // Open flags count
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.status IN ('open', 'in_progress')`,
        flagParams
      ),
      // Critical flags count
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.severity = 'critical' AND f.status IN ('open', 'in_progress')`,
        flagParams
      ),
      // Flags grouped by severity (open only)
      pool.query(
        `SELECT f.severity, COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.status IN ('open', 'in_progress')
         GROUP BY f.severity`,
        flagParams
      ),
      // Asset health distribution
      pool.query(
        `SELECT health_status AS "healthStatus", COUNT(*) AS cnt
         FROM assets WHERE company_id = ? GROUP BY health_status`,
        [companyId]
      ),
    ]);

    const severityMap = {};
    for (const r of flagsBySeverity) severityMap[r.severity] = Number(r.cnt);

    const healthMap = {};
    for (const r of assetsHealth) healthMap[r.healthStatus] = Number(r.cnt);

    res.json({
      totalAssets:      Number(assetRows[0]?.cnt      || 0),
      activeAssets:     Number(activeAssets[0]?.cnt   || 0),
      totalDepartments: Number(deptRows[0]?.cnt        || 0),
      activeEmployees:  Number(empRows[0]?.cnt         || 0),
      openIssues:       Number(issueRows[0]?.cnt        || 0),
      flags: {
        open:     Number(openFlags[0]?.cnt     || 0),
        critical: Number(criticalFlags[0]?.cnt || 0),
        bySeverity: {
          low:      severityMap.low      || 0,
          medium:   severityMap.medium   || 0,
          high:     severityMap.high     || 0,
          critical: severityMap.critical || 0,
        },
      },
      assetHealth: {
        green:  healthMap.green  || 0,
        yellow: healthMap.yellow || 0,
        red:    healthMap.red    || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── Departments ────────────────────────────────────────────────────────────── */
router.get("/departments", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name AS "departmentName", description, created_at AS "createdAt"
       FROM departments WHERE company_id = ? ORDER BY name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/departments", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "name is required" });
    const [rows] = await pool.query(
      `INSERT INTO departments (company_id, name, description) VALUES (?, ?, ?) RETURNING id, name AS "departmentName", description, created_at AS "createdAt"`,
      [cid(req), name.trim(), description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Department name already exists" });
    next(err);
  }
});

router.put("/departments/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { name, description } = req.body;
    const [[check]] = await pool.query("SELECT id FROM departments WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Department not found" });
    const [rows] = await pool.query(
      `UPDATE departments SET name = COALESCE(?, name), description = ? WHERE id = ? RETURNING id, name AS "departmentName", description, created_at AS "createdAt"`,
      [name?.trim() || null, description ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Department name already exists" });
    next(err);
  }
});

router.delete("/departments/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM departments WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Department not found" });
    await pool.query("DELETE FROM departments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ── Assets ─────────────────────────────────────────────────────────────────── */
router.get("/assets", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.department_id AS "departmentId",
              d.name AS "departmentName",
              ad.metadata, ad.documents
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.company_id = ?
       ORDER BY a.asset_name`,
      [cid(req)]
    );
    const normalized = rows.map((r) => {
      const meta = r.metadata == null ? {} : (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata);
      const docs = r.documents == null ? undefined : (typeof r.documents === "string" ? JSON.parse(r.documents) : r.documents);
      return { ...r, metadata: docs ? { ...meta, documents: docs } : meta, documents: undefined };
    });
    res.json(normalized);
  } catch (err) {
    next(err);
  }
});

router.get("/assets/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.created_at AS "createdAt",
              d.name AS "departmentName",
              ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id = ?`,
      [id, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const meta = asset.metadata == null ? {} : (typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : asset.metadata);

    // Templates that match this asset's type
    const [checklists] = await pool.query(
      `SELECT id, 'checklist' AS "templateType", template_name AS "templateName", description
       FROM checklist_templates WHERE company_id = ? AND asset_type = ?
       UNION ALL
       SELECT id, 'logsheet' AS "templateType", template_name AS "templateName", description
       FROM logsheet_templates WHERE company_id = ? AND asset_type = ?
       ORDER BY "templateName" LIMIT 50`,
      [cid(req), asset.assetType, cid(req), asset.assetType]
    );

    // Assignments for templates of this asset type
    const [assignments] = await pool.query(
      `SELECT tua.id, COALESCE(ct.template_name, lt.template_name) AS "templateName",
              tua.template_type AS "templateType",
              cu.full_name AS "assignedToName",
              tua.created_at AS "assignedAt"
       FROM template_user_assignments tua
       JOIN company_users cu ON tua.assigned_to = cu.id
       LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.asset_type = ?
       LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id AND lt.asset_type = ?
       WHERE tua.company_id = ? AND (ct.id IS NOT NULL OR lt.id IS NOT NULL)
       ORDER BY tua.created_at DESC LIMIT 50`,
      [asset.assetType, asset.assetType, cid(req)]
    );

    res.json({ ...asset, metadata: meta, checklists, assignments });
  } catch (err) {
    next(err);
  }
});

router.post("/assets", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { assetName, assetUniqueId, assetType, departmentId, building, floor, room, status = "Active", metadata = {} } = req.body;
    if (!assetName?.trim() || !assetType) return res.status(400).json({ message: "assetName and assetType are required" });
    const [rows] = await pool.query(
      `INSERT INTO assets (company_id, department_id, asset_name, asset_unique_id, asset_type, building, floor, room, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_name AS "assetName", asset_unique_id AS "assetUniqueId", asset_type AS "assetType", status, building, floor, room, department_id AS "departmentId"`,
      [cid(req), departmentId || null, assetName.trim(), assetUniqueId || null, assetType, building || null, floor || null, room || null, status]
    );
    const asset = rows[0];
    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON CONFLICT (asset_id) DO UPDATE SET metadata = EXCLUDED.metadata, documents = EXCLUDED.documents`,
      [asset.id, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    res.status(201).json({ ...asset, metadata });
  } catch (err) { next(err); }
});

router.put("/assets/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { assetName, assetUniqueId, assetType, departmentId, building, floor, room, status, metadata = {} } = req.body;
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    const [rows] = await pool.query(
      `UPDATE assets SET
         asset_name = COALESCE(?, asset_name),
         asset_unique_id = COALESCE(?, asset_unique_id),
         asset_type = COALESCE(?, asset_type),
         department_id = ?,
         building = ?, floor = ?, room = ?,
         status = COALESCE(?, status),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, asset_name AS "assetName", asset_unique_id AS "assetUniqueId", asset_type AS "assetType", status, building, floor, room, department_id AS "departmentId"`,
      [assetName || null, assetUniqueId || null, assetType || null, departmentId || null, building || null, floor || null, room || null, status || null, id]
    );
    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON CONFLICT (asset_id) DO UPDATE SET metadata = EXCLUDED.metadata, documents = EXCLUDED.documents`,
      [id, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    res.json({ ...rows[0], metadata });
  } catch (err) { next(err); }
});

router.delete("/assets/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    await pool.query("DELETE FROM assets WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Checklists ─────────────────────────────────────────────────────────────── */
router.get("/checklists", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
              ct.category, ct.description, ct.frequency, ct.shift, ct.status,
              ct.questions, ct.created_at AS "createdAt"
       FROM checklist_templates ct
       WHERE ct.company_id = ? AND ct.is_active = 1
       ORDER BY ct.template_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/checklists", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { templateName, assetType, category, description, frequency = "Daily", shift, status = "active", questions } = req.body;
    if (!templateName?.trim() || !assetType) return res.status(400).json({ message: "templateName and assetType are required" });
    const questionsJson = questions ? JSON.stringify(questions) : null;
    const [rows] = await pool.query(
      `INSERT INTO checklist_templates (company_id, template_name, asset_type, category, description, frequency, shift, status, is_active, created_by, questions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", category, description, frequency, shift, status, questions, created_at AS "createdAt"`,
      [cid(req), templateName.trim(), assetType, category || null, description || null, frequency, shift || null, status, req.companyUser.id, questionsJson]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { templateName, assetType, category, description, frequency, shift, status, questions } = req.body;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    const isActive = status === "active" ? 1 : 0;
    const questionsJson = questions !== undefined ? JSON.stringify(questions) : undefined;
    const [rows] = await pool.query(
      `UPDATE checklist_templates SET
         template_name = COALESCE(?, template_name),
         asset_type = COALESCE(?, asset_type),
         category = COALESCE(?, category),
         description = COALESCE(?, description),
         frequency = COALESCE(?, frequency),
         shift = COALESCE(?, shift),
         status = COALESCE(?, status),
         is_active = ?,
         questions = COALESCE(?, questions)
       WHERE id = ?
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", category, description, frequency, shift, status, questions, created_at AS "createdAt"`,
      [templateName || null, assetType || null, category || null, description || null, frequency || null, shift || null, status || null, isActive, questionsJson ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    await pool.query("DELETE FROM checklist_templates WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Create Logsheet Template ──────────────────────────────────────────────── */
router.post("/logsheet-templates", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can create logsheet templates" });
    }
    const { templateName, assetType, assetModel, frequency = "daily", assetId, description,
            headerConfig = {}, sections, layoutType = "standard" } = req.body;
    if (!templateName?.trim()) return res.status(400).json({ message: "templateName is required" });
    if (!assetType) return res.status(400).json({ message: "assetType is required" });
    // Standard templates require sections; tabular templates store config in headerConfig
    if (layoutType !== "tabular" && (!Array.isArray(sections) || !sections.length)) {
      return res.status(400).json({ message: "At least one section is required" });
    }

    const companyId = cid(req);
    // Merge layoutType into headerConfig so the frontend can detect it on fetch
    const mergedConfig = { ...headerConfig, layoutType };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [tmplRows] = await conn.execute(
        `INSERT INTO logsheet_templates (company_id, asset_id, template_name, asset_type, asset_model, frequency, header_config, description, is_active, layout_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         RETURNING id`,
        [companyId, assetId || null, templateName.trim(), assetType, assetModel || null, frequency,
         JSON.stringify(mergedConfig), description || null, layoutType]
      );
      const templateId = tmplRows[0]?.id;

      // Persist sections + questions only for standard templates
      if (layoutType !== "tabular" && Array.isArray(sections)) {
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index) VALUES (?, ?, ?) RETURNING id`,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;
          const questionValues = (section.questions || []).map((q, qIdx) => [
            sectionId, q.questionText, q.specification || null, q.answerType,
            (q.rule && Object.keys(q.rule).length) ? JSON.stringify(q.rule) : null,
            q.priority || "medium", q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);
          if (questionValues.length) {
            await conn.query(
              `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index) VALUES ?`,
              [questionValues]
            );
          }
        }
      }

      // Auto-assign to asset if provided
      if (assetId) {
        await conn.execute(
          `INSERT IGNORE INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?)`,
          [templateId, assetId]
        );
      }

      await conn.commit();
      res.status(201).json({ id: templateId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ── Assign Logsheet Template to Asset ──────────────────────────────────────── */
router.post("/logsheet-templates/:templateId/assign", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[tmpl]] = await pool.query("SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?", [templateId, cid(req)]);
    if (!tmpl) return res.status(404).json({ message: "Template not found" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [assetId, cid(req)]);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    await pool.query(
      `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT (template_id, asset_id) DO NOTHING`,
      [templateId, assetId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Templates ─────────────────────────────────────────────────────── */
router.get("/logsheet-templates", async (req, res, next) => {
  try {
    const [templates] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName",
              lt.description, lt.header_config AS "headerConfig",
              lt.layout_type AS "layoutType",
              lt.is_active AS "isActive", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       LEFT JOIN assets a ON a.id = lt.asset_id
       WHERE lt.company_id = ?
       ORDER BY lt.template_name`,
      [cid(req)]
    );

    if (!templates.length) return res.json([]);

    const templateIds = templates.map((t) => t.id);
    const [sections] = await pool.query(
      `SELECT id, template_id AS "templateId", section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id IN (${templateIds.map(() => "?").join(",")})
       ORDER BY order_index`,
      templateIds
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index`,
        sectionIds
      );
      questions = qRows;
    }

    const result = templates.map((t) => ({
      ...t,
      headerConfig: safeParse(t.headerConfig) ?? {},
      sections: sections
        .filter((s) => s.templateId === t.id)
        .map((s) => ({
          ...s,
          questions: questions
            .filter((q) => q.sectionId === s.id)
            .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
        })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Submit Logsheet Entry ──────────────────────────────────────────────────── */
router.post("/logsheet-templates/:templateId/entries", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year, shift, headerValues = {}, answers, tabularData } = req.body;

    if (!assetId || !month || !year) {
      return res.status(400).json({ message: "assetId, month, and year are required" });
    }

    // Verify template and asset belong to this company
    const [[tmplRow]] = await pool.query(
      `SELECT id, COALESCE(layout_type, 'standard') AS "layoutType" FROM logsheet_templates WHERE id = ? AND company_id = ?`,
      [templateId, cid(req)]
    );
    if (!tmplRow) return res.status(404).json({ message: "Template not found" });

    const isTabular = tmplRow.layoutType === "tabular" || !!tabularData;

    if (!isTabular && !answers?.length) {
      return res.status(400).json({ message: "answers are required for standard logsheet entries" });
    }

    const [[assetRow]] = await pool.query(
      "SELECT id, asset_name, building, floor, room FROM assets WHERE id = ? AND company_id = ?",
      [assetId, cid(req)]
    );
    if (!assetRow) return res.status(404).json({ message: "Asset not found" });

    const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const dataJson = isTabular ? JSON.stringify(tabularData || {}) : "{}";

    const [entryRows] = await pool.query(
      `INSERT INTO logsheet_entries (template_id, asset_id, submitted_by, company_user_id, entry_date, month, year, shift, header_values, data, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       RETURNING id`,
      [templateId, assetId, req.companyUser.id, req.companyUser.id, monthDate, month, year,
       shift || null, JSON.stringify(headerValues), dataJson]
    );
    const entryId = entryRows[0]?.id;

    // Persist individual answers for standard (non-tabular) templates
    if (!isTabular && answers?.length) {
      const answerValues = answers.map((a) => [entryId, a.questionId, a.dateColumn, a.answerValue != null ? String(a.answerValue) : null, 0, null, null]);
      await pool.query(
        `INSERT INTO logsheet_answers (entry_id, question_id, date_column, answer_value, is_issue, issue_reason, issue_detail) VALUES ?`,
        [answerValues]
      );
    }

    res.status(201).json({ id: entryId, issues: 0 });
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Entries (read) ────────────────────────────────────────────────── */
router.get("/logsheet-templates/:templateId/entries", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year, limit = 100 } = req.query;

    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const qParams = [templateId];
    let where = "WHERE le.template_id = ?";
    if (assetId) { where += " AND le.asset_id = ?"; qParams.push(assetId); }
    if (month) { where += " AND le.month = ?"; qParams.push(Number(month)); }
    if (year) { where += " AND le.year = ?"; qParams.push(Number(year)); }

    const [entries] = await pool.query(
      `SELECT le.id, le.asset_id AS "assetId", le.template_id AS "templateId",
              le.submitted_by AS "submittedBy", le.entry_date AS "entryDate",
              le.month, le.year, le.shift, le.header_values AS "headerValues",
              le.submitted_at AS "submittedAt"
       FROM logsheet_entries le
       ${where}
       ORDER BY le.submitted_at DESC
       LIMIT ?`,
      [...qParams, Number(limit)]
    );

    if (!entries.length) return res.json([]);

    const entryIds = entries.map((e) => e.id);
    const [answers] = await pool.query(
      `SELECT id, entry_id AS "entryId", question_id AS "questionId", date_column AS "dateColumn",
              answer_value AS "answerValue", is_issue AS "isIssue", issue_reason AS "issueReason"
       FROM logsheet_answers
       WHERE entry_id IN (${entryIds.map(() => "?").join(",")})
       ORDER BY entry_id ASC, question_id ASC, date_column ASC`,
      entryIds
    );

    const result = entries.map((e) => ({
      ...e,
      headerValues: safeParse(e.headerValues) ?? {},
      answers: answers.filter((a) => a.entryId === e.id),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Grid View (company portal) ────────────────────────────────────── */
router.get("/logsheet-templates/:templateId/grid", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year } = req.query;
    const now = new Date();
    const effectiveMonth = month ? Number(month) : now.getMonth() + 1;
    const effectiveYear = year ? Number(year) : now.getFullYear();
    const companyId = cid(req);

    // Verify template belongs to this company
    const [[tmplRow]] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "defaultAssetId",
              lt.header_config AS "headerConfig", lt.description
       FROM logsheet_templates lt WHERE lt.id = ? AND lt.company_id = ?`,
      [templateId, companyId]
    );
    if (!tmplRow) return res.status(404).json({ message: "Template not found" });
    tmplRow.headerConfig = safeParse(tmplRow.headerConfig) ?? {};

    // Sections + Questions
    const [sections] = await pool.query(
      `SELECT id, section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
      [templateId]
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions
         WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        sectionIds
      );
      questions = qRows;
    }

    const structuredTemplate = {
      ...tmplRow,
      sections: sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.sectionId === s.id)
          .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
      })),
    };

    // Asset info
    const effectiveAssetId = assetId ? Number(assetId) : tmplRow.defaultAssetId;
    let asset = null;
    if (effectiveAssetId) {
      const [[aRow]] = await pool.query(
        `SELECT id, asset_name AS "assetName", asset_type AS "assetType"
         FROM assets WHERE id = ? AND company_id = ?`,
        [effectiveAssetId, companyId]
      );
      asset = aRow || null;
    }

    // Find most recent entry for this template + month + year
    const entryParams = [templateId, effectiveMonth, effectiveYear];
    let entryWhere = "le.template_id = ? AND le.month = ? AND le.year = ?";
    if (effectiveAssetId) {
      entryWhere += " AND le.asset_id = ?";
      entryParams.push(effectiveAssetId);
    }

    const [entryRows] = await pool.query(
      `SELECT le.id, le.asset_id AS "assetId", le.shift,
              le.header_values AS "headerValues", le.submitted_at AS "submittedAt", le.status,
              cu.full_name AS "submittedByName"
       FROM logsheet_entries le
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       WHERE ${entryWhere}
       ORDER BY le.submitted_at DESC NULLS LAST
       LIMIT 1`,
      entryParams
    );

    const entry = entryRows[0] || null;
    let answerMap = {};

    if (entry) {
      entry.headerValues = safeParse(entry.headerValues) ?? {};
      const [ansRows] = await pool.query(
        `SELECT question_id AS "questionId", date_column AS "dateColumn",
                answer_value AS "answerValue", is_issue AS "isIssue", issue_reason AS "issueReason"
         FROM logsheet_answers WHERE entry_id = ?
         ORDER BY question_id ASC, date_column ASC`,
        [entry.id]
      );
      for (const a of ansRows) {
        if (!answerMap[a.questionId]) answerMap[a.questionId] = {};
        answerMap[a.questionId][a.dateColumn] = {
          value: a.answerValue,
          isIssue: !!a.isIssue,
          issueReason: a.issueReason,
        };
      }
    }

    const daysInMonth = new Date(effectiveYear, effectiveMonth, 0).getDate();

    res.json({ template: structuredTemplate, asset, entry, answerMap, daysInMonth });
  } catch (err) {
    next(err);
  }
});

/* ── Single Logsheet Template ───────────────────────────────────────────────── */
router.get("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName",
              lt.description, lt.header_config AS "headerConfig",
              lt.layout_type AS "layoutType",
              lt.is_active AS "isActive", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       LEFT JOIN assets a ON a.id = lt.asset_id
       WHERE lt.id = ? AND lt.company_id = ?`,
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const [sections] = await pool.query(
      `SELECT id, section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id = ? ORDER BY order_index`,
      [templateId]
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index`,
        sectionIds
      );
      questions = qRows;
    }

    res.json({
      ...tmpl,
      headerConfig: safeParse(tmpl.headerConfig) ?? {},
      sections: sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.sectionId === s.id)
          .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ── Update Logsheet Template ───────────────────────────────────────────────── */
router.put("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can edit logsheet templates" });
    }
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const { templateName, assetType, assetModel, frequency, assetId, description, headerConfig, sections } = req.body;

    const setClauses = [];
    const setParams = [];
    if (templateName !== undefined) { setClauses.push("template_name = ?"); setParams.push(templateName.trim()); }
    if (assetType !== undefined) { setClauses.push("asset_type = ?"); setParams.push(assetType); }
    if (assetModel !== undefined) { setClauses.push("asset_model = ?"); setParams.push(assetModel || null); }
    if (frequency !== undefined) { setClauses.push("frequency = ?"); setParams.push(frequency); }
    if (assetId !== undefined) { setClauses.push("asset_id = ?"); setParams.push(assetId || null); }
    if (description !== undefined) { setClauses.push("description = ?"); setParams.push(description || null); }
    if (headerConfig !== undefined) { setClauses.push("header_config = ?"); setParams.push(JSON.stringify(headerConfig)); }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (setClauses.length) {
        await conn.execute(
          `UPDATE logsheet_templates SET ${setClauses.join(", ")} WHERE id = ?`,
          [...setParams, templateId]
        );
      }

      // Sync assignment if assetId changed
      if (assetId !== undefined) {
        await conn.execute("DELETE FROM logsheet_template_assignments WHERE template_id = ?", [templateId]);
        if (assetId) {
          await conn.execute(
            `INSERT IGNORE INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?)`,
            [templateId, assetId]
          );
        }
      }

      if (Array.isArray(sections)) {
        await conn.execute("DELETE FROM logsheet_sections WHERE template_id = ?", [templateId]);
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index) VALUES (?, ?, ?) RETURNING id`,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;
          const questionValues = (section.questions || []).map((q, qIdx) => [
            sectionId, q.questionText, q.specification || null, q.answerType,
            (q.rule && Object.keys(q.rule).length) ? JSON.stringify(q.rule) : null,
            q.priority || "medium", q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);
          if (questionValues.length) {
            await conn.query(
              `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index) VALUES ?`,
              [questionValues]
            );
          }
        }
      }

      await conn.commit();
      res.status(204).send();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ── Delete Logsheet Template ───────────────────────────────────────────────── */
router.delete("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can delete logsheet templates" });
    }
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });
    await pool.execute("DELETE FROM logsheet_templates WHERE id = ?", [templateId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/* ── Employees ──────────────────────────────────────────────────────────────── */
router.get("/employees", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId",
              cu.full_name AS "fullName", cu.email, cu.phone,
              cu.designation, cu.role, cu.status, cu.username,
              cu.supervisor_id AS "supervisorId",
              s.full_name AS "supervisorName",
              cu.created_at AS "createdAt"
       FROM company_users cu
       LEFT JOIN company_users s ON s.id = cu.supervisor_id
       WHERE cu.company_id = ?
       ORDER BY cu.full_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Supervisors list (for dropdowns) ───────────────────────────────────────── */
router.get("/employees/supervisors", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, designation
       FROM company_users
       WHERE company_id = ? AND role = 'supervisor'
       ORDER BY full_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET: My team members (for supervisors in mobile app)
router.get("/my-team", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, phone, role, designation, status
       FROM company_users
       WHERE supervisor_id = ? AND company_id = ?
       ORDER BY full_name`,
      [req.companyUser.id, cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/employees", async (req, res, next) => {
  try {
    const { fullName, email, phone, designation, role = "employee", status = "Active", password, username, supervisorId } = req.body;
    if (!fullName || !email) return res.status(400).json({ message: "fullName and email are required" });

    // Only admin role can add employees; supervisors can add helpers under themselves
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can add employees" });
    }

    // Supervisors can only set themselves as the supervisor
    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId || null);

    let passwordHash = null;
    if (password) passwordHash = await bcrypt.hash(password, 10);

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash, username, supervisor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id,
                 company_id    AS "companyId",
                 full_name     AS "fullName",
                 email, phone, designation, role, status, username,
                 supervisor_id AS "supervisorId",
                 created_at    AS "createdAt"`,
      [cid(req), fullName, email, phone || null, designation || null, role, status, passwordHash, username || null, resolvedSupervisorId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "uq_company_users_username") return res.status(409).json({ message: "Username already exists" });
      return res.status(409).json({ message: "Email already exists" });
    }
    next(err);
  }
});

router.put("/employees/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, designation, role, status, password, username, supervisorId } = req.body;

    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Employee not found" });

    // Supervisors can only manage employees under themselves
    if (req.companyUser.role === "supervisor") {
      const [[emp]] = await pool.query(
        "SELECT supervisor_id FROM company_users WHERE id = ?", [id]
      );
      if (!emp || String(emp.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "Not authorised to edit this employee" });
      }
    }

    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId !== undefined ? (supervisorId || null) : undefined);

    let passwordClause = "";
    let usernameClause = username !== undefined ? ", username = ?" : "";
    let supervisorClause = resolvedSupervisorId !== undefined ? ", supervisor_id = ?" : "";
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active"];
    if (username !== undefined) params.push(username || null);
    if (resolvedSupervisorId !== undefined) params.push(resolvedSupervisorId);
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      passwordClause = ", password_hash = ?";
      params.push(hash);
    }
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET full_name = ?, email = ?, phone = ?, designation = ?, role = ?, status = ?${usernameClause}${supervisorClause}${passwordClause}, updated_at = NOW()
       WHERE id = ?
       RETURNING id,
                 full_name     AS "fullName",
                 email, phone, designation, role, status, username,
                 supervisor_id AS "supervisorId"`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "uq_company_users_username") return res.status(409).json({ message: "Username already exists" });
      return res.status(409).json({ message: "Email already exists" });
    }
    next(err);
  }
});

router.delete("/employees/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete employees" });
    }
    const { id } = req.params;
    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Not found" });
    await pool.query("DELETE FROM company_users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ── Bulk import employees ──────────────────────────────────────────────────── */
router.post("/employees/bulk", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }
    const { employees } = req.body; // array of { fullName, email, phone, designation, role, status, password }
    if (!Array.isArray(employees) || !employees.length) {
      return res.status(400).json({ message: "employees array is required" });
    }

    const results = { created: 0, skipped: 0, errors: [] };
    for (const emp of employees) {
      try {
        const { fullName, email, phone, designation, role = "employee", status = "Active", password } = emp;
        if (!fullName || !email) { results.errors.push({ email, reason: "Missing name or email" }); continue; }
        let passwordHash = null;
        if (password) passwordHash = await bcrypt.hash(password, 10);
        await pool.query(
          `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (email) DO NOTHING`,
          [cid(req), fullName, email, phone || null, designation || null, role, status, passwordHash]
        );
        results.created++;
      } catch (err) {
        results.skipped++;
        results.errors.push({ email: emp.email, reason: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
});

/* ── Current user profile ───────────────────────────────────────────────────── */
router.get("/me", async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT cu.id, cu.full_name AS "fullName", cu.email, cu.phone, cu.designation, cu.role,
              cu.status, cu.company_id AS "companyId", c.company_name AS "companyName"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [req.companyUser.id]
    );
    if (!row) return res.status(404).json({ message: "User not found" });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

/* ── Recent filled logsheet entries (company portal) ───────────────────────── */
router.get("/logsheet-templates/entries/recent", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT le.id, le.month, le.year, le.shift,
              le.submitted_at AS "submittedAt",
              lt.template_name AS "templateName", lt.frequency, lt.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              cu.full_name AS "submittedBy"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       WHERE lt.company_id = ?
       ORDER BY le.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Recent filled checklist submissions (company portal) ───────────────────── */
router.get("/checklist-submissions/recent", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT cs.id, cs.submitted_at AS "submittedAt",
              ct.template_name AS "templateName", ct.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              cs.status, cs.completion_pct AS "completionPct",
              cu.full_name AS "submittedBy"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       WHERE ct.company_id = ?
       ORDER BY cs.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Template ↔ User Assignments ────────────────────────────────────────────── */

// Admin assigns a template to a supervisor; supervisor can assign to their helpers
router.post("/template-user-assignments", async (req, res, next) => {
  try {
    const { templateType, templateId, assignedTo, note } = req.body;
    if (!templateType || !templateId || !assignedTo) {
      return res.status(400).json({ message: "templateType, templateId and assignedTo are required" });
    }
    if (!["checklist", "logsheet"].includes(templateType)) {
      return res.status(400).json({ message: "templateType must be checklist or logsheet" });
    }

    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can assign templates" });
    }

    // Supervisor can only assign to their own helpers
    if (role === "supervisor") {
      const [[target]] = await pool.query(
        "SELECT supervisor_id FROM company_users WHERE id = ? AND company_id = ?",
        [assignedTo, cid(req)]
      );
      if (!target || String(target.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "You can only assign to employees under you" });
      }
    }

    // Verify target belongs to this company
    const [[empCheck]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [assignedTo, cid(req)]
    );
    if (!empCheck) return res.status(404).json({ message: "Assignee not found in this company" });

    const [rows] = await pool.query(
      `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (template_type, template_id, assigned_to) DO UPDATE
         SET note = EXCLUDED.note, assigned_by = EXCLUDED.assigned_by, created_at = NOW()
       RETURNING id, template_type AS "templateType", template_id AS "templateId",
                 assigned_to AS "assignedTo", assigned_by AS "assignedBy", note, created_at AS "createdAt"`,
      [cid(req), templateType, templateId, assignedTo, req.companyUser.id, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get all assignments for this company (admin sees all; supervisor sees only theirs)
router.get("/template-user-assignments", async (req, res, next) => {
  try {
    const role = req.companyUser.role;
    let rows;
    if (role === "admin") {
      [rows] = await pool.query(
        `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
                tua.assigned_to AS "assignedTo", tua.assigned_by AS "assignedBy",
                tua.note, tua.created_at AS "createdAt",
                cu.full_name AS "assignedToName", cu.role AS "assignedToRole",
                ab.full_name AS "assignedByName",
                COALESCE(ct.template_name, lt.template_name) AS "templateName"
         FROM template_user_assignments tua
         JOIN company_users cu  ON cu.id  = tua.assigned_to
         LEFT JOIN company_users ab ON ab.id = tua.assigned_by
         LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
         LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
         WHERE tua.company_id = ?
         ORDER BY tua.created_at DESC`,
        [cid(req)]
      );
    } else if (role === "supervisor") {
      // Supervisor sees assignments they made to their helpers
      [rows] = await pool.query(
        `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
                tua.assigned_to AS "assignedTo", tua.assigned_by AS "assignedBy",
                tua.note, tua.created_at AS "createdAt",
                cu.full_name AS "assignedToName", cu.role AS "assignedToRole",
                COALESCE(ct.template_name, lt.template_name) AS "templateName"
         FROM template_user_assignments tua
         JOIN company_users cu ON cu.id = tua.assigned_to
         LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
         LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
         WHERE tua.company_id = ? AND tua.assigned_by = ?
         ORDER BY tua.created_at DESC`,
        [cid(req), req.companyUser.id]
      );
    } else {
      return res.status(403).json({ message: "Not authorised" });
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get assignments for the CURRENT logged-in user (employee/helper sees their assigned tasks)
router.get("/template-user-assignments/mine", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
              tua.note, tua.created_at AS "createdAt",
              ab.full_name AS "assignedByName",
              COALESCE(ct.template_name, lt.template_name) AS "templateName",
              lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName"
       FROM template_user_assignments tua
       JOIN company_users ab         ON ab.id = tua.assigned_by
       LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
       LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
       LEFT JOIN assets a             ON a.id = lt.asset_id
       WHERE tua.assigned_to = ? AND tua.company_id = ?
       ORDER BY tua.created_at DESC`,
      [req.companyUser.id, cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Delete an assignment (admin: any; supervisor: only ones they created)
router.delete("/template-user-assignments/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[row]] = await pool.query(
      "SELECT id, assigned_by FROM template_user_assignments WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!row) return res.status(404).json({ message: "Assignment not found" });

    if (role === "supervisor" && String(row.assigned_by) !== String(req.companyUser.id)) {
      return res.status(403).json({ message: "Not authorised to delete this assignment" });
    }

    await pool.query("DELETE FROM template_user_assignments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
