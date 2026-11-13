import { expect, test } from "./helpers/test";

test("create text-to-video: no preset, no LoRAs, validation (no generation)", async ({
  page,
}) => {
  await page.goto("/create/text-to-video");
  await expect(
    page.getByRole("heading", { level: 1, name: "Text to Video" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#sidebar-text-to-video")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator('textarea[name="prompt"]')).toBeVisible();
  await expect(page.locator('select[name="video_model"]')).toBeVisible();
  await expect(page.locator('select[name="resolution"]')).toBeVisible();
  await expect(
    page.locator('input[name="clip_duration"][type="range"]'),
  ).toBeVisible();

  await expect(page.locator('select[name="style_preset"]')).toHaveCount(0);
  await expect(page.getByText("LoRAs", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/Intermediate image \(used for I2V\)/i),
  ).toHaveCount(0);

  await page.locator("#submit-btn").click();
  await expect(page.getByText("Prompt is required")).toBeVisible();
  await expect(page).not.toHaveURL(/job_id=/);
  await expect(
    page.getByRole("button", { name: /Generate Video/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  await expect(page).toHaveURL(/\/create\/text-to-video/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#submit-btn")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("create text-to-video: submit payload sends exact PostTextToVideoSchema fields without style_preset or loras (blocked with 503)", async ({
  page,
}) => {
  let capturedFields: Record<string, string> | null = null;
  await page.route("**/api/jobs/videos", async (route) => {
    const req = route.request();
    const buf = req.postDataBuffer();
    const ct = req.headers()["content-type"] ?? "";
    if (buf && ct) {
      const fd = await new Response(new Uint8Array(buf), {
        headers: { "content-type": ct },
      }).formData();
      const map: Record<string, string> = {};
      fd.forEach((v, k) => {
        map[k] = typeof v === "string" ? v : String(v);
      });
      capturedFields = map;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked by test" }),
    });
  });

  await page.goto("/create/text-to-video");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("waves crashing on cliffs");
  await page.getByText("Style guide", { exact: true }).click();
  await page.locator('textarea[name="style_guide"]').fill("cinematic grain");
  await page.locator('select[name="video_model"]').selectOption("wan2.2");
  await page.locator('select[name="resolution"]').selectOption("720p");
  await page.locator('input[name="clip_duration"][type="range"]').fill("4");
  await page.getByText("Advanced", { exact: true }).click();
  await page.locator('input[name="fps"][type="range"]').fill("16");

  await page.locator("#submit-btn").click();
  await expect.poll(() => capturedFields).not.toBeNull();
  expect(Object.keys(capturedFields!).sort()).toEqual(
    [
      "prompt",
      "video_model",
      "resolution",
      "clip_duration",
      "fps",
      "style_guide",
    ].sort(),
  );
  expect(capturedFields).toEqual({
    prompt: "waves crashing on cliffs",
    video_model: "wan2.2",
    resolution: "720p",
    clip_duration: "4",
    fps: "16",
    style_guide: "cinematic grain",
  });
  expect(Object.hasOwn(capturedFields!, "style_preset")).toBe(false);
  expect(Object.hasOwn(capturedFields!, "loras")).toBe(false);
});
