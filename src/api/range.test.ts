import { describe, expect, test } from "bun:test";
import { parseRange } from "./range";

describe("parseRange", () => {
  test("no header or foreign unit means no range", () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("items=0-5", 100)).toBeNull();
    expect(parseRange("bytes=abc", 100)).toBeNull();
  });
  test("multi-range falls back to a full response", () => {
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
  });
  test("open-ended, closed and suffix ranges", () => {
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange(" bytes = 5 - 9 ".replace(/ /g, ""), 100)).toEqual({
      start: 5,
      end: 9,
    });
  });
  test("unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
  });
});
