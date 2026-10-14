/**
 * Serves the click-to-load player module in `cloudhal dev` (RFC-0015 §4); builds write it as a
 * static asset (`integration.ts`).
 */
import { EMBED_SCRIPT } from "./embed-client.ts";

interface MiddlewareContext {
  request: Request;
}

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  if (new URL(context.request.url).pathname !== EMBED_SCRIPT.path) return next();
  return new Response(EMBED_SCRIPT.code, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
