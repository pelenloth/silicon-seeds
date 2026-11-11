import { describe, expect, test } from "bun:test";
import { galleryEtag } from "./gallery-etag";

const page = (ids: string[]) => ids.map((meta_id) => ({ meta_id }));

describe("galleryEtag", () => {
  test("is quoted and stable for the same page", () => {
    const a = galleryEtag({ limit: 20 }, page(["b", "a"]));
    expect(a).toBe(galleryEtag({ limit: 20 }, page(["b", "a"])));
    expect(a.startsWith('"') && a.endsWith('"')).toBe(true);
  });
  test("changes when a newer item pushes into a full page (B9)", () => {
    const before = galleryEtag({ limit: 2 }, page(["b", "a"]));
    const after = galleryEtag({ limit: 2 }, page(["c", "b"]));
    expect(after).not.toBe(before);
  });
  test("changes with type, cursor, limit and emptiness", () => {
    const base = galleryEtag({ limit: 20 }, page(["a"]));
    expect(galleryEtag({ limit: 20, type: "image" }, page(["a"]))).not.toBe(
      base,
    );
    expect(galleryEtag({ limit: 20, cursor: "x" }, page(["a"]))).not.toBe(base);
    expect(galleryEtag({ limit: 10 }, page(["a"]))).not.toBe(base);
    expect(galleryEtag({ limit: 20 }, [])).not.toBe(base);
  });
  test("encodes non-ASCII, CR/LF and quotes in type and cursor into valid ETag characters", () => {
    const tag = galleryEtag(
      { limit: 20, cursor: "€\r\nX-Evil: 1", type: 'vi deo"' },
      page(["a"]),
    );
    expect(tag).toMatch(/^"[\x21\x23-\x7e]*"$/);
    const other = galleryEtag(
      { limit: 20, cursor: "€\r\nX-Evil: 2", type: 'vi deo"' },
      page(["a"]),
    );
    expect(other).not.toBe(tag);
  });
  test("changes when job_name changes on an item in the page", () => {
    const before = galleryEtag({ limit: 20 }, [
      { meta_id: "b", job_name: null },
      { meta_id: "a", job_name: "Old Name" },
    ]);
    const afterFirst = galleryEtag({ limit: 20 }, [
      { meta_id: "b", job_name: "Generated Name" },
      { meta_id: "a", job_name: "Old Name" },
    ]);
    const afterSecond = galleryEtag({ limit: 20 }, [
      { meta_id: "b", job_name: "Generated Name" },
      { meta_id: "a", job_name: "New Name" },
    ]);
    expect(afterFirst).not.toBe(before);
    expect(afterSecond).not.toBe(afterFirst);
    expect(afterSecond).toMatch(/^"[\x21\x23-\x7e]*"$/);
  });
  test("changes when nextCursor changes", () => {
    const withoutNext = galleryEtag({ limit: 20 }, page(["b", "a"]), null);
    const withNextA = galleryEtag({ limit: 20 }, page(["b", "a"]), "a");
    const withNextZ = galleryEtag({ limit: 20 }, page(["b", "a"]), "z");
    expect(withNextA).not.toBe(withoutNext);
    expect(withNextZ).not.toBe(withNextA);
    expect(withNextA).toMatch(/^"[\x21\x23-\x7e]*"$/);
  });
});

describe("pickGalleryPage", () => {
  test("empty scan returns empty items and null nextCursor", async () => {
    const { pickGalleryPage } = await import("./gallery-etag");
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

  test("more rows were scanned than returned: nextCursor is meta_id of last returned item", async () => {
    const { pickGalleryPage } = await import("./gallery-etag");
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

  test("scan was full (limit * 2 rows) and fewer than limit survived: nextCursor is meta_id of last scanned row", async () => {
    const { pickGalleryPage } = await import("./gallery-etag");
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

  test("scan was not full and everything that survived was returned: nextCursor is null", async () => {
    const { pickGalleryPage } = await import("./gallery-etag");
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
