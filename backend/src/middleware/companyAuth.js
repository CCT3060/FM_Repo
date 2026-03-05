import jwt from "jsonwebtoken";

/**
 * Middleware: verify company-user JWT (issued by /api/company-auth/login).
 * Sets req.companyUser = { id, email, companyId, role }
 */
export const requireCompanyAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const companyId = parseInt(payload.companyId, 10);
    if (!companyId || isNaN(companyId)) return res.status(401).json({ message: "Invalid company token" });
    req.companyUser = {
      id: payload.sub,
      email: payload.email,
      companyId,
      role: payload.role || "employee",
    };
    next();
  } catch {
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};

/**
 * Flexible auth: accepts EITHER a company-user JWT (cp_token) OR a main-platform
 * JWT (regular auth token). Used on routes that must work for both portals.
 *
 * - Company JWT  → sets req.companyUser { id, email, companyId, role }
 * - Platform JWT → sets req.user { id, email }, req.companyUser = null
 *
 * After this middleware, call helpers like:
 *   const cid = req.companyUser?.companyId ?? parseInt(req.query.companyId, 10)
 */
export const flexCompanyAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.companyId) {
      const companyId = parseInt(payload.companyId, 10);
      if (!companyId || isNaN(companyId)) return res.status(401).json({ message: "Invalid company token" });
      req.companyUser = { id: payload.sub, email: payload.email, companyId, role: payload.role || "employee" };
    } else {
      // Main-platform JWT (no companyId in token)
      req.companyUser = null;
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};
