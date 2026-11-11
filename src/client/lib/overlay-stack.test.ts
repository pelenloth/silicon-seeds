import { describe, expect, test } from "bun:test";
import { pushOverlay, removeOverlay, topOverlay } from "./overlay-stack";

describe("overlay-stack", () => {
  test("topOverlay returns null for empty stack and the last item otherwise", () => {
    expect(topOverlay([])).toBeNull();
    expect(topOverlay([1, 2, 3])).toBe(3);
  });

  test("pushOverlay appends new id and deduplicates existing id moving it to top", () => {
    const s0: readonly number[] = [];
    const s1 = pushOverlay(s0, 10);
    expect(s1).toEqual([10]);
    expect(s0).toEqual([]);

    const s2 = pushOverlay(s1, 20);
    const s3 = pushOverlay(s2, 30);
    expect(s3).toEqual([10, 20, 30]);
    expect(topOverlay(s3)).toBe(30);

    const s4 = pushOverlay(s3, 10);
    expect(s4).toEqual([20, 30, 10]);
    expect(topOverlay(s4)).toBe(10);
  });

  test("removeOverlay removes an id regardless of position while preserving order", () => {
    const s = [1, 2, 3];
    expect(removeOverlay(s, 2)).toEqual([1, 3]);
    expect(removeOverlay(s, 3)).toEqual([1, 2]);
    expect(removeOverlay(s, 99)).toEqual([1, 2, 3]);
    expect(s).toEqual([1, 2, 3]);
  });
});
