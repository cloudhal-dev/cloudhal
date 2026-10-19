/**
 * RFC-0034 §4: which site a request is for, from its hostname. A multi-site Worker serves the sites
 * in its allow-list (`CLOUDHAL_SITE_IDS`); `site_hosts` (written by the API with every site change)
 * maps hostnames to them. Up to `MAX_PRELOAD` hosts the whole map is held in the isolate and
 * reloaded after `ttlMs` or on a purge; beyond that each hostname is looked up on first use and
 * kept for `ttlMs`. A hostname whose site is not in the allow-list is unknown: never another site.
 *
 * Worker-safe: SQL only, the clock injected.
 */
import type { SqlDriver } from "@cloudhal/storage";

export interface HostMatch {
  readonly siteId: string;
  /** A per-locale domain (`Site.localization.domains`): this locale is served at the root. */
  readonly locale?: string;
}

/** Hosts held in memory at once; more than this and hostnames are looked up one by one. */
export const MAX_PRELOAD = 1000;

/** `CLOUDHAL_SITE_IDS`: comma- or space-separated site ids, each once, in order. */
export function parseSiteIds(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(/[\s,]+/).filter(Boolean))];
}

type Row = { host: string; site_id: string; locale: string | null };

export class SiteHostMap {
  readonly #sql: () => SqlDriver;
  readonly #siteIds: readonly string[];
  readonly #ttlMs: number;
  readonly #now: () => number;
  #all: { at: number; hosts: Map<string, HostMatch> | "too-many" } | undefined;
  readonly #one = new Map<string, { at: number; match: HostMatch | undefined }>();

  constructor(options: {
    sql: () => SqlDriver;
    siteIds: readonly string[];
    ttlMs?: number;
    now?: () => number;
  }) {
    this.#sql = options.sql;
    this.#siteIds = options.siteIds;
    this.#ttlMs = options.ttlMs ?? 60_000;
    this.#now = options.now ?? Date.now;
  }

  get siteIds(): readonly string[] {
    return this.#siteIds;
  }

  /** Forget what was loaded (a purge: the site's domains may have changed). */
  reset(): void {
    this.#all = undefined;
    this.#one.clear();
  }

  /** The site (and locale) `host` serves, or undefined when it serves none of the allowed sites. */
  async lookup(host: string): Promise<HostMatch | undefined> {
    const key = host.toLowerCase().replace(/\.$/, "");
    const all = await this.#preload();
    if (all !== "too-many") return all.get(key);
    const hit = this.#one.get(key);
    if (hit && this.#now() - hit.at < this.#ttlMs) return hit.match;
    const row = await this.#sql().get<Row>(
      `SELECT host, site_id, locale FROM site_hosts WHERE host = ? AND site_id IN (${this.#marks()})`,
      [key, ...this.#siteIds],
    );
    const match = row ? toMatch(row) : undefined;
    this.#one.set(key, { at: this.#now(), match });
    return match;
  }

  /** The hostnames of one site, as last loaded (same-origin checks for analytics and comments). */
  async hostsOf(siteId: string): Promise<string[]> {
    const all = await this.#preload();
    if (all === "too-many") {
      const rows = await this.#sql().all<{ host: string }>(
        "SELECT host FROM site_hosts WHERE site_id = ? ORDER BY host",
        [siteId],
      );
      return rows.map((r) => r.host);
    }
    return [...all].filter(([, m]) => m.siteId === siteId).map(([h]) => h);
  }

  async #preload(): Promise<Map<string, HostMatch> | "too-many"> {
    if (this.#all && this.#now() - this.#all.at < this.#ttlMs) return this.#all.hosts;
    if (this.#siteIds.length === 0) {
      this.#all = { at: this.#now(), hosts: new Map() };
      return this.#all.hosts;
    }
    const rows = await this.#sql().all<Row>(
      `SELECT host, site_id, locale FROM site_hosts WHERE site_id IN (${this.#marks()}) LIMIT ${MAX_PRELOAD + 1}`,
      [...this.#siteIds],
    );
    const hosts: Map<string, HostMatch> | "too-many" =
      rows.length > MAX_PRELOAD ? "too-many" : new Map(rows.map((r) => [r.host, toMatch(r)]));
    this.#all = { at: this.#now(), hosts };
    return hosts;
  }

  #marks(): string {
    return this.#siteIds.map(() => "?").join(", ");
  }
}

function toMatch(r: Row): HostMatch {
  return { siteId: r.site_id, ...(r.locale ? { locale: r.locale } : {}) };
}
