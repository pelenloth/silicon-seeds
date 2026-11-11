import { describe, expect, test } from "bun:test";
import { confirmDialog, pendingConfirm, resolveConfirm } from "./confirm";

describe("confirm store", () => {
  test("second confirmDialog resolves the first promise with false, and resolveConfirm(true) resolves the pending one with true", async () => {
    const p1 = confirmDialog({ title: "First?" });
    expect(pendingConfirm()?.title).toBe("First?");

    const p2 = confirmDialog({ title: "Second?" });
    expect(await p1).toBe(false);
    expect(pendingConfirm()?.title).toBe("Second?");

    resolveConfirm(true);
    expect(await p2).toBe(true);
    expect(pendingConfirm()).toBeNull();
  });
});
