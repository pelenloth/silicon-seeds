import { expect, test } from "@playwright/test";
import { blockGeneration } from "./helpers/no-generation";

test.beforeEach(async ({ page }) => {
  await blockGeneration(page);
});

test("create video: defaults, controls, validation (no generation)", async ({
  page,
  request,
}) => {
  const settings = (await (
    await request.get("/api/settings")
  ).json()) as Record<string, string>;
  await page.goto("/create/video");
  await expect(
    page.getByRole("heading", { level: 1, name: "Video", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible();
  await expect(page.locator("#submit-btn")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: /Generate Video/i }),
  ).toBeVisible();

  if (settings.default_video_model)
    await expect(page.locator('select[name="video_model"]')).toHaveValue(
      settings.default_video_model,
    );
  if (settings.default_resolution)
    await expect(page.locator('select[name="resolution"]')).toHaveValue(
      settings.default_resolution,
    );
  if (settings.default_clip_duration)
    await expect(page.locator('input[name="clip_duration"]')).toHaveValue(
      settings.default_clip_duration,
    );

  await page.locator("#submit-btn").click();
  await expect(page.getByText("Prompt is required")).toBeVisible();
  await expect(page).not.toHaveURL(/job_id=/);

  await prompt.fill("e2e video draft, never submitted");
  await page.locator('input[name="clip_duration"][type="range"]').fill("3");
  await expect(page.getByText("3s").first()).toBeVisible();
  await expect(page.locator('select[name="style_preset"]')).toBeVisible();
  await page.getByText("LoRAs", { exact: true }).click();
  await expect(page.getByText(/No LoRAs added/i)).toBeVisible();
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.locator('input[name="fps"][type="range"]')).toBeVisible();
  await page.getByText("Style guide", { exact: true }).click();
  await expect(page.locator('textarea[name="style_guide"]')).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(prompt).toHaveValue("");
  await expect(page.locator("#result-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/create\/video/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#submit-btn")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
