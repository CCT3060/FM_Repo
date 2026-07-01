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
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS module_access JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS service_domain VARCHAR(20) NOT NULL DEFAULT 'technical'`);
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS push_token TEXT NULL`);
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS push_token_platform VARCHAR(20) NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_email ON company_users(email)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_username ON company_users(LOWER(username)) WHERE username IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id)`);
    // Multi-company assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_company_assignments (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, company_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_uca_user_id ON user_company_assignments(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_uca_company_id ON user_company_assignments(company_id)`);
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
              permissions,
              module_access AS "moduleAccess",
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
    const { companyId, fullName, email, phone, designation, role = "employee", status = "Active", password, username, permissions, moduleAccess } = req.body;

    if (!companyId || !fullName || !email) {
      return res.status(400).json({ message: "companyId, fullName and email are required" });
    }

    const ok = await verifyCompanyOwner(Number(companyId));
    if (!ok) return res.status(403).json({ message: "Access denied" });

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    const permJson = JSON.stringify(permissions && typeof permissions === "object" ? permissions : {});
    const modJson  = JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []);

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash, username, permissions, module_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
       RETURNING id,
                 company_id    AS "companyId",
                 full_name     AS "fullName",
                 email,
                 phone,
                 designation,
                 role,
                 status,
                 username,
                 permissions,
                 module_access AS "moduleAccess",
                 created_at    AS "createdAt"`,
      [Number(companyId), fullName, email, phone || null, designation || null, role, status, passwordHash, username || null, permJson, modJson]
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
    const { fullName, email, phone, designation, role, status, password, username, permissions, moduleAccess } = req.body;

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

    const setClauses = ["full_name = ?", "email = ?", "phone = ?", "designation = ?", "role = ?", "status = ?", "username = ?"];
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active", username || null];
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      setClauses.push("password_hash = ?");
      params.push(passwordHash);
    }
    if (permissions !== undefined) {
      setClauses.push("permissions = ?::jsonb");
      params.push(JSON.stringify(permissions || {}));
    }
    if (moduleAccess !== undefined) {
      setClauses.push("module_access = ?::jsonb");
      params.push(JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []));
    }
    setClauses.push("updated_at = NOW()");
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET ${setClauses.join(", ")}
       WHERE id = ?
       RETURNING id,
                 company_id    AS "companyId",
                 full_name     AS "fullName",
                 email,
                 phone,
                 designation,
                 role,
                 status,
                 username,
                 permissions,
                 module_access AS "moduleAccess"`,
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
// Helper: sync user_company_assignments for a given user (replaces all assignments)
// companyIds is the COMPLETE list of companies the user should have access to.
async function syncCompanyAssignments(userId, primaryCompanyId, companyIds = []) {
  // Remove all existing assignments
  await pool.query(`DELETE FROM user_company_assignments WHERE user_id = ?`, [userId]);
  // Insert all assigned companies — this is the authoritative access list
  const ids = (companyIds || []).map(Number).filter(id => id > 0);
  for (const id of ids) {
    await pool.query(
      `INSERT INTO user_company_assignments (user_id, company_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [userId, id]
    );
  }
}

// GET /api/company-users/employees?companyId=X  (or companyId=all for all companies)
router.get("/employees", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    let rows;
    if (companyId === "all") {
      // Return all employees across all companies with the company name included
      [rows] = await pool.query(
        `SELECT cu.id, cu.full_name AS "fullName", cu.email, cu.phone, cu.role, cu.designation,
                cu.department_id AS "departmentId", cu.status, cu.username,
                cu.company_id AS "companyId", c.company_name AS "companyName",
                cu.permissions, cu.module_access AS "moduleAccess", cu.created_at AS "createdAt"
         FROM company_users cu
         JOIN companies c ON c.id = cu.company_id
         ORDER BY c.company_name, cu.full_name`,
        []
      );
    } else {
      [rows] = await pool.query(
        `SELECT cu.id, cu.full_name AS "fullName", cu.email, cu.phone, cu.role, cu.designation,
                cu.department_id AS "departmentId", cu.status, cu.username,
                cu.company_id AS "companyId", c.company_name AS "companyName",
                cu.permissions, cu.module_access AS "moduleAccess", cu.created_at AS "createdAt"
         FROM company_users cu
         JOIN companies c ON c.id = cu.company_id
         WHERE cu.company_id = ? ORDER BY cu.full_name`,
        [companyId]
      );
    }
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/employees – create employee (admin)
router.post("/employees", requireAuth, async (req, res, next) => {
  try {
    const { companyId, fullName, email, phone, role = "technician", designation, departmentId, status = "Active", username, password, permissions, moduleAccess } = req.body;
    if (!companyId || !fullName || !email) return res.status(400).json({ message: "companyId, fullName, email required" });
    const bcrypt = (await import("bcryptjs")).default;
    const hashedPw = password ? await bcrypt.hash(password, 10) : await bcrypt.hash("changeme123", 10);
    const permJson = JSON.stringify(permissions && typeof permissions === "object" ? permissions : {});
    const modJson  = JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []);
    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, role, designation, department_id, username, password_hash, status, permissions, module_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
       RETURNING id, full_name AS "fullName", email, phone, role, designation, status, username`,
      [companyId, fullName, email, phone || null, role, designation || null, departmentId || null, username || null, hashedPw, status, permJson, modJson]
    );
    const newUser = rows[0];
    // Sync extra company assignments if provided
    const { companyIds } = req.body;
    if (Array.isArray(companyIds)) {
      await syncCompanyAssignments(newUser.id, companyId, companyIds);
    }
    res.status(201).json(newUser);
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint && err.constraint.includes("username")) return res.status(409).json({ message: "A user with this username already exists" });
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// PUT /api/company-users/employees/:id – update employee (admin)
router.put("/employees/:id", requireAuth, async (req, res, next) => {
  try {
    const { fullName, email, phone, role, designation, departmentId, status, username, password, permissions, moduleAccess } = req.body;
    const fields = []; const params = [];
    if (fullName !== undefined)    { fields.push("full_name = ?");    params.push(fullName); }
    if (email !== undefined)       { fields.push("email = ?");        params.push(email); }
    if (phone !== undefined)       { fields.push("phone = ?");        params.push(phone); }
    if (role !== undefined)        { fields.push("role = ?");         params.push(role); }
    if (designation !== undefined) { fields.push("designation = ?");  params.push(designation); }
    if (departmentId !== undefined){ fields.push("department_id = ?");params.push(departmentId); }
    if (status !== undefined)      { fields.push("status = ?");       params.push(status); }
    if (username !== undefined)    { fields.push("username = ?");     params.push(username || null); }
    if (password)                  {
      const bcrypt = (await import("bcryptjs")).default;
      fields.push("password_hash = ?");
      params.push(await bcrypt.hash(password, 10));
    }
    if (permissions !== undefined) { fields.push("permissions = ?::jsonb"); params.push(JSON.stringify(permissions || {})); }
    if (moduleAccess !== undefined){ fields.push("module_access = ?::jsonb"); params.push(JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : [])); }
    if (!fields.length) return res.status(400).json({ message: "No fields" });
    params.push(req.params.id);
    const [rows] = await pool.query(
      `UPDATE company_users SET ${fields.join(", ")} WHERE id = ? RETURNING id, full_name AS "fullName", email, phone, role, designation, status, username, company_id AS "companyId"`,
      params
    );
    const updated = rows[0];
    // Sync extra company assignments if provided
    const { companyIds } = req.body;
    if (updated && Array.isArray(companyIds)) {
      await syncCompanyAssignments(updated.id, updated.companyId, companyIds);
    }
    res.json(updated || { message: "Updated" });
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint && err.constraint.includes("username")) return res.status(409).json({ message: "A user with this username already exists" });
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// DELETE /api/company-users/employees/:id
router.delete("/employees/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM company_users WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// GET /api/company-users/employees/:id/companies – companies the user has access to
// Returns UCA entries if any exist, otherwise falls back to the user's primary company.
router.get("/employees/:id/companies", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.company_name AS "companyName", c.company_code AS "companyCode"
       FROM user_company_assignments uca
       JOIN companies c ON c.id = uca.company_id
       WHERE uca.user_id = ?
       ORDER BY c.company_name`,
      [req.params.id]
    );
    if (rows.length > 0) return res.json(rows);
    // No explicit assignments — return primary company as the single accessible company
    const [[user]] = await pool.query(
      `SELECT company_id AS "companyId" FROM company_users WHERE id = ?`,
      [req.params.id]
    );
    if (!user) return res.json([]);
    const [[primary]] = await pool.query(
      `SELECT id, company_name AS "companyName", company_code AS "companyCode" FROM companies WHERE id = ?`,
      [user.companyId]
    );
    res.json(primary ? [primary] : []);
  } catch (err) { next(err); }
});

// ── Company Roles (platform admin view) ──────────────────────────────────────
// GET /api/company-users/company-roles?companyId=X
router.get("/company-roles", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT id, company_id AS "companyId", role_key AS "roleKey", label,
                parent_role_key AS "parentRoleKey", sort_order AS "sortOrder",
                color, bg_color AS "bgColor", is_active AS "isActive",
                can_raise_soft_issue AS "canRaiseSoftIssue",
                can_resolve_soft_issue AS "canResolveSoftIssue",
                is_soft_manager AS "isSoftManager",
                is_technical_supervisor AS "isTechnicalSupervisor",
                is_technician AS "isTechnician"
         FROM company_roles WHERE company_id = ? AND is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
        [companyId]
      );
    } catch {
      [rows] = await pool.query(
        `SELECT id, company_id AS "companyId", role_key AS "roleKey", label,
                parent_role_key AS "parentRoleKey", sort_order AS "sortOrder",
                color, bg_color AS "bgColor", is_active AS "isActive"
         FROM company_roles WHERE company_id = ? AND is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
        [companyId]
      );
    }
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/company-roles
router.post("/company-roles", requireAuth, async (req, res, next) => {
  try {
    const { companyId, label, roleKey, parentRoleKey, color, bgColor,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager,
            isTechnicalSupervisor, isTechnician } = req.body;
    if (!companyId || !label) return res.status(400).json({ message: "companyId and label are required" });
    const slugify = (s) => String(s||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)||`role_${Date.now()}`;
    const key = roleKey?.trim() || slugify(label);
    const [rows] = await pool.query(
      `INSERT INTO company_roles (company_id, role_key, label, parent_role_key, color, bg_color,
          can_raise_soft_issue, can_resolve_soft_issue, is_soft_manager, is_technical_supervisor, is_technician)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, company_id AS "companyId", role_key AS "roleKey", label, parent_role_key AS "parentRoleKey",
                 color, bg_color AS "bgColor", is_active AS "isActive",
                 can_raise_soft_issue AS "canRaiseSoftIssue", can_resolve_soft_issue AS "canResolveSoftIssue",
                 is_soft_manager AS "isSoftManager", is_technical_supervisor AS "isTechnicalSupervisor",
                 is_technician AS "isTechnician"`,
      [companyId, key, label.trim(), parentRoleKey||null, color||"#475569", bgColor||"#f1f5f9",
       !!canRaiseSoftIssue, !!canResolveSoftIssue, !!isSoftManager, !!isTechnicalSupervisor, !!isTechnician]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "A role with this key already exists for this company" });
    next(err);
  }
});

// PUT /api/company-users/company-roles/:id
router.put("/company-roles/:id", requireAuth, async (req, res, next) => {
  try {
    const { label, parentRoleKey, color, bgColor,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager,
            isTechnicalSupervisor, isTechnician } = req.body;
    await pool.query(
      `UPDATE company_roles SET label = ?, parent_role_key = ?, color = ?, bg_color = ?,
          can_raise_soft_issue = ?, can_resolve_soft_issue = ?, is_soft_manager = ?,
          is_technical_supervisor = ?, is_technician = ?
       WHERE id = ?`,
      [label, parentRoleKey||null, color||"#475569", bgColor||"#f1f5f9",
       !!canRaiseSoftIssue, !!canResolveSoftIssue, !!isSoftManager, !!isTechnicalSupervisor, !!isTechnician,
       req.params.id]
    );
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// DELETE /api/company-users/company-roles/:id
router.delete("/company-roles/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE company_roles SET is_active = FALSE WHERE id = ?`, [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── Locations (platform admin view) ──────────────────────────────────────────
// GET /api/company-users/locations?companyId=X
router.get("/locations", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT id, name, campus, building, floor, room, status, qr_code AS "qrCode", created_at AS "createdAt"
       FROM locations WHERE company_id = ? ORDER BY name ASC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /api/company-users/locations/:id
router.delete("/locations/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM locations WHERE id = ?`, [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── GET /api/company-users/soft-requests?companyId=:id&status=:status ────────
router.get("/soft-requests", async (req, res, next) => {
  try {
    const { companyId, status } = req.query;
    let whereClause = "WHERE 1=1";
    const params = [];
    if (companyId) { whereClause += " AND ssr.company_id = ?"; params.push(Number(companyId)); }
    if (status && status !== "all") { whereClause += " AND ssr.status = ?"; params.push(status); }

    const [rows] = await pool.query(
      `SELECT
         ssr.id,
         ssr.company_id        AS "companyId",
         c.company_name        AS "companyName",
         ssr.asset_id          AS "assetId",
         COALESCE(a.asset_name, loc.name, 'N/A') AS "assetName",
         ssr.description,
         ssr.status,
         ssr.raised_at         AS "raisedAt",
         ssr.resolved_at       AS "resolvedAt",
         ssr.escalation_level  AS "escalationLevel",
         cu.full_name          AS "raisedBy",
         COALESCE(cu2.full_name, 'Unassigned') AS "assignedTo",
         ssr.notes
       FROM soft_service_requests ssr
       LEFT JOIN companies c ON c.id = ssr.company_id
       LEFT JOIN assets a ON a.id = ssr.asset_id
       LEFT JOIN locations loc ON loc.id = ssr.location_id
       LEFT JOIN company_users cu ON cu.id = ssr.raised_by_user_id
       LEFT JOIN company_users cu2 ON cu2.id = ssr.assigned_to_user_id
       ${whereClause}
       ORDER BY ssr.raised_at DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PUT /api/company-users/soft-requests/:id/resolve ─────────────────────────
router.put("/soft-requests/:id/resolve", async (req, res, next) => {
  try {
    const { notes } = req.body || {};
    await pool.query(
      `UPDATE soft_service_requests SET status = 'resolved', resolved_at = NOW(), notes = ? WHERE id = ?`,
      [notes || null, Number(req.params.id)]
    );
    res.json({ message: "Resolved" });
  } catch (err) { next(err); }
});

export default router;
