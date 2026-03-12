import "dotenv/config";
import app from "./app.js";
import { startEscalationJob } from "./utils/escalationJob.js";
import { startWorkOrderEscalationJob } from "./utils/workOrderEscalationJob.js";

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on port ${port}`);
  startEscalationJob();
  startWorkOrderEscalationJob();
});
