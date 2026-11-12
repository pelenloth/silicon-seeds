import { expect, type Page, type Route } from "@playwright/test";

export async function expectThreeSamples<T>(
  sample: () => Promise<T>,
  expected: T,
  intervalMs = 150,
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    expect(await sample()).toBe(expected);
  }
}

export type GenerationGuard = {
  calls: () => { method: string; url: string }[];
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function blockGeneration(page: Page): Promise<GenerationGuard> {
  const recorded: { method: string; url: string }[] = [];

  const reject = async (route: Route) => {
    const req = route.request();
    recorded.push({ method: req.method(), url: req.url() });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"blocked by test"}',
    });
  };

  const rejectMutating = async (route: Route) => {
    const method = route.request().method().toUpperCase();
    if (MUTATING_METHODS.has(method)) {
      await reject(route);
      return;
    }
    await route.continue();
  };

  await page.route("**/api/jobs/**", async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const pathname = new URL(req.url()).pathname;
    if (MUTATING_METHODS.has(method) || pathname === "/api/jobs/text") {
      await reject(route);
      return;
    }
    await route.continue();
  });

  await page.route("**/api/enhance**", reject);
  await page.route("**/api/intent**", reject);
  await page.route("**/api/tts/**", rejectMutating);
  await page.route("**/api/comfyui/**", rejectMutating);
  await page.route("**/api/settings**", rejectMutating);
  await page.route("**/api/loras**", rejectMutating);
  await page.route("**/api/style-presets**", rejectMutating);

  return {
    calls: () => [...recorded],
  };
}
