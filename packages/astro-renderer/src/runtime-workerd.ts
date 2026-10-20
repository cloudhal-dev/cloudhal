/**
 * `workerd` build of `@cloudhal/astro-renderer/runtime` (selected by the `workerd` export
 * condition): the deployed Site Worker. Storage comes from bindings — D1 `DB` for nodes and the
 * published pointer, R2 `BLOBS` for snapshot bodies — and every request is resolved on its own:
 * published snapshot by default, drafts/any snapshot behind a signed preview link.
 *
 * Response headers set here drive the Workers Cache (ADR-0012): published pages are cached at the
 * edge under `Cache-Tag: cloudhal-site-<siteId>` until a publish/rollback purges that tag, and
 * never past the snapshot's next time gate (RFC-0008 §7.4); previews are never cached.
 */

import { env, waitUntil } from "cloudflare:workers";
import { AsyncLocalStorage } from "node:async_hooks";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { Site } from "@cloudhal/core-contracts";
import { type AiSearchEnv, SiteGraphStore, searchProviderFromEnv } from "@cloudhal/core-ts";
import { edgeMaxAge } from "@cloudhal/core-ts/availability";
import type { SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { siteCacheTag } from "./cache-tags.ts";
import { usableCommentsKey } from "./comments.ts";
import type { CloudhalRendererConfig } from "./integration.ts";
import type { PeerEdition } from "./locales.ts";
import { matchMediaRoute, serveMediaRequest } from "./media-route.ts";
import { PREVIEW_PARAM, SiteResolver } from "./resolver.ts";
import type { GraphSource } from "./source.ts";

/** RFC-0029 §3: `AI_SEARCH`, `SEARCH_BUCKET` and `CLOUDHAL_SEARCH_*` turn on semantic search. */
export interface SiteWorkerEnv extends AiSearchEnv {
  DB: D1Database;
  BLOBS: R2Bucket;
  /** Overrides the site id baked into the build (one Worker can be re-pointed without a rebuild). */
  CLOUDHAL_SITE_ID?: string;
  /** Shared with the admin Worker; enables signed preview links. */
  CLOUDHAL_PREVIEW_SECRET?: string;
  /** Reader comments (RFC-0007 §15.4): without a usable key, comments are off. */
  CLOUDHAL_COMMENTS_KEY?: string;
}

/** Minimal shape of the Astro global the page passes in. */
export interface AstroLike {
  request: Request;
  response: { headers: Headers; status?: number };
}

/**
 * RFC-0034 §4: the site this request is for, set by the entry (from the hostname on a multi-site
 * Worker) around everything the request runs, Astro's render included. Module state, not a header:
 * a client cannot choose it.
 */
const requestSite = new AsyncLocalStorage<string>();

/** Runs `fn` (and everything it awaits) as a request for `siteId`. */
export function withRequestSite<T>(siteId: string, fn: () => T): T {
  return requestSite.run(siteId, fn);
}

/**
 * RFC-0036 §4: a store the entry chose for this request — a playground session's own database in
 * its Durable Object — instead of the D1/R2 bindings. Its pages are private: never edge-cached and
 * never tagged.
 */
const requestStore = new AsyncLocalStorage<{ store: SiteGraphStore; siteId: string }>();
const storeResolvers = new WeakMap<SiteGraphStore, SiteResolver>();

/** Runs `fn` (and everything it awaits) as a request for `siteId` over `store`. */
export function withRequestStore<T>(store: SiteGraphStore, siteId: string, fn: () => T): T {
  return requestStore.run({ store, siteId }, fn);
}

/** The request's site: the entry's choice, else `CLOUDHAL_SITE_ID`, else the build's. */
function siteOf(fallback: string | undefined): string | undefined {
  return (
    requestStore.getStore()?.siteId ??
    requestSite.getStore() ??
    (env as unknown as SiteWorkerEnv).CLOUDHAL_SITE_ID ??
    fallback
  );
}

/** The resolver over the request's own store (`withRequestStore`), one per store. */
function scopedResolver(siteId: string): SiteResolver | undefined {
  const scoped = requestStore.getStore();
  if (!scoped || scoped.siteId !== siteId) return undefined;
  let resolver = storeResolvers.get(scoped.store);
  if (!resolver) {
    resolver = new SiteResolver({
      store: scoped.store,
      siteId,
      pointerTtlMs: 0,
      previewCookie: false,
      // The store lives in the caller's Durable Object, which outlives the response.
      persistBundle: (task) => void task.catch(() => {}),
    });
    storeResolvers.set(scoped.store, resolver);
  }
  return resolver;
}

/** One resolver per site the isolate has served (pointer, snapshot and bundle caches). */
const resolvers = new Map<string, SiteResolver>();

/** The site's store; with the deployment's search provider when it has one (RFC-0029 §3). */
function siteStore(e: SiteWorkerEnv): SiteGraphStore {
  const sql = new D1Driver(e.DB);
  const search = searchProviderFromEnv(e, sql, {
    onError: (err) => console.error("semantic search failed, FTS5 answered:", err),
  });
  return new SiteGraphStore({
    sql,
    blobs: new R2BlobStore(e.BLOBS),
    ...(search ? { search } : {}),
  });
}

function getResolver(siteId: string): SiteResolver {
  const scoped = scopedResolver(siteId);
  if (scoped) return scoped;
  const e = env as unknown as SiteWorkerEnv;
  const known = resolvers.get(siteId);
  if (known) return known;
  const resolver = new SiteResolver({
    store: siteStore(e),
    siteId,
    previewSecret: e.CLOUDHAL_PREVIEW_SECRET,
    // The edge cache absorbs repeat traffic; a cache miss must see the pointer as it is now,
    // otherwise a just-purged page could be re-cached from a stale pointer.
    pointerTtlMs: 0,
    // Previews travel in the URL (links are rewritten by the entry), not in a cookie: the edge
    // cache does not vary on cookies, so a cookie-carried preview could be served a cached page.
    previewCookie: false,
    // RFC-0010: the published snapshot's bundle is written after the response, the first time
    // this deployment renders it without one (release runs, rollbacks, pushes, lifecycle expiry).
    persistBundle: (task) => waitUntil(task),
  });
  resolvers.set(siteId, resolver);
  return resolver;
}

/** Test/purge hook: forget cached state in this isolate, for one site or all of them. */
export function resetSource(siteId?: string): void {
  for (const [id, r] of resolvers) if (!siteId || id === siteId) r.invalidate();
}

/**
 * What site analytics read on the Site Worker (`SiteAnalytics`, RFC-0006 §5.2): D1 for settings and
 * the daily salt, the site row (published pointer, domains) and the isolate's snapshot cache.
 */
export function analyticsBackend(
  siteId: string,
  /** Ignored here (bindings decide); the Node build reads the local store from `dataDir`. */
  _config?: Partial<CloudhalRendererConfig>,
): {
  sql: () => SqlDriver;
  site: () => Promise<Site | undefined>;
  snapshot: (id: string) => Promise<GraphSource>;
  open: () => Promise<SqlDriver>;
} {
  const r = getResolver(siteId);
  let sql: D1Driver | undefined;
  const driver = () => {
    sql ??= new D1Driver((env as unknown as SiteWorkerEnv).DB);
    return sql;
  };
  return {
    sql: driver,
    open: async () => driver(),
    site: () => r.store.getSite(siteId),
    snapshot: (id) => r.snapshot(id),
  };
}

export { CACHE_TAG_PREFIX } from "./cache-tags.ts";

/**
 * RFC-0034 §6: the other sites of the project that publish a version of `node`'s work (language
 * editions), for `hreflang` and the language switcher. Only what those sites have published
 * counts: their published snapshot is read, never their drafts. A site without a hostname is
 * left out (there is no address to point to).
 */
export async function peerEditions(
  config: CloudhalRendererConfig,
  node: { id: string; translation?: { group: string } | undefined; path?: string },
): Promise<PeerEdition[]> {
  const siteId = siteOf(config.siteId);
  if (!siteId) return [];
  const store = getResolver(siteId).store;
  const site = await store.getSite(siteId);
  if (!site) return [];
  const siblings = (await store.listSites(site.projectId)).filter(
    (s) => s.id !== siteId && s.publishedSnapshotId && s.domains.length > 0,
  );
  if (siblings.length === 0) return [];
  const group = node.translation?.group ?? node.id;
  const rows = await store.sql.all<{ site_id: string }>(
    `SELECT DISTINCT site_id FROM nodes WHERE kind = ? AND site_id IN (${siblings.map(() => "?").join(", ")})
       AND (id = ? OR json_extract(body, '$.translation.group') = ?)`,
    ["path" in node ? "page" : "contentEntry", ...siblings.map((s) => s.id), group, group],
  );
  const now = Date.now();
  const out: PeerEdition[] = [];
  for (const { site_id } of rows) {
    const peer = siblings.find((s) => s.id === site_id);
    const host = peer?.domains.find((d) => d.primary)?.hostname ?? peer?.domains[0]?.hostname;
    if (!peer?.publishedSnapshotId || !host) continue;
    const source = (await getResolver(peer.id).snapshot(peer.publishedSnapshotId)).at(now);
    out.push({ source, origin: `https://${host}` });
  }
  return out;
}

let commentStore: SqlCommentStore | undefined;

/**
 * The comment store for pages on the Site Worker (RFC-0007 §8.1): D1. `undefined` when the build
 * has no comments module (`comments.available: false`) or the Worker has no usable
 * `CLOUDHAL_COMMENTS_KEY` — comments are then off, and the entry answers their endpoints `404`.
 */
export async function commentsBackend(
  config: Partial<CloudhalRendererConfig>,
): Promise<{ store: SqlCommentStore } | undefined> {
  const e = env as unknown as SiteWorkerEnv;
  if (!config.commentsScript || !usableCommentsKey(e.CLOUDHAL_COMMENTS_KEY)) return undefined;
  commentStore ??= new SqlCommentStore(new D1Driver(e.DB));
  return { store: commentStore };
}

/**
 * Resolves the source for this request and sets caching/preview headers on the response.
 * Returns `undefined` when the site has never been published (the page should answer 503).
 */
export async function getSource(
  config: CloudhalRendererConfig,
  astro?: AstroLike,
): Promise<GraphSource | undefined> {
  if (!astro) throw new Error("on Cloudflare, pass the Astro global: getSource(config, Astro)");
  const siteId = siteOf(config.siteId) as string;
  const r = getResolver(siteId);
  const resolution = await r.resolve(astro.request);
  const h = astro.response.headers;
  if (resolution.kind === "preview") {
    h.set("cache-control", "private, no-store");
    h.set("cloudflare-cdn-cache-control", "no-store");
    h.set("x-robots-tag", "noindex");
    h.set("x-cloudhal-mode", "preview");
    const token = new URL(astro.request.url).searchParams.get(PREVIEW_PARAM);
    if (token) h.set("x-cloudhal-preview-token", token);
    return resolution.source;
  }
  if (resolution.kind === "unpublished") {
    h.set("cache-control", "no-store");
    h.set("cloudflare-cdn-cache-control", "no-store");
    h.set("x-cloudhal-mode", "unpublished");
    return undefined;
  }
  if (requestStore.getStore()) {
    // RFC-0036 §4: a session's page is the session's alone.
    h.set("cache-control", "private, no-store");
    h.set("cloudflare-cdn-cache-control", "no-store");
    h.set("x-robots-tag", "noindex");
    h.set("x-cloudhal-mode", "published");
    h.set("x-cloudhal-snapshot", resolution.snapshotId);
    return resolution.source;
  }
  // Published: browsers revalidate, the edge keeps it until a publish purges the tag — or, when a
  // time gate lies ahead, until that gate (RFC-0008 §7.4): any page may list any entry, so the
  // cap is site-wide and a gate needs no purge.
  h.set("cache-control", "public, max-age=0, must-revalidate");
  h.set(
    "cloudflare-cdn-cache-control",
    `public, max-age=${edgeMaxAge(await resolution.source.nextGate(), resolution.at)}`,
  );
  // Pages add per-node tags next to this one (`addCacheTags`, `cache-tags.ts`).
  h.set("cache-tag", siteCacheTag(siteId));
  h.set("x-cloudhal-mode", "published");
  h.set("x-cloudhal-snapshot", resolution.snapshotId);
  if (resolution.previewError) {
    // An invalid preview link must not poison the cache entry for this URL.
    h.set("cloudflare-cdn-cache-control", "no-store");
    h.set("x-cloudhal-preview-error", resolution.previewError);
  }
  return resolution.source;
}

/**
 * The media route (RFC-0004 §7.1), answered by the Site Worker entry before Astro: the asset comes
 * from the published snapshot, or from the preview target behind a valid token (invariant 15).
 * Returns `undefined` for paths that are not media URLs.
 */
export async function serveMedia(
  request: Request,
  options: { siteId?: string | undefined } = {},
): Promise<Response | undefined> {
  if (!matchMediaRoute(new URL(request.url).pathname)) return undefined;
  const siteId = siteOf(options.siteId);
  if (!siteId) return undefined;
  const r = getResolver(siteId);
  const resolution = await r.resolve(request);
  if (resolution.kind === "unpublished")
    return new Response("not found", {
      status: 404,
      headers: { "cache-control": "no-store", "cloudflare-cdn-cache-control": "no-store" },
    });
  const source = resolution.source;
  const token = new URL(request.url).searchParams.get(PREVIEW_PARAM);
  const preview = resolution.kind === "preview";
  const store = r.store;
  const response = await serveMediaRequest(request, {
    siteId,
    mode: preview ? "preview" : "published",
    assetByPrefix: async (prefix) => source.assetByPrefix?.(prefix),
    blobState: (sha256) => store.blobState(siteId, sha256),
    blobs: store.blobs,
    ...(preview && token ? { keepQuery: `${PREVIEW_PARAM}=${encodeURIComponent(token)}` } : {}),
  });
  if (response && resolution.kind === "published" && resolution.previewError) {
    // An invalid preview link must not poison the edge cache entry for this URL.
    response.headers.set("cloudflare-cdn-cache-control", "no-store");
    response.headers.set("x-cloudhal-preview-error", resolution.previewError);
  }
  return response;
}
