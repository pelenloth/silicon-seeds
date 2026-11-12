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

export async function blockGeneration(
  page: Page,
): Promise<{ calls: () => { method: string; url: string }[] }> {
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

  await page.route("**/api/jobs/**", async (route) => {
    const method = route.request().method().toUpperCase();
    if (
      method === "POST" ||
      method === "PUT" ||
      method === "PATCH" ||
      method === "DELETE"
    ) {
      await reject(route);
      return;
    }
    await route.continue();
  });

  await page.route("**/api/enhance**", reject);
  await page.route("**/api/intent**", reject);

  return {
    calls: () => [...recorded],
  };
}
