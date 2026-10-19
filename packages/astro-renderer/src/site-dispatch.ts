/**
 * RFC-0034 §4: which site a request on the Site Worker is for.
 *
 * - `CLOUDHAL_SITE_ID` (or the build's site) set: that site, whatever the host, as before.
 * - `CLOUDHAL_SITE_IDS` set: the hostname picks one of those sites through `site_hosts`. The
 *   Worker's own `*.workers.dev` host shows the first site (`noindex`), so a fresh deploy has
 *   something to check. Any other host is unknown: a short-cached 404, never another site.
 */
import type { SqlDriver } from "@cloudhal/storage";
import { parseSiteIds, SiteHostMap } from "./site-hosts.ts";

export type SiteChoice =
  | { readonly kind: "site"; readonly siteId: string | undefined; readonly noindex?: boolean }
  | { readonly kind: "unknown" };

export class SiteDispatch {
  readonly #single: string | undefined;
  readonly #map: SiteHostMap | undefined;

  constructor(options: {
    siteId: string | undefined;
    siteIds: string | undefined;
    sql: () => SqlDriver;
  }) {
    const ids = parseSiteIds(options.siteIds);
    this.#single = options.siteId;
    this.#map =
      options.siteId === undefined && ids.length > 0
        ? new SiteHostMap({ sql: options.sql, siteIds: ids })
        : undefined;
  }

  /** True when the hostname decides the site. */
  get multi(): boolean {
    return this.#map !== undefined;
  }

  /** The sites this Worker may serve (one, or the allow-list). */
  get siteIds(): readonly string[] {
    return this.#map?.siteIds ?? (this.#single ? [this.#single] : []);
  }

  async choose(request: Request): Promise<SiteChoice> {
    if (!this.#map) return { kind: "site", siteId: this.#single };
    const host = new URL(request.url).hostname;
    const match = await this.#map.lookup(host);
    if (match) return { kind: "site", siteId: match.siteId };
    if (host.endsWith(".workers.dev"))
      return { kind: "site", siteId: this.#map.siteIds[0], noindex: true };
    return { kind: "unknown" };
  }

  /** The site's hostnames (multi-site), for the same-origin checks of analytics and comments. */
  async hosts(siteId: string): Promise<string[]> {
    return this.#map ? this.#map.hostsOf(siteId) : [];
  }

  /** A purge: domains may have changed. */
  reset(): void {
    this.#map?.reset();
  }
}

/** For a hostname no allowed site holds: plain, and cached briefly so floods stay cheap. */
export function unknownHost(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=60",
      "cloudflare-cdn-cache-control": "max-age=60",
      "x-robots-tag": "noindex",
    },
  });
}

/** The same response with `x-robots-tag: noindex` (the workers.dev fallback). */
export function withNoindex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
