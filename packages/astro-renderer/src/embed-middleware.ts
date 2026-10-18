/**
 * Serves Cloudhal's constant modules in `cloudhal dev`: the click-to-load player (RFC-0015 §4)
 * and the interaction runtime (RFC-0020 §4); builds write them as static assets (`integration.ts`).
 */

import { AMBIENT_SCRIPT } from "./ambient-client.ts";
import { CAROUSEL_SCRIPT, CAROUSEL_SCRIPT_ALIASES } from "./carousel-client.ts";
import { CHART_SCRIPT } from "./chart.ts";
import { CHROME_SCRIPT, CHROME_SCRIPT_ALIASES } from "./chrome-client.ts";
import { EMBED_SCRIPT } from "./embed-client.ts";
import { MOTION_SCRIPT, MOTION_SCRIPT_ALIASES } from "./motion-client.ts";
import { OVERLAY_SCRIPT } from "./overlay-client.ts";
import { PREFS_SCRIPT } from "./prefs-client.ts";
import { SEARCH_SCRIPT } from "./search-client.ts";
import { SURFACE_SCRIPT, SURFACE_SCRIPT_ALIASES } from "./surface-client.ts";

/** Cloudhal's constant first-party modules `cloudhal dev` serves (builds write them as files). */
const SCRIPTS = new Map<string, string>([
  [EMBED_SCRIPT.path, EMBED_SCRIPT.code],
  [SURFACE_SCRIPT.path, SURFACE_SCRIPT.code],
  ...SURFACE_SCRIPT_ALIASES.map((alias) => [alias, SURFACE_SCRIPT.code] as [string, string]),
  [CHART_SCRIPT.path, CHART_SCRIPT.code],
  [MOTION_SCRIPT.path, MOTION_SCRIPT.code],
  ...MOTION_SCRIPT_ALIASES.map((alias) => [alias, MOTION_SCRIPT.code] as [string, string]),
  [AMBIENT_SCRIPT.path, AMBIENT_SCRIPT.code],
  [CHROME_SCRIPT.path, CHROME_SCRIPT.code],
  ...CHROME_SCRIPT_ALIASES.map((alias) => [alias, CHROME_SCRIPT.code] as [string, string]),
  [OVERLAY_SCRIPT.path, OVERLAY_SCRIPT.code],
  [CAROUSEL_SCRIPT.path, CAROUSEL_SCRIPT.code],
  ...CAROUSEL_SCRIPT_ALIASES.map((alias) => [alias, CAROUSEL_SCRIPT.code] as [string, string]),
  [PREFS_SCRIPT.path, PREFS_SCRIPT.code],
  // RFC-0029 §6: the search modal, on pages of deployments that answer searches.
  [SEARCH_SCRIPT.path, SEARCH_SCRIPT.code],
]);

interface MiddlewareContext {
  request: Request;
}

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const code = SCRIPTS.get(new URL(context.request.url).pathname);
  if (code === undefined) return next();
  return new Response(code, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
