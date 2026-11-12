import { expect, test } from "@playwright/test";
import { blockGeneration } from "./helpers/no-generation";

test.beforeEach(async ({ page }) => {
  await blockGeneration(page);
});

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
