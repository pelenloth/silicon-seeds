import { describe, expect, test } from "bun:test";
import { canCancelJob } from "./job-cancel";

describe("canCancelJob", () => {
  test("active and paused jobs can be cancelled", () => {
    expect(canCancelJob("active")).toBe(true);
    expect(canCancelJob("paused")).toBe(true);
  });

  test("finished jobs and unknown statuses cannot", () => {
    for (const status of ["complete", "failed", "cancelled", "nonsense", ""]) {
      expect(canCancelJob(status)).toBe(false);
    }
  });
});
