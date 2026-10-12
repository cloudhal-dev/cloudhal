/**
 * Site analytics in the renderer (RFC-0006 §5, rollout step 5), shared by the Cloudflare Site
 * Worker entry and the Node middleware. Worker-safe: no Node module, no bundler.
 *
 * - **Settings** apply per request: the deployment switch and defaults (`CLOUDHAL_ANALYTICS`,
 *   `CLOUDHAL_ANALYTICS_DEFAULTS` on Cloudflare; integration options on Node), overridden by the
 *   site's `analytics_settings` row, memoised for 60 s per isolate. A missing table, a read error,
 *   a missing store or the deployment switch off all count as **off** (fail closed).
 * - **The tag** (`<script type="module" src="/_cloudhal/p.<hash>.js" data-v="N">`) goes into the
 *   `<head>` of `200` `text/html` **published** responses only, while the setting is on.
 * - **`POST /__cloudhal/e`** runs `@cloudhal/analytics`' beacon handler: same origin, size, agent,
 *   rate (per isolate, then the optional Rate Limiting binding across isolates), schema, then the path is resolved against the **published** snapshot with the
 *   renderer's own `resolveRoute` (the browser never names a node), and one event is written.
 * - **Render events** (§5.4) for published HTML `200`s (cache misses by definition), redirects,
 *   `404`, `410`, `451` and `5xx`, never for previews, `/__cloudhal/*`, `/_cloudhal/*` or `HEAD`;
 *   flood-sampled by `RenderEventSampler`.
 */
import {
  type AnalyticsDefaults,
  type AnalyticsWriter,
  BeaconRateLimiter,
  buildRenderEvent,
  type EffectiveAnalyticsSettings,
  effectiveSettings,
  handleBeacon,
  normaliseBeaconPath,
  parseAnalyticsDefaults,
  type RateLimitBinding,
  RenderEventSampler,
  type ResolvedNode,
  SharedBeaconRateLimiter,
} from "@cloudhal/analytics";
import { createSaltProvider, getAnalyticsSettings } from "@cloudhal/analytics/sql";
import type { Site } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { PREVIEW_PARAM } from "./resolver.ts";
import { resolveRoute } from "./routing.ts";
import type { GraphSource } from "./source.ts";

/** The beacon endpoint (kept equal to `@cloudhal/analytics/client`'s `BEACON_PATH` by a test). */
export const ANALYTICS_BEACON_PATH = "/__cloudhal/e";
/** Where the scripts are served from. */
export const ANALYTICS_SCRIPT_DIR = "/_cloudhal/";
/** Settings and the published pointer are re-read at most this often per isolate (§3.3, §5.2). */
export const ANALYTICS_MEMO_MS = 60_000;

/** The tag the page-view script is loaded with (`data-v` = vitals sampling, one view in N). */
export function analyticsTag(script: string, vitalsOneIn: number): string {
  return `<script type="module" src="${script}" data-v="${vitalsOneIn}"></script>`;
}

/** Inserts the tag before `</head>` of an HTML string (Node; the Worker uses `HTMLRewriter`). */
export function insertTag(html: string, tag: string): string {
  const at = html.search(/<\/head\s*>/i);
  return at < 0 ? html : `${html.slice(0, at)}${tag}${html.slice(at)}`;
}

/**
 * The node a normalised route shows in a published source: a page, an entry, or a term archive
 * (any of its pages counts toward the term). Feeds, redirects, 404s and 410s are not page views.
 */
export async function publishedNode(
  source: GraphSource,
  path: string,
): Promise<ResolvedNode | undefined> {
  const route = await resolveRoute(source, path);
  switch (route.kind) {
    case "page":
      return { nodeId: route.page.id, nodeKind: "page", locale: route.page.locale };
    case "entry":
      return { nodeId: route.entry.id, nodeKind: "entry", locale: route.entry.locale };
    case "archive":
      return {
        nodeId: route.archive.term.id,
        nodeKind: "archive",
        locale: route.archive.locale,
      };
    default:
      return undefined;
  }
}

/**
 * The deployment switch and defaults as the site Worker reads them: `CLOUDHAL_ANALYTICS` must be
 * `"on"` (anything else, or absent, is off); `CLOUDHAL_ANALYTICS_DEFAULTS` is compact JSON
 * (`cloudhal.json`'s `analytics` block) in which `enabled` defaults to `true`.
 */
export function deploymentDefaults(
  flag: string | undefined,
  defaults: string | undefined,
): AnalyticsDefaults | undefined {
  if (flag?.trim().toLowerCase() !== "on") return undefined;
  let parsed: unknown;
  try {
    parsed = defaults ? JSON.parse(defaults) : {};
  } catch {
    parsed = {};
  }
  const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return parseAnalyticsDefaults({ enabled: true, ...o });
}

/** Comma- or space-separated hostnames (e.g. `CLOUDHAL_SITE_HOSTS`), lower case. */
export function parseHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export interface SiteAnalyticsOptions {
  readonly siteId: string;
  /** Deployment defaults; `undefined` = analytics are off for the deployment. */
  readonly defaults: AnalyticsDefaults | undefined;
  /** Where events go; `undefined` = no store (nothing is collected, no tag). */
  readonly writer: AnalyticsWriter | undefined;
  /** Settings, salt (D1 on Cloudflare, SQLite on Node). */
  readonly sql: () => SqlDriver;
  /** The site row as stored now (for its published pointer and domains). */
  readonly site: () => Promise<Site | undefined>;
  /** The source of a snapshot (cached by the caller; snapshots are immutable). */
  readonly snapshot: (id: string) => Promise<GraphSource>;
  /** Hashed URL of the page-view script; without it no tag is injected. */
  readonly script?: string | undefined;
  /** Hosts the site answers on besides `Site.domains` (e.g. the workers.dev host). */
  readonly hosts?: readonly string[];
  /** Also accept the request's own host (`*.workers.dev` on Cloudflare; every host in dev). */
  readonly acceptRequestHost?: (host: string) => boolean;
  /**
   * The optional Workers Rate Limiting binding (`analytics.rateLimit`, RFC-0006 §5.5), checked
   * after the per-isolate limit and keyed by an HMAC under `secret` (a deployment secret every
   * isolate has). Absent: the per-isolate limits alone apply.
   */
  readonly rateLimit?: { readonly binding: RateLimitBinding; readonly secret: string } | undefined;
  readonly now?: () => number;
  readonly onError?: (message: string, error?: unknown) => void;
}

interface Memo<T> {
  readonly at: number;
  readonly value: Promise<T>;
}

/** What a request's analytics need from the published site. */
interface Published {
  readonly site: Site;
  readonly source: GraphSource;
}

/**
 * Per-isolate analytics state of one site: memoised settings and pointer, the beacon rate limiter
 * and the render-event sampler. Create one per isolate (module scope) and `reset()` it on a purge.
 */
export class SiteAnalytics {
  readonly #o: SiteAnalyticsOptions;
  readonly #now: () => number;
  readonly #limiter: BeaconRateLimiter;
  readonly #shared: SharedBeaconRateLimiter | undefined;
  readonly #sampler: RenderEventSampler;
  readonly #salt: (day: string) => Promise<string>;
  #settings: Memo<EffectiveAnalyticsSettings | undefined> | undefined;
  #site: Memo<Site | undefined> | undefined;

  constructor(options: SiteAnalyticsOptions) {
    this.#o = options;
    this.#now = options.now ?? Date.now;
    this.#limiter = new BeaconRateLimiter({ now: this.#now });
    this.#shared = options.rateLimit
      ? new SharedBeaconRateLimiter(options.rateLimit.binding, {
          secret: options.rateLimit.secret,
          ...(options.onError ? { onError: options.onError } : {}),
        })
      : undefined;
    this.#sampler = new RenderEventSampler({ now: this.#now });
    let salt: ((day: string) => Promise<string>) | undefined;
    this.#salt = (day) => {
      salt ??= createSaltProvider(this.#o.sql());
      return salt(day);
    };
  }

  /** Forget memoised settings and the pointer (a purge follows every settings change, §9.2). */
  reset(): void {
    this.#settings = undefined;
    this.#site = undefined;
  }

  /** True when the deployment collects at all (switch on and a store bound). */
  get available(): boolean {
    return this.#o.defaults !== undefined && this.#o.writer !== undefined;
  }

  #memo<T>(current: Memo<T> | undefined, load: () => Promise<T>): Memo<T> {
    const now = this.#now();
    if (current && now - current.at < ANALYTICS_MEMO_MS) return current;
    const value = load();
    value.catch(() => {});
    return { at: now, value };
  }

  /** The site's effective settings, or `undefined` when analytics are off or unreadable. */
  async settings(): Promise<EffectiveAnalyticsSettings | undefined> {
    const defaults = this.#o.defaults;
    if (!defaults || !this.#o.writer) return undefined;
    this.#settings = this.#memo(this.#settings, async () =>
      effectiveSettings(
        this.#o.siteId,
        await getAnalyticsSettings(this.#o.sql(), this.#o.siteId),
        defaults,
      ),
    );
    try {
      const s = await this.#settings.value;
      return s?.enabled ? s : undefined;
    } catch {
      return undefined; // a missing table (before migration 0014) or a read error: off
    }
  }

  /** The tag for a published HTML page, or `undefined` (off, or no built script). */
  async tag(): Promise<string | undefined> {
    if (!this.#o.script) return undefined;
    const s = await this.settings();
    return s ? analyticsTag(this.#o.script, s.vitalsOneIn) : undefined;
  }

  async #published(): Promise<Published | undefined> {
    this.#site = this.#memo(this.#site, () => this.#o.site());
    let site: Site | undefined;
    try {
      site = await this.#site.value;
    } catch (error) {
      this.#o.onError?.("analytics: reading the site failed", error);
      return undefined;
    }
    if (!site?.publishedSnapshotId) return undefined;
    return { site, source: await this.#o.snapshot(site.publishedSnapshotId) };
  }

  #hosts(site: Site, requestHost: string): string[] {
    const hosts = [...site.domains.map((d) => d.hostname), ...(this.#o.hosts ?? [])];
    const bare = requestHost.toLowerCase().replace(/:\d+$/, "");
    if (this.#o.acceptRequestHost?.(bare)) hosts.push(requestHost.toLowerCase());
    return hosts;
  }

  /**
   * `POST /__cloudhal/e`: `204` for every outcome (`405` for another method), `no-store`.
   * `clientIp` / `country` stand in for `CF-Connecting-IP` / `request.cf.country` off Cloudflare.
   */
  async beacon(
    request: Request,
    extra: { clientIp?: string; country?: string } = {},
  ): Promise<Response> {
    const writer = this.#o.writer;
    const off = { settings: () => undefined, hosts: [], resolvePath: () => undefined };
    const noop: AnalyticsWriter = { write: () => {} };
    if (request.method !== "POST" || !writer)
      return handleBeacon(request, { siteId: this.#o.siteId, writer: noop, ...off });
    const settings = await this.settings();
    const published = settings ? await this.#published() : undefined;
    if (!settings || !published)
      return handleBeacon(request, { siteId: this.#o.siteId, writer: noop, ...off });
    const { source, site } = published;
    return handleBeacon(request, {
      siteId: this.#o.siteId,
      settings: () => settings,
      hosts: this.#hosts(site, new URL(request.url).host),
      resolvePath: (path) => publishedNode(source, path),
      writer,
      salt: this.#salt,
      rateLimit: async (ip, kind) =>
        (await this.#limiter.allow(ip, kind)) && (await (this.#shared?.allow(ip) ?? true)),
      now: () => new Date(this.#now()),
      ...(extra.clientIp ? { clientIp: extra.clientIp } : {}),
      ...(extra.country ? { country: extra.country } : {}),
      ...(this.#o.onError ? { onError: this.#o.onError } : {}),
    });
  }

  /**
   * Records the render event for a response the site rendered (§5.4), if it is one. Run it off
   * the response path (`ctx.waitUntil`); it never throws.
   */
  async render(
    request: Request,
    response: Response,
    renderMs: number,
    extra: { country?: string } = {},
  ): Promise<void> {
    try {
      const writer = this.#o.writer;
      if (!writer || !isRenderEvent(request, response)) return;
      if (!(await this.settings())) return;
      const published = await this.#published();
      if (!published) return;
      const decision = this.#sampler.next();
      if (!decision.record) return;
      const url = new URL(request.url);
      const status = response.status;
      const location = response.headers.get("location");
      // the node shown (200) or redirected to (3xx, same-site targets only)
      let nodePath: string | undefined;
      if (status === 200) nodePath = normaliseBeaconPath(url.pathname);
      else if (status >= 300 && status < 400 && location) {
        const target = new URL(location, url);
        if (target.host === url.host) nodePath = normaliseBeaconPath(target.pathname);
      }
      const node = nodePath ? await publishedNode(published.source, nodePath) : undefined;
      const cf = (request as Request & { cf?: { country?: unknown } }).cf;
      const country = typeof cf?.country === "string" ? cf.country : extra.country;
      const h = request.headers;
      const event = buildRenderEvent({
        siteId: this.#o.siteId,
        now: new Date(this.#now()),
        url,
        status,
        hosts: this.#hosts(published.site, url.host),
        userAgent: h.get("user-agent"),
        hints: { mobile: h.get("sec-ch-ua-mobile"), platform: h.get("sec-ch-ua-platform") },
        referer: h.get("referer"),
        ...(node ? { node: { nodeId: node.nodeId, nodeKind: node.nodeKind } } : {}),
        location,
        renderMs,
        sampleOneIn: decision.sampleOneIn,
        ...(country ? { country } : {}),
      });
      if (event) writer.write(event);
    } catch (error) {
      this.#o.onError?.("analytics: render event failed", error);
    }
  }
}

const RENDER_STATUSES = new Set([301, 302, 303, 307, 308, 404, 410, 451]);

/**
 * Whether a response is one the site Worker records as a `render` event (§5.4): a `GET` for a
 * site path (not `/__cloudhal/*`, `/_cloudhal/*`, not a preview), answered with a published HTML
 * `200`, a redirect, `404`, `410`, `451` or a `5xx`. Media `200`/`206`/`304` and feeds are not
 * HTML, so they never count.
 */
export function isRenderEvent(request: Request, response: Response): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/__cloudhal/") || url.pathname.startsWith(ANALYTICS_SCRIPT_DIR))
    return false;
  if (url.searchParams.has(PREVIEW_PARAM)) return false;
  const mode = response.headers.get("x-cloudhal-mode");
  if (mode === "preview" || mode === "unpublished") return false;
  const status = response.status;
  if (status === 200)
    return (
      mode === "published" && (response.headers.get("content-type") ?? "").includes("text/html")
    );
  return RENDER_STATUSES.has(status) || (status >= 500 && status <= 599);
}
