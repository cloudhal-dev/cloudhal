/**
 * Dev middleware (added by the `cloudhal()` integration for Node targets): answers the media route
 * from the local blob store before page routing, with `no-store`, drafts included (RFC-0004 §7.8).
 * The Cloudflare Site Worker answers media in its entry instead (`cloudflare-entry.ts`).
 */
import config from "virtual:cloudhal/config";
import { serveMedia } from "@cloudhal/astro-renderer/runtime";

interface MiddlewareContext {
  request: Request;
}

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  return (await serveMedia(context.request, config)) ?? next();
}
