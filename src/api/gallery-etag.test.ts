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
});
