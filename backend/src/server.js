import "dotenv/config";
import app from "./app.js";
import { startEscalationJob } from "./utils/escalationJob.js";

const port = Number(process.env.PORT || 4000);

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on port ${port}`);
  startEscalationJob();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(`Port ${port} is already in use. Kill it with: npx kill-port ${port}`);
    process.exit(1);
  }
  throw err;
});
