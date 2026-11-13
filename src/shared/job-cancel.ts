export const JOB_CANCELLED_ERROR = "job cancelled by user";

export function canCancelJob(status: string): boolean {
  return status === "active" || status === "paused";
}
