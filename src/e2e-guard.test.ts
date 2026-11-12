import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const E2E_DIR = join(process.cwd(), "e2e");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

function importsTestFromPlaywright(src: string): boolean {
  const importRe =
    /\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@playwright\/test["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    const specifiers = (m[1] ?? "").split(",");
    for (const raw of specifiers) {
      const cleaned = raw.replace(/\btype\b/g, "").trim();
      const firstToken = cleaned.split(/\s+/)[0];
      if (firstToken === "test") return true;
    }
  }
  if (
    /\bimport\s+test\b[^;]*from\s+["']@playwright\/test["']/.test(src) ||
    /\bimport\s+\*\s+as\s+\w+\s+from\s+["']@playwright\/test["']/.test(src)
  ) {
    return true;
  }
  return false;
}

describe("e2e generation guard", () => {
  const files = listTsFiles(E2E_DIR);

  test("discovers e2e .ts files recursively", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const absPath of files) {
    const rel = relative(process.cwd(), absPath).replace(/\\/g, "/");
    test(`${rel} obeys e2e safety guard rules`, () => {
      const src = readFileSync(absPath, "utf8");

      if (rel !== "e2e/helpers/test.ts" && importsTestFromPlaywright(src)) {
        throw new Error(
          `${rel} imports test from @playwright/test; import test and expect from "./helpers/test" instead.`,
        );
      }

      if (
        rel !== "e2e/helpers/no-generation.ts" &&
        src.includes(".continue(")
      ) {
        throw new Error(
          `${rel} calls .continue(; use route.fallback() or route.fulfill() instead so the generation block still runs.`,
        );
      }

      if (/\brequest\.(?:post|put|patch|delete|fetch)\s*\(/.test(src)) {
        throw new Error(
          `${rel} calls a mutating request method; use request.get() or stub page routes instead.`,
        );
      }

      if (/\b(?:browser\.newContext|chromium\.launch)\s*\(/.test(src)) {
        throw new Error(
          `${rel} calls browser.newContext( or chromium.launch(; use the context or page fixture from "./helpers/test" instead so the generation block is installed.`,
        );
      }
    });
  }
});
