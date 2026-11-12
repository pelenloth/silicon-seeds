import { expect, test } from "@playwright/test";
import { blockGeneration } from "./helpers/no-generation";

type FakeStreamSummary = {
  url: string;
  closed: boolean;
};

declare global {
  interface Window {
    __streams?: {
      list: () => FakeStreamSummary[];
      emitOnLatest: (name: string, data?: unknown) => void;
      failLatest: () => void;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await blockGeneration(page);
  await page.addInitScript(() => {
    type Listener = (evt: MessageEvent) => void;
    class FakeEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      url: string;
      readyState = 0;
      onopen: ((evt: Event) => void) | null = null;
      onerror: ((evt: Event) => void) | null = null;
      onmessage: ((evt: MessageEvent) => void) | null = null;
      closed = false;
      private listeners = new Map<string, Set<Listener>>();

      constructor(url: string) {
        this.url = url;
        instances.push(this);
        queueMicrotask(() => {
          if (this.closed) return;
          this.readyState = 1;
          this.onopen?.(new Event("open"));
          this.emit("connected", { jobId: "*" });
        });
      }

      addEventListener(type: string, cb: Listener) {
        let set = this.listeners.get(type);
        if (!set) {
          set = new Set();
          this.listeners.set(type, set);
        }
        set.add(cb);
      }

      removeEventListener(type: string, cb: Listener) {
        this.listeners.get(type)?.delete(cb);
      }

      close() {
        this.closed = true;
        this.readyState = 2;
      }

      emit(name: string, data: unknown = {}) {
        if (this.closed) return;
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        const evt = new MessageEvent(name, { data: payload });
        const set = this.listeners.get(name);
        if (set) {
          for (const fn of set) fn(evt);
        }
      }

      fail() {
        if (this.closed) return;
        this.onerror?.(new Event("error"));
      }
    }

    const instances: FakeEventSource[] = [];
    (window as unknown as { EventSource: unknown }).EventSource =
      FakeEventSource;
    window.__streams = {
      list: () => instances.map((i) => ({ url: i.url, closed: i.closed })),
      emitOnLatest: (name: string, data: unknown = {}) => {
        const last = instances[instances.length - 1];
        last?.emit(name, data);
      },
      failLatest: () => {
        const last = instances[instances.length - 1];
        last?.fail();
      },
    };
  });
});

async function setupMockJob(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  jobId: string,
) {
  const galleryRes = await request.get("/api/gallery/items?limit=1");
  const galleryData = (await galleryRes.json()) as {
    items?: Record<string, unknown>[];
  };
  const sampleItem = galleryData.items?.[0];
  if (!sampleItem) {
    return null;
  }

  const nowIso = new Date().toISOString();
  let state: "active" | "complete" = "active";
  let jobsListRequests = 0;

  const currentJob = () => ({
    id: jobId,
    name: "Live Stream Test Job",
    status: state,
    created_at: nowIso,
    kind: "image",
    progress:
      state === "active"
        ? { total: 1, complete: 0, running: 1, pending: 0, failed: 0 }
        : { total: 1, complete: 1, running: 0, pending: 0, failed: 0 },
    thumb: null,
  });

  const currentEvents = () => [
    {
      id: "evt-live-1",
      jobId,
      type: "new_image_prompt",
      mode: "image",
      status: state === "active" ? "running" : "complete",
      created_at: nowIso,
    },
  ];

  const currentMedia = () =>
    state === "active"
      ? []
      : [
          {
            ...sampleItem,
            meta_id: "live-meta-1",
            event_id: "evt-live-1",
            job_id: jobId,
            job_name: "Live Stream Test Job",
            mediaType: "image",
          },
        ];

  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    jobsListRequests++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [currentJob()] }),
    });
  });

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job: currentJob(),
        events: currentEvents(),
      }),
    });
  });

  await page.route(`**/api/jobs/${jobId}/media**`, async (route) => {
    const items = currentMedia();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, total: items.length, hasMore: false }),
    });
  });

  return {
    flipToComplete: () => {
      state = "complete";
    },
    jobsListRequests: () => jobsListRequests,
  };
}

test("live updates: silent stream recovers via watchdog and shows completed output without reload", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const jobId = "live-silent-job";
  const mock = await setupMockJob(page, request, jobId);
  test.skip(!mock, "gallery is empty");

  await page.goto(`/create/image?job_id=${jobId}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText("Live Stream Test Job", { timeout: 10000 });
  await expect(panel.getByText("Running")).toBeVisible();

  mock!.flipToComplete();

  // Emit nothing. Advance clock by 45 s (past 40s watchdog + reconnect backoff).
  await page.clock.fastForward(41_000);
  await page.clock.fastForward(4_000);

  await expect(panel.getByText("Completed")).toBeVisible();
  await expect(panel.locator("button[aria-label^='Open ']")).toHaveCount(1);

  const streams = await page.evaluate(() => window.__streams?.list() ?? []);
  expect(streams.length).toBeGreaterThanOrEqual(2);
});

test("live updates: stream cut reconnects, bumps epoch and shows completed output", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const jobId = "live-cut-job";
  const mock = await setupMockJob(page, request, jobId);
  test.skip(!mock, "gallery is empty");

  await page.goto(`/create/image?job_id=${jobId}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText("Live Stream Test Job", { timeout: 10000 });
  await expect(panel.getByText("Running")).toBeVisible();

  mock!.flipToComplete();
  await page.evaluate(() => window.__streams?.failLatest());

  // Advance past the 1s initial reconnect backoff + 400ms panel debounce
  await page.clock.fastForward(2500);

  await expect(panel.getByText("Completed")).toBeVisible();
  await expect(panel.locator("button[aria-label^='Open ']")).toHaveCount(1);
});

test("live updates: normal job-update event updates panel within debounce time", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const jobId = "live-normal-job";
  const mock = await setupMockJob(page, request, jobId);
  test.skip(!mock, "gallery is empty");

  await page.goto(`/create/image?job_id=${jobId}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText("Live Stream Test Job", { timeout: 10000 });
  await expect(panel.getByText("Running")).toBeVisible();

  mock!.flipToComplete();
  await page.evaluate(
    (id) => window.__streams?.emitOnLatest("job-update", { jobId: id }),
    jobId,
  );

  await page.clock.fastForward(500);

  await expect(panel.getByText("Completed")).toBeVisible();
  await expect(panel.locator("button[aria-label^='Open ']")).toHaveCount(1);
});

test("live updates: no storm when healthy stream emits ping every 15s for 2 minutes", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const jobId = "live-ping-job";
  const mock = await setupMockJob(page, request, jobId);
  test.skip(!mock, "gallery is empty");

  await page.goto(`/create/image?job_id=${jobId}`);
  const panel = page.locator("#result-panel");
  await expect(panel).toContainText("Live Stream Test Job", { timeout: 10000 });

  expect(mock!.jobsListRequests()).toBe(1);

  for (let i = 0; i < 8; i++) {
    await page.clock.fastForward(15_000);
    await page.evaluate(() => window.__streams?.emitOnLatest("ping", {}));
  }

  expect(mock!.jobsListRequests()).toBe(1);
  const streams = await page.evaluate(() => window.__streams?.list() ?? []);
  expect(streams.length).toBe(1);
});
