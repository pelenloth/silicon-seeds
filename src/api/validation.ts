import type { Context } from "hono";

export function formatZodIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): { error: string; fields: Record<string, string> } {
  const error = issues[0]?.message ?? "Invalid request";
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.path.length === 0) continue;
    const key = issue.path.map(String).join(".");
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return { error, fields };
}

export const validationHook: (
  result: {
    success: boolean;
    error?: {
      issues: readonly { path: readonly PropertyKey[]; message: string }[];
    };
  },
  c: Context,
) => Response | undefined = (result, c) => {
  if (!result.success) {
    return c.json(formatZodIssues(result.error!.issues), 400);
  }
  return undefined;
};
