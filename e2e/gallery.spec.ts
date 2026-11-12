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
  const tiles = page.locator('#gallery-grid button[aria-label^="Open "]');
  await expect
    .poll(async () => {
      const n = await tiles.count();
      const empty = await page
        .getByText(/Nothing here yet/i)
        .isVisible()
        .catch(() => false);
      return n > 0 || empty;
    })
    .toBe(true);

  if ((await page.locator("#gallery-grid video").count()) > 0) {
    const countPlaying = () =>
      page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLVideoElement>(
              "#gallery-grid video",
            ),
          ].filter((v) => !v.paused).length,
      );
    expect(await countPlaying()).toBe(0);
    await page.waitForTimeout(500);
    expect(await countPlaying()).toBe(0);
  }

  await radio("audio").check();
  await expect(radio("audio")).toBeChecked();
  await expect
    .poll(async () => {
      const n = await tiles.count();
      const empty = await page
        .getByText(/Nothing here yet/i)
        .isVisible()
        .catch(() => false);
      return n > 0 || empty;
    })
    .toBe(true);
  const audioCount = await tiles.count();
  for (let idx = 0; idx < audioCount; idx++) {
    const label = await tiles.nth(idx).getAttribute("aria-label");
    expect(label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  }

  await radio("image").check();
  await expect(radio("image")).toBeChecked();
  await expect
    .poll(async () => {
      const n = await tiles.count();
      const empty = await page
        .getByText(/Nothing here yet/i)
        .isVisible()
        .catch(() => false);
      return n > 0 || empty;
    })
    .toBe(true);
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

test("gallery: keeps loading on a tall screen", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1600 });
  const res = await page.request.get("/api/gallery/items?limit=21");
  const data = (await res.json()) as { items?: unknown[] };
  test.skip(
    (data.items?.length ?? 0) <= 20,
    "fewer than 21 gallery items in DB",
  );

  await page.goto("/gallery");
  const tiles = page.locator('#gallery-grid button[aria-label^="Open "]');
  await expect
    .poll(() => tiles.count(), { timeout: 15000 })
    .toBeGreaterThan(20);

  const countBeforeScroll = await tiles.count();
  await page.evaluate(() => {
    const main = document.getElementById("app-main");
    if (main) {
      main.scrollTop = main.scrollHeight;
    }
  });
  await expect
    .poll(
      async () => {
        const count = await tiles.count();
        const done = await page
          .getByText("That is everything.")
          .isVisible()
          .catch(() => false);
        return count > countBeforeScroll || done;
      },
      { timeout: 15000 },
    )
    .toBe(true);
});

test("gallery: first page 500 shows inline alert with Try again, and retry loads tiles", async ({
  page,
}) => {
  const pattern = "**/api/gallery/items**";
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Gallery unavailable" }),
    }),
  );

  await page.goto("/gallery");
  const grid = page.locator("#gallery-grid");
  await expect(grid.getByRole("alert")).toContainText("Gallery unavailable", {
    timeout: 10000,
  });
  const retryBtn = grid.getByRole("button", { name: "Try again" });
  await expect(retryBtn).toBeVisible();

  await page.unroute(pattern);
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            meta_id: "m1",
            event_id: "e1",
            filename: "demo-1.svg",
            subfolder: "",
            type: "output",
            created_at: new Date().toISOString(),
            job_id: "j1",
            job_name: "Recovered Image",
            mediaType: "image",
          },
        ],
        next_cursor: null,
      }),
    }),
  );

  await retryBtn.click();
  await expect(
    grid.locator('button[aria-label^="Open Recovered Image"]'),
  ).toBeVisible();
  await page.unroute(pattern);
});

test("gallery: second page 500 keeps first-page tiles and shows Could not load more. Try again", async ({
  page,
}) => {
  const pattern = "**/api/gallery/items**";
  await page.route(pattern, (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");
    if (!cursor) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              meta_id: "m1",
              event_id: "e1",
              filename: "demo-1.svg",
              subfolder: "",
              type: "output",
              created_at: new Date().toISOString(),
              job_id: "j1",
              job_name: "Page One Tile",
              mediaType: "image",
            },
          ],
          next_cursor: "cursor-page-2",
        }),
      });
    }
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Page 2 failed" }),
    });
  });

  await page.goto("/gallery");
  const grid = page.locator("#gallery-grid");
  await expect(
    grid.locator('button[aria-label^="Open Page One Tile"]'),
  ).toBeVisible({ timeout: 10000 });
  await expect(grid.getByText("Could not load more.")).toBeVisible();
  await expect(grid.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(
    grid.locator('button[aria-label^="Open Page One Tile"]'),
  ).toBeVisible();
  await page.unroute(pattern);
});

test("gallery: /gallery?type=video selects Videos and choosing Images replaces URL without adding history entry", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible({ timeout: 10000 });

  await page.goto("/gallery?type=video");
  const radio = (v: string) =>
    page.locator(`input[name="gallery-type"][value="${v}"]`);
  await expect(radio("video")).toBeChecked();

  await radio("image").check();
  await expect(radio("image")).toBeChecked();
  await expect(page).toHaveURL(/\/gallery\?type=image/);

  await page.goBack();
  await expect(page).toHaveURL(/\/settings/);
});

test("gallery: progress guard shows Could not load more. Try again when page stalls, and clicking Try again appends 20 new items", async ({
  page,
  request,
}) => {
  const sampleRes = await request.get("/api/gallery/items?limit=1");
  const sampleData = (await sampleRes.json()) as {
    items?: Record<string, unknown>[];
  };
  test.skip(
    !sampleData.items || sampleData.items.length === 0,
    "no gallery items in DB",
  );
  const template = sampleData.items![0]!;

  const makeItems = (prefix: string) =>
    Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      const id = `${prefix}-${n}`;
      return {
        ...template,
        id,
        meta_id: id,
        event_id: `evt-${id}`,
        job_name: `Tile ${id}`,
        filename:
          typeof template.filename === "string"
            ? template.filename
            : `file-${id}.png`,
      };
    });

  const page1Items = makeItems("p1");
  const page2Items = makeItems("p2");
  let retried = false;

  const pattern = "**/api/gallery/items*";
  await page.route(pattern, async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");
    if (!cursor) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: page1Items,
          next_cursor: "cursor-stall-1",
        }),
      });
      return;
    }
    if (!retried) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: page1Items,
          next_cursor: "cursor-stall-1",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: page2Items,
        next_cursor: null,
      }),
    });
  });

  await page.goto("/gallery");
  const grid = page.locator("#gallery-grid");
  const tiles = grid.locator('button[aria-label^="Open "]');
  await expect(tiles).toHaveCount(20, { timeout: 10000 });
  await expect(grid.getByText("Could not load more.")).toBeVisible({
    timeout: 10000,
  });
  const retryBtn = grid.getByRole("button", { name: "Try again" });
  await expect(retryBtn).toBeVisible();

  retried = true;
  await retryBtn.click();
  await expect(grid.getByText("Could not load more.")).toHaveCount(0);
  await expect(tiles).toHaveCount(40);
  await page.unroute(pattern);
});
