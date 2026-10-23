/**
 * RFC-0042 §5 (added by the `cloudhal()` integration on every target): a collection's feed at
 * `<prefix>/rss.xml`, served only where the theme's own routes answered 404
 * (`collection-feed-route.ts`).
 */
import config from "virtual:cloudhal/config";
import { serveCollectionFeed } from "@cloudhal/astro-renderer/collection-feed-route";
import { getSource } from "@cloudhal/astro-renderer/runtime";

interface MiddlewareContext {
  request: Request;
}

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const response = await next();
  return serveCollectionFeed(context.request, response, (headers) =>
    getSource(config, { request: context.request, response: { headers } }),
  );
}
