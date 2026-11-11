import { Hono } from "hono";
import { JobUpdates } from "../../sse/job-updates";

const app = new Hono();

app.get("/stream/all", () => JobUpdates.streamAll());

app.get("/stream", (c) => {
  const jobId = c.req.query("job_id");
  if (!jobId) {
    return c.text("job_id is required", 400);
  }
  return JobUpdates.stream(jobId);
});

export default app;
