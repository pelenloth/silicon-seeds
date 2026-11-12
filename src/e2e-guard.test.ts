import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const E2E_DIR = join(process.cwd(), "e2e");

const CREATE_ENHANCE_INTENT_RE =
  /\/api\/(?:jobs\/(?:images|videos|audio|scenes|instrumental)|enhance|intent)/;

function hasForbiddenRoutePassthrough(src: string): boolean {
  const parts = src.split("page.route");
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i] ?? "";
    const firstLine = chunk.slice(0, 200);
    if (!CREATE_ENHANCE_INTENT_RE.test(firstLine)) continue;
    if (/route\.(?:continue|fallback)\s*\(/.test(chunk)) {
      return true;
    }
  }
  return false;
}

describe("e2e generation guard", () => {
  const files = readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .sort();

  test("discovers e2e spec files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${file} imports test from ./helpers/test and never forwards create/enhance/intent routes`, () => {
      const src = readFileSync(join(E2E_DIR, file), "utf8");
      if (
        src.includes('"@playwright/test"') ||
        src.includes("'@playwright/test'")
      ) {
        throw new Error(
          `${file} imports from @playwright/test directly; import test and expect from "./helpers/test" instead.`,
        );
      }
      if (!src.includes("./helpers/test")) {
        throw new Error(
          `${file} must import test and expect from "./helpers/test".`,
        );
      }
      if (hasForbiddenRoutePassthrough(src)) {
        throw new Error(
          `${file} registers a create/enhance/intent route that calls route.continue() or route.fallback(); import from "./helpers/test" and fulfill the stub instead.`,
        );
      }
    });
  }
});
