import { describe, expect, test } from "bun:test";
import {
  clearDraft,
  createDraftTracker,
  draftOf,
  loadDraft,
  mergeInitial,
  resolveInitialValues,
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
  test("resolveInitialValues: precedence base < defaults < draft < prefill < query", () => {
    const base = {
      prompt: "",
      resolution: "480p",
      image_model: "m1",
      style_preset: "none",
      batch_size: "1",
    };
    const defaults = {
      resolution: "1080p",
      image_model: "m2",
      style_preset: "watercolor",
    };
    const draft = {
      prompt: "from draft",
      image_model: "m3",
      unknown_key: "ignored",
    };
    const prefill = {
      prompt: "from prefill",
      style_preset: "noir",
    };
    const query = {
      prompt: "from query",
    };
    expect(
      resolveInitialValues({ base, defaults, draft, prefill, query }),
    ).toEqual({
      prompt: "from query",
      resolution: "1080p",
      image_model: "m3",
      style_preset: "noir",
      batch_size: "1",
    });
  });
  test("resolveInitialValues: draft with only a prompt + newer default resolution -> new resolution wins", () => {
    const base = {
      prompt: "",
      resolution: "720p",
      image_model: "z-image-turbo",
      style_preset: "none",
      batch_size: "1",
    };
    const defaults = {
      resolution: "1080p",
      image_model: "z-image-turbo",
      style_preset: "none",
    };
    const draft = { prompt: "only prompt was touched" };
    const out = resolveInitialValues({ base, defaults, draft });
    expect(out.prompt).toBe("only prompt was touched");
    expect(out.resolution).toBe("1080p");
  });
  test("resolveInitialValues: unknown keys in a stored draft are ignored", () => {
    const base = { prompt: "", resolution: "720p" };
    const out = resolveInitialValues({
      base,
      draft: { prompt: "ok", bogus: "123", __proto__: "bad" },
    });
    expect(out).toEqual({ prompt: "ok", resolution: "720p" });
    expect(Object.keys(out)).toEqual(["prompt", "resolution"]);
  });
  test("touch, draftOf and reset: sparse draft includes only touched fields, reset clears draft and touched set so later default change is picked up", () => {
    const s = fakeStorage();
    const tracker = createDraftTracker({
      route: "/create/image",
      allowedKeys: ["prompt", "resolution", "image_model"],
      storage: s,
    });

    const values = {
      prompt: "a desert fox",
      resolution: "720p",
      image_model: "z-image-turbo",
    };

    tracker.touch("prompt");
    expect(tracker.draftOf(values)).toEqual({ prompt: "a desert fox" });
    expect(draftOf(values, tracker.touched)).toEqual({
      prompt: "a desert fox",
    });

    tracker.persist(values);
    expect(loadDraft("/create/image", s)).toEqual({ prompt: "a desert fox" });
    expect(tracker.isUntouched("prompt")).toBe(false);
    expect(tracker.isUntouched("resolution")).toBe(true);

    tracker.reset();
    expect(tracker.touched.size).toBe(0);
    expect(tracker.draftOf(values)).toEqual({});
    expect(loadDraft("/create/image", s)).toBeNull();
    expect(tracker.isUntouched("prompt")).toBe(true);
    expect(tracker.isUntouched("resolution")).toBe(true);

    // After reset, a later untouched default change is picked up
    const nextDefaults = {
      prompt: "",
      resolution: "1080p",
      image_model: "flux2-klein-9b",
    };
    for (const [k, v] of Object.entries(nextDefaults)) {
      if (tracker.isUntouched(k)) {
        (values as Record<string, string>)[k] = v;
      }
    }
    expect(values).toEqual({
      prompt: "",
      resolution: "1080p",
      image_model: "flux2-klein-9b",
    });
  });
});
