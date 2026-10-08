import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

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
