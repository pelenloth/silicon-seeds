import { expect, test } from "./helpers/test";

test("create image: saved defaults, controls, validation, draft, reset (no generation)", async ({
  page,
  request,
}) => {
  const settings = (await (
    await request.get("/api/settings")
  ).json()) as Record<string, string>;
  await page.goto("/create/image");
  await expect(
    page.getByRole("heading", { level: 1, name: "Image" }),
  ).toBeVisible({ timeout: 10000 });
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible();
  await expect(page.locator("#submit-btn")).toBeInViewport();
  await expect(page.locator("#result-panel")).toBeVisible();

  if (settings.default_resolution) {
    await expect(page.locator('select[name="resolution"]')).toHaveValue(
      settings.default_resolution,
    );
  }

  await page.locator("#submit-btn").click();
  await expect(page.getByText("Prompt is required")).toBeVisible();
  await expect(page).not.toHaveURL(/job_id=/);

  await prompt.fill("e2e draft prompt, never submitted");
  await page.locator('select[name="resolution"]').selectOption("480p");
  await page.locator('input[name="batch_size"][type="range"]').fill("4");
  await expect(page.getByText(/4 images/).first()).toBeVisible();

  await page.getByText("Style guide", { exact: true }).click();
  await expect(page.locator('textarea[name="style_guide"]')).toBeVisible();
  await page.getByText("LoRAs", { exact: true }).click();
  await expect(page.getByText(/No LoRAs added/i)).toBeVisible();
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.locator('select[name="image_model"]')).toBeVisible();
  await expect(page.locator('select[name="style_preset"]')).toBeVisible();

  await page.locator("#sidebar-gallery").click();
  await expect(page).toHaveURL(/\/gallery/);
  await page.locator("#sidebar-image").click();
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue(
    "e2e draft prompt, never submitted",
  );
  await expect(page.locator('select[name="resolution"]')).toHaveValue("480p");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator('textarea[name="prompt"]')).toHaveValue("");
  if (settings.default_resolution) {
    await expect(page.locator('select[name="resolution"]')).toHaveValue(
      settings.default_resolution,
    );
  }
  await expect(page).toHaveURL(/\/create\/image/);
});

test("create image: the result panel shows the real state of a finished job", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs")).json()) as {
    jobs: { id: string; name: string; kind: string; status: string }[];
  };
  const job = jobs.find((j) => j.kind === "image" && j.status === "complete");
  test.skip(!job, "no completed image job in this database");
  await page.goto(`/create/image?show_progress=true&job_id=${job!.id}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText(job!.name, { timeout: 10000 });
  await expect(panel.getByText("Completed")).toBeVisible();
  await expect(panel.getByText("Active", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Open job" })).toHaveAttribute(
    "href",
    new RegExp(`/jobs/${job!.id}`),
  );
});

test("create image: single column on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create/image");
  await expect(page.locator('textarea[name="prompt"]')).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator("#submit-btn")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("create image: result panel shows Starting your job while create request is in flight and restores on error", async ({
  page,
}) => {
  await page.route("**/api/jobs/images", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Validation failed in stub",
        fields: { prompt: "Validation failed in stub" },
      }),
    });
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("stubbed prompt for pending test");
  await page.locator('input[name="batch_size"][type="range"]').fill("3");

  const panel = page.locator("#result-panel");
  await page.locator("#submit-btn").click();
  await expect(panel.getByText("Starting your job")).toBeVisible();
  await expect(
    panel.getByText("Naming and queueing. This can take a few seconds."),
  ).toBeVisible();
  await expect(panel.locator(".skeleton")).toHaveCount(3);

  await expect(panel.getByText("Starting your job")).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(panel.getByText("Your images appear here")).toBeVisible();
  await page.unroute("**/api/jobs/images");
});

test("create image: blockGeneration blocks unstubbed generation and enhance requests with 503", async ({
  page,
  generationGuard,
}) => {
  await page.goto("/create/image");
  await expect(page.locator('textarea[name="prompt"]')).toBeVisible({
    timeout: 10000,
  });

  const resJobs = await page.evaluate(async () => {
    const r = await fetch("/api/jobs/images", { method: "POST" }); // e2e-guard: in-page fetch
    return { status: r.status, body: await r.json() };
  });
  expect(resJobs).toEqual({
    status: 503,
    body: { error: "blocked by test" },
  });

  const resEnhance = await page.evaluate(async () => {
    const r = await fetch("/api/enhance?prompt=hi"); // e2e-guard: in-page fetch
    return { status: r.status, body: await r.json() };
  });
  expect(resEnhance).toEqual({
    status: 503,
    body: { error: "blocked by test" },
  });

  expect(generationGuard.calls().length).toBeGreaterThanOrEqual(2);
});

test("create image: Ctrl+Enter in prompt submits once; Enter alone does not submit", async ({
  page,
}) => {
  let submitCount = 0;
  await page.route("**/api/jobs/images", async (route) => {
    submitCount++;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Stubbed submit check",
        fields: { prompt: "Stubbed submit check" },
      }),
    });
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("first line");
  await prompt.focus();

  await page.keyboard.press("Enter");
  await prompt.pressSequentially("second line");
  expect(submitCount).toBe(0);

  await prompt.press("Control+Enter");
  await expect(page.getByText("Stubbed submit check")).toBeVisible();
  await expect.poll(() => submitCount).toBe(1);
});

test("create image: two fast clicks on Generate send only one request", async ({
  page,
}) => {
  let submitCount = 0;
  await page.route("**/api/jobs/images", async (route) => {
    submitCount++;
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Stubbed double click check",
      }),
    });
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("double click test");

  const firstResp = page.waitForResponse("**/api/jobs/images");
  await page.evaluate(() => {
    const btn = document.getElementById("submit-btn") as HTMLButtonElement;
    btn.click();
    btn.click();
  });

  await expect.poll(() => submitCount).toBe(1);
  await firstResp;
  await expect(page.getByText("Stubbed double click check")).toBeVisible();
  expect(submitCount).toBe(1);
});

test("create image: 400 naming batch_size or collapsed field shows error and opens collapsed section", async ({
  page,
}) => {
  let mode: "batch" | "advanced" = "batch";
  await page.route("**/api/jobs/images", async (route) => {
    if (mode === "batch") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Too big: expected number to be <=16",
          fields: { batch_size: "Too big: expected number to be <=16" },
        }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Unsupported model",
          fields: { image_model: "Unsupported model" },
        }),
      });
    }
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("testing 400 field errors");

  await page.locator("#submit-btn").click();
  await expect(
    page.getByText("Too big: expected number to be <=16"),
  ).toBeVisible();

  mode = "advanced";
  await expect(page.locator('select[name="image_model"]')).not.toBeVisible();
  await page.locator("#submit-btn").click();
  await expect(page.locator('select[name="image_model"]')).toBeVisible();
  await expect(page.getByText("Unsupported model")).toBeVisible();
});

test("create image: Enhance replaces untouched text with Undo, and preserves edits typed while in flight", async ({
  page,
}) => {
  let enhanceCall = 0;
  const enhanceBodies: { text?: string; kind?: string }[] = [];
  await page.route("**/api/enhance**", async (route) => {
    enhanceCall++;
    const currentCall = enhanceCall;
    try {
      enhanceBodies.push(
        JSON.parse(route.request().postData() ?? "{}") as {
          text?: string;
          kind?: string;
        },
      );
    } catch {
      enhanceBodies.push({});
    }
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enhanced:
          currentCall === 2
            ? "second enhanced prompt"
            : "enhanced masterpiece prompt",
      }),
    });
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });

  // (a) untouched text is replaced, a second Enhance sends the original text and replaces the first, and Undo restores the user's original text
  await prompt.fill("original fox");
  const enhanceBtn = page.getByRole("button", { name: "Prompt: Enhance" });
  await enhanceBtn.click();
  await expect(prompt).toHaveValue("enhanced masterpiece prompt");
  await enhanceBtn.click();
  await expect(prompt).toHaveValue("second enhanced prompt");
  expect(enhanceBodies[0]?.text).toBe("original fox");
  expect(enhanceBodies[1]?.text).toBe("original fox");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(prompt).toHaveValue("original fox");

  // (b) text typed during the request is kept and the info toast appears
  await enhanceBtn.click();
  await prompt.fill("original fox edited while waiting");
  await expect(
    page.getByText("Kept your edits. Run Enhance again to use the new text."),
  ).toBeVisible();
  await expect(prompt).toHaveValue("original fox edited while waiting");
});

test("create image: Generate again right after loading /create/image?job_id=<id> is not a no-op", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs")).json()) as {
    jobs: { id: string; name: string; kind: string; status: string }[];
  };
  const job = jobs.find((j) => j.kind === "image" && j.status === "complete");
  test.skip(!job, "no completed image job in this database");

  await page.goto(`/create/image?job_id=${job!.id}`);
  const panel = page.locator("#result-panel");
  const genAgain = panel.getByRole("button", { name: "Generate again" });
  await expect(genAgain).toBeVisible({ timeout: 10000 });

  await genAgain.click();
  await expect(page.getByText("Prompt is required")).toBeVisible();
});

test("create image: stubbed create response shows job, and switching to a second job clears first job tiles immediately", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs")).json()) as {
    jobs: { id: string; name: string; kind: string; status: string }[];
  };
  const completedImageJobs = jobs.filter(
    (j) => j.kind === "image" && j.status === "complete",
  );
  test.skip(
    completedImageJobs.length === 0,
    "no completed image job in this database",
  );

  const firstJob = completedImageJobs[0]!;
  const secondJobId = "stub-second-job-id";
  let nextCreateId = firstJob.id;

  await page.route("**/api/jobs/images", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: nextCreateId, message: "job queued" }),
    });
  });

  await page.route(`**/api/jobs/${secondJobId}/media**`, async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            filename: "second-job-img.png",
            subfolder: "",
            mediaType: "image",
            job_name: "Second Stub Job",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/jobs/${secondJobId}`, async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: secondJobId,
          name: "Second Stub Job",
          status: "complete",
          created_at: new Date().toISOString(),
          kind: "image",
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

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("first stubbed create");
  await page.locator("#submit-btn").click();

  const panel = page.locator("#result-panel");
  await expect(panel).toContainText(firstJob.name, { timeout: 10000 });
  const firstTiles = panel.locator("button[aria-label^='Open ']");
  await expect(firstTiles.first()).toBeVisible();

  nextCreateId = secondJobId;
  await page.locator("#submit-btn").click();

  // Wait until the result panel left the pending state (mocked job detail answered) while media is still delayed
  await expect(panel.getByText("Starting your job")).toHaveCount(0);
  await expect(panel).toContainText("Second Stub Job", { timeout: 5000 });
  await expect(firstTiles).toHaveCount(0);

  // Then once media finishes arriving, the new job's tile appears
  await expect(firstTiles).toHaveCount(1, { timeout: 5000 });
});

test("create image: focused last control in Advanced does not intersect sticky submit bar at 390x844 and 1280x800", async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/create/image");
    const prompt = page.locator('textarea[name="prompt"]');
    await expect(prompt).toBeVisible({ timeout: 10000 });

    // Open all collapsible sections so the form is taller than the viewport and really scrolls
    for (const label of ["Style guide", "LoRAs", "Advanced"]) {
      const sum = page.locator("summary", { hasText: label });
      const det = page.locator("details", { has: sum });
      if (!(await det.evaluate((el: HTMLDetailsElement) => el.open))) {
        await sum.click();
      }
    }
    await prompt.evaluate((el: HTMLTextAreaElement) => {
      el.rows = 18;
    });

    const advSummary = page.locator("summary", { hasText: "Advanced" });
    const modelSelect = page.locator('select[name="image_model"]');
    await expect(modelSelect).toBeVisible();
    await advSummary.focus();
    await page.keyboard.press("Tab");
    await expect(modelSelect).toBeFocused();

    const modelBox = await modelSelect.boundingBox();
    const barBox = await page.locator("#submit-bar").boundingBox();
    expect(modelBox).not.toBeNull();
    expect(barBox).not.toBeNull();
    // Bounding boxes must not overlap vertically when they overlap horizontally
    const horizOverlap =
      modelBox!.x < barBox!.x + barBox!.width &&
      modelBox!.x + modelBox!.width > barBox!.x;
    if (horizOverlap) {
      expect(modelBox!.y + modelBox!.height).toBeLessThanOrEqual(barBox!.y + 1);
    }

    if (size.width === 1280) {
      await page.setViewportSize({ width: 1280, height: 800 });
      const barRect = await page.locator("#submit-bar").boundingBox();
      const panelRect = await page.locator("#result-panel").boundingBox();
      expect(barRect).not.toBeNull();
      expect(panelRect).not.toBeNull();
      expect(barRect!.x + barRect!.width).toBeLessThanOrEqual(panelRect!.x + 1);

      const scrolled = await page.evaluate(() => {
        const main =
          document.getElementById("app-main") ?? document.documentElement;
        main.scrollTop = main.scrollHeight;
        return main.scrollTop > 0;
      });
      expect(scrolled).toBe(true);
      await expect(page.locator("#submit-btn")).toBeInViewport();
      await page.evaluate(() => {
        const main =
          document.getElementById("app-main") ?? document.documentElement;
        main.scrollTop = 0;
      });
      await expect(page.locator("#submit-btn")).toBeInViewport();
    }
  }
});

test("create image: result panel retries empty media when job is complete and shows tile without reload", async ({
  page,
}) => {
  await page.clock.install();
  const jobId = "stub-retry-media-job";
  const nowIso = new Date().toISOString();
  let mediaCalls = 0;

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: jobId,
          name: "Retry Media Job",
          status: "complete",
          created_at: nowIso,
          kind: "image",
          progress: {
            total: 1,
            complete: 1,
            running: 0,
            pending: 0,
            failed: 0,
          },
          thumb: null,
        },
        events: [
          {
            id: "evt-1",
            jobId,
            type: "new_image_prompt",
            mode: "image",
            status: "complete",
            created_at: nowIso,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/jobs/${jobId}/media**`, async (route) => {
    mediaCalls++;
    const items =
      mediaCalls >= 3
        ? [
            {
              meta_id: "m1",
              event_id: "evt-1",
              filename: "retry-success.png",
              subfolder: "",
              type: "output",
              created_at: nowIso,
              job_id: jobId,
              job_name: "Retry Media Job",
              mediaType: "image",
            },
          ]
        : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, total: items.length, hasMore: false }),
    });
  });

  await page.goto(`/create/image?job_id=${jobId}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText("Retry Media Job", { timeout: 10000 });
  await expect(panel).toContainText("Loading outputs");
  await expect(panel.getByText("0 outputs")).toHaveCount(0);

  await expect.poll(() => mediaCalls).toBe(1);
  await page.clock.fastForward(1100);
  await expect.poll(() => mediaCalls).toBe(2);
  await page.clock.fastForward(2100);
  await expect.poll(() => mediaCalls).toBe(3);

  await expect(panel.locator("button[aria-label^='Open ']")).toHaveCount(1);
  await expect(panel).toContainText("1 output");
  await expect(panel).not.toContainText("0s");
});

test("create image: result panel stops after bounded retries and shows Outputs are not available yet with Reload button", async ({
  page,
}) => {
  await page.clock.install();
  const jobId = "stub-exhausted-media-job";
  const nowIso = new Date().toISOString();
  let mediaCalls = 0;
  let returnItemOnReload = false;

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: jobId,
          name: "Exhausted Media Job",
          status: "complete",
          created_at: nowIso,
          kind: "image",
          progress: {
            total: 1,
            complete: 1,
            running: 0,
            pending: 0,
            failed: 0,
          },
          thumb: null,
        },
        events: [
          {
            id: "evt-1",
            jobId,
            type: "new_image_prompt",
            mode: "image",
            status: "complete",
            created_at: nowIso,
          },
        ],
      }),
    });
  });

  await page.route(`**/api/jobs/${jobId}/media**`, async (route) => {
    mediaCalls++;
    const items = returnItemOnReload
      ? [
          {
            meta_id: "m1",
            event_id: "evt-1",
            filename: "reloaded.png",
            subfolder: "",
            type: "output",
            created_at: nowIso,
            job_id: jobId,
            job_name: "Exhausted Media Job",
            mediaType: "image",
          },
        ]
      : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, total: items.length, hasMore: false }),
    });
  });

  await page.goto(`/create/image?job_id=${jobId}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText("Exhausted Media Job", { timeout: 10000 });
  await expect.poll(() => mediaCalls).toBe(1);

  for (const [idx, ms] of [1100, 2100, 4100, 8100].entries()) {
    await page.clock.fastForward(ms);
    await expect.poll(() => mediaCalls).toBe(idx + 2);
  }

  await expect(panel.getByText("Outputs are not available yet.")).toBeVisible();
  const reloadBtn = panel.getByRole("button", { name: "Reload" });
  await expect(reloadBtn).toBeVisible();

  returnItemOnReload = true;
  await reloadBtn.click();
  await expect(panel.locator("button[aria-label^='Open ']")).toHaveCount(1);
});

test("create image: 400 naming loras.1.strength with two LoRA rows focuses the second row's strength input", async ({
  page,
}) => {
  await page.route("**/api/loras", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        loras: [
          {
            id: "lora-1",
            comfyui_name: "first-lora.safetensors",
            display_name: "First LoRA",
            trigger_word: null,
            is_active: 1,
            sort_order: 1,
          },
          {
            id: "lora-2",
            comfyui_name: "second-lora.safetensors",
            display_name: "Second LoRA",
            trigger_word: null,
            is_active: 1,
            sort_order: 2,
          },
        ],
      }),
    });
  });

  await page.route("**/api/jobs/images", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "LoRA strength out of range",
        fields: {
          "loras.1.strength": "LoRA strength must be between 0.1 and 2.0",
        },
      }),
    });
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });
  await prompt.fill("testing lora row focus");

  const lorasSummary = page.locator("summary", { hasText: "LoRAs" });
  await lorasSummary.click();
  const select = page.getByRole("combobox", { name: "Select LoRA" });
  const addBtn = page.getByRole("button", { name: "Add", exact: true });

  await select.selectOption("first-lora.safetensors");
  await addBtn.click();
  await select.selectOption("second-lora.safetensors");
  await addBtn.click();

  await expect(page.locator('input[data-lora-index="0"]')).toBeVisible();
  const secondStrength = page.locator('input[data-lora-index="1"]');
  await expect(secondStrength).toBeVisible();

  // Close the LoRAs section to also verify it opens and focuses row 1
  await lorasSummary.click();
  await expect(secondStrength).not.toBeVisible();

  await page.locator("#submit-btn").click();
  await expect(secondStrength).toBeVisible();
  await expect(secondStrength).toBeFocused();
});

test("create image: Reset ends the Enhance chain, clears Enhanced · Undo hint, and Inspire sends empty text", async ({
  page,
}) => {
  const enhanceBodies: { text?: string; kind?: string }[] = [];
  await page.route("**/api/enhance**", async (route) => {
    try {
      enhanceBodies.push(
        JSON.parse(route.request().postData() ?? "{}") as {
          text?: string;
          kind?: string;
        },
      );
    } catch {
      enhanceBodies.push({});
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enhanced: "fixed enhanced text" }),
    });
  });

  await page.goto("/create/image");
  const prompt = page.locator('textarea[name="prompt"]');
  await expect(prompt).toBeVisible({ timeout: 10000 });

  await prompt.fill("initial user prompt");
  await page.getByRole("button", { name: "Prompt: Enhance" }).click();
  await expect(prompt).toHaveValue("fixed enhanced text");
  await expect(page.getByText(/Enhanced ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(prompt).toHaveValue("");
  await expect(page.getByText(/Enhanced ·/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);

  const inspireBtn = page.getByRole("button", { name: "Prompt: Inspire" });
  await expect(inspireBtn).toBeVisible();
  await inspireBtn.click();
  await expect(prompt).toHaveValue("fixed enhanced text");
  expect(enhanceBodies).toHaveLength(2);
  expect(enhanceBodies[0]?.text).toBe("initial user prompt");
  expect(enhanceBodies[1]?.text).toBe("");
});
