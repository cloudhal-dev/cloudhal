/**
 * Serves Cloudhal's constant modules in `cloudhal dev`: the click-to-load player (RFC-0015 §4)
 * and the interaction runtime (RFC-0020 §4); builds write them as static assets (`integration.ts`).
 */

import { CHART_SCRIPT } from "./chart.ts";
import { EMBED_SCRIPT } from "./embed-client.ts";
import { MOTION_SCRIPT, MOTION_SCRIPT_ALIASES } from "./motion-client.ts";
import { SURFACE_SCRIPT, SURFACE_SCRIPT_ALIASES } from "./surface-client.ts";

/** Cloudhal's constant first-party modules `cloudhal dev` serves (builds write them as files). */
const SCRIPTS = new Map<string, string>([
  [EMBED_SCRIPT.path, EMBED_SCRIPT.code],
  [SURFACE_SCRIPT.path, SURFACE_SCRIPT.code],
  ...SURFACE_SCRIPT_ALIASES.map((alias) => [alias, SURFACE_SCRIPT.code] as [string, string]),
  [CHART_SCRIPT.path, CHART_SCRIPT.code],
  [MOTION_SCRIPT.path, MOTION_SCRIPT.code],
  ...MOTION_SCRIPT_ALIASES.map((alias) => [alias, MOTION_SCRIPT.code] as [string, string]),
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
