import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
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
import assetQRRouter from "./routes/assetQR.js";
import mobileAuthRouter from "./routes/mobileAuth.js";
import templateAssignmentsRouter from "./routes/templateAssignments.js";
import flagsRouter from "./routes/flags.js";
import flagRulesRouter from "./routes/flagRules.js";
import notificationsRouter from "./routes/notifications.js";

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

app.get("/health", (_req, res) => res.json({ status: "ok" }));
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
app.use("/api/asset-qr", assetQRRouter);
app.use("/api/mobile-auth", mobileAuthRouter);
app.use("/api/template-assignments", templateAssignmentsRouter);
app.use("/api/flags", flagsRouter);
app.use("/api/flag-rules", flagRulesRouter);
app.use("/api/notifications", notificationsRouter);

// Basic 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found", path: req.originalUrl }));

// Centralized error handler
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: "Unexpected error", detail: err.message });
});

export default app;
