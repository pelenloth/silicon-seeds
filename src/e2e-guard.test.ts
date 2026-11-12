// Tripwire scanner for honest mistakes in e2e specs. String indirection is out
// of scope; the runtime guard in e2e/helpers/no-generation.ts is the actual
// protection (in-page requests go through the context routes).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const E2E_DIR = join(process.cwd(), "e2e");
const IN_PAGE_FETCH_MARKER = "// e2e-guard: in-page fetch";

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

function hasForbiddenFetch(src: string): boolean {
  for (const line of src.split(/\r?\n/)) {
    if (!/\bfetch\s*\(/.test(line)) continue;
    if (/\.\s*fetch\s*\(/.test(line)) return true;
    if (!line.includes(IN_PAGE_FETCH_MARKER)) return true;
  }
  return false;
}

function hasRequestDestructuring(src: string): boolean {
  const destructureRe = /\{([^}]*)\}\s*=\s*(?:page|context)\b/g;
  let m: RegExpExecArray | null;
  while ((m = destructureRe.exec(src)) !== null) {
    const props = (m[1] ?? "").split(",");
    for (const prop of props) {
      const propName = prop.split(/[:=]/)[0]?.trim();
      if (propName === "request") return true;
    }
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

    if (hasForbiddenFetch(src)) {
      issues.push(
        `${rel} calls fetch(; use request.get() or stub page routes instead so the generation guard is not bypassed (or mark in-page evaluate lines with ${IN_PAGE_FETCH_MARKER}).`,
      );
    }

    if (
      /\.\s*request\b(?!\s*\()/.test(src) ||
      hasRequestDestructuring(src) ||
      /\[\s*["']request["']\s*\]/.test(src)
    ) {
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
    /\b(?:browser\.(?:newContext|newPage)|request\.newContext|(?:chromium|firefox|webkit)\.(?:launch|launchPersistentContext|connectOverCDP|connect))\s*\(/.test(
      src,
    )
  ) {
    issues.push(
      `${rel} creates an unguarded context or page (browser.newContext, browser.newPage, request.newContext, launch, launchPersistentContext, connectOverCDP, or connect); use the fixtures from "./helpers/test" instead.`,
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
      [
        "marked route.fetch(",
        "await route" + `.fetch(); ${IN_PAGE_FETCH_MARKER}`,
      ],
      ["bare fetch(", "await " + "fetch('http://localhost:3000/api/jobs');"],
      ["browser.newContext(", "await browser" + ".newContext();"],
      ["browser.newPage(", "await browser" + ".newPage();"],
      ["chromium.launch(", "await chromium" + ".launch();"],
      [
        "chromium.launchPersistentContext(",
        "await chromium" + ".launchPersistentContext('/tmp/u');",
      ],
      [
        "chromium.connectOverCDP(",
        "await chromium" + ".connectOverCDP('http://localhost:9222');",
      ],
      ["chromium.connect(", "await chromium" + ".connect('ws://host');"],
      ["firefox.connect(", "await firefox" + ".connect('ws://host');"],
      ["webkit.connect(", "await webkit" + ".connect('ws://host');"],
      ["request.newContext(", "await request" + ".newContext();"],
      ["playwright.request", "const r = playwright" + ".request;"],
      ["page.request", "await page" + ".request.get('/api/jobs');"],
      ["context.request", "await context" + ".request.get('/api/jobs');"],
      [
        "aliased page/context .request",
        "const p = page; await p" + ".request.get('/api/jobs');",
      ],
      ["destructure request from page", "const { " + "request } = page;"],
      [
        "destructure request from context with alias",
        "const { " + "request: api } = context;",
      ],
      ['bracket access ["request"]', 'const r = page["' + 'request"];'],
      ["bracket access ['request']", "const r = context['" + "request'];"],
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
      "  await page.evaluate(async () => {",
      `    await ${"fetch"}("/api/jobs/images", { method: "POST" }); ${IN_PAGE_FETCH_MARKER}`,
      "  });",
      "});",
    ].join("\n");
    expect(scanE2eSource(cleanSample)).toEqual([]);
  });
});
