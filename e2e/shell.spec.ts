import { expect, test } from "./helpers/test";
import { expectThreeSamples } from "./helpers/no-generation";

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
  const settingsOpt = palette.getByRole("option", {
    name: "Settings",
    exact: true,
  });
  await expect(settingsOpt).toBeVisible();
  await palette.getByRole("combobox").press("Enter");
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
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();
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

test("shell: deep links are served to clients that do not ask for HTML", async ({
  request,
}) => {
  for (const path of [
    "/jobs",
    "/gallery",
    "/create/image",
    "/settings",
    "/compose",
  ]) {
    const res = await request.get(path, { headers: { Accept: "*/*" } });
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain("text/html");
  }
  const missing = await request.get("/thumbs/does-not-exist.png", {
    headers: { Accept: "text/html" },
  });
  expect(missing.status()).toBe(404);
});

test("shell: navigating to a new pathname resets #app-main scrollTop to 0", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 350 });
  await page.goto("/dev/kit");
  await expect(
    page.getByRole("heading", { name: "UI kit", level: 1 }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: "UI kit", level: 2 }),
  ).toBeVisible({ timeout: 10000 });

  const main = page.locator("#app-main");
  await main.evaluate((el) => {
    el.scrollTop = 50;
  });
  expect(await main.evaluate((el) => el.scrollTop)).toBe(50);

  await page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>(
      'a[href="/dev/kit?tab=failed"]',
    );
    a?.click();
  });
  await expect(page).toHaveURL(/\/dev\/kit\?tab=failed/);
  await expectThreeSamples(() => main.evaluate((el) => el.scrollTop), 50);

  await page.locator("#sidebar-jobs-summary").click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(main).toBeFocused();

  await page.setViewportSize({ width: 900, height: 350 });
  await page.goto("/jobs");
  await expect(page.locator("#job-list")).toBeVisible({ timeout: 10000 });
  await main.evaluate((el) => {
    const first = el.firstElementChild as HTMLElement | null;
    if (first) first.style.minHeight = "1000px";
    el.scrollTop = 50;
    const a = document.createElement("a");
    a.href = "/jobs?status=failed";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  await expect(page).toHaveURL(/\/jobs\?status=failed/);
  await expectThreeSamples(() => main.evaluate((el) => el.scrollTop), 50);
});

test("shell: clicking the second job row at desktop width keeps focus inside #job-list", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=5")).json()) as {
    jobs: { id: string }[];
  };
  test.skip(jobs.length < 2, "fewer than 2 jobs in this database");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/jobs");
  const rows = page.locator('#job-list a[href^="/jobs/"]');
  await expect(rows.nth(1)).toBeVisible({ timeout: 10000 });
  const secondHref = (await rows.nth(1).getAttribute("href")) ?? "";
  const secondPath = secondHref.split("?")[0];
  await rows.nth(1).click();
  await expect(page).toHaveURL(new RegExp(secondPath));
  const focusInList = () =>
    page.evaluate(() => {
      const list = document.getElementById("job-list");
      return Boolean(
        list && document.activeElement && list.contains(document.activeElement),
      );
    });
  await expect.poll(focusInList).toBe(true);
  await expectThreeSamples(focusInList, true);
});

test("shell: mobile Activity panel fits inside viewport and Escape returns focus to trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gallery");
  const activityBtn = page.locator("#activity-button");
  await expect(activityBtn).toBeVisible({ timeout: 10000 });

  await activityBtn.click();
  const region = page.getByRole("region", { name: "Activity" });
  await expect(region).toBeVisible();

  const box = (await region.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);

  await page.setViewportSize({ width: 320, height: 640 });
  const boxSmall = (await region.boundingBox())!;
  expect(boxSmall.x).toBeGreaterThanOrEqual(0);
  expect(boxSmall.y).toBeGreaterThanOrEqual(0);
  expect(boxSmall.x + boxSmall.width).toBeLessThanOrEqual(320);
  expect(boxSmall.y + boxSmall.height).toBeLessThanOrEqual(640);

  await page.keyboard.press("Escape");
  await expect(region).toBeHidden();
  await expect(activityBtn).toBeFocused();
});
