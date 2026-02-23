import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import clientsRouter from "./routes/clients.js";
import usersRouter from "./routes/users.js";

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
app.use("/api/clients", clientsRouter);
app.use("/api/users", usersRouter);

// Basic 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found", path: req.originalUrl }));

// Centralized error handler
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: "Unexpected error", detail: err.message });
});

export default app;
