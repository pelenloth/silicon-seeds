import { DB } from "../../db/db";
import { Context } from "hono";
export async function delete_job(
  c: Context,
  jobId: string,
  _context: { source?: string; filter?: string; tab?: string },
) {
  const job = await DB.db
    .selectFrom("jobs")
    .select(["id", "status"])
    .where("id", "=", jobId)
    .executeTakeFirst();
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  if (job.status === "active") {
    return c.json({ error: "Cancel the job before deleting it" }, 409);
  }
  await DB.Jobs.deleteById(jobId);
  return c.json({ success: true, jobId });
}
