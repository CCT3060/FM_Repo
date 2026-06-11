import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";
import clientsRouter from "./routes/clients.js";
import usersRouter from "./routes/users.js";
import authRouter from "./routes/auth.js";
import companiesRouter from "./routes/companies.js";
import assetTypesRouter from "./routes/assetTypes.js";
import assetsRouter from "./routes/assets.js";
import departmentsRouter from "./routes/departments.js";
import checklistsRouter from "./routes/checklists.js";
import logsRouter from "./routes/logs.js";
import checklistTemplatesRouter from "./routes/templateChecklists.js";
import logsheetTemplatesRouter from "./routes/templateLogs.js";
import companyUsersRouter from "./routes/companyUsers.js";
import companyAuthRouter from "./routes/companyAuth.js";
import companyPortalRouter from "./routes/companyPortal.js";
import companyRolesRouter from "./routes/companyRoles.js";
import assetQRRouter from "./routes/assetQR.js";
import mobileAuthRouter from "./routes/mobileAuth.js";
import templateAssignmentsRouter from "./routes/templateAssignments.js";
import submissionReportsRouter from "./routes/submissionReports.js";
import shiftsRouter from "./routes/shifts.js";
import flagsRouter from "./routes/flags.js";
import flagRulesRouter from "./routes/flagRules.js";
import notificationsRouter from "./routes/notifications.js";
import templateImportRouter from "./routes/templateImport.js";
import assetDashboardRouter from "./routes/assetDashboard.js";
import companyPortalAssetDashboardRouter from "./routes/companyPortalAssetDashboard.js";
import uploadRouter from "./routes/upload.js";
import softServiceRequestsRouter from "./routes/softServiceRequests.js";
import scheduledReportsRouter from "./routes/scheduledReports.js";

// ── Startup migrations ────────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`ALTER TABLE company_users ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL`);
  } catch (e) {
    console.warn("[startup] fcm_token migration warning:", e.message);
  }
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const allowedOrigins = process.env.ALLOW_ORIGIN?.split(",").map((o) => o.trim());

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("tiny"));

const healthHandler = async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[health] DB check failed:", err.message);
    res.status(503).json({ status: "degraded", db: "error", detail: err.message });
  }
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);
app.use("/api/auth", authRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/users", usersRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/asset-types", assetTypesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/checklists", checklistsRouter);
app.use("/api/logs", logsRouter);
app.use("/api/checklist-templates", checklistTemplatesRouter);
app.use("/api/logsheet-templates", logsheetTemplatesRouter);
app.use("/api/company-users", companyUsersRouter);
app.use("/api/company-auth", companyAuthRouter);
app.use("/api/company-portal", companyPortalRouter);
app.use("/api/company-portal/roles", companyRolesRouter);
app.use("/api/asset-qr", assetQRRouter);
app.use("/api/mobile-auth", mobileAuthRouter);
// Submission reports – accepts both company JWT and main-platform JWT (must be BEFORE templateAssignmentsRouter)
app.use("/api/template-assignments", submissionReportsRouter);
app.use("/api/template-assignments", templateAssignmentsRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/flags", flagsRouter);
app.use("/api/flag-rules", flagRulesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/template-import", templateImportRouter);
app.use("/api/asset-dashboard", assetDashboardRouter);
app.use("/api/company-portal/asset-dashboard", companyPortalAssetDashboardRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/soft-service", softServiceRequestsRouter);
app.use("/api/company-portal/scheduled-reports", scheduledReportsRouter);

app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "../uploads")));

// Basic 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found", path: req.originalUrl }));

// Centralized error handler
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const msg = String(err?.message || "");
  const code = String(err?.code || "");

  // Detect database connection / tenant configuration problems and surface a
  // clear, actionable message to mobile / web clients instead of leaking
  // low-level driver errors.
  const isDbConfigError =
    msg.includes("Tenant or user not found") ||
    msg.toLowerCase().includes("password authentication failed") ||
    msg.toLowerCase().includes("database") && msg.toLowerCase().includes("does not exist");
  const isDbUnreachable =
    code === "ECONNREFUSED" ||
    code === "ENETUNREACH" ||
    code === "ETIMEDOUT" ||
    msg.toLowerCase().includes("connect etimedout") ||
    msg.toLowerCase().includes("circuit breaker");

  if (isDbConfigError) {
    return res.status(503).json({
      message: "Database configuration error. Please contact your administrator.",
      code: "DB_CONFIG",
    });
  }
  if (isDbUnreachable) {
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again shortly.",
      code: "DB_UNREACHABLE",
    });
  }
  res.status(500).json({ message: "Unexpected error", detail: err.message });
});

export default app;
