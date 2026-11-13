import { expect, test, type Page } from "./helpers/test";

async function mockLongJob(page: Page, jobId: string) {
  const nowIso = new Date().toISOString();
  const longPrompt = "A detailed cinematic scene with rich lighting. ".repeat(
    86,
  );
  const longStyle = "High contrast film grain and warm highlights. ".repeat(44);
  const stubJob = {
    id: jobId,
    name: "Long prompt and style guide job",
    status: "complete" as const,
    created_at: nowIso,
    kind: "image" as const,
    original_prompt: longPrompt.slice(0, 4000),
    style_guide: longStyle.slice(0, 2000),
    resolution: "720p",
    image_model: "flux",
    progress: {
      total: 1,
      complete: 1,
      running: 0,
      pending: 0,
      failed: 0,
    },
    thumb: null,
  };

  await page.route("**/api/jobs", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/jobs") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [stubJob] }),
    });
  });

  await page.route(
    `**/api/jobs/${encodeURIComponent(jobId)}/media**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, hasMore: false }),
      });
    },
  );

  await page.route(
    `**/api/jobs/${encodeURIComponent(jobId)}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job: stubJob,
          events: [
            {
              id: `evt-${jobId}`,
              jobId,
              type: "new_image_prompt",
              mode: "image",
              status: "complete",
              created_at: nowIso,
            },
          ],
        }),
      });
    },
  );
}

async function mockAllApisForRoutes(page: Page) {
  const nowIso = new Date().toISOString();
  const stubJob = {
    id: "stub-layout-job",
    name: "Layout check job",
    status: "complete" as const,
    created_at: nowIso,
    kind: "image" as const,
    original_prompt: "Sample prompt for layout check. ".repeat(40),
    style_guide: "Sample style guide for layout check. ".repeat(20),
    progress: {
      total: 1,
      complete: 1,
      running: 0,
      pending: 0,
      failed: 0,
    },
    thumb: null,
  };

  await page.route("**/api/jobs", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/jobs") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [stubJob] }),
    });
  });

  await page.route("**/api/jobs/stub-layout-job/media**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, hasMore: false }),
    });
  });

  await page.route("**/api/jobs/stub-layout-job", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: stubJob,
        events: [
          {
            id: "evt-stub-layout-job",
            jobId: "stub-layout-job",
            type: "new_image_prompt",
            mode: "image",
            status: "complete",
            created_at: nowIso,
          },
        ],
      }),
    });
  });

  await page.route("**/api/gallery/items**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], next_cursor: null }),
    });
  });

  await page.route("**/api/settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        default_resolution: "720p",
        default_image_model: "flux",
        default_video_model: "wan",
        default_audio_model: "ace-step",
        default_style_preset: "none",
        default_clip_duration: "5",
        default_transition_duration: "1",
        default_fps: "24",
      }),
    });
  });

  await page.route("**/api/loras", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ loras: [] }),
    });
  });

  await page.route("**/api/comfyui/loras", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ loras: [] }),
    });
  });

  await page.route("**/api/style-presets", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ presets: [] }),
    });
  });
}

test("layout: long job at 1440x900 scrolls inside detail pane while window stays fixed", async ({
  page,
}) => {
  const jobId = "stub-long-job-1440";
  await mockLongJob(page, jobId);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/jobs/${jobId}?tab=status`);

  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    "Long prompt and style guide job",
    { timeout: 10000 },
  );
  const copyIdBtn = detail.getByRole("button", { name: "Copy ID" });
  await expect(copyIdBtn).toBeAttached();

  const winMetrics = await page.evaluate(() => {
    window.scrollTo(0, 10000);
    return {
      scrollY: window.scrollY,
      docScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });

  expect(winMetrics.scrollY).toBe(0);
  expect(winMetrics.docScrollHeight).toBeLessThanOrEqual(
    winMetrics.innerHeight + 1,
  );

  const pane = detail.locator(".overflow-y-auto").first();
  const paneMetrics = await pane.evaluate((el) => {
    const before = {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
    el.scrollTo(0, el.scrollHeight);
    return {
      ...before,
      scrollTop: el.scrollTop,
    };
  });

  expect(paneMetrics.scrollHeight).toBeGreaterThan(paneMetrics.clientHeight);
  expect(paneMetrics.scrollTop).toBeGreaterThan(0);
  await expect(copyIdBtn).toBeInViewport();
});

test("layout: long job at 390x844 keeps window scrollY at 0 and document scrollHeight within viewport", async ({
  page,
}) => {
  const jobId = "stub-long-job-390";
  await mockLongJob(page, jobId);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/jobs/${jobId}?tab=status`);

  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    "Long prompt and style guide job",
    { timeout: 10000 },
  );
  await expect(detail.getByRole("button", { name: "Copy ID" })).toBeAttached();

  const winMetrics = await page.evaluate(() => {
    window.scrollTo(0, 10000);
    return {
      scrollY: window.scrollY,
      docScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });

  expect(winMetrics.scrollY).toBe(0);
  expect(winMetrics.docScrollHeight).toBeLessThanOrEqual(
    winMetrics.innerHeight + 1,
  );
});

test("layout: every route at 1440x560 and 390x560 never scrolls the window vertically or horizontally", async ({
  page,
}) => {
  await mockAllApisForRoutes(page);

  const routes = [
    "/",
    "/jobs",
    "/gallery",
    "/create/image",
    "/create/video",
    "/create/text-to-video",
    "/create/audio",
    "/compose",
    "/settings",
    "/settings?tab=defaults",
    "/settings?tab=loras",
    "/settings?tab=presets",
    "/dev/kit",
    "/nope",
  ];

  for (const size of [
    { width: 1440, height: 560 },
    { width: 390, height: 560 },
  ]) {
    await page.setViewportSize(size);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("#app-main")).toBeVisible({ timeout: 10000 });
      const res = await page.evaluate(() => {
        window.scrollTo(10000, 10000);
        return {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          docScrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          docScrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });
      expect(
        res.scrollY,
        `${route} at ${size.width}x${size.height} scrollY`,
      ).toBe(0);
      expect(
        res.scrollX,
        `${route} at ${size.width}x${size.height} scrollX`,
      ).toBe(0);
      expect(
        res.docScrollHeight,
        `${route} at ${size.width}x${size.height} docScrollHeight`,
      ).toBeLessThanOrEqual(res.innerHeight + 1);
      expect(
        res.docScrollWidth,
        `${route} at ${size.width}x${size.height} docScrollWidth`,
      ).toBeLessThanOrEqual(res.innerWidth + 1);
    }
  }
});
