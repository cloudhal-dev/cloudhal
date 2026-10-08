/**
 * Worker entry for a Cloudhal site on Cloudflare (`"main"` in the site's wrangler config).
 * Wraps the Astro handler with what a deployed Cloudhal site needs on top:
 *
 * - `POST /__cloudhal/purge` (Bearer `CLOUDHAL_PURGE_TOKEN`) purges this site's edge cache. The
 *   admin Worker calls it after publish/rollback. Purges are scoped to the Worker that cached the
 *   responses, which is why this lives here and not in the admin Worker (ADR-0012). A JSON body
 *   `{ "tags": [...] }` (at most 100, Cloudflare's limit per purge request) purges only those tags
 *   (`cloudhal-site-`, `-node-`, `-term-`, `-list-`, see `cache-tags.ts`) — what the admin Worker
 *   sends after working out what a publish changed; without one, everything is purged.
 * - Redirects (RFC-0002) are answered by the routes themselves (real 301s, `no-store` here like
 *   every non-200), so a publish that adds or removes one needs no purge of its own.
 * - Preview responses get every internal link rewritten to keep the signed token, so navigation
 *   stays in preview without a cookie (the edge cache does not vary on cookies). Media URLs in
 *   images, sources, video and audio keep it too, so draft media show (RFC-0004 §7.3).
 * - `/media/<sha16>/<slug>.<ext>` (RFC-0004 §7.1) is answered here, before Astro: published media
 *   are immutable and tagged `cloudhal-media-<siteId>` / `cloudhal-asset-<id>` (not the site tag),
 *   so purging pages after a publish leaves them cached.
 */

import { cache } from "cloudflare:workers";
import { handle } from "@astrojs/cloudflare/handler";
import { CACHE_TAG_PREFIX, resetSource, serveMedia } from "@cloudhal/astro-renderer/runtime";
import { isCloudhalCacheTag } from "./cache-tags.ts";
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
      purge?: (
        o: { tags: string[] } | { purgeEverything: true },
      ) => Promise<{ success: boolean; errors?: unknown[] }>;
    }
  )?.purge;
  // Optional body `{ "tags": [...] }`: purge only those Cloudhal tags (RFC-0002 §7). 100 per
  // request is Cloudflare's limit for tag purges on the Free tier, which Workers Cache always uses
  // (https://developers.cloudflare.com/cache/how-to/purge-cache/#hostname-tag-prefix-url-and-purge-everything-limits,
  // https://developers.cloudflare.com/workers/cache/purge/); the admin Worker batches to it.
  // Without a body everything is purged (first publish, or when the diff is unavailable).
  let tags: string[] | undefined;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => undefined)) as { tags?: unknown } | undefined;
    if (body?.tags !== undefined) {
      if (
        !Array.isArray(body.tags) ||
        body.tags.length === 0 ||
        body.tags.length > 100 ||
        !body.tags.every((t) => typeof t === "string" && isCloudhalCacheTag(t))
      )
        return Response.json(
          { error: "tags must be 1–100 cloudhal-site-/node-/term-/list-/media-/asset- cache tags" },
          { status: 400 },
        );
      tags = body.tags as string[];
    }
  }
  if (!purger)
    return Response.json({
      purged: false,
      tag,
      ...(tags ? { tags } : {}),
      reason: "no edge cache in this runtime",
    });
  // This Worker serves one site, so everything it cached belongs to that site. Purging all of it
  // (not just the tag) also drops entries Cloudflare cached on its own, e.g. a 404 for a page that
  // was published since.
  const result = await purger.call(cache, tags ? { tags } : { purgeEverything: true });
  return Response.json(
    { purged: result.success, tag, ...(tags ? { tags } : {}), errors: result.errors ?? [] },
    { status: result.success ? 200 : 502 },
  );
}

/** A site-relative URL with the preview token added; anything else unchanged. */
function withToken(value: string, token: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return value;
  const url = new URL(value, "https://x");
  url.searchParams.set(PREVIEW_PARAM, token);
  return `${url.pathname}${url.search}${url.hash}`;
}

function keepPreviewInLinks(response: Response, token: string): Response {
  const rewrite = (attr: string) => ({
    element(el: Element) {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, withToken(value, token));
    },
  });
  // `srcset`: "<url> <descriptor>, …" — each candidate URL keeps the token.
  const rewriteSrcset = {
    element(el: Element) {
      const value = el.getAttribute("srcset");
      if (!value) return;
      el.setAttribute(
        "srcset",
        value
          .split(",")
          .map((c) => {
            const [u, ...rest] = c.trim().split(/\s+/);
            return [withToken(u ?? "", token), ...rest].join(" ");
          })
          .join(", "),
      );
    },
  };
  return new HTMLRewriter()
    .on("a[href]", rewrite("href"))
    .on("form[action]", rewrite("action"))
    .on("img[src]", rewrite("src"))
    .on("img[srcset]", rewriteSrcset)
    .on("source[srcset]", rewriteSrcset)
    .on("source[src]", rewrite("src"))
    .on("video[src]", rewrite("src"))
    .on("video[poster]", rewrite("poster"))
    .on("audio[src]", rewrite("src"))
    .transform(response);
}

/**
 * Defence in depth for content written by agents: no inline or third-party scripts, no plugins,
 * no foreign framing. Sites ship no client scripts of their own (Astro islands load from 'self').
 */
// Not exported: every named export of a Worker entry module must be a handler or entrypoint.
const SITE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

/**
 * Only a 200 page may sit in the edge cache (tagged, until the next publish). Anything else — a
 * 404 for a page that does not exist *yet*, a 503 before the first publish — must not be cached,
 * or it would outlive the publish that fixes it.
 */
function cacheOnlySuccess(response: Response): Response {
  if (response.status === 200 || response.status === 304) return response;
  const headers = new Headers(response.headers);
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response: Response): Response {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const headers = new Headers(response.headers);
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", SITE_CSP);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createSiteWorker(options: { siteId?: string } = {}) {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/__cloudhal/purge") return purge(request, env, options.siteId);
      const siteId = env.CLOUDHAL_SITE_ID ?? options.siteId;
      const media = siteId ? await serveMedia(request, { siteId }) : undefined;
      if (media) return media;
      const response = withSecurityHeaders(
        cacheOnlySuccess((await handle(request, env as never, ctx)) as unknown as Response),
      );
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
