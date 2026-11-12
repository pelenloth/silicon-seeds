import { expect, test } from "./helpers/test";
import { expectThreeSamples } from "./helpers/no-generation";

type Job = { id: string; name: string; status: string };

test("jobs: list, search, filters and canonical URLs", async ({ page }) => {
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Jobs" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#job-list")).toBeVisible();
  await expect(page.locator("#job-list").getByText(/New Job/i)).toHaveCount(0);
  await expect(page.locator("#new-menu-button")).toBeVisible();

  const filter = page.locator('nav[aria-label="Filter jobs"]');
  await expect(filter.getByRole("link", { name: /^All/ })).toBeVisible();
  await filter.getByRole("link", { name: /^Failed/ }).click();
  await expect(page).toHaveURL(/filter=failed/);
  await filter.getByRole("link", { name: /^All/ }).click();
  await expect(page).toHaveURL(/filter=all/);

  const rows = page.locator('#job-list a[href^="/jobs/"]');
  if ((await rows.count()) === 0) {
    await expect(page.getByText(/No jobs yet/i)).toBeVisible();
    return;
  }
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{8,}/);
  await page.locator("#job-search").fill("zzzz-no-such-job");
  await expect(page.getByText(/No jobs match/i)).toBeVisible();
  await page.locator("#job-search").fill("");
  await expect(rows.first()).toBeVisible();
});

test("jobs: detail header, tabs, step counts, timeline and legacy URL", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=5")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];
  const detailData = await (await request.get(`/api/jobs/${job.id}`)).json();

  await page.goto(`/jobs?job_id=${job.id}&tab=events&filter=all`);
  await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}\\?.*tab=events`));
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(job.name);
  await expect(
    detail.getByRole("button", { name: "Reuse settings" }),
  ).toBeVisible();

  const firstEvent = detail.locator("details").first();
  if ((await firstEvent.count()) > 0) {
    await firstEvent.locator("summary").click();
    await expect(firstEvent).toHaveAttribute("open", "");
  }

  const detailNav = detail.locator('nav[aria-label="Job sections"]');
  await detailNav.getByRole("link", { name: /^Status/ }).click();
  await expect(page).toHaveURL(/tab=status/);
  await expect(detail.getByText("Details", { exact: true })).toBeVisible();
  await expect(detail.getByText("Not set")).toHaveCount(0);
  const images = (detailData.events as { type: string }[]).filter(
    (e) => e.type === "new_image_prompt",
  ).length;
  if (images > 0) {
    await expect(
      detail.getByText(new RegExp(`\\b${images} images?\\b`)).first(),
    ).toBeVisible();
  }

  await detailNav.getByRole("link", { name: /^Media/ }).click();
  await expect(page).toHaveURL(/tab=media/);
  const tiles = detail.locator('button[aria-label^="Open "]');
  if ((await tiles.count()) > 0) {
    await tiles.first().click();
    await expect(
      page.getByRole("dialog", { name: "Media viewer" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("jobs: delete asks for confirmation and can be cancelled", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs")).json()) as {
    jobs: Job[];
  };
  const target = jobs.find(
    (j) =>
      j.status === "complete" ||
      j.status === "failed" ||
      j.status === "cancelled",
  );
  test.skip(!target, "no finished job to test with");
  await page.goto(`/jobs/${target!.id}`);
  await page
    .locator("#job-detail")
    .getByRole("button", { name: "Delete" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete this job?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect((await request.get(`/api/jobs/${target!.id}`)).status()).toBe(200);
});

test("jobs: mobile shows the list, then the detail with a back link", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=1")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs");
  await expect(page.locator("#job-list")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#job-detail")).toBeHidden();
  await page.locator('#job-list a[href^="/jobs/"]').first().click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{8,}/);
  await expect(page.locator("#job-detail")).toBeVisible();
  await expect(page.locator("#job-list")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#job-detail")
    .getByRole("link", { name: "Jobs", exact: true })
    .click();
  await expect(page.locator("#job-list")).toBeVisible();
});

test("jobs: not-found detail shows empty state and keeps list visible on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/jobs/00000000-0000-7000-8000-000000000000");
  await expect(page.locator("#job-list")).toBeVisible({ timeout: 10000 });
  await expect(
    page.locator("#job-detail").getByText("Job not found"),
  ).toBeVisible();
});

test("jobs: detail load error shows inline alert with Try again and keeps list visible", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=1")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];

  const detailUrlPattern = `**/api/jobs/${encodeURIComponent(job.id)}`;
  await page.route(detailUrlPattern, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Server exploded" }),
    }),
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${job.id}`);
  await expect(page.locator("#job-list")).toBeVisible({ timeout: 10000 });

  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("alert")).toContainText("Server exploded");
  const retryBtn = detail.getByRole("button", { name: "Try again" });
  await expect(retryBtn).toBeVisible();

  await page.unroute(detailUrlPattern);
  await retryBtn.click();
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(job.name);
});

test("jobs: refetch error keeps existing detail content and shows non-blocking notice", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=1")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${job.id}`);
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(job.name, {
    timeout: 10000,
  });

  const detailUrlPattern = `**/api/jobs/${encodeURIComponent(job.id)}`;
  await page.route(detailUrlPattern, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Refetch failed" }),
    }),
  );

  const respPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/jobs/${encodeURIComponent(job.id)}`) &&
      r.status() === 500,
  );
  await page.evaluate((id) => {
    window.dispatchEvent(
      new CustomEvent("job-update", { detail: { jobId: id } }),
    );
  }, job.id);
  await respPromise;

  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(job.name);
  await expect(detail.getByText(/Could not refresh/i)).toBeVisible();
  await page.unroute(detailUrlPattern);
});

test("jobs: exactly one active tab in detail and one active filter in list", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=1")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${job.id}`);
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(job.name, {
    timeout: 10000,
  });

  const detailTabs = detail.locator('nav[aria-label="Job sections"]');

  await expect(
    detail.locator('nav[aria-label="Job sections"] a[aria-current="page"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('nav[aria-label="Filter jobs"] a[aria-current="page"]'),
  ).toHaveCount(1);
  await expect(
    detailTabs.getByRole("link", { name: /^Status/ }),
  ).toHaveAttribute("aria-current", "page");

  await detailTabs.getByRole("link", { name: /^Events/ }).click();
  await expect(page).toHaveURL(/tab=events/);
  await expect(
    detail.locator('nav[aria-label="Job sections"] a[aria-current="page"]'),
  ).toHaveCount(1);
  await expect(
    detailTabs.getByRole("link", { name: /^Events/ }),
  ).toHaveAttribute("aria-current", "page");
});

test("jobs: live refresh keeps open timeline details DOM node attached and open", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=10")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");

  let targetJob: Job | undefined;
  for (const candidate of jobs) {
    const d = (await (
      await request.get(`/api/jobs/${candidate.id}`)
    ).json()) as { events?: unknown[] };
    if (d.events && d.events.length > 0) {
      targetJob = candidate;
      break;
    }
  }
  test.skip(!targetJob, "no job with events in this database");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${targetJob!.id}?tab=events`);
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    targetJob!.name,
    { timeout: 10000 },
  );

  const firstDetails = detail.locator("details").first();
  await expect(firstDetails).toBeVisible();
  await firstDetails.locator("summary").click();
  await expect(firstDetails).toHaveAttribute("open", "");

  await firstDetails.evaluate((el) => {
    (el as HTMLElement).dataset.mark = "1";
  });

  const refetchResp = page.waitForResponse((r) =>
    r.url().endsWith(`/api/jobs/${encodeURIComponent(targetJob!.id)}`),
  );
  await page.evaluate((id) => {
    window.dispatchEvent(
      new CustomEvent("job-update", { detail: { jobId: id } }),
    );
  }, targetJob!.id);
  await refetchResp;

  await expect
    .poll(() =>
      firstDetails.evaluate(
        (el) =>
          el.isConnected &&
          el.hasAttribute("open") &&
          (el as HTMLElement).dataset.mark === "1",
      ),
    )
    .toBe(true);
});

test("jobs: stale detail response from earlier job does not overwrite newer job", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=5")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length < 2, "fewer than 2 jobs in this database");
  const jobA = jobs[0];
  const jobB = jobs.slice(1).find((j) => j.name !== jobA.name) ?? jobs[1];
  test.skip(
    jobA.name === jobB.name,
    "the two jobs share a name so stale overwrite cannot be observed by heading",
  );
  const detailA = await (await request.get(`/api/jobs/${jobA.id}`)).json();

  let resolveDelayedA!: () => void;
  const delayedADone = new Promise<void>((resolve) => {
    resolveDelayedA = resolve;
  });

  const urlPatternA = `**/api/jobs/${encodeURIComponent(jobA.id)}`;
  await page.route(urlPatternA, async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(detailA),
    });
    resolveDelayedA();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${jobA.id}`);
  const rowB = page.locator(
    `#job-list a[href^="/jobs/${encodeURIComponent(jobB.id)}"]`,
  );
  await expect(rowB).toBeVisible({ timeout: 10000 });
  await rowB.click();
  await expect(page).toHaveURL(
    new RegExp(`/jobs/${encodeURIComponent(jobB.id)}`),
  );
  await delayedADone;
  const heading = page
    .locator("#job-detail")
    .getByRole("heading", { level: 2 });
  await expect(heading).toHaveText(jobB.name, { timeout: 10000 });
  await expectThreeSamples(
    async () => (await heading.textContent())?.trim() ?? "",
    jobB.name,
  );
  await page.unroute(urlPatternA);
});

test("jobs: media cap shows Showing the first N and Show all requests limit=1000", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=5")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];

  const stubItems = [1, 2, 3].map((n) => ({
    meta_id: `m${n}`,
    event_id: `e${n}`,
    filename: `demo-${n}.svg`,
    subfolder: "",
    type: "output",
    created_at: new Date().toISOString(),
    job_id: job.id,
    job_name: job.name,
    mediaType: "image",
  }));

  const requestedLimits: string[] = [];
  let hasMoreAt1000 = true;
  const mediaPattern = `**/api/jobs/${encodeURIComponent(job.id)}/media**`;
  await page.route(mediaPattern, async (route) => {
    const url = new URL(route.request().url());
    const lim = url.searchParams.get("limit") ?? "";
    requestedLimits.push(lim);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: stubItems,
        total: 4,
        hasMore: lim === "1000" ? hasMoreAt1000 : true,
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${job.id}?tab=media`);
  const detail = page.locator("#job-detail");
  await expect(detail.getByText("Showing the first 3")).toBeVisible({
    timeout: 10000,
  });
  expect(requestedLimits[0]).toBe("100");
  await expect(detail.getByText("3+ outputs")).toBeVisible();
  await expect(
    detail
      .locator('nav[aria-label="Job sections"]')
      .getByRole("link", { name: /Media/ }),
  ).toContainText("3+");

  const showAllBtn = detail.getByRole("button", { name: "Show all" });
  await expect(showAllBtn).toBeVisible();
  await showAllBtn.click();
  await expect.poll(() => requestedLimits.includes("1000")).toBe(true);
  await expect(showAllBtn).toHaveCount(0);
  await expect(
    detail.getByText("Showing the first 1000 outputs."),
  ).toBeVisible();

  hasMoreAt1000 = false;
  const countBeforeRefetch = requestedLimits.length;
  await page.evaluate((id) => {
    window.dispatchEvent(
      new CustomEvent("job-update", { detail: { jobId: id } }),
    );
  }, job.id);
  await expect
    .poll(() => requestedLimits.length)
    .toBeGreaterThan(countBeforeRefetch);
  expect(requestedLimits[requestedLimits.length - 1]).toBe("1000");
  await expect(detail.getByText("Showing the first 1000 outputs.")).toHaveCount(
    0,
  );
  await page.unroute(mediaPattern);
});

test("jobs: media load error shows inline Try again in Media tab instead of No media yet", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=5")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];

  const mediaPattern = `**/api/jobs/${encodeURIComponent(job.id)}/media**`;
  await page.route(mediaPattern, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Media fetch exploded" }),
    }),
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${job.id}?tab=media`);
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(job.name, {
    timeout: 10000,
  });
  await expect(detail.getByText("No media yet")).toHaveCount(0);
  await expect(detail.getByText("Media fetch exploded")).toBeVisible();
  const retryBtn = detail.getByRole("button", { name: "Try again" });
  await expect(retryBtn).toBeVisible();
  await page.unroute(mediaPattern);
});

test("jobs: status filter chips fit inside the list header at 1440x900 and 390x844", async ({
  page,
}) => {
  const nowIso = new Date().toISOString();
  const stubJobs = (
    ["active", "complete", "failed", "paused", "cancelled"] as const
  ).map((status, idx) => ({
    id: `stub-status-${status}`,
    name: `Stub ${status} job`,
    status,
    created_at: new Date(Date.now() - idx * 1000).toISOString(),
    kind: "image",
    progress: {
      total: 1,
      complete: status === "complete" ? 1 : 0,
      running: status === "active" ? 1 : 0,
      pending: 0,
      failed: status === "failed" ? 1 : 0,
    },
    thumb: null,
  }));

  await page.route("**/api/jobs", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/jobs") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: stubJobs }),
    });
  });

  await page.route("**/api/jobs/stub-status-**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/media")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, hasMore: false }),
      });
      return;
    }
    const id = url.pathname.split("/").pop() ?? "stub-status-active";
    const match = stubJobs.find((j) => j.id === id) ?? stubJobs[0];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: match,
        events: [
          {
            id: `evt-${id}`,
            jobId: id,
            type: "new_image_prompt",
            mode: "image",
            status: match.status === "complete" ? "complete" : "pending",
            created_at: nowIso,
          },
        ],
      }),
    });
  });

  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/jobs");
    const filterNav = page.locator("#job-filter");
    await expect(filterNav).toBeVisible({ timeout: 10000 });
    const chips = filterNav.getByRole("link");
    await expect(chips).toHaveCount(6);

    const headerBox = await filterNav.boundingBox();
    expect(headerBox).not.toBeNull();

    for (let i = 0; i < 6; i++) {
      const chip = chips.nth(i);
      await expect(chip).toBeVisible();
      const chipBox = await chip.boundingBox();
      expect(chipBox).not.toBeNull();
      expect(chipBox!.x).toBeGreaterThanOrEqual(headerBox!.x - 1);
      expect(chipBox!.y).toBeGreaterThanOrEqual(headerBox!.y - 1);
      expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(
        headerBox!.x + headerBox!.width + 1,
      );
      expect(chipBox!.y + chipBox!.height).toBeLessThanOrEqual(
        headerBox!.y + headerBox!.height + 1,
      );
    }

    const listFits = await page
      .locator("#job-list")
      .evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(listFits).toBe(true);

    await expect(page.locator("#new-menu-button")).toBeInViewport();
  }
});

test("jobs: active job with 0 total steps shows no '0 of 0' fraction and indeterminate progress, while 2 of 5 shows '2 of 5 steps'", async ({
  page,
}) => {
  const nowIso = new Date().toISOString();
  const jobZero = {
    id: "stub-progress-zero",
    name: "Queued zero total",
    status: "active",
    created_at: nowIso,
    kind: "image",
    progress: {
      total: 0,
      complete: 0,
      running: 0,
      pending: 0,
      failed: 0,
    },
    thumb: null,
  };
  const jobTwoOfFive = {
    id: "stub-progress-2of5",
    name: "Running two of five",
    status: "active",
    created_at: nowIso,
    kind: "image",
    progress: {
      total: 5,
      complete: 2,
      running: 1,
      pending: 2,
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
      body: JSON.stringify({ jobs: [jobZero, jobTwoOfFive] }),
    });
  });

  await page.route("**/api/jobs/stub-progress-**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/media")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, hasMore: false }),
      });
      return;
    }
    const isZero = url.pathname.endsWith("/stub-progress-zero");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: isZero ? jobZero : jobTwoOfFive,
        events: [],
      }),
    });
  });

  await page.goto("/jobs/stub-progress-zero?tab=status");
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    "Queued zero total",
    { timeout: 10000 },
  );
  await expect(detail.getByText("Waiting in queue")).toBeVisible();
  await expect(detail).not.toContainText(/\b0 of 0\b/);
  const progressBar = detail.locator("progress").first();
  await expect(progressBar).toBeVisible();
  expect(await progressBar.getAttribute("value")).toBeNull();

  await page.goto("/jobs/stub-progress-2of5?tab=status");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    "Running two of five",
    { timeout: 10000 },
  );
  await expect(detail.getByText("2 of 5 steps")).toBeVisible();
  await expect(detail.locator("progress").first()).toHaveAttribute(
    "value",
    "2",
  );
});

test("jobs: dismissing Delete or Cancel confirm dialog with Escape restores focus to the trigger button", async ({
  page,
}) => {
  const nowIso = new Date().toISOString();
  const completedJob = {
    id: "stub-focus-completed",
    name: "Completed focus job",
    status: "complete",
    created_at: nowIso,
    kind: "image",
    progress: { total: 1, complete: 1, running: 0, pending: 0, failed: 0 },
    thumb: null,
  };
  const activeJob = {
    id: "stub-focus-active",
    name: "Active focus job",
    status: "active",
    created_at: nowIso,
    kind: "image",
    progress: { total: 2, complete: 1, running: 1, pending: 0, failed: 0 },
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
      body: JSON.stringify({ jobs: [completedJob, activeJob] }),
    });
  });

  await page.route("**/api/jobs/stub-focus-**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/media")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, hasMore: false }),
      });
      return;
    }
    const isCompleted = url.pathname.endsWith("/stub-focus-completed");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: isCompleted ? completedJob : activeJob,
        events: [],
      }),
    });
  });

  await page.goto("/jobs/stub-focus-completed");
  const detail = page.locator("#job-detail");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    "Completed focus job",
    { timeout: 10000 },
  );
  const deleteBtn = detail.getByRole("button", { name: "Delete" });
  await deleteBtn.click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete this job?" });
  await expect(deleteDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toBeHidden();
  await expect(deleteBtn).toBeFocused();

  await page.goto("/jobs/stub-focus-active");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
    "Active focus job",
    { timeout: 10000 },
  );
  const cancelBtn = detail.getByRole("button", { name: "Cancel" });
  await cancelBtn.click();
  const cancelDialog = page.getByRole("dialog", { name: "Cancel this job?" });
  await expect(cancelDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cancelDialog).toBeHidden();
  await expect(cancelBtn).toBeFocused();
});

test("jobs: a regenerated output replaces the old picture (versioned media urls)", async ({
  page,
  request,
}) => {
  const { jobs } = (await (await request.get("/api/jobs?limit=1")).json()) as {
    jobs: Job[];
  };
  test.skip(jobs.length === 0, "no jobs in this database");
  const job = jobs[0];

  let metaId = "m1";
  const mediaPattern = `**/api/jobs/${encodeURIComponent(job.id)}/media**`;
  await page.route(mediaPattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            filename: "a.png",
            subfolder: "mock",
            mediaType: "image",
            meta_id: metaId,
            event_id: "evt-1",
            job_id: job.id,
            job_name: job.name,
          },
        ],
        total: 1,
        hasMore: false,
      }),
    }),
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/jobs/${job.id}?tab=media`);
  const detail = page.locator("#job-detail");
  await expect(detail.locator('img[src*="v=m1"]').first()).toBeAttached({
    timeout: 10000,
  });

  metaId = "m2";
  await page.evaluate((id) => {
    window.dispatchEvent(
      new CustomEvent("job-update", { detail: { jobId: id } }),
    );
  }, job.id);
  await expect(detail.locator('img[src*="v=m2"]').first()).toBeAttached({
    timeout: 10000,
  });
  await expect(page.locator('img[src*="v=m1"]')).toHaveCount(0);
  await page.unroute(mediaPattern);
});
