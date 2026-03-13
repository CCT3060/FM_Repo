import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Auto-create table on first load (idempotent)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_users (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        full_name     VARCHAR(160) NOT NULL,
        email         VARCHAR(160) NOT NULL,
        phone         VARCHAR(32),
        designation   VARCHAR(120),
        role          VARCHAR(60) NOT NULL DEFAULT 'employee',
        status        VARCHAR(20) NOT NULL DEFAULT 'Active',
        password_hash VARCHAR(255),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Patch existing tables that were created before the role column was added
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS role VARCHAR(60) NOT NULL DEFAULT 'employee'`);
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_email ON company_users(email)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_username ON company_users(LOWER(username)) WHERE username IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id)`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[company-users] migration error:", err.message);
  }
})();

router.use(requireAuth);

// Verify company exists and the authenticated admin has access to it.
// All platform admins have equal access to all companies.
const verifyCompanyOwner = async (companyId) => {
  const [rows] = await pool.query(
    "SELECT id FROM companies WHERE id = ?",
    [companyId]
  );
  return rows.length > 0;
};

// ── GET /api/company-users?companyId=:id ──────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const ok = await verifyCompanyOwner(companyId);
    if (!ok) return res.status(403).json({ message: "Access denied" });

    const [rows] = await pool.query(
      `SELECT id,
              company_id   AS "companyId",
              full_name    AS "fullName",
              email,
              phone,
              designation,
              role,
              status,
              username,
              created_at   AS "createdAt"
       FROM company_users
       WHERE company_id = ?
       ORDER BY created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/company-users ───────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const { companyId, fullName, email, phone, designation, role = "employee", status = "Active", password, username } = req.body;

    if (!companyId || !fullName || !email) {
      return res.status(400).json({ message: "companyId, fullName and email are required" });
    }

    const ok = await verifyCompanyOwner(Number(companyId));
    if (!ok) return res.status(403).json({ message: "Access denied" });

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash, username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id,
                 company_id   AS "companyId",
                 full_name    AS "fullName",
                 email,
                 phone,
                 designation,
                 role,
                 status,
                 username,
                 created_at   AS "createdAt"`,
      [Number(companyId), fullName, email, phone || null, designation || null, role, status, passwordHash, username || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "uq_company_users_username") return res.status(409).json({ message: "A user with this username already exists" });
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// ── PUT /api/company-users/:id ────────────────────────────────────────────────
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, designation, role, status, password, username } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "fullName and email are required" });
    }

    // Ensure user belongs to a valid company
    const [check] = await pool.query(
      `SELECT cu.id
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [id]
    );
    if (!check.length) return res.status(403).json({ message: "Access denied" });

    let passwordClause = "";
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active", username || null];
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      passwordClause = ", password_hash = ?";
      params.push(passwordHash);
    }
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET full_name = ?, email = ?, phone = ?, designation = ?, role = ?, status = ?, username = ?${passwordClause}, updated_at = NOW()
       WHERE id = ?
       RETURNING id,
                 company_id   AS "companyId",
                 full_name    AS "fullName",
                 email,
                 phone,
                 designation,
                 role,
                 status,
                 username`,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "uq_company_users_username") return res.status(409).json({ message: "A user with this username already exists" });
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// ── DELETE /api/company-users/:id ─────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const [check] = await pool.query(
      `SELECT cu.id
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [id]
    );
    if (!check.length) return res.status(403).json({ message: "Access denied" });

    await pool.query("DELETE FROM company_users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Admin-level template-user assignment (for client portal) ──────
// POST /api/company-users/template-assignments
// Accepts the master admin JWT and a companyId in the body.
router.post("/template-assignments", requireAuth, async (req, res, next) => {
  try {
    const { companyId, templateType, templateId, assignedTo, note } = req.body;
    if (!companyId || !templateType || !templateId || !assignedTo) {
      return res.status(400).json({ message: "companyId, templateType, templateId and assignedTo are required" });
    }
    if (!["checklist", "logsheet"].includes(templateType)) {
      return res.status(400).json({ message: "templateType must be checklist or logsheet" });
    }
    const templateTable = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
    const [[tmpl]] = await pool.query(
      `SELECT id FROM ${templateTable} WHERE id = ? AND company_id = ?`,
      [templateId, companyId]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found in this company" });
    const [[user]] = await pool.query(
      `SELECT id FROM company_users WHERE id = ? AND company_id = ?`,
      [assignedTo, companyId]
    );
    if (!user) return res.status(404).json({ message: "User not found in this company" });
    const [rows] = await pool.query(
      `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
       VALUES (?, ?, ?, ?, NULL, ?)
       ON CONFLICT (template_type, template_id, assigned_to) DO UPDATE
         SET note = EXCLUDED.note, created_at = NOW()
       RETURNING id, template_type AS "templateType", template_id AS "templateId",
                 assigned_to AS "assignedTo", note, created_at AS "createdAt"`,
      [companyId, templateType, templateId, assignedTo, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── Admin: list OJT trainings by company ─────────────────────────
// GET /api/company-users/ojt-trainings?companyId=X
router.get("/ojt-trainings", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.description, t.status, t.passing_percentage AS "passingPercentage",
              t.created_at AS "createdAt",
              COUNT(DISTINCT p.id) AS "enrolledCount",
              COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) AS "completedCount"
       FROM ojt_trainings t
       LEFT JOIN ojt_user_progress p ON p.training_id = t.id
       WHERE t.company_id = ?
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Admin: get OJT training user progress by company ─────────────
// GET /api/company-users/ojt-progress?companyId=X
router.get("/ojt-progress", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT p.id, p.status, p.score, p.certificate_url AS "certificateUrl",
              t.title AS "trainingTitle",
              u.full_name AS "userName", u.email
       FROM ojt_user_progress p
       JOIN ojt_trainings t ON t.id = p.training_id
       JOIN company_users u ON u.id = p.user_id
       WHERE t.company_id = ?
       ORDER BY p.created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Admin: work orders by company ─────────────────────────────────────────
// GET /api/company-users/work-orders?companyId=X[&status=open]
router.get("/work-orders", requireAuth, async (req, res, next) => {
  try {
    const { companyId, status, limit = 200, offset = 0 } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    let where = "WHERE wo.company_id = ?";
    const params = [companyId];
    if (status) { where += " AND wo.status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS "workOrderNumber",
              wo.asset_id AS "assetId", wo.asset_name AS "assetName",
              wo.location, wo.issue_source AS "issueSource",
              wo.issue_description AS "issueDescription",
              wo.priority, wo.status,
              wo.flag_id AS "flagId",
              wo.cp_assigned_to AS "assignedTo",
              wo.assigned_note AS "assignedNote",
              cu.full_name AS "assignedToName",
              wo.cp_created_by AS "createdBy",
              cb.full_name AS "createdByName",
              wo.created_at AS "createdAt",
              wo.expected_completion_at AS "expectedCompletionAt",
              wo.escalation_level AS "escalationLevel",
              f.severity AS "flagSeverity", f.source AS "flagSource",
              COALESCE(f.escalated, FALSE) AS "flagEscalated"
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN flags f ON f.id = wo.flag_id
       ${where}
       ORDER BY wo.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM work_orders wo ${where}`, params
    );
    res.json({ total: Number(countRow?.total ?? 0), data: rows });
  } catch (err) { next(err); }
});

// POST /api/company-users/work-orders  – create work order (admin)
router.post("/work-orders", requireAuth, async (req, res, next) => {
  try {
    const { companyId, issueDescription, assetId, assetName, priority = "medium", assignedTo, assignedNote, expectedCompletionAt } = req.body;
    if (!companyId || !issueDescription) return res.status(400).json({ message: "companyId and issueDescription are required" });
    const woNum = `WO-${Date.now().toString(36).toUpperCase()}`;
    const [result] = await pool.query(
      `INSERT INTO work_orders (work_order_number, company_id, asset_id, asset_name, issue_description, priority, status, cp_assigned_to, assigned_note, expected_completion_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NOW(), NOW()) RETURNING id`,
      [woNum, companyId, assetId || null, assetName || null, issueDescription, priority, assignedTo || null, assignedNote || null, expectedCompletionAt || null]
    );
    res.status(201).json({ id: result.insertId, workOrderNumber: woNum, status: "open" });
  } catch (err) { next(err); }
});

// PUT /api/company-users/work-orders/:id/status  – update WO status (admin)
router.put("/work-orders/:id/status", requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["open", "in_progress", "completed", "closed"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
    await pool.query("UPDATE work_orders SET status = ?, updated_at = NOW() WHERE id = ?", [status, req.params.id]);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// PUT /api/company-users/work-orders/:id/assign  – assign WO (admin)
router.put("/work-orders/:id/assign", requireAuth, async (req, res, next) => {
  try {
    const { assignedTo, assignedNote } = req.body;
    await pool.query("UPDATE work_orders SET cp_assigned_to = ?, assigned_note = ?, updated_at = NOW() WHERE id = ?", [assignedTo || null, assignedNote || null, req.params.id]);
    res.json({ message: "Assigned" });
  } catch (err) { next(err); }
});

// ── Admin: shifts by company ──────────────────────────────────────────────
// GET /api/company-users/shifts?companyId=X
router.get("/shifts", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.start_time AS "startTime", s.end_time AS "endTime",
              s.description, s.status, s.created_at AS "createdAt",
              COUNT(DISTINCT es.company_user_id)::int AS "employeeCount"
       FROM shifts s
       LEFT JOIN employee_shifts es ON es.shift_id = s.id
       WHERE s.company_id = ?
       GROUP BY s.id ORDER BY s.start_time`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/shifts  – create shift (admin)
router.post("/shifts", requireAuth, async (req, res, next) => {
  try {
    const { companyId, name, startTime, endTime, description, status = "active" } = req.body;
    if (!companyId || !name || !startTime || !endTime) return res.status(400).json({ message: "companyId, name, startTime, endTime required" });
    const [result] = await pool.query(
      "INSERT INTO shifts (company_id, name, start_time, end_time, description, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [companyId, name, startTime, endTime, description || null, status]
    );
    res.status(201).json({ id: result.insertId, name, startTime, endTime, status });
  } catch (err) { next(err); }
});

// PUT /api/company-users/shifts/:id  – update shift (admin)
router.put("/shifts/:id", requireAuth, async (req, res, next) => {
  try {
    const { name, startTime, endTime, description, status } = req.body;
    const fields = []; const params = [];
    if (name !== undefined)        { fields.push("name = ?");        params.push(name); }
    if (startTime !== undefined)   { fields.push("start_time = ?");  params.push(startTime); }
    if (endTime !== undefined)     { fields.push("end_time = ?");    params.push(endTime); }
    if (description !== undefined) { fields.push("description = ?"); params.push(description); }
    if (status !== undefined)      { fields.push("status = ?");      params.push(status); }
    if (!fields.length) return res.status(400).json({ message: "No fields to update" });
    params.push(req.params.id);
    await pool.query(`UPDATE shifts SET ${fields.join(", ")} WHERE id = ?`, params);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// DELETE /api/company-users/shifts/:id
router.delete("/shifts/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM shifts WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── Admin: employees by company (CRUD) ────────────────────────────────────
// GET /api/company-users/employees?companyId=X
router.get("/employees", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, phone, role, designation,
              department_id AS "departmentId", status, created_at AS "createdAt"
       FROM company_users WHERE company_id = ? ORDER BY full_name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/employees – create employee (admin)
router.post("/employees", requireAuth, async (req, res, next) => {
  try {
    const { companyId, fullName, email, phone, role = "technician", designation, departmentId, password } = req.body;
    if (!companyId || !fullName || !email) return res.status(400).json({ message: "companyId, fullName, email required" });
    const bcrypt = (await import("bcryptjs")).default;
    const hashedPw = password ? await bcrypt.hash(password, 10) : await bcrypt.hash("changeme123", 10);
    const [result] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, role, designation, department_id, password, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active') RETURNING id`,
      [companyId, fullName, email, phone || null, role, designation || null, departmentId || null, hashedPw]
    );
    res.status(201).json({ id: result.insertId, fullName, email, role, status: "active" });
  } catch (err) { next(err); }
});

// PUT /api/company-users/employees/:id – update employee (admin)
router.put("/employees/:id", requireAuth, async (req, res, next) => {
  try {
    const { fullName, email, phone, role, designation, departmentId, status } = req.body;
    const fields = []; const params = [];
    if (fullName !== undefined)    { fields.push("full_name = ?");    params.push(fullName); }
    if (email !== undefined)       { fields.push("email = ?");        params.push(email); }
    if (phone !== undefined)       { fields.push("phone = ?");        params.push(phone); }
    if (role !== undefined)        { fields.push("role = ?");         params.push(role); }
    if (designation !== undefined) { fields.push("designation = ?");  params.push(designation); }
    if (departmentId !== undefined){ fields.push("department_id = ?");params.push(departmentId); }
    if (status !== undefined)      { fields.push("status = ?");       params.push(status); }
    if (!fields.length) return res.status(400).json({ message: "No fields" });
    params.push(req.params.id);
    await pool.query(`UPDATE company_users SET ${fields.join(", ")} WHERE id = ?`, params);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// DELETE /api/company-users/employees/:id
router.delete("/employees/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM company_users WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

export default router;
