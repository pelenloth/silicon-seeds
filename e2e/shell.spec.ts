import { expect, test } from "@playwright/test";

test("shell: labeled nav, active item, titles, palette, activity, new menu, collapse", async ({
  page,
}) => {
  await page.goto("/gallery");
  await expect(
    page.getByRole("heading", { level: 1, name: "Gallery" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveTitle(/Gallery · Silicon Seeds/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /favicon.*\.svg/,
  );

  const nav = page.getByRole("navigation", { name: "Main" });
  for (const label of [
    "Home",
    "Jobs",
    "Gallery",
    "Image",
    "Video",
    "Text to Video",
    "Audio",
    "Compose",
    "Settings",
  ]) {
    await expect(
      nav.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator("#sidebar-gallery")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("#sidebar-jobs-summary")).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("#app-sidebar select")).toHaveCount(0);

  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("sett");
  await expect(palette.getByRole("option", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings/);
  await expect(palette).toBeHidden();

  await page.locator("#activity-button").click();
  await expect(page.getByRole("region", { name: "Activity" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Activity" })).toBeHidden();

  await page.locator("#new-menu-button").click();
  await page.getByRole("menuitem", { name: "Image" }).click();
  await expect(page).toHaveURL(/\/create\/image/);

  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await page.reload();
  await expect(page.locator("#app-sidebar")).toHaveAttribute(
    "data-collapsed",
    "true",
  );
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator("#app-sidebar")).toHaveAttribute(
    "data-collapsed",
    "false",
  );
});

test("shell: theme lives in settings and survives a reload", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("radiogroup", { name: "Theme" })
    .getByText("Dracula", { exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dracula");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dracula");
  await page
    .getByRole("radiogroup", { name: "Theme" })
    .getByText("Tokyo Night", { exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    "tokyonight",
  );
});

test("shell: legacy bumblebee preference maps to daylight", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("theme", "bumblebee"));
  await page.goto("/gallery", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "daylight");
});

test("shell: mobile drawer opens and closes on navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gallery");
  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar).not.toBeInViewport();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(sidebar).toBeInViewport();
  await page.locator("#sidebar-settings").click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(sidebar).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("shell: unknown routes show a not-found page", async ({ page }) => {
  await page.goto("/definitely/not/here");
  await expect(page.getByText("Page not found")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).not.toHaveURL(/definitely/);
});

test("shell: the command palette is centered and thumbnails are served", async ({
  page,
  request,
}) => {
  await page.goto("/gallery");
  await expect(page.locator("#header-title")).toHaveText("Gallery", {
    timeout: 10000,
  });
  await page.locator("#palette-button").click();
  const box = page
    .getByRole("dialog", { name: "Command palette" })
    .locator(".modal-box");
  await expect(box).toBeVisible();
  const rect = (await box.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(
    Math.abs(rect.x + rect.width / 2 - viewport.width / 2),
  ).toBeLessThanOrEqual(8);
  await page.keyboard.press("Escape");

  const jobs = (await (await request.get("/api/jobs?limit=50")).json()) as {
    jobs: { thumb: { subfolder: string; filename: string } | null }[];
  };
  const thumb = jobs.jobs.find((j) => j.thumb)?.thumb;
  test.skip(!thumb, "no job with media in this database");
  const sub = thumb!.subfolder ? `${thumb!.subfolder.replace(/\/$/, "")}/` : "";
  const res = await request.get(
    `/thumbs/${sub}${encodeURIComponent(thumb!.filename)}?w=96`,
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/jpeg");
  expect((await res.body()).byteLength).toBeLessThan(60_000);
  expect((await request.get("/thumbs/does-not-exist.png?w=96")).status()).toBe(
    404,
  );
  expect(
    (await request.get("/thumbs/..%2F..%2Fetc%2Fpasswd?w=96")).status(),
  ).toBe(404);
});
