/**
 * shifts.js — Shift Management Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * All routes scoped to the authenticated company user's company.
 *
 * Endpoints:
 *   GET    /api/shifts                   – list all company shifts
 *   POST   /api/shifts                   – create shift (admin only)
 *   PUT    /api/shifts/:id               – update shift (admin only)
 *   DELETE /api/shifts/:id               – delete shift (admin only)
 *   GET    /api/shifts/active            – shifts currently active by server time
 *   GET    /api/shifts/:id/employees     – list employees assigned to a shift
 *   POST   /api/shifts/:id/employees     – assign employee(s) to shift (admin only)
 *   DELETE /api/shifts/:id/employees/:userId – remove employee from shift (admin only)
 *   GET    /api/shifts/my-shifts         – shifts assigned to the calling user
 */

import { Router } from "express";
import { body, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

/* ── Helper: is this TIME currently active? ─────────────────────────────────
   Handles overnight shifts (end_time < start_time).                          */
const isShiftActive = (startTime, endTime) => {
  const now = new Date();
  // Convert to minutes-since-midnight for easy comparison
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const startMin = toMin(startTime);
  const endMin   = toMin(endTime);

  if (startMin <= endMin) {
    // Normal (same-day) shift: e.g., 06:00–14:00
    return nowMin >= startMin && nowMin < endMin;
  } else {
    // Overnight shift: e.g., 22:00–06:00
    return nowMin >= startMin || nowMin < endMin;
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   GET /shifts — List all shifts for the company
   ─────────────────────────────────────────────────────────────────────────── */
router.get("/", async (req, res, next) => {
  try {
    const [shifts] = await pool.query(
      `SELECT s.id, s.name, s.start_time AS "startTime", s.end_time AS "endTime",
              s.description, s.status, s.created_at AS "createdAt",
              COUNT(DISTINCT es.company_user_id)::int AS "employeeCount"
       FROM shifts s
       LEFT JOIN employee_shifts es ON es.shift_id = s.id
       WHERE s.company_id = ?
       GROUP BY s.id
       ORDER BY s.start_time ASC, s.name ASC`,
      [cid(req)]
    );
    // Annotate with isCurrentlyActive flag
    const result = shifts.map((s) => ({
      ...s,
      isActive: s.status === "active" && isShiftActive(s.startTime, s.endTime),
    }));
    res.json(result);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /shifts/active — Shifts currently active by server time
   ─────────────────────────────────────────────────────────────────────────── */
router.get("/active", async (req, res, next) => {
  try {
    const [shifts] = await pool.query(
      `SELECT id, name, start_time AS "startTime", end_time AS "endTime", description
       FROM shifts
       WHERE company_id = ? AND status = 'active'`,
      [cid(req)]
    );
    const active = shifts.filter((s) => isShiftActive(s.startTime, s.endTime));
    res.json(active);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /shifts/my-shifts — Shifts assigned to the calling user (+ active flag)
   ─────────────────────────────────────────────────────────────────────────── */
router.get("/my-shifts", async (req, res, next) => {
  try {
    const [shifts] = await pool.query(
      `SELECT s.id, s.name, s.start_time AS "startTime", s.end_time AS "endTime",
              s.description, s.status
       FROM shifts s
       JOIN employee_shifts es ON es.shift_id = s.id
       WHERE es.company_user_id = ? AND s.company_id = ?
       ORDER BY s.start_time ASC`,
      [req.companyUser.id, cid(req)]
    );
    const result = shifts.map((s) => ({
      ...s,
      isActive: s.status === "active" && isShiftActive(s.startTime, s.endTime),
    }));
    res.json(result);
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────────────────
   POST /shifts — Create a shift (admin only)
   ─────────────────────────────────────────────────────────────────────────── */
router.post(
  "/",
  validate([
    body("name").trim().notEmpty().withMessage("name is required"),
    body("startTime").matches(/^\d{2}:\d{2}$/).withMessage("startTime must be HH:MM"),
    body("endTime").matches(/^\d{2}:\d{2}$/).withMessage("endTime must be HH:MM"),
    body("description").optional().isString(),
    body("status").optional().isIn(["active", "inactive"]),
  ]),
  async (req, res, next) => {
    try {
      if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { name, startTime, endTime, description, status = "active" } = req.body;
      const [[shift]] = await pool.query(
        `INSERT INTO shifts (company_id, name, start_time, end_time, description, status)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, name, start_time AS "startTime", end_time AS "endTime",
                   description, status, created_at AS "createdAt"`,
        [cid(req), name.trim(), startTime, endTime, description?.trim() || null, status]
      );
      res.status(201).json({ ...shift, isActive: shift.status === "active" && isShiftActive(shift.startTime, shift.endTime), employeeCount: 0 });
    } catch (err) { next(err); }
  }
);

/* ─────────────────────────────────────────────────────────────────────────────
   PUT /shifts/:id — Update a shift (admin only)
   ─────────────────────────────────────────────────────────────────────────── */
router.put(
  "/:id",
  validate([
    param("id").isInt({ min: 1 }),
    body("name").optional().trim().notEmpty(),
    body("startTime").optional().matches(/^\d{2}:\d{2}$/),
    body("endTime").optional().matches(/^\d{2}:\d{2}$/),
    body("status").optional().isIn(["active", "inactive"]),
  ]),
  async (req, res, next) => {
    try {
      if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { id } = req.params;
      const { name, startTime, endTime, description, status } = req.body;
      const [[existing]] = await pool.query(
        `SELECT id FROM shifts WHERE id = ? AND company_id = ?`, [id, cid(req)]
      );
      if (!existing) return res.status(404).json({ message: "Shift not found" });
      const [[shift]] = await pool.query(
        `UPDATE shifts SET
           name        = COALESCE(?, name),
           start_time  = COALESCE(?, start_time),
           end_time    = COALESCE(?, end_time),
           description = COALESCE(?, description),
           status      = COALESCE(?, status)
         WHERE id = ? AND company_id = ?
         RETURNING id, name, start_time AS "startTime", end_time AS "endTime",
                   description, status, created_at AS "createdAt"`,
        [name?.trim() || null, startTime || null, endTime || null,
         description !== undefined ? (description?.trim() || null) : undefined,
         status || null, id, cid(req)]
      );
      res.json({ ...shift, isActive: shift.status === "active" && isShiftActive(shift.startTime, shift.endTime) });
    } catch (err) { next(err); }
  }
);

/* ─────────────────────────────────────────────────────────────────────────────
   DELETE /shifts/:id — Delete a shift (admin only)
   ─────────────────────────────────────────────────────────────────────────── */
router.delete(
  "/:id",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { id } = req.params;
      const [[existing]] = await pool.query(
        `SELECT id FROM shifts WHERE id = ? AND company_id = ?`, [id, cid(req)]
      );
      if (!existing) return res.status(404).json({ message: "Shift not found" });
      await pool.query(`DELETE FROM shifts WHERE id = ?`, [id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

/* ─────────────────────────────────────────────────────────────────────────────
   GET /shifts/:id/employees — List employees in a shift
   ─────────────────────────────────────────────────────────────────────────── */
router.get(
  "/:id/employees",
  validate([param("id").isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const [[shift]] = await pool.query(
        `SELECT id FROM shifts WHERE id = ? AND company_id = ?`, [id, cid(req)]
      );
      if (!shift) return res.status(404).json({ message: "Shift not found" });

      const [employees] = await pool.query(
        `SELECT cu.id, cu.full_name AS "fullName", cu.email, cu.role,
                cu.designation, cu.status, es.created_at AS "assignedAt"
         FROM employee_shifts es
         JOIN company_users cu ON cu.id = es.company_user_id
         WHERE es.shift_id = ? AND cu.company_id = ?
         ORDER BY cu.full_name ASC`,
        [id, cid(req)]
      );
      res.json(employees);
    } catch (err) { next(err); }
  }
);

/* ─────────────────────────────────────────────────────────────────────────────
   POST /shifts/:id/employees — Assign employee(s) to shift (admin only)
   Body: { userIds: number[] }
   ─────────────────────────────────────────────────────────────────────────── */
router.post(
  "/:id/employees",
  validate([
    param("id").isInt({ min: 1 }),
    body("userIds").isArray({ min: 1 }).withMessage("userIds array required"),
    body("userIds.*").isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { id } = req.params;
      const { userIds } = req.body;

      const [[shift]] = await pool.query(
        `SELECT id FROM shifts WHERE id = ? AND company_id = ?`, [id, cid(req)]
      );
      if (!shift) return res.status(404).json({ message: "Shift not found" });

      // Verify all users belong to this company
      const [users] = await pool.query(
        `SELECT id FROM company_users WHERE id = ANY(?) AND company_id = ?`,
        [userIds, cid(req)]
      );
      if (users.length !== userIds.length) {
        return res.status(400).json({ message: "One or more users not found in your company" });
      }

      // Bulk insert with conflict ignore
      await pool.query(
        `INSERT INTO employee_shifts (company_id, company_user_id, shift_id)
         SELECT ?, unnest(?::int[]), ?
         ON CONFLICT (company_user_id, shift_id) DO NOTHING`,
        [cid(req), userIds, id]
      );

      res.json({ message: `${userIds.length} employee(s) assigned to shift` });
    } catch (err) { next(err); }
  }
);

/* ─────────────────────────────────────────────────────────────────────────────
   DELETE /shifts/:id/employees/:userId — Remove employee from shift (admin)
   ─────────────────────────────────────────────────────────────────────────── */
router.delete(
  "/:id/employees/:userId",
  validate([
    param("id").isInt({ min: 1 }),
    param("userId").isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { id, userId } = req.params;
      const [[shift]] = await pool.query(
        `SELECT id FROM shifts WHERE id = ? AND company_id = ?`, [id, cid(req)]
      );
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      await pool.query(
        `DELETE FROM employee_shifts WHERE shift_id = ? AND company_user_id = ?`,
        [id, userId]
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

export default router;
