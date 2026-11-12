import { describe, expect, test } from "bun:test";
import { clampGalleryLimit, pickGalleryPage } from "./gallery-page";

describe("clampGalleryLimit", () => {
  test("clamps numeric and string inputs to 1..100 and falls back to 20 for NaN/missing", () => {
    expect(clampGalleryLimit(undefined)).toBe(20);
    expect(clampGalleryLimit(null)).toBe(20);
    expect(clampGalleryLimit("")).toBe(20);
    expect(clampGalleryLimit("abc")).toBe(20);
    expect(clampGalleryLimit(Number.NaN)).toBe(20);
    expect(clampGalleryLimit(Number.POSITIVE_INFINITY)).toBe(20);
    expect(clampGalleryLimit(-1)).toBe(1);
    expect(clampGalleryLimit("-1")).toBe(1);
    expect(clampGalleryLimit(0)).toBe(1);
    expect(clampGalleryLimit("0")).toBe(1);
    expect(clampGalleryLimit(1)).toBe(1);
    expect(clampGalleryLimit("12")).toBe(12);
    expect(clampGalleryLimit(100)).toBe(100);
    expect(clampGalleryLimit(101)).toBe(100);
    expect(clampGalleryLimit("9999")).toBe(100);
  });
});

describe("pickGalleryPage", () => {
  test("empty scan returns empty items and null nextCursor", () => {
    expect(
      pickGalleryPage({
        limit: 3,
        scanLimit: 6,
        scannedCount: 0,
        lastScannedMetaId: null,
        surviving: [],
      }),
    ).toEqual({ items: [], nextCursor: null });
  });

  test("more rows were scanned than returned: nextCursor is meta_id of last returned item", () => {
    // Case 1a: > limit items survived
    const res1 = pickGalleryPage({
      limit: 2,
      scanLimit: 4,
      scannedCount: 3,
      lastScannedMetaId: "m3",
      surviving: [{ meta_id: "m5" }, { meta_id: "m4" }, { meta_id: "m3" }],
    });
    expect(res1).toEqual({
      items: [{ meta_id: "m5" }, { meta_id: "m4" }],
      nextCursor: "m4",
    });

    // Case 1b: exactly limit items survived, but more rows were scanned (some dropped)
    const res2 = pickGalleryPage({
      limit: 2,
      scanLimit: 4,
      scannedCount: 3,
      lastScannedMetaId: "m2",
      surviving: [{ meta_id: "m5" }, { meta_id: "m2" }],
    });
    expect(res2).toEqual({
      items: [{ meta_id: "m5" }, { meta_id: "m2" }],
      nextCursor: "m2",
    });
  });

  test("scan was full (limit * 2 rows) and fewer than limit survived: nextCursor is meta_id of last scanned row", () => {
    const shortPage = pickGalleryPage({
      limit: 3,
      scanLimit: 6,
      scannedCount: 6,
      lastScannedMetaId: "m1",
      surviving: [{ meta_id: "m6" }],
    });
    expect(shortPage).toEqual({
      items: [{ meta_id: "m6" }],
      nextCursor: "m1",
    });

    const emptyPage = pickGalleryPage({
      limit: 3,
      scanLimit: 6,
      scannedCount: 6,
      lastScannedMetaId: "m0",
      surviving: [],
    });
    expect(emptyPage).toEqual({
      items: [],
      nextCursor: "m0",
    });
  });

  test("scan was not full and everything that survived was returned: nextCursor is null", () => {
    expect(
      pickGalleryPage({
        limit: 3,
        scanLimit: 6,
        scannedCount: 2,
        lastScannedMetaId: "m1",
        surviving: [{ meta_id: "m2" }, { meta_id: "m1" }],
      }),
    ).toEqual({
      items: [{ meta_id: "m2" }, { meta_id: "m1" }],
      nextCursor: null,
    });
  });
});
