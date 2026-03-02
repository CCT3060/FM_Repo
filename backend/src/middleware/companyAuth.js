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
    if (!payload.companyId) return res.status(401).json({ message: "Invalid company token" });
    req.companyUser = {
      id: payload.sub,
      email: payload.email,
      companyId: payload.companyId,
      role: payload.role || "employee",
    };
    next();
  } catch {
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};
