import { comfyClient } from "../../comfyui/comfyui-client";
import { DB } from "../../db/db";
import { JobLifecycleStatus } from "../../events/events";
import { Logger } from "../../logger/logger";
import { QueueManager } from "../../queue/queue-manager";
import { Context } from "hono";

export async function cancel_job(
  c: Context,
  jobId: string,
  _context: { source?: string; filter?: string; tab?: string },
) {
  try {
    const result = await DB.Jobs.cancelJob(jobId);
    const wasActive = result.job.status === JobLifecycleStatus.Active;
    if (wasActive && result.runningPromptId) QueueManager.holdForComfyIdle();
    if (result.pendingPromptIds.length > 0) {
      try {
        await comfyClient.deleteQueuedPrompts(result.pendingPromptIds);
      } catch (e) {
        Logger.error("Failed to delete queued prompts", {
          jobId,
          error: String(e),
        });
      }
    }
    if (result.runningPromptId) {
      try {
        await comfyClient.interruptPrompt(result.runningPromptId);
      } catch (e) {
        Logger.error("Failed to interrupt", { jobId, error: String(e) });
        QueueManager.releaseComfyIdle();
      }
    }
    if (wasActive && !result.runningPromptId) void QueueManager.pump();
    return c.json({ success: true, jobId });
  } catch (e: any) {
    const status = e.status ?? 500;
    if (status === 409) return c.json({ error: e.message }, 409);
    if (e.message?.includes("not found") || e.message?.includes("no result"))
      return c.json({ error: "Job not found" }, 404);
    throw e;
  }
}
