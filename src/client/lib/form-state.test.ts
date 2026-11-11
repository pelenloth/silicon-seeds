import { describe, expect, test } from "bun:test";
import {
  clearDraft,
  loadDraft,
  mergeInitial,
  saveDraft,
  setPrefill,
  takePrefill,
  type StorageLike,
} from "./form-state";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("form-state", () => {
  test("drafts round-trip per route and can be cleared", () => {
    const s = fakeStorage();
    expect(loadDraft("/create/image", s)).toBeNull();
    saveDraft("/create/image", { prompt: "a fox" }, s);
    saveDraft("/compose", { script: "hello" }, s);
    expect(loadDraft("/create/image", s)).toEqual({ prompt: "a fox" });
    expect(loadDraft("/compose", s)).toEqual({ script: "hello" });
    clearDraft("/create/image", s);
    expect(loadDraft("/create/image", s)).toBeNull();
  });
  test("prefill is one-shot", () => {
    const s = fakeStorage();
    setPrefill("/create/image", { prompt: "reuse me" }, s);
    expect(takePrefill("/create/image", s)).toEqual({ prompt: "reuse me" });
    expect(takePrefill("/create/image", s)).toBeNull();
  });
  test("corrupt or non-object storage is ignored", () => {
    const s = fakeStorage();
    s.setItem("ss:draft:/x", "{not json");
    expect(loadDraft("/x", s)).toBeNull();
    s.setItem("ss:draft:/y", "[1,2]");
    expect(loadDraft("/y", s)).toBeNull();
  });
  test("a throwing storage never throws out", () => {
    const boom: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadDraft("/x", boom)).toBeNull();
    expect(() => saveDraft("/x", { a: "b" }, boom)).not.toThrow();
    expect(takePrefill("/x", boom)).toBeNull();
  });
  test("mergeInitial: later layers win, unknown keys and non-strings are dropped", () => {
    const out = mergeInitial(
      { prompt: "", resolution: "720p", fps: "16" },
      { resolution: "480p" },
      null,
      { prompt: "a fox", extra: "nope", fps: undefined },
    );
    expect(out).toEqual({ prompt: "a fox", resolution: "480p", fps: "16" });
  });
});
