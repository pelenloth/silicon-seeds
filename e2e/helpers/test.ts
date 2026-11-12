import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";
import {
  blockGeneration,
  guardRequestContext,
  type GenerationGuard,
} from "./no-generation";

export const test = base.extend<{ generationGuard: GenerationGuard }>({
  context: async ({ context }, use) => {
    const guard = await blockGeneration(context);
    (
      context as unknown as { __generationGuard?: GenerationGuard }
    ).__generationGuard = guard;
    await use(context);
  },
  generationGuard: [
    async ({ context }, use) => {
      const guard =
        (context as unknown as { __generationGuard?: GenerationGuard })
          .__generationGuard ?? (await blockGeneration(context));
      await use(guard);
    },
    { auto: true },
  ],
  request: async ({ request }, use) => {
    await use(guardRequestContext(request));
  },
});

export {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type GenerationGuard,
  type Page,
  type Request,
  type Route,
};
