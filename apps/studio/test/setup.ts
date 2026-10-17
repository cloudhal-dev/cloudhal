import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { beforeAll } from "vitest";
import { LOCALE_LIST, loadLocale, loadNamespace, NAMESPACES } from "../src/i18n/index.tsx";

// Lazy message namespaces (src/i18n/namespaces.ts) arrive with their routes in the app. Screens
// rendered on their own in tests get them up front, in every locale; test/i18n.test.tsx covers
// the loading itself.
// The core catalogs of other languages load the same way (`loadLocale`).
beforeAll(() =>
  Promise.all(
    LOCALE_LIST.flatMap((locale) => [
      loadLocale(locale),
      ...NAMESPACES.map((ns) => loadNamespace(ns, locale)),
    ]),
  ),
);

// findBy*/waitFor default to 1 s; with the whole monorepo testing in parallel (turbo) a screen can
// take longer to settle. The test timeout (vitest.config.ts) stays the upper bound.
configure({ asyncUtilTimeout: 5000 });

// Base UI / Kumo touch these at module level in some chunks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }) as unknown as MediaQueryList) as typeof window.matchMedia;
