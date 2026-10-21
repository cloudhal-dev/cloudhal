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
 * - `GET /__cloudhal/features` (Bearer `CLOUDHAL_PURGE_TOKEN`) says what this Worker enforces, so
 *   the admin Worker never writes data an older site Worker would mishandle (RFC-0008 §7.7):
 *   `{ "gates": 1 }` — every public path checks pages' and entries' time gates per request and
 *   caps the edge cache at the next one. Until it answers so, writers refuse `availability`.
 * - Redirects (RFC-0002) are answered by the routes themselves (real 301s, `no-store` here like
 *   every non-200), so a publish that adds or removes one needs no purge of its own.
 * - Preview responses get every internal link rewritten to keep the signed token, so navigation
 *   stays in preview without a cookie (the edge cache does not vary on cookies). Media URLs in
 *   images, sources, video and audio keep it too, so draft media show (RFC-0004 §7.3).
 * - `/media/<sha16>/<slug>.<ext>` (RFC-0004 §7.1) is answered here, before Astro: published media
 *   are immutable and tagged `cloudhal-media-<siteId>` / `cloudhal-asset-<id>` (not the site tag),
 *   so purging pages after a publish leaves them cached.
 * - Site analytics (RFC-0006 §5): `POST /__cloudhal/e` takes page-view and vitals beacons (always
 *   `204`, never cached) and writes them to Workers Analytics Engine (`ANALYTICS`); published HTML
 *   pages get the `/_cloudhal/p.<hash>.js` tag while the site's setting is on (it sits in the cached
 *   HTML, so a settings change purges); responses the Worker renders become `render` events. All of
 *   it is off without `CLOUDHAL_ANALYTICS=on` and the binding (`analytics.ts`).
 * - Reader comments (RFC-0007 §6, §15.2): `GET /__cloudhal/comments/challenge`,
 *   `POST /__cloudhal/comments` and `POST /__cloudhal/comments/report` are answered here, before
 *   Astro and never cached (`comments.ts`), with `CF-Connecting-IP` as the client address. Pages
 *   render the section themselves (`loadComments`, `<Comments />`) and set their own CSP when an
 *   open form uses Turnstile; `withSecurityHeaders` keeps it. All of it is off without a usable
 *   `CLOUDHAL_COMMENTS_KEY` (or when the build has no comments module).
 */

import { cache } from "cloudflare:workers";
import config from "virtual:cloudhal/config";
import { handle } from "@astrojs/cloudflare/handler";
import { type WaeDataset, WaeWriter } from "@cloudhal/analytics/wae";
import {
  analyticsBackend,
  CACHE_TAG_PREFIX,
  resetSource,
  serveMedia,
  withRequestSite,
} from "@cloudhal/astro-renderer/runtime";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import { GATES_FEATURE_VERSION } from "@cloudhal/core-ts/availability";
import { D1Driver } from "@cloudhal/storage/d1";
import {
  ANALYTICS_BEACON_PATH,
  deploymentDefaults,
  parseHosts,
  SiteAnalytics,
} from "./analytics.ts";
import { isCloudhalCacheTag } from "./cache-tags.ts";
import { varyByHost } from "./cache-vary.ts";
import { type CommentsRateLimit, isCommentsPath, SiteComments } from "./comments.ts";
import { SITE_CSP } from "./csp.ts";
import { EMBED_HEADER, withEmbedFrames } from "./embed-client.ts";
import { hostRedirect, type RedirectEnv } from "./host-redirect.ts";
import { PREVIEW_PARAM } from "./resolver.ts";
import { SearchLimiter, searchCost } from "./search-limit.ts";
import { SiteDispatch, unknownHost, withNoindex } from "./site-dispatch.ts";

interface Env extends RedirectEnv {
  CLOUDHAL_SITE_ID?: string;
  /**
   * RFC-0034 §4: the sites a multi-site Worker serves (comma-separated); the hostname picks one
   * through `site_hosts`. Ignored when `CLOUDHAL_SITE_ID` is set.
   */
  CLOUDHAL_SITE_IDS?: string;
  DB?: D1Database;
  CLOUDHAL_PURGE_TOKEN?: string;
  /**
   * Site analytics (RFC-0006 §11): the Workers Analytics Engine dataset (`<deployment>_events`).
   * Without it nothing is collected and no script tag is injected.
   */
  ANALYTICS?: AnalyticsEngineDataset;
  /**
   * Optional Workers Rate Limiting binding (`analytics.rateLimit` in cloudhal.json, RFC-0006 §5.5):
   * a cross-isolate beacon limit on top of the per-isolate one, keyed by an HMAC derived from
   * `CLOUDHAL_PURGE_TOKEN` (never the IP). Without it, or without the token, only the per-isolate
   * limits apply.
   */
  ANALYTICS_RL?: RateLimit;
  /** `"on"` turns analytics on for the deployment; anything else (or absent) is off. */
  CLOUDHAL_ANALYTICS?: string;
  /** `cloudhal.json`'s `analytics` block as compact JSON: defaults for sites without a settings row. */
  CLOUDHAL_ANALYTICS_DEFAULTS?: string;
  /**
   * Hostnames the site answers on besides `Site.domains` (comma-separated), e.g. its workers.dev
   * host. Requests that arrive on a `*.workers.dev` host are always accepted as the site's own.
   */
  CLOUDHAL_SITE_HOSTS?: string;
  /**
   * Reader comments (RFC-0007 §15.4): the deployment secret the comment keys are derived from
   * (proof-of-work MACs, email encryption and hashes, stored owner secrets). Without it — or with
   * fewer than 32 characters — comments are off: the endpoints answer `404`, pages show none.
   */
  CLOUDHAL_COMMENTS_KEY?: string;
  /**
   * Optional Workers Rate Limiting binding (`comments.rateLimit` in cloudhal.json, RFC-0007 §6.5):
   * submissions per client across isolates, keyed by an HMAC under `CLOUDHAL_COMMENTS_KEY`.
   */
  COMMENTS_RL?: CommentsRateLimit;
  [binding: string]: unknown;
}

/**
 * Writes made through an RPC-style binding (a test double, or a future binding that returns a
 * promise) are kept alive with `waitUntil`; Workers Analytics Engine's `writeDataPoint` returns
 * nothing, so this costs nothing in production.
 */
class PendingWrites {
  readonly #pending = new Set<Promise<unknown>>();
  dataset(binding: AnalyticsEngineDataset): WaeDataset {
    return {
      writeDataPoint: (point) => {
        const result = (binding.writeDataPoint as (p: unknown) => unknown)(point);
        if (result && typeof (result as Promise<unknown>).then === "function") {
          const p = (result as Promise<unknown>).catch(() => {});
          this.#pending.add(p);
          p.finally(() => this.#pending.delete(p));
        }
      },
    };
  }
  /** Settles when the writes made so far have. */
  settled(): Promise<unknown> {
    return Promise.allSettled([...this.#pending]);
  }
  /** Keeps the invocation alive until the writes made so far have settled. */
  flush(ctx: ExecutionContext): void {
    if (this.#pending.size > 0) ctx.waitUntil(this.settled());
  }
}

const pendingWrites = new PendingWrites();
/** Per site the isolate has served (one on a single-site Worker). */
const analyticsBySite = new Map<string, SiteAnalytics>();
const commentsBySite = new Map<string, SiteComments>();
let dispatch: SiteDispatch | undefined;

/** One per isolate: which site a request is for (RFC-0034 §4). */
function siteDispatch(env: Env, siteIdFromBuild: string | undefined): SiteDispatch {
  dispatch ??= new SiteDispatch({
    siteId: env.CLOUDHAL_SITE_ID ?? (env.CLOUDHAL_SITE_IDS ? undefined : siteIdFromBuild),
    siteIds: env.CLOUDHAL_SITE_IDS,
    sql: () => new D1Driver(env.DB as D1Database),
  });
  return dispatch;
}

/** The hosts a site answers on: `CLOUDHAL_SITE_HOSTS`, plus its `site_hosts` rows when multi-site. */
async function siteHosts(env: Env, siteId: string): Promise<string[]> {
  return [...parseHosts(env.CLOUDHAL_SITE_HOSTS), ...((await dispatch?.hosts(siteId)) ?? [])];
}

/** One per site and isolate: keys, limits, today's count, replay cache, settings and pointer. */
async function siteComments(env: Env, siteId: string): Promise<SiteComments> {
  const known = commentsBySite.get(siteId);
  if (known) return known;
  const { sql, site, snapshot } = analyticsBackend(siteId);
  let store: SqlCommentStore | undefined;
  const comments = new SiteComments({
    siteId,
    secret: env.CLOUDHAL_COMMENTS_KEY,
    // the integration built the module only when `comments.available` is not false
    available: Boolean(config.commentsScript),
    store: async () => {
      store ??= new SqlCommentStore(sql());
      return store;
    },
    site,
    snapshot,
    hosts: await siteHosts(env, siteId),
    acceptRequestHost: (host) => host.endsWith(".workers.dev"),
    rateLimit: env.COMMENTS_RL,
    onError: (m, e) => console.error(m, e),
  });
  commentsBySite.set(siteId, comments);
  return comments;
}

/** One per site and isolate: settings, pointer, rate limits and the render sampler. */
async function siteAnalytics(env: Env, siteId: string): Promise<SiteAnalytics> {
  const known = analyticsBySite.get(siteId);
  if (known) return known;
  const { sql, site, snapshot } = analyticsBackend(siteId);
  const analytics = new SiteAnalytics({
    siteId,
    defaults: deploymentDefaults(env.CLOUDHAL_ANALYTICS, env.CLOUDHAL_ANALYTICS_DEFAULTS),
    writer: env.ANALYTICS
      ? new WaeWriter(pendingWrites.dataset(env.ANALYTICS), {
          onError: (m, e) => console.error(m, e),
        })
      : undefined,
    sql,
    site,
    snapshot,
    script: config.analyticsScript,
    hosts: await siteHosts(env, siteId),
    acceptRequestHost: (host) => host.endsWith(".workers.dev"),
    rateLimit:
      env.ANALYTICS_RL && env.CLOUDHAL_PURGE_TOKEN
        ? { binding: env.ANALYTICS_RL, secret: env.CLOUDHAL_PURGE_TOKEN }
        : undefined,
    onError: (m, e) => console.error(m, e),
  });
  analyticsBySite.set(siteId, analytics);
  return analytics;
}

/** Appends the analytics tag to `<head>` of a published HTML page (§5.1). */
async function withAnalyticsTag(response: Response, a: SiteAnalytics): Promise<Response> {
  if (
    response.status !== 200 ||
    response.headers.get("x-cloudhal-mode") !== "published" ||
    !(response.headers.get("content-type") ?? "").includes("text/html")
  )
    return response;
  const tag = await a.tag();
  if (!tag) return response;
  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append(tag, { html: true });
      },
    })
    .transform(response);
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}

/** True when the request carries the shared purge token (the admin Worker over `SITE`). */
function fromAdmin(request: Request, env: Env): boolean {
  const expected = env.CLOUDHAL_PURGE_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return !!expected && timingSafeEqual(given, expected);
}

/**
 * What this site Worker enforces (RFC-0008 §7.6–§7.7): the admin Worker asks before it lets anyone
 * write time gates. Authenticated like the purge (it is not a public endpoint), never cached.
 */
function features(request: Request, env: Env): Response {
  const headers = { "cache-control": "no-store", "cloudflare-cdn-cache-control": "no-store" };
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("method not allowed", {
      status: 405,
      headers: { ...headers, allow: "GET" },
    });
  if (!fromAdmin(request, env))
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  return Response.json({ gates: GATES_FEATURE_VERSION }, { headers });
}

/**
 * The purge's optional JSON body: `tags` (1–100 Cloudhal cache tags) and, on a multi-site Worker,
 * the `siteId` whose publish it is (RFC-0034 §4). A 400 for anything else.
 */
async function purgeBody(
  request: Request,
  served: readonly string[],
): Promise<{ tags?: string[]; siteId?: string } | Response> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return {};
  const body = (await request.json().catch(() => undefined)) as
    | { tags?: unknown; siteId?: unknown }
    | undefined;
  const out: { tags?: string[]; siteId?: string } = {};
  if (body?.siteId !== undefined) {
    if (typeof body.siteId !== "string" || !served.includes(body.siteId))
      return Response.json({ error: "siteId is not served by this Worker" }, { status: 400 });
    out.siteId = body.siteId;
  }
  if (body?.tags !== undefined) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.length === 0 ||
      body.tags.length > 100 ||
      !body.tags.every((t) => typeof t === "string" && isCloudhalCacheTag(t))
    )
      return Response.json(
        {
          error:
            "tags must be 1–100 cloudhal-site-/node-/term-/list-/media-/asset-/comments- cache tags",
        },
        { status: 400 },
      );
    out.tags = body.tags as string[];
  }
  return out;
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
  const d = siteDispatch(env, siteIdFromBuild);
  const siteId = d.siteIds[0];
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
  const body = await purgeBody(request, d.siteIds);
  if (body instanceof Response) return body;
  const only = body.siteId;
  let tags = body.tags;
  // Re-read what the purged sites' publish or settings change touched (RFC-0006 §9.2, RFC-0007
  // §8.3): pointers, settings, and on a multi-site Worker the hostnames.
  d.reset();
  for (const id of only ? [only] : d.siteIds) {
    resetSource(id);
    analyticsBySite.get(id)?.reset();
    commentsBySite.get(id)?.reset();
  }
  if (!tags && d.multi)
    tags = (only ? [only] : [...d.siteIds]).map((id) => `${CACHE_TAG_PREFIX}${id}`).slice(0, 100);
  if (!purger)
    return Response.json({
      purged: false,
      tag,
      ...(tags ? { tags } : {}),
      reason: "no edge cache in this runtime",
    });
  // A single-site Worker cached only its site, so purging everything also drops entries Cloudflare
  // cached on its own (a 404 for a page published since). A multi-site Worker purges tags only:
  // one site's publish never empties another's cache (RFC-0034 invariant 4).
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
  // A page with a video player asked for its frames (RFC-0015 §4): this page only.
  if (headers.has(EMBED_HEADER)) {
    headers.set(
      "content-security-policy",
      withEmbedFrames(headers.get("content-security-policy") ?? SITE_CSP),
    );
    headers.delete(EMBED_HEADER);
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Everything after the operator endpoints, for one site (or none: a Worker not yet pointed at one). */
async function serveSite(
  call: { request: Request; env: Env; ctx: ExecutionContext },
  siteId: string | undefined,
  searchLimiter: SearchLimiter,
): Promise<Response> {
  const { request, env, ctx } = call;
  const url = new URL(request.url);
  const a = siteId ? await siteAnalytics(env, siteId) : undefined;
  // Analytics beacons (RFC-0006 §5.2): 204 for every outcome, never cached (POST).
  if (url.pathname === ANALYTICS_BEACON_PATH) {
    if (!a)
      return new Response(null, {
        status: request.method === "POST" ? 204 : 405,
        headers: { "cache-control": "no-store" },
      });
    // On Cloudflare the edge sets CF-Connecting-IP (a client's own value is overwritten), so
    // it is the trusted address here; the beacon handler never reads headers for it.
    const clientIp = request.headers.get("cf-connecting-ip")?.trim();
    const answer = await a.beacon(request, clientIp ? { clientIp } : {});
    pendingWrites.flush(ctx);
    return answer;
  }
  // Reader comments (RFC-0007 §6.1): before Astro, never cached; `404` while comments are off.
  if (isCommentsPath(url.pathname)) {
    if (!siteId)
      return Response.json(
        { error: "not_found" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    // CF-Connecting-IP is set by Cloudflare's edge (a client's own value is overwritten).
    return (await (
      await siteComments(env, siteId)
    ).handle(request, {
      clientAddress: request.headers.get("cf-connecting-ip") ?? undefined,
    })) as Response;
  }
  // Site search (RFC-0019 §3, RFC-0029 §5): per-client limit before anything renders; the
  // modal's endpoint answers in JSON.
  const cost = searchCost(url.pathname);
  if (cost !== undefined) {
    const wait = searchLimiter.take(request.headers.get("cf-connecting-ip") ?? undefined, cost);
    if (wait > 0) {
      const json = url.pathname.endsWith(".json");
      return new Response(
        json
          ? JSON.stringify({ error: "rate_limited" })
          : "Too many searches; try again in a minute.",
        {
          status: 429,
          headers: {
            "retry-after": String(wait),
            "cache-control": "no-store",
            "content-type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
          },
        },
      );
    }
  }
  const started = Date.now();
  const media = siteId ? await serveMedia(request, { siteId }) : undefined;
  const rendered =
    media ??
    withSecurityHeaders(
      cacheOnlySuccess((await handle(request, env as never, ctx)) as unknown as Response),
    );
  // Server-side render events (§5.4), off the response path: published HTML 200s (cache
  // misses), redirects, 404, 410, 451 and 5xx; never previews or HEAD.
  if (a?.available) {
    const renderMs = Date.now() - started;
    ctx.waitUntil(a.render(request, rendered, renderMs).then(() => pendingWrites.settled()));
  }
  if (media) return media;
  const response = a?.available ? await withAnalyticsTag(rendered, a) : rendered;
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
}

export function createSiteWorker(options: { siteId?: string } = {}) {
  const searchLimiter = new SearchLimiter();
  async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__cloudhal/purge") return purge(request, env, options.siteId);
    if (url.pathname === "/__cloudhal/features") return features(request, env);
    const moved = hostRedirect(request, env);
    if (moved) return moved;
    // RFC-0034 §4: the hostname picks the site on a multi-site Worker; everything the request
    // runs (Astro's render included) then sees that site.
    const choice = await siteDispatch(env, options.siteId).choose(request);
    if (choice.kind === "unknown") return unknownHost();
    const siteId = choice.siteId;
    const run = () => serveSite({ request, env, ctx }, siteId, searchLimiter);
    const response = siteId ? await withRequestSite(siteId, run) : await run();
    return choice.noindex ? withNoindex(response) : response;
  }
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      // #62: the edge cache is shared by every host this Worker answers on, unless told to vary.
      return varyByHost(await route(request, env, ctx));
    },
  };
}

export default createSiteWorker();
