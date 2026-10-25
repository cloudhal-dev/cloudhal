import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
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

// Vitest runs without globals, so Testing Library never registers its own cleanup: trees stayed
// mounted, Base UI / Floating UI work committed outside act after the file ended, and React's
// passive flush (setImmediate) read `window` after happy-dom's teardown ("window is not defined",
// CI run 39959905949). cleanup() is idempotent, so files that call it themselves are unaffected.
// Real timers come back first so the drain below is never faked; setImmediate is FIFO, so three
// rounds also cover a scheduler that yields and posts again.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
afterAll(async () => {
  for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve));
});

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
