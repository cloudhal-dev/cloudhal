/**
 * Worker entry for a Cloudhal site on Cloudflare (`"main"` in the site's wrangler config).
 * Wraps the Astro handler with what a deployed Cloudhal site needs on top:
 *
 * - `POST /__cloudhal/purge` (Bearer `CLOUDHAL_PURGE_TOKEN`) purges this site's edge cache. The
 *   admin Worker calls it after publish/rollback. Purges are scoped to the Worker that cached the
 *   responses, which is why this lives here and not in the admin Worker (ADR-0012).
 * - Preview responses get every internal link rewritten to keep the signed token, so navigation
 *   stays in preview without a cookie (the edge cache does not vary on cookies).
 */

import { cache } from "cloudflare:workers";
import { handle } from "@astrojs/cloudflare/handler";
import { CACHE_TAG_PREFIX, resetSource } from "@cloudhal/astro-renderer/runtime";
import { PREVIEW_PARAM } from "./resolver.ts";

interface Env {
  CLOUDHAL_SITE_ID?: string;
  CLOUDHAL_PURGE_TOKEN?: string;
  [binding: string]: unknown;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}

async function purge(
  request: Request,
  env: Env,
  siteIdFromBuild: string | undefined,
): Promise<Response> {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const expected = env.CLOUDHAL_PURGE_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !timingSafeEqual(given, expected))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  resetSource();
  const siteId = env.CLOUDHAL_SITE_ID ?? siteIdFromBuild;
  const tag = `${CACHE_TAG_PREFIX}${siteId}`;
  // `cache.purge` exists on Cloudflare; local workerd has no edge cache to purge.
  const purger = (
    cache as unknown as {
      purge?: (o: { tags: string[] }) => Promise<{ success: boolean; errors?: unknown[] }>;
    }
  )?.purge;
  if (!purger)
    return Response.json({ purged: false, tag, reason: "no edge cache in this runtime" });
  const result = await purger.call(cache, { tags: [tag] });
  return Response.json(
    { purged: result.success, tag, errors: result.errors ?? [] },
    { status: result.success ? 200 : 502 },
  );
}

function keepPreviewInLinks(response: Response, token: string): Response {
  const rewrite = (attr: string) => ({
    element(el: Element) {
      const value = el.getAttribute(attr);
      if (!value?.startsWith("/") || value.startsWith("//")) return;
      const url = new URL(value, "https://x");
      url.searchParams.set(PREVIEW_PARAM, token);
      el.setAttribute(attr, `${url.pathname}${url.search}${url.hash}`);
    },
  });
  return new HTMLRewriter()
    .on("a[href]", rewrite("href"))
    .on("form[action]", rewrite("action"))
    .transform(response);
}

export function createSiteWorker(options: { siteId?: string } = {}) {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/__cloudhal/purge") return purge(request, env, options.siteId);
      const response = (await handle(request, env as never, ctx)) as unknown as Response;
      const token = response.headers.get("x-cloudhal-preview-token");
      if (response.headers.get("x-cloudhal-mode") !== "preview" || !token) return response;
      const headers = new Headers(response.headers);
      headers.delete("x-cloudhal-preview-token");
      const stripped = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      return (headers.get("content-type") ?? "").includes("text/html")
        ? keepPreviewInLinks(stripped, token)
        : stripped;
    },
  };
}

export default createSiteWorker();
