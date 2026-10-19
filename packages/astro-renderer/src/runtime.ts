import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { Site } from "@cloudhal/core-contracts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import type { SqlDriver } from "@cloudhal/storage";
import type { PeerEdition } from "./locales.ts";
import type { CloudhalRendererConfig } from "./integration.ts";
import { matchMediaRoute, serveMediaRequest } from "./media-route.ts";
import { SiteResolver } from "./resolver.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

let cached: { key: string; source: Promise<GraphSource> } | undefined;

/**
 * The page-side entry point: returns the configured `GraphSource`, created once per process and
 * selector. `CLOUDHAL_SOURCE=live | snapshot:<id>` overrides the integration config (used by
 * `cloudhal build`); a later build in the same process with another selector gets a new source.
 */
export function getSource(
  config: CloudhalRendererConfig,
  /** Ignored on Node (one source per process); the `workerd` build resolves per request. */
  _astro?: { request: Request; response: { headers: Headers } },
): Promise<GraphSource> {
  const selector = process.env.CLOUDHAL_SOURCE ?? config.source ?? "live";
  const key = `${config.dataDir}\n${config.siteId}\n${selector}`;
  if (cached?.key !== key) cached = { key, source: open(config, selector) };
  return cached.source;
}

let local: { dir: string; store: Promise<LocalStore> } | undefined;

/** One local store per data directory and process. */
function localStore(dataDir: string): Promise<LocalStore> {
  if (local?.dir !== dataDir) local = { dir: dataDir, store: openLocalStore(dataDir) };
  return local.store;
}

function open(config: CloudhalRendererConfig, selector: string): Promise<GraphSource> {
  return (async () => {
    const { store } = await localStore(config.dataDir);
    if (selector === "live") return new LiveSource(store, config.siteId);
    if (selector.startsWith("snapshot:"))
      return SnapshotSource.open(store, selector.slice("snapshot:".length));
    throw new Error(`invalid CLOUDHAL_SOURCE "${selector}" (expected "live" or "snapshot:<id>")`);
  })();
}

/** Test hook. `cloudhal dev` serves one site, so `_siteId` changes nothing. */
export function resetSource(_siteId?: string): void {
  cached = undefined;
}

/**
 * RFC-0034 §4: on a multi-site Worker the entry runs each request for its site; `cloudhal dev`
 * serves the project's one site, so this only runs `fn`.
 */
export function withRequestSite<T>(_siteId: string, fn: () => T): T {
  return fn();
}

/**
 * RFC-0034 §6: other sites' published versions of a work. `cloudhal dev` renders the project's one
 * site from its local store, so there are none.
 */
export async function peerEditions(
  _config: Partial<CloudhalRendererConfig>,
  _node: unknown,
): Promise<PeerEdition[]> {
  return [];
}

/**
 * The media route for `cloudhal dev` (RFC-0004 §7.8): served from the local blob store with
 * `no-store`, drafts included, matching the live preview. `undefined` for other paths.
 */
export async function serveMedia(
  request: Request,
  options: Partial<CloudhalRendererConfig>,
): Promise<Response | undefined> {
  if (!matchMediaRoute(new URL(request.url).pathname)) return undefined;
  if (!options.dataDir || !options.siteId) return undefined;
  const config: CloudhalRendererConfig = {
    ...options,
    dataDir: options.dataDir,
    siteId: options.siteId,
  };
  const { store, blobs } = await localStore(config.dataDir);
  const source = await getSource(config);
  return serveMediaRequest(request, {
    siteId: config.siteId,
    mode: "dev",
    assetByPrefix: async (prefix) => source.assetByPrefix?.(prefix),
    blobState: (sha256) => store.blobState(config.siteId, sha256),
    blobs,
  });
}

let analyticsResolver: { key: string; resolver: Promise<SiteResolver> } | undefined;

/**
 * What site analytics read on Node (`cloudhal dev`, self-host; RFC-0006 §11): the local SQLite
 * store for settings, the salt and raw events, the site row, and published snapshots (cached per
 * process). Same name and shape as the `workerd` build, which reads the D1/R2 bindings instead.
 * `open()` must have resolved before `sql()` is called.
 */
export function analyticsBackend(
  siteId: string,
  config?: Partial<CloudhalRendererConfig>,
): {
  sql: () => SqlDriver;
  site: () => Promise<Site | undefined>;
  snapshot: (id: string) => Promise<GraphSource>;
  open: () => Promise<SqlDriver>;
} {
  const dataDir = config?.dataDir;
  if (!dataDir) throw new Error("analyticsBackend on Node needs the renderer config's dataDir");
  const key = `${dataDir}|${siteId}`;
  if (analyticsResolver?.key !== key)
    analyticsResolver = {
      key,
      resolver: localStore(dataDir).then((l) => new SiteResolver({ store: l.store, siteId })),
    };
  const pending = analyticsResolver.resolver;
  let sql: SqlDriver | undefined;
  return {
    sql: () => {
      if (!sql) throw new Error("analyticsBackend: await open() first");
      return sql;
    },
    open: async () => {
      sql ??= (await localStore(dataDir)).sql;
      return sql;
    },
    site: async () => (await pending).store.getSite(siteId),
    snapshot: async (id) => (await pending).snapshot(id),
  };
}

/**
 * The comment store for pages on Node (`cloudhal dev`; RFC-0007 §8.5): the local SQLite store.
 * `undefined` when the integration did not build the comments module (static builds have no
 * endpoint, or `comments.available: false`). Same name and shape as the `workerd` build, which
 * reads D1 and also needs a usable `CLOUDHAL_COMMENTS_KEY`.
 */
export async function commentsBackend(
  config: Partial<CloudhalRendererConfig>,
): Promise<{ store: SqlCommentStore } | undefined> {
  if (!config.commentsScript || !config.dataDir || config.comments?.available === false)
    return undefined;
  return { store: new SqlCommentStore((await localStore(config.dataDir)).sql) };
}

/** Shared with the `workerd` runtime so code importing either build sees the same names. */
export { CACHE_TAG_PREFIX } from "./cache-tags.ts";
