/**
 * Import this module FIRST in a Worker entry (the generated `worker.ts` does).
 *
 * esbuild (wrangler's bundler) wraps zod in a lazy initializer because Better Auth reaches it
 * through dynamic `import()`s, yet it does not call that initializer before modules that import
 * zod statically — and `@modelcontextprotocol/core` builds zod schemas at module top level. The
 * Worker then fails at startup with "ZodLazy is not a constructor". Awaiting a dynamic import here
 * forces the initializer to run before any later module in the bundle evaluates.
 * Remove once the bundler orders wrapped modules correctly (ADR-0012).
 */
const z = await import("zod/v4");

// A real side effect, so the bundler keeps this module (zod declares `sideEffects: false`).
(globalThis as { __cloudhalZodReady?: boolean }).__cloudhalZodReady =
  typeof z.lazy(() => z.string()).parse === "function";

export {};
