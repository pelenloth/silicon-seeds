import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

export async function expectThreeSamples<T>(
  sample: () => Promise<T>,
  expected: T,
  intervalMs = 150,
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    expect(await sample()).toBe(expected);
  }
}

export type GenerationGuard = {
  calls: () => { method: string; url: string }[];
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function blockGeneration(
  target: BrowserContext | Page,
): Promise<GenerationGuard> {
  const recorded: { method: string; url: string }[] = [];

  const reject = async (route: Route) => {
    const req = route.request();
    recorded.push({ method: req.method(), url: req.url() });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"blocked by test"}',
    });
  };

  // Documented last step for read-only requests once all test routes have fallen back.
  const passReadOnly = async (route: Route) => {
    await route.continue();
  };

  const rejectMutating = async (route: Route) => {
    const method = route.request().method().toUpperCase();
    if (MUTATING_METHODS.has(method)) {
      await reject(route);
      return;
    }
    await passReadOnly(route);
  };

  await target.route("**/api/jobs**", async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const pathname = new URL(req.url()).pathname;
    if (MUTATING_METHODS.has(method) || pathname === "/api/jobs/text") {
      await reject(route);
      return;
    }
    await passReadOnly(route);
  });

  await target.route("**/api/enhance**", reject);
  await target.route("**/api/intent**", reject);
  await target.route("**/api/tts**", rejectMutating);
  await target.route("**/api/comfyui**", rejectMutating);
  await target.route("**/api/settings**", rejectMutating);
  await target.route("**/api/loras**", rejectMutating);
  await target.route("**/api/style-presets**", rejectMutating);

  return {
    calls: () => [...recorded],
  };
}

function isJobsTextUrl(urlOrReq: string | { url(): string }): boolean {
  const raw = typeof urlOrReq === "string" ? urlOrReq : urlOrReq.url();
  try {
    const pathname = new URL(raw, "http://localhost").pathname;
    return pathname === "/api/jobs/text";
  } catch {
    return raw.includes("/api/jobs/text");
  }
}

export function guardRequestContext(
  request: APIRequestContext,
): APIRequestContext {
  const rejectMutatingCall = (method: string, target: unknown) => {
    const url =
      typeof target === "string"
        ? target
        : target &&
            typeof target === "object" &&
            "url" in target &&
            typeof (target as { url: () => string }).url === "function"
          ? (target as { url: () => string }).url()
          : String(target);
    return Promise.reject(
      new Error(
        `Blocked ${method} ${url} in e2e test: mutating request methods are forbidden`,
      ),
    );
  };

  return new Proxy(request, {
    get(target, prop, receiver) {
      if (
        prop === "post" ||
        prop === "put" ||
        prop === "patch" ||
        prop === "delete"
      ) {
        return (url: unknown) => rejectMutatingCall(prop.toUpperCase(), url);
      }
      if (prop === "get" || prop === "head") {
        return (
          url: string,
          options?: Parameters<APIRequestContext["get"]>[1],
        ) => {
          if (isJobsTextUrl(url)) {
            return Promise.reject(
              new Error(
                `Blocked ${String(prop).toUpperCase()} ${url} in e2e test: /api/jobs/text triggers LLM generation`,
              ),
            );
          }
          const orig = Reflect.get(target, prop, receiver) as (
            u: string,
            o?: Parameters<APIRequestContext["get"]>[1],
          ) => ReturnType<APIRequestContext["get"]>;
          return orig.call(target, url, options);
        };
      }
      if (prop === "fetch") {
        return (
          urlOrRequest: string | { url(): string },
          options?: Parameters<APIRequestContext["fetch"]>[1],
        ) => {
          const method = (options?.method ?? "GET").toUpperCase();
          if (MUTATING_METHODS.has(method)) {
            return rejectMutatingCall(method, urlOrRequest);
          }
          if (isJobsTextUrl(urlOrRequest)) {
            return Promise.reject(
              new Error(
                `Blocked ${method} /api/jobs/text in e2e test: /api/jobs/text triggers LLM generation`,
              ),
            );
          }
          return target.fetch(urlOrRequest as string, options);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}
