import { describe, expect, test } from "bun:test";
import {
  enhanceChainReducer,
  enhanceSourceText,
  INITIAL_ENHANCE_CHAIN,
} from "./enhance-chain";

describe("enhanceChainReducer", () => {
  test("rule 1 & 2: origin is the user's text at the first Enhance of a chain, and every Enhance in the chain sends origin", () => {
    let state = INITIAL_ENHANCE_CHAIN;
    expect(enhanceSourceText(state, "user text")).toBe("user text");

    state = enhanceChainReducer(state, {
      type: "enhance-result",
      sentOrigin: enhanceSourceText(state, "user text"),
      resultText: "first enhanced",
    });
    expect(state.origin).toBe("user text");
    expect(state.lastResult).toBe("first enhanced");

    // Second enhance in chain sends the origin ("user text"), not "first enhanced"
    expect(enhanceSourceText(state, "first enhanced")).toBe("user text");

    state = enhanceChainReducer(state, {
      type: "enhance-result",
      sentOrigin: enhanceSourceText(state, "first enhanced"),
      resultText: "second enhanced",
    });
    expect(state.origin).toBe("user text");
    expect(state.lastResult).toBe("second enhanced");
  });

  test("rule 3: Undo restores the origin after multiple Enhances and ends the chain", () => {
    let state = INITIAL_ENHANCE_CHAIN;
    state = enhanceChainReducer(state, {
      type: "enhance-result",
      sentOrigin: "user text",
      resultText: "first enhanced",
    });
    state = enhanceChainReducer(state, {
      type: "enhance-result",
      sentOrigin: "user text",
      resultText: "second enhanced",
    });

    expect(state.origin).toBe("user text");
    state = enhanceChainReducer(state, { type: "undo" });
    expect(state.origin).toBeNull();
    expect(state.lastResult).toBeNull();
  });

  test("rule 4: typing in the field ends the chain so the next Enhance starts from the new field value", () => {
    let state = INITIAL_ENHANCE_CHAIN;
    state = enhanceChainReducer(state, {
      type: "enhance-result",
      sentOrigin: "user text",
      resultText: "first enhanced",
    });
    expect(state.origin).toBe("user text");

    state = enhanceChainReducer(state, {
      type: "user-input",
      value: "first enhanced edited",
    });
    expect(state.origin).toBeNull();
    expect(state.lastResult).toBeNull();
    expect(enhanceSourceText(state, "first enhanced edited")).toBe(
      "first enhanced edited",
    );
  });

  test("rule 5: external value change (Reset, draft, Generate again) ends the chain while keeping chain when value matches lastResult", () => {
    let state = INITIAL_ENHANCE_CHAIN;
    state = enhanceChainReducer(state, {
      type: "enhance-result",
      sentOrigin: "a fox",
      resultText: "an enhanced fox",
    });

    // Prop update reflecting the enhance result itself keeps the chain
    state = enhanceChainReducer(state, {
      type: "sync-value",
      value: "an enhanced fox",
    });
    expect(state.origin).toBe("a fox");

    // External reset to empty ends the chain; Inspire on empty sends empty text
    state = enhanceChainReducer(state, {
      type: "sync-value",
      value: "",
    });
    expect(state.origin).toBeNull();
    expect(state.lastResult).toBeNull();
    expect(enhanceSourceText(state, "")).toBe("");
  });
});
