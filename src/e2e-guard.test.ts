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

export function scanE2eSource(
  src: string,
  rel = "e2e/example.spec.ts",
): string[] {
  const issues: string[] = [];

  if (rel !== "e2e/helpers/test.ts" && importsTestFromPlaywright(src)) {
    issues.push(
      `${rel} imports test from @playwright/test; import test and expect from "./helpers/test" instead.`,
    );
  }

  if (rel !== "e2e/helpers/no-generation.ts") {
    if (/\.continue\s*\(/.test(src)) {
      issues.push(
        `${rel} calls .continue(; use route.fallback() or route.fulfill() instead so the generation block still runs.`,
      );
    }

    if (/\bfetch\s*\(/.test(src)) {
      issues.push(
        `${rel} calls fetch(; use request.get() or stub page routes instead so the generation guard is not bypassed.`,
      );
    }

    if (/\.\s*request\b(?!\s*\()/.test(src)) {
      issues.push(
        `${rel} accesses .request; use the guarded request fixture from "./helpers/test" instead of page.request, context.request, or playwright.request.`,
      );
    }
  }

  if (/\brequest\.(?:post|put|patch|delete|fetch)\s*\(/.test(src)) {
    issues.push(
      `${rel} calls a mutating request method; use request.get() or stub page routes instead.`,
    );
  }

  if (
    /\b(?:browser\.(?:newContext|newPage)|request\.newContext|(?:chromium|firefox|webkit)\.launch)\s*\(/.test(
      src,
    )
  ) {
    issues.push(
      `${rel} creates an unguarded context or page (browser.newContext, browser.newPage, request.newContext, or launch); use the fixtures from "./helpers/test" instead.`,
    );
  }

  return issues;
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
      const issues = scanE2eSource(src, rel);
      if (issues.length > 0) {
        throw new Error(issues.join("\n"));
      }
    });
  }

  test("self-test: scanner reports every forbidden pattern and accepts clean code", () => {
    const pwPkg = "@playwright" + "/test";
    const badSamples: [string, string][] = [
      [`import test from ${pwPkg}`, `import { test } from '${pwPkg}';`],
      ["route.continue(", "await route" + ".continue();"],
      ["request.post(", "await request" + ".post('/api/jobs');"],
      ["route.fetch(", "await route" + ".fetch();"],
      ["bare fetch(", "await " + "fetch('http://localhost:3000/api/jobs');"],
      ["browser.newContext(", "await browser" + ".newContext();"],
      ["browser.newPage(", "await browser" + ".newPage();"],
      ["chromium.launch(", "await chromium" + ".launch();"],
      ["request.newContext(", "await request" + ".newContext();"],
      ["playwright.request", "const r = playwright" + ".request;"],
      ["page.request", "await page" + ".request.get('/api/jobs');"],
      ["context.request", "await context" + ".request.get('/api/jobs');"],
      [
        "aliased page/context .request",
        "const p = page; await p" + ".request.get('/api/jobs');",
      ],
    ];

    for (const [label, sample] of badSamples) {
      const issues = scanE2eSource(sample);
      expect(
        issues.length,
        `expected "${label}" to be flagged`,
      ).toBeGreaterThan(0);
    }

    const cleanSample = [
      'import { expect, test } from "./helpers/test";',
      'test("clean", async ({ page, request }) => {',
      '  await page.route("**/api/jobs", async (route) => {',
      "    const req = route.request();",
      "    expect(req.method()).toBe('GET');",
      "    await route.fallback();",
      "  });",
      '  await request.get("/api/jobs");',
      "});",
    ].join("\n");
    expect(scanE2eSource(cleanSample)).toEqual([]);
  });
});
