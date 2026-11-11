import { DB } from "../../db/db";
import { QueueManager } from "../../queue/queue-manager";
import { Context } from "hono";

export async function retry_job(c: Context, jobId: string) {
  try {
    await DB.Jobs.retryJob(jobId);
    void QueueManager.pump();
    return c.json({ success: true, jobId, status: "active" });
  } catch (e: any) {
    const status = e.status ?? 500;
    if (status === 409) return c.json({ error: e.message }, 409);
    if (e.message?.includes("not found") || e.message?.includes("no result"))
      return c.json({ error: "Job not found" }, 404);
    throw e;
  }
}
