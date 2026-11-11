import { expect, test } from "@playwright/test";

test("gallery: filters, grid, lightbox, no autoplay", async ({ page }) => {
  await page.goto("/gallery");
  await expect(
    page.getByRole("heading", { level: 1, name: "Gallery" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Gallery" })).toHaveCount(1);
  await expect(page.locator('a[href="/gallery"]').first()).toBeVisible();

  const radio = (v: string) =>
    page.locator(`input[name="gallery-type"][value="${v}"]`);
  await expect(radio("all")).toBeChecked();
  await expect(page.locator("#gallery-grid")).toBeVisible();
  await expect(page.locator("#gallery-sentinel")).toBeAttached();

  await radio("video").check();
  await expect(radio("video")).toBeChecked();
  await page.waitForTimeout(1000);
  const playing = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll<HTMLVideoElement>("#gallery-grid video"),
      ].filter((v) => !v.paused).length,
  );
  expect(playing).toBe(0);

  await radio("audio").check();
  await expect(radio("audio")).toBeChecked();
  await radio("image").check();
  await expect(radio("image")).toBeChecked();

  const tiles = page.locator('#gallery-grid button[aria-label^="Open "]');
  await page.waitForTimeout(800);
  if ((await tiles.count()) > 0) {
    await tiles.first().click();
    const box = page.getByRole("dialog", { name: "Media viewer" });
    await expect(box).toBeVisible();
    await expect(box.getByRole("link", { name: "Open job" })).toHaveAttribute(
      "href",
      /\/jobs\/.+tab=media/,
    );
    await expect(box.getByRole("link", { name: "Download" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(box).toBeHidden();
  } else {
    await expect(page.getByText(/Nothing here yet/i)).toBeVisible();
  }
  await radio("all").check();
  await expect(page).toHaveURL(/\/gallery/);
});

test("gallery: fits a phone without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gallery");
  await expect(page.locator("#gallery-grid")).toBeVisible({ timeout: 10000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
