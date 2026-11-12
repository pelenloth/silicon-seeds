import { expect, test, type Page, type Request } from "./helpers/test";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => {
    throw new Error(
      `Unexpected native dialog: ${dialog.type()} "${dialog.message()}"`,
    );
  });
});

async function parseFormData(req: Request): Promise<Record<string, string>> {
  const buf = req.postDataBuffer();
  const ct = req.headers()["content-type"] ?? "";
  if (!buf || !ct) return {};
  const fd = await new Response(new Uint8Array(buf), {
    headers: { "content-type": ct },
  }).formData();
  const map: Record<string, string> = {};
  fd.forEach((v, k) => {
    map[k] = typeof v === "string" ? v : String(v);
  });
  return map;
}

async function mockJobRoutes(page: Page, jobId: string, kind = "image") {
  const nowIso = new Date().toISOString();
  await page.route(`**/api/jobs/${jobId}/media**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, hasMore: false }),
    });
  });
  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: jobId,
          name: "Stubbed Job",
          status: "complete",
          created_at: nowIso,
          kind,
          progress: {
            total: 1,
            complete: 1,
            running: 0,
            pending: 0,
            failed: 0,
          },
          thumb: null,
        },
        events: [],
      }),
    });
  });
  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              id: jobId,
              name: "Stubbed Job",
              status: "complete",
              created_at: nowIso,
              kind,
              progress: {
                total: 1,
                complete: 1,
                running: 0,
                pending: 0,
                failed: 0,
              },
              thumb: null,
            },
          ],
        }),
      });
    } else {
      await route.continue();
    }
  });
}

test("home: navigation, heading, and mode controls", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#sidebar-home")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible();

  const mode = (v: string) =>
    page.locator(`input[name="home-mode"][value="${v}"]`);
  for (const v of ["auto", "image", "video", "text-to-video", "audio"]) {
    await expect(mode(v)).toBeVisible();
  }

  await expect(mode("auto")).toBeChecked();
  await expect(page.locator('select[name="home-count"]')).toHaveCount(0);
  await expect(page.locator('select[name="home-resolution"]')).toHaveCount(0);
  await expect(page.locator('select[name="home-preset"]')).toHaveCount(0);
  await expect(page.locator('select[name="home-duration"]')).toHaveCount(0);
  await expect(
    page.getByText("Auto picks the format and settings from your description."),
  ).toBeVisible();

  await mode("audio").check();
  await expect(page.locator('select[name="home-duration"]')).toBeVisible();
  await expect(page.locator('select[name="home-count"]')).toHaveCount(0);
  await mode("image").check();
  await expect(page.locator('select[name="home-count"]')).toBeVisible();
  await expect(page.locator('select[name="home-resolution"]')).toBeVisible();
});

test("home: empty prompt validation shows error and sends no request", async ({
  page,
  generationGuard,
}) => {
  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await page.locator("#home-generate").click();
  await expect(page.locator("#home-prompt-error")).toHaveText(
    "Describe what you want to create",
  );
  await expect(prompt).toHaveAttribute("aria-describedby", "home-prompt-error");
  const postCalls = generationGuard.calls().filter((c) => c.method === "POST");
  expect(postCalls).toHaveLength(0);
});

test("home: payload capture and 503 error handling in image mode", async ({
  page,
}) => {
  let capturedFields: Record<string, string> | null = null;
  await page.route("**/api/jobs/images", async (route) => {
    capturedFields = await parseFormData(route.request());
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Service unavailable in stub" }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await page.locator('input[name="home-mode"][value="image"]').check();
  await prompt.fill("a serene mountain lake");

  const resSelect = page.locator('select[name="home-resolution"]');
  await resSelect.selectOption("1080p");
  const countSelect = page.locator('select[name="home-count"]');
  await countSelect.selectOption("4");

  await page.locator("#home-generate").click();

  await expect.poll(() => capturedFields).not.toBeNull();
  expect(capturedFields).toMatchObject({
    prompt: "a serene mountain lake",
    resolution: "1080p",
    batch_size: "4",
  });
  expect(typeof capturedFields!.style_preset).toBe("string");
  expect(typeof capturedFields!.image_model).toBe("string");

  await expect(page.getByText("Service unavailable in stub")).toBeVisible();
  await expect(prompt).toHaveValue("a serene mountain lake");
  await expect(page.locator("#home-generate")).toBeEnabled();
});

test("home: successful image create clears prompt, shows toast with View link, and draft stays cleared after reload", async ({
  page,
}) => {
  const stubJobId = "stub-home-image-job-123";
  await mockJobRoutes(page, stubJobId, "image");
  await page.route("**/api/jobs/images", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "job queued", jobId: stubJobId }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await page.locator('input[name="home-mode"][value="image"]').check();
  await prompt.fill("a prompt that succeeds");

  await page.locator("#home-generate").click();

  await expect(prompt).toHaveValue("");
  const toast = page.getByRole("status").filter({ hasText: "Queued image" });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("link", { name: "View" })).toHaveAttribute(
    "href",
    `/jobs/${stubJobId}`,
  );

  await page.reload();
  await expect(page.locator("#home-prompt")).toHaveValue("");
});

test("home: payload per mode sends correct fields and endpoints", async ({
  page,
}) => {
  let capturedVideo: Record<string, string> | null = null;
  let capturedAudio: Record<string, string> | null = null;
  let capturedT2V: Record<string, string> | null = null;

  await page.route("**/api/jobs/videos", async (route) => {
    const fields = await parseFormData(route.request());
    if (fields.style_preset !== undefined) {
      capturedVideo = fields;
    } else {
      capturedT2V = fields;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked by test" }),
    });
  });

  await page.route("**/api/jobs/audio", async (route) => {
    capturedAudio = await parseFormData(route.request());
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked by test" }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  const mode = (v: string) =>
    page.locator(`input[name="home-mode"][value="${v}"]`);

  // 1. text-to-video mode: sends to /api/jobs/videos without style_preset
  await mode("text-to-video").check();
  await prompt.fill("a spaceship launching");
  await page.locator("#home-generate").click();
  await expect.poll(() => capturedT2V).not.toBeNull();
  expect(capturedT2V).toMatchObject({
    prompt: "a spaceship launching",
  });
  expect(typeof capturedT2V!.video_model).toBe("string");
  expect(typeof capturedT2V!.fps).toBe("string");
  expect(typeof capturedT2V!.clip_duration).toBe("string");
  expect(typeof capturedT2V!.resolution).toBe("string");
  expect(capturedT2V!.style_preset).toBeUndefined();

  // 2. video mode: sends to /api/jobs/videos with style_preset
  await mode("video").check();
  await prompt.fill("a waterfall in jungle");
  await page.locator("#home-generate").click();
  await expect.poll(() => capturedVideo).not.toBeNull();
  expect(capturedVideo).toMatchObject({
    prompt: "a waterfall in jungle",
  });
  expect(typeof capturedVideo!.video_model).toBe("string");
  expect(typeof capturedVideo!.fps).toBe("string");
  expect(typeof capturedVideo!.clip_duration).toBe("string");
  expect(typeof capturedVideo!.resolution).toBe("string");
  expect(typeof capturedVideo!.style_preset).toBe("string");

  // 3. audio mode: sends to /api/jobs/audio with instrumental_prompt and duration
  await mode("audio").check();
  await prompt.fill("lofi chill beats");
  await page.locator('select[name="home-duration"]').selectOption("30");
  await page.locator("#home-generate").click();
  await expect.poll(() => capturedAudio).not.toBeNull();
  expect(capturedAudio).toMatchObject({
    instrumental_prompt: "lofi chill beats",
    duration: "30",
  });
});

test("home: Ctrl+Enter submits once and fast double click sends only one request", async ({
  page,
}) => {
  let submitCount = 0;
  await page.route("**/api/jobs/images", async (route) => {
    submitCount++;
    await new Promise((r) => setTimeout(r, 400));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "delayed error" }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await page.locator('input[name="home-mode"][value="image"]').check();
  await prompt.fill("ctrl enter prompt");

  // Ctrl+Enter submits once
  await prompt.press("Control+Enter");
  await expect.poll(() => submitCount).toBe(1);
  await expect(page.getByText("delayed error")).toBeVisible();
  expect(submitCount).toBe(1);

  // Fast double click sends only one request
  submitCount = 0;
  await page.evaluate(() => {
    const btn = document.getElementById("home-generate") as HTMLButtonElement;
    btn.click();
    btn.click();
  });
  await expect.poll(() => submitCount).toBe(1);
  await expect(page.getByText("delayed error")).toBeVisible();
  expect(submitCount).toBe(1);
});

test("home: enhance prompt first toggle behavior, warning on failure, and persistence across reload", async ({
  page,
}) => {
  let capturedPrompt = "";
  await page.route("**/api/jobs/images", async (route) => {
    const fields = await parseFormData(route.request());
    capturedPrompt = fields.prompt ?? "";
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "blocked after capture" }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await page.locator('input[name="home-mode"][value="image"]').check();
  const toggle = page.getByLabel("Enhance prompt first");
  await expect(toggle).not.toBeChecked();

  // 1. Toggle survives a reload
  await toggle.check();
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Enhance prompt first")).toBeChecked();

  // 2. Toggle on + enhance succeeds: prompt sent is ENHANCED TEXT
  await page.route("**/api/enhance**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enhanced: "ENHANCED TEXT" }),
    });
  });
  await prompt.fill("raw prompt text");
  await page.locator("#home-generate").click();
  await expect.poll(() => capturedPrompt).toBe("ENHANCED TEXT");

  // 3. Toggle on + enhance fails (503): warning toast shown, original prompt sent
  capturedPrompt = "";
  await page.route("**/api/enhance**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "enhance service down" }),
    });
  });
  await page.locator("#home-generate").click();
  await expect(
    page.getByText("Could not enhance the prompt, using it as written"),
  ).toBeVisible();
  await expect.poll(() => capturedPrompt).toBe("raw prompt text");

  // 4. Toggle off: no enhance request sent
  let enhanceCalled = false;
  await page.route("**/api/enhance**", async (route) => {
    enhanceCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enhanced: "SHOULD NOT BE USED" }),
    });
  });
  await page.getByLabel("Enhance prompt first").uncheck();
  capturedPrompt = "";
  await page.locator("#home-generate").click();
  await expect.poll(() => capturedPrompt).toBe("raw prompt text");
  expect(enhanceCalled).toBe(false);
});

test("home: mode and draft prompt persist across reload until submitted", async ({
  page,
}) => {
  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });

  const mode = (v: string) =>
    page.locator(`input[name="home-mode"][value="${v}"]`);
  await mode("video").check();
  await prompt.fill("persistent draft prompt");

  await page.reload();
  await expect(mode("video")).toBeChecked();
  await expect(page.locator("#home-prompt")).toHaveValue(
    "persistent draft prompt",
  );
});

test("home: More options hands off prompt and settings to target create page and prefill is cleared by Reset", async ({
  page,
}) => {
  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  const mode = (v: string) =>
    page.locator(`input[name="home-mode"][value="${v}"]`);

  // Image mode hand-off
  await mode("image").check();
  await prompt.fill("handoff image draft");
  await page.locator('select[name="home-resolution"]').selectOption("1080p");
  await page.getByRole("link", { name: "More options" }).click();
  await expect(page).toHaveURL(/\/create\/image/);
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue(
    "handoff image draft",
  );
  await expect(page.locator('select[name="resolution"]')).toHaveValue("1080p");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue("");

  // Audio mode hand-off
  await page.goto("/");
  await mode("audio").check();
  await page.locator("#home-prompt").fill("handoff audio draft");
  await page.getByRole("link", { name: "More options" }).click();
  await expect(page).toHaveURL(/\/create\/audio/);
  await expect(
    page.locator('textarea[name="instrumental_prompt"]'),
  ).toHaveValue("handoff audio draft");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(
    page.locator('textarea[name="instrumental_prompt"]'),
  ).toHaveValue("");
});

test("home: In progress section displays active job with progress, link, and cancel dialog", async ({
  page,
}) => {
  const activeJobId = "active-test-job-789";
  const nowIso = new Date().toISOString();
  let cancelCalled = false;

  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              id: activeJobId,
              name: "Active Test Job",
              status: "active",
              created_at: nowIso,
              kind: "image",
              progress: {
                total: 4,
                complete: 1,
                running: 1,
                pending: 2,
                failed: 0,
              },
              thumb: null,
            },
          ],
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`**/api/jobs/${activeJobId}/cancel`, async (route) => {
    cancelCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.goto("/");
  const section = page.locator("section").filter({ hasText: "In progress" });
  await expect(section).toBeVisible({ timeout: 10000 });
  await expect(
    section.getByRole("heading", { name: "In progress" }),
  ).toBeVisible();
  await expect(section).toContainText("Active Test Job");
  await expect(
    section.getByRole("link", { name: /Active Test Job/i }),
  ).toHaveAttribute("href", `/jobs/${activeJobId}`);

  // Cancel control opens confirm dialog
  const cancelBtn = section.getByRole("button", { name: /Cancel/i });
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();

  const confirmModal = page.getByRole("dialog", { name: "Cancel this job?" });
  await expect(confirmModal).toBeVisible();
  await confirmModal
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmModal).toBeHidden();
  expect(cancelCalled).toBe(false);

  // When no active jobs, section is absent
  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobs: [] }),
      });
    } else {
      await route.continue();
    }
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "In progress" })).toHaveCount(
    0,
  );
});

test("home: Recent creations renders gallery tiles, lightbox, empty state, and Compose link", async ({
  page,
  request,
}) => {
  const galleryRes = await request.get("/api/gallery/items?limit=1");
  const galleryData = (await galleryRes.json()) as {
    items?: Record<string, unknown>[];
  };
  const sample = galleryData.items?.[0];
  test.skip(!sample, "gallery is empty");

  const threeItems = [1, 2, 3].map((n) => ({
    ...sample,
    meta_id: `sample-meta-${n}`,
    event_id: `sample-event-${n}`,
    filename: `sample-file-${n}.png`,
    mediaType: "image",
  }));

  await page.route("**/api/gallery/items*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: threeItems, total: 3, hasMore: false }),
    });
  });

  await page.goto("/");
  const section = page
    .locator("section")
    .filter({ hasText: "Recent creations" });
  await expect(
    section.getByRole("heading", { name: "Recent creations" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    section.getByRole("link", { name: "Open gallery" }),
  ).toHaveAttribute("href", "/gallery");

  const tiles = section.locator("button[aria-label^='Open ']");
  await expect(tiles).toHaveCount(3);
  await tiles.first().click();

  const lightbox = page.getByRole("dialog", { name: "Media viewer" });
  await expect(lightbox).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();

  const composeLink = page.getByRole("link", {
    name: /Compose a narrated video from a script/i,
  });
  await expect(composeLink).toBeVisible();
  await expect(composeLink).toHaveAttribute("href", "/compose");

  // Empty state with empty items list
  await page.route("**/api/gallery/items*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, hasMore: false }),
    });
  });
  await page.reload();
  await expect(page.getByText("Nothing yet")).toBeVisible();
});

test("home: palette offers quick create and executes quick create for video", async ({
  page,
}) => {
  await page.goto("/gallery");
  await expect(
    page.getByRole("heading", { level: 1, name: "Gallery" }),
  ).toBeVisible({ timeout: 10000 });

  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("a fox in snow");

  for (const kind of ["image", "video", "audio"]) {
    await expect(
      palette.getByRole("option", {
        name: `Generate ${kind}: “a fox in snow”`,
      }),
    ).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  // Re-open palette and execute quick create for video with stubbed success
  await page.keyboard.press("Control+K");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("a fox in snow");

  const fixedVideoJobId = "palette-stub-video-job";
  let capturedVideoPrompt = "";
  await page.route("**/api/jobs/videos", async (route) => {
    const fields = await parseFormData(route.request());
    capturedVideoPrompt = fields.prompt ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: fixedVideoJobId, message: "job queued" }),
    });
  });
  await mockJobRoutes(page, fixedVideoJobId, "video");

  await palette
    .getByRole("option", { name: "Generate video: “a fox in snow”" })
    .click();
  await expect(palette).toBeHidden();
  await expect(page.getByText("Queued video")).toBeVisible();
  expect(capturedVideoPrompt).toBe("a fox in snow");

  // Re-open palette and execute with 503 error
  await page.keyboard.press("Control+K");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("a stormy sea");
  await page.route("**/api/jobs/videos", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "stub queue error" }),
    });
  });
  await palette
    .getByRole("option", { name: "Generate video: “a stormy sea”" })
    .click();
  await expect(palette).toBeHidden();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /stub queue error|Could not queue the job/ }),
  ).toBeVisible();
});

test("home: layout fits phone (390x844) and desktop (1280x800) with no horizontal scroll and generate button in viewport", async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.locator("#home-prompt")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#home-generate")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("home: palette sends two requests for two prompts while first is pending, and double Enter sends one", async ({
  page,
}) => {
  const prompts: string[] = [];
  let releaseFirst: (() => void) | null = null;
  let callIndex = 0;

  await page.route("**/api/jobs/images", async (route) => {
    callIndex++;
    const idx = callIndex;
    const fields = await parseFormData(route.request());
    prompts.push(fields.prompt ?? "");
    if (idx === 1) {
      await new Promise<void>((r) => {
        releaseFirst = r;
      });
    }
    const jobId = `palette-job-${idx}`;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId, message: "job queued" }),
    });
  });

  await page.goto("/");
  await expect(page.locator("#home-prompt")).toBeVisible({ timeout: 10000 });

  // 1. First prompt submitted via palette (double Enter sends only one request)
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  const input = palette.getByRole("combobox");
  await input.fill("first fox in snow");
  await expect(
    palette.getByRole("option", {
      name: "Generate image: “first fox in snow”",
    }),
  ).toBeVisible();

  await input.evaluate((el: HTMLInputElement) => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await expect(palette).toBeHidden();
  await expect.poll(() => prompts.length).toBe(1);

  // 2. While the first request is still pending, submit a second prompt via palette
  await page.keyboard.press("Control+K");
  await expect(palette).toBeVisible();
  await input.fill("second wolf in woods");
  await expect(
    palette.getByRole("option", {
      name: "Generate image: “second wolf in woods”",
    }),
  ).toBeVisible();
  await input.press("Enter");
  await expect(palette).toBeHidden();

  await expect.poll(() => prompts.length).toBe(2);
  expect(prompts).toEqual(["first fox in snow", "second wolf in woods"]);

  releaseFirst!();
  await expect(
    page.getByRole("status").filter({ hasText: "Queued image" }),
  ).toHaveCount(2);
});

test("home: Recent creations 500 on first load shows error and Try again loads tiles", async ({
  page,
}) => {
  let failRecent = true;
  const sampleItems = [1, 2].map((n) => ({
    meta_id: `rec-meta-${n}`,
    event_id: `rec-evt-${n}`,
    job_id: `rec-job-${n}`,
    job_name: `Recovered Creation ${n}`,
    filename: `demo-${n}.svg`,
    subfolder: "",
    created_at: new Date().toISOString(),
    mediaType: "image",
  }));

  await page.route("**/api/gallery/items*", async (route) => {
    if (failRecent) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Gallery database offline" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: sampleItems, next_cursor: null }),
    });
  });

  await page.goto("/");
  const section = page
    .locator("section")
    .filter({ hasText: "Recent creations" });
  await expect(section.getByRole("alert")).toContainText(
    "Gallery database offline",
    { timeout: 10000 },
  );
  await expect(section.getByText("Nothing yet")).toHaveCount(0);
  const tryAgainBtn = section.getByRole("button", { name: "Try again" });
  await expect(tryAgainBtn).toBeVisible();

  failRecent = false;
  await tryAgainBtn.click();
  await expect(section.locator("button[aria-label^='Open ']")).toHaveCount(2);
  await expect(section.getByRole("alert")).toHaveCount(0);
});

test("home: form accessibility sets aria-busy, announces busy status, and keeps focus on prompt on keyboard submit", async ({
  page,
}) => {
  let releaseCreate: (() => void) | null = null;
  await page.route("**/api/jobs/images", async (route) => {
    await new Promise<void>((r) => {
      releaseCreate = r;
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "stub error after busy" }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await page.locator('input[name="home-mode"][value="image"]').check();
  await prompt.fill("keyboard submit focus check");
  await prompt.focus();

  await prompt.press("Control+Enter");
  const form = page.locator("form").first();
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(form.locator('[aria-live="polite"]')).toHaveText("Queueing…");
  await expect(prompt).toBeFocused();

  releaseCreate!();
  await expect(page.locator("#home-prompt-error")).toHaveText(
    "stub error after busy",
  );
  await expect(form).not.toHaveAttribute("aria-busy", "true");
});

test("home: auto mode is default when nothing stored, and stored mode wins after reload", async ({
  page,
}) => {
  await page.goto("/");
  const mode = (v: string) =>
    page.locator(`input[name="home-mode"][value="${v}"]`);
  await expect(mode("auto")).toBeChecked();
  await page.reload();
  await expect(mode("auto")).toBeChecked();

  await mode("video").check();
  await expect(mode("video")).toBeChecked();
  await page.reload();
  await expect(mode("video")).toBeChecked();
});

test("home: auto mode image plan routes to image create, displays summary chips, shows toast, and clears prompt", async ({
  page,
}) => {
  let intentBody: { text?: string } | null = null;
  let capturedCreate: Record<string, string> | null = null;
  const stubJobId = "stub-auto-image-job-1";

  await page.route("**/api/intent", async (route) => {
    intentBody = (await route.request().postDataJSON()) as { text?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          kind: "image",
          prompt: "a fox, watercolor",
          count: 2,
          resolution: "9_16_HD",
          style_preset: "none",
          duration_seconds: 0,
        },
      }),
    });
  });

  await mockJobRoutes(page, stubJobId, "image");
  await page.route("**/api/jobs/images", async (route) => {
    capturedCreate = await parseFormData(route.request());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "job queued", jobId: stubJobId }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("two portrait watercolor foxes");

  await page.locator("#home-generate").click();

  await expect.poll(() => intentBody).not.toBeNull();
  expect(intentBody).toEqual({ text: "two portrait watercolor foxes" });

  await expect.poll(() => capturedCreate).not.toBeNull();
  expect(capturedCreate).toMatchObject({
    prompt: "a fox, watercolor",
    batch_size: "2",
    resolution: "9_16_HD",
  });

  await expect(
    page.locator(".badge").filter({ hasText: "Image" }),
  ).toBeVisible();
  await expect(
    page.locator(".badge").filter({ hasText: "2 × 9:16 (HD)" }),
  ).toBeVisible();

  const toast = page.getByRole("status").filter({ hasText: /^Queued: Image/ });
  await expect(toast).toBeVisible();
  await expect(prompt).toHaveValue("");
});

test("home: auto mode video plan routes to text-to-video without style_preset", async ({
  page,
}) => {
  let capturedVideo: Record<string, string> | null = null;
  const stubJobId = "stub-auto-video-job-1";

  await page.route("**/api/intent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          kind: "video",
          prompt: "a fox running",
          count: 1,
          resolution: "720p",
          style_preset: "none",
          duration_seconds: 4,
        },
      }),
    });
  });

  await mockJobRoutes(page, stubJobId, "video");
  await page.route("**/api/jobs/videos", async (route) => {
    capturedVideo = await parseFormData(route.request());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "job queued", jobId: stubJobId }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("a 4 second clip of a fox running");

  await page.locator("#home-generate").click();

  await expect.poll(() => capturedVideo).not.toBeNull();
  expect(capturedVideo).toMatchObject({
    prompt: "a fox running",
    clip_duration: "4",
    resolution: "720p",
  });
  expect(capturedVideo!.style_preset).toBeUndefined();

  const toast = page.getByRole("status").filter({ hasText: /^Queued: Video/ });
  await expect(toast).toBeVisible();
});

test("home: auto mode audio plan routes to audio endpoint with instrumental_prompt and duration", async ({
  page,
}) => {
  let capturedAudio: Record<string, string> | null = null;
  const stubJobId = "stub-auto-audio-job-1";

  await page.route("**/api/intent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          kind: "audio",
          prompt: "gentle piano melody",
          count: 1,
          resolution: "720p",
          style_preset: "none",
          duration_seconds: 90,
        },
      }),
    });
  });

  await mockJobRoutes(page, stubJobId, "audio");
  await page.route("**/api/jobs/audio", async (route) => {
    capturedAudio = await parseFormData(route.request());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "job queued", jobId: stubJobId }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("gentle piano melody for 90 seconds");

  await page.locator("#home-generate").click();

  await expect.poll(() => capturedAudio).not.toBeNull();
  expect(capturedAudio).toMatchObject({
    instrumental_prompt: "gentle piano melody",
    duration: "90",
  });

  const toast = page.getByRole("status").filter({ hasText: /^Queued: Audio/ });
  await expect(toast).toBeVisible();
});

test("home: auto mode planner failure (503 and 502) shows error toast, switches to image mode, preserves prompt, and sends no create request", async ({
  page,
}) => {
  let createRequests = 0;
  await page.route("**/api/jobs/**", async (route) => {
    createRequests++;
    await route.fulfill({ status: 503, body: "{}" });
  });

  // 1. Helper's 503
  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("prompt that fails with 503");

  await page.locator("#home-generate").click();

  await expect(
    page.getByText(
      "Could not plan that automatically. Pick a format and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.locator('input[name="home-mode"][value="image"]'),
  ).toBeChecked();
  await expect(prompt).toHaveValue("prompt that fails with 503");
  expect(createRequests).toBe(0);

  // 2. Mocked 502
  await page.route("**/api/intent", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Planner unavailable" }),
    });
  });

  await page.locator('input[name="home-mode"][value="auto"]').check();
  await prompt.fill("prompt that fails with 502");
  await page.locator("#home-generate").click();

  await expect(
    page.getByText(
      "Could not plan that automatically. Pick a format and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.locator('input[name="home-mode"][value="image"]'),
  ).toBeChecked();
  await expect(prompt).toHaveValue("prompt that fails with 502");
  expect(createRequests).toBe(0);
});

test("home: auto mode malformed plan answer is treated as planner failure", async ({
  page,
}) => {
  let responsePayload: unknown = {};
  await page.route("**/api/intent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responsePayload),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });

  // 1. Empty object
  responsePayload = {};
  await prompt.fill("malformed empty plan");
  await page.locator("#home-generate").click();

  await expect(
    page.getByText(
      "Could not plan that automatically. Pick a format and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.locator('input[name="home-mode"][value="image"]'),
  ).toBeChecked();
  await expect(prompt).toHaveValue("malformed empty plan");

  // 2. { plan: null }
  responsePayload = { plan: null };
  await page.locator('input[name="home-mode"][value="auto"]').check();
  await prompt.fill("malformed null plan");
  await page.locator("#home-generate").click();

  await expect(
    page.getByText(
      "Could not plan that automatically. Pick a format and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.locator('input[name="home-mode"][value="image"]'),
  ).toBeChecked();
  await expect(prompt).toHaveValue("malformed null plan");
});

test("home: enhance prompt first toggle is disabled in auto mode and no enhance request is sent", async ({
  page,
}) => {
  let enhanceCalled = false;
  await page.route("**/api/enhance**", async (route) => {
    enhanceCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enhanced: "SHOULD NOT BE USED" }),
    });
  });
  await page.route("**/api/intent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          kind: "image",
          prompt: "fox",
          count: 1,
          resolution: "720p",
          style_preset: "none",
          duration_seconds: 0,
        },
      }),
    });
  });
  await page.route("**/api/jobs/images", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "job-auto-no-enhance", message: "queued" }),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem("home:enhance", "1");
  });

  await page.goto("/");
  const toggle = page.getByLabel("Enhance prompt first");
  await expect(toggle).toBeDisabled();

  const prompt = page.locator("#home-prompt");
  await prompt.fill("fox without enhance");
  await page.locator("#home-generate").click();

  await expect(
    page.getByRole("status").filter({ hasText: /^Queued: Image/ }),
  ).toBeVisible();
  expect(enhanceCalled).toBe(false);
});

test("home: while planning the button shows Planning… and is disabled, and fast double click sends one intent request", async ({
  page,
}) => {
  let intentCount = 0;
  let finishIntent: (() => void) | null = null;

  await page.route("**/api/intent", async (route) => {
    intentCount++;
    await new Promise<void>((resolve) => {
      finishIntent = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: {
          kind: "image",
          prompt: "fox",
          count: 1,
          resolution: "720p",
          style_preset: "none",
          duration_seconds: 0,
        },
      }),
    });
  });
  await page.route("**/api/jobs/images", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "job-double-click", message: "queued" }),
    });
  });

  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("fox in snow");

  await page.evaluate(() => {
    const btn = document.getElementById("home-generate") as HTMLButtonElement;
    btn.click();
    btn.click();
  });

  const generateBtn = page.locator("#home-generate");
  await expect(generateBtn).toContainText("Planning…");
  await expect(generateBtn).toBeDisabled();
  expect(intentCount).toBe(1);

  finishIntent!();
  await expect(
    page.getByRole("status").filter({ hasText: /^Queued: Image/ }),
  ).toBeVisible();
  expect(intentCount).toBe(1);
});

test("home: More options in auto mode navigates to /create/image with prompt filled in", async ({
  page,
}) => {
  await page.goto("/");
  const prompt = page.locator("#home-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("auto mode handoff draft");

  await page.getByRole("link", { name: "More options" }).click();
  await expect(page).toHaveURL(/\/create\/image/);
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue(
    "auto mode handoff draft",
  );
});
