import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const root = new URL(".", import.meta.url).pathname;
const srcRoot = new URL("..", import.meta.url).pathname;

async function sources(dir = root, includeTests = false) {
  const out: { path: string; text: string }[] = [];
  for await (const path of new Glob("**/*.{ts,tsx}").scan(dir)) {
    if (!includeTests && path.endsWith(".test.ts")) continue;
    out.push({ path, text: await Bun.file(dir + path).text() });
  }
  return out;
}

const BANNED: [string, RegExp][] = [
  ["React className", /\bclassName=/],
  ["React SVG props", /\bstroke(Width|Linecap|Linejoin)=/],
  // Note: stores/confirm.ts exports confirmDialog(...) and state; bare confirm( / alert( calls are banned.
  ["native confirm/alert", /(?<![.\w])(confirm|alert)\(/],
  ["window.confirm/alert/prompt", /\bwindow\.(confirm|alert|prompt)\b/],
  ["console.log", /\bconsole\.log\b/],
  ["HTMX leftovers", /HX-Redirect|hx-redirect/],
  ["rainbow sliders", /range-(secondary|accent|info|success|warning|error)/],
  ["heavy card shadows", /\bcard\b[^"`]*shadow-xl/],
  ["per-page EventSource", /new EventSource\(/],
  ["legacy job-updates alias", /useJobUpdates/],
];

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const PLAYWRIGHT_IMPORT_RE =
  /\b(?:import|export)\b[^;]*["']@playwright\/test["']|\bimport\s*\(\s*["']@playwright\/test["']\s*\)/;
const JOB_URL_TEMPLATE_RE = /(?:href=["']|`)\/jobs\/\$\{/;

describe("client conventions", () => {
  test("no banned patterns", async () => {
    const files = await sources();
    expect(files.length).toBeGreaterThan(20);
    const hits: string[] = [];
    for (const { path, text } of files) {
      for (const [name, re] of BANNED) {
        // stores/jobs.ts owns the single app-wide /jobs/stream/all EventSource connection.
        if (name === "per-page EventSource" && path === "stores/jobs.ts")
          continue;
        if (re.test(text)) hits.push(`${path}: ${name}`);
      }
      if (path.endsWith(".tsx") && EMOJI_RE.test(text)) {
        hits.push(`${path}: emoji in .tsx`);
      }
      for (const [idx, line] of text.split("\n").entries()) {
        if (
          JOB_URL_TEMPLATE_RE.test(line) &&
          !line.includes("encodeURIComponent(")
        ) {
          hits.push(`${path}:${idx + 1}: unencoded /jobs/\${...} URL`);
        }
      }
    }
    for (const { path, text } of await sources(srcRoot, true)) {
      if (PLAYWRIGHT_IMPORT_RE.test(text)) {
        hits.push(`src/${path}: @playwright/test import`);
      }
      if (!path.endsWith(".test.ts") && /HX-Redirect|hx-redirect/.test(text)) {
        hits.push(`src/${path}: HTMX leftovers`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("self-test: every BANNED regex flags its known-bad sample", () => {
    const samples: Record<string, string> = {
      "React className": "<div " + 'className="foo" />',
      "React SVG props": "<svg " + 'strokeWidth="2" />',
      "native confirm/alert": "if (" + "confirm('sure?')) {}",
      "window.confirm/alert/prompt": "window." + "alert('hi')",
      "console.log": "console." + "log('debug')",
      "HTMX leftovers": "res.headers.set('HX-" + "Redirect', '/')",
      "rainbow sliders": '<input class="range range-' + 'secondary" />',
      "heavy card shadows": '<div class="card bg-base-100 ' + 'shadow-xl" />',
      "per-page EventSource": "new " + "EventSource('/jobs/stream/all')",
      "legacy job-updates alias": "useJob" + "Updates()",
    };

    expect(Object.keys(samples).sort()).toEqual(
      BANNED.map(([name]) => name).sort(),
    );

    for (const [name, re] of BANNED) {
      const bad = samples[name] ?? "";
      expect(re.test(bad), `expected BANNED["${name}"] to flag sample`).toBe(
        true,
      );
      expect(
        re.test("const clean = 1;"),
        `expected BANNED["${name}"] not to flag clean code`,
      ).toBe(false);
    }
  });

  test("deleted legacy components stay deleted", async () => {
    for (const p of [
      "components/Layout.tsx",
      "components/EnhanceButton.tsx",
      "components/EnhanceModal.tsx",
      "components/SparkleIcon.tsx",
      "stores/theme.tsx",
    ]) {
      expect(await Bun.file(root + p).exists()).toBe(false);
    }
  });
});
