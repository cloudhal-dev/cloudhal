/**
 * @cloudhal/comments/client — the browser sources of reader comments (RFC-0007 §7.3, §8.2) and the
 * names they are served under. The `cloudhal()` Astro integration bundles them into two hashed
 * static assets; nothing here runs in a Worker or in the browser as-is (Node build input only, like
 * `@cloudhal/analytics/client`).
 *
 * - `module`: `/_cloudhal/c.<hash>.js`, loaded (`type="module"`) only on pages with an open thread.
 *   Progressive enhancement of the plain HTML form: it fetches a challenge when the reader focuses
 *   a form, solves it in the worker, posts JSON, shows the reader's own comment inline as awaiting
 *   moderation, moves the form under a comment for "Reply", loads more comments in place, and with
 *   Turnstile on (owner opt-in) loads Cloudflare's widget instead. ≤ `MODULE_GZIP_BUDGET` gzipped.
 * - `solver`: `/_cloudhal/cw.<hash>.js`, a dedicated Web Worker with a pure-JS SHA-256 (no
 *   WebAssembly, so the CSP needs no `'wasm-unsafe-eval'`), so the page never janks while it
 *   searches. ≤ `SOLVER_GZIP_BUDGET` gzipped.
 *
 * Neither stores anything on the device, sets a cookie or sends an identifier.
 */
import { fileURLToPath } from "node:url";

/** Where the scripts are served (a static-assets directory of the site build). */
export const CLIENT_DIR = "/_cloudhal/";
/** The endpoints the module talks to (answered by the site Worker before Astro, §6.1). */
export const COMMENTS_ENDPOINT = "/__cloudhal/comments";
export const COMMENTS_REPORT_ENDPOINT = "/__cloudhal/comments/report";
export const COMMENTS_CHALLENGE_ENDPOINT = "/__cloudhal/comments/challenge";
/** The module's size budget, gzipped (RFC-0007 §8.2: ≤ 4 KB). */
export const MODULE_GZIP_BUDGET = 4096;
/** The worker's size budget, gzipped (RFC-0007 §8.2: ≈ 1 KB). */
export const SOLVER_GZIP_BUDGET = 1024;
/** Replaced in the module source with the worker's hashed URL. */
export const SOLVER_URL_DEFINE = "__CLOUDHAL_SOLVER__";
/** The only third-party origin the module may load from, and only with Turnstile on (§7.6). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Absolute paths of the two entry files (plain browser JavaScript, no imports). */
export const COMMENTS_CLIENT_SOURCES = {
  module: fileURLToPath(new URL("./comments.browser.js", import.meta.url).href),
  solver: fileURLToPath(new URL("./solver.browser.js", import.meta.url).href),
} as const;
