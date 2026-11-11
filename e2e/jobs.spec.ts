import { expect, test } from "@playwright/test";

type Job = { id: string; name: string; status: string };

test("jobs: list, search, filters and canonical URLs", async ({ page }) => {
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Jobs" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#job-list")).toBeVisible();
  await expect(page.getByRole("link", { name: /new job/i })).toHaveAttribute(
    "href",
    "/",
  );

  const filter = page.locator("#job-filter");
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

  await detail.getByRole("link", { name: /^Status/ }).click();
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

  await detail.getByRole("link", { name: /^Media/ }).click();
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
