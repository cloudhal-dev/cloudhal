/**
 * @cloudhal/analytics/client — the browser script sources (RFC-0006 §5.1) and the names they are
 * served under. The `cloudhal()` Astro integration bundles them at build time into two hashed
 * static assets; nothing here runs in a Worker or in the browser as-is (Node build input only).
 *
 * - `pageview`: `/_cloudhal/p.<hash>.js`, ≤ `PAGEVIEW_GZIP_BUDGET` bytes gzipped;
 * - `vitals`: `/_cloudhal/v.<hash>.js`, `web-vitals` plus our sender, loaded by sampled page views.
 *
 * `/_cloudhal/` cannot collide with a site route (the graph's `Path` pattern has no `_`), and the
 * names avoid the words blocklists match (`analytics`, `collect`, `track`, `beacon`).
 */
import { fileURLToPath } from "node:url";

/** Where the scripts are served (a static-assets directory of the site build). */
export const CLIENT_DIR = "/_cloudhal/";
/** The beacon endpoint the scripts post to. */
export const BEACON_PATH = "/__cloudhal/e";
/** The page-view script's size budget, gzipped (RFC-0006 §5.1). */
export const PAGEVIEW_GZIP_BUDGET = 1024;
/** Replaced in the page-view source with the vitals module's URL. */
export const VITALS_URL_DEFINE = "__CLOUDHAL_VITALS__";

/** Absolute paths of the two entry modules (plain ES modules; the vitals one imports `web-vitals`). */
export const CLIENT_SOURCES = {
  pageview: fileURLToPath(new URL("./pageview.browser.js", import.meta.url).href),
  vitals: fileURLToPath(new URL("./vitals.browser.js", import.meta.url).href),
} as const;
