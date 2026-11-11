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
});
