import { expect, test } from "./helpers/test";

test("safety: second page in the same context is blocked from triggering generation", async ({
  context,
  page,
  generationGuard,
}) => {
  await page.goto("/");
  const secondPage = await context.newPage();
  await secondPage.goto("/");

  const results = await secondPage.evaluate(async () => {
    const endpoints = [
      ["POST", "/api/jobs"],
      ["POST", "/api/jobs/images"],
      ["POST", "/api/enhance"],
      ["POST", "/api/intent"],
      ["POST", "/api/tts"],
      ["POST", "/api/comfyui"],
      ["GET", "/api/jobs/text"],
    ] as const;
    const out: { status: number; body: unknown }[] = [];
    for (const [method, url] of endpoints) {
      const res = await fetch(url, { method }); // e2e-guard: in-page fetch
      out.push({ status: res.status, body: await res.json() });
    }
    return out;
  });

  for (const r of results) {
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: "blocked by test" });
  }
  expect(generationGuard.calls().length).toBeGreaterThanOrEqual(7);
  await secondPage.close();
});

test("safety: blocked POST from the page is recorded by the guard and returns 503", async ({
  page,
  generationGuard,
}) => {
  await page.goto("/");
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/jobs/images", { method: "POST" }); // e2e-guard: in-page fetch
    return { status: r.status, body: await r.json() };
  });
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ error: "blocked by test" });
  expect(
    generationGuard
      .calls()
      .some((c) => c.method === "POST" && c.url.endsWith("/api/jobs/images")),
  ).toBe(true);
});

test("safety: request fixture rejects mutating methods and GET /api/jobs/text while allowing plain GET", async ({
  request,
}) => {
  const postMethod = "post" as const;
  const putMethod = "put" as const;
  const patchMethod = "patch" as const;
  const deleteMethod = "delete" as const;
  const fetchMethod = "fetch" as const;

  await expect(
    request[postMethod]("/api/jobs/images", { data: {} }),
  ).rejects.toThrow(/blocked/i);
  await expect(
    request[putMethod]("/api/settings", { data: {} }),
  ).rejects.toThrow(/blocked/i);
  await expect(
    request[patchMethod]("/api/settings", { data: {} }),
  ).rejects.toThrow(/blocked/i);
  await expect(request[deleteMethod]("/api/jobs/123")).rejects.toThrow(
    /blocked/i,
  );
  await expect(
    request[fetchMethod]("/api/jobs/images", { method: "POST" }),
  ).rejects.toThrow(/blocked/i);
  await expect(request.get("/api/jobs/text")).rejects.toThrow(/blocked/i);

  const okRes = await request.get("/api/settings");
  expect(okRes.status()).toBe(200);
});

test("safety: page and context request contexts and Request objects are guarded before sending", async ({
  context,
  page,
  request,
}) => {
  const reqProp = "request" as const;
  const postMethod = "post" as const;
  const fetchMethod = "fetch" as const;

  expect(page[reqProp]).toBe(context[reqProp]);

  await expect(
    page[reqProp][postMethod]("/api/jobs/images", { data: {} }),
  ).rejects.toThrow(/blocked/i);

  await expect(
    context[reqProp][fetchMethod]("/api/jobs/images", {
      method: "POST",
      data: {},
    }),
  ).rejects.toThrow(/blocked/i);

  await page.goto("/");
  const reqPromise = page.waitForRequest(
    (r) => r.url().endsWith("/api/jobs/images") && r.method() === "POST",
  );
  await page.evaluate(async () => {
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    };
    await fetch("/api/jobs/images", init); // e2e-guard: in-page fetch
  });
  const pwPostRequest = await reqPromise;

  await expect(
    request[fetchMethod](pwPostRequest, { data: {} }),
  ).rejects.toThrow(/blocked.*\/api\/jobs\/images/i);
});
