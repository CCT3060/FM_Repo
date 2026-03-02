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
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_company_users_email ON company_users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id)`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[company-users] migration error:", err.message);
  }
})();

router.use(requireAuth);

// Verify company belongs to request user; returns true if allowed
const verifyCompanyOwner = async (companyId, userId) => {
  const [rows] = await pool.query(
    "SELECT id FROM companies WHERE id = ? AND user_id = ?",
    [companyId, userId]
  );
  return rows.length > 0;
};

// ── GET /api/company-users?companyId=:id ──────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const ok = await verifyCompanyOwner(companyId, req.user.id);
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
    const { companyId, fullName, email, phone, designation, role = "employee", status = "Active", password } = req.body;

    if (!companyId || !fullName || !email) {
      return res.status(400).json({ message: "companyId, fullName and email are required" });
    }

    const ok = await verifyCompanyOwner(Number(companyId), req.user.id);
    if (!ok) return res.status(403).json({ message: "Access denied" });

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id,
                 company_id   AS "companyId",
                 full_name    AS "fullName",
                 email,
                 phone,
                 designation,
                 role,
                 status,
                 created_at   AS "createdAt"`,
      [Number(companyId), fullName, email, phone || null, designation || null, role, status, passwordHash]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// ── PUT /api/company-users/:id ────────────────────────────────────────────────
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, designation, role, status, password } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "fullName and email are required" });
    }

    // Ensure user belongs to a company owned by the requester
    const [check] = await pool.query(
      `SELECT cu.id
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ? AND c.user_id = ?`,
      [id, req.user.id]
    );
    if (!check.length) return res.status(403).json({ message: "Access denied" });

    let passwordClause = "";
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active"];
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      passwordClause = ", password_hash = ?";
      params.push(passwordHash);
    }
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET full_name = ?, email = ?, phone = ?, designation = ?, role = ?, status = ?${passwordClause}, updated_at = NOW()
       WHERE id = ?
       RETURNING id,
                 company_id   AS "companyId",
                 full_name    AS "fullName",
                 email,
                 phone,
                 designation,
                 role,
                 status`,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
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
       WHERE cu.id = ? AND c.user_id = ?`,
      [id, req.user.id]
    );
    if (!check.length) return res.status(403).json({ message: "Access denied" });

    await pool.query("DELETE FROM company_users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
