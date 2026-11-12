import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";
import { blockGeneration, type GenerationGuard } from "./no-generation";

export const test = base.extend<{ generationGuard: GenerationGuard }>({
  generationGuard: [
    async ({ page }, use) => {
      const guard = await blockGeneration(page);
      await use(guard);
    },
    { auto: true },
  ],
});

export {
  expect,
  type APIRequestContext,
  type GenerationGuard,
  type Page,
  type Request,
  type Route,
};
