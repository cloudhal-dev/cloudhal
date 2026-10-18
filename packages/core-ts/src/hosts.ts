/**
 * RFC-0034 §4: the hostnames a site answers on, kept in `site_hosts` so one hostname belongs to
 * exactly one site of the installation. Rows come from `Site.domains` and, per locale, from
 * `Site.localization.domains`; the store writes them in the site's own batch.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import { InvariantError } from "./errors.ts";
import type { SiteGuard } from "./search.ts";

export interface SiteHost {
  readonly host: string;
  readonly siteId: string;
  /** Set for a per-locale domain: that locale is served at the host's root. */
  readonly locale?: string;
  readonly primary: boolean;
}

/** The site's hostnames, lower case, each once (a locale domain wins over a plain one). */
export function hostsOf(site: Pick<Site, "id" | "domains" | "localization">): SiteHost[] {
  const out = new Map<string, SiteHost>();
  for (const d of site.domains)
    out.set(d.hostname.toLowerCase(), {
      host: d.hostname.toLowerCase(),
      siteId: site.id,
      primary: d.primary === true,
    });
  for (const [locale, hostname] of Object.entries(site.localization?.domains ?? {})) {
    if (!hostname) continue;
    const host = hostname.toLowerCase();
    out.set(host, { host, siteId: site.id, locale, primary: out.get(host)?.primary ?? false });
  }
  return [...out.values()];
}

/** Refuses a hostname another site of the installation already serves (`409 host_taken`). */
export async function checkHosts(sql: SqlDriver, hosts: readonly SiteHost[]): Promise<void> {
  if (hosts.length === 0) return;
  const siteId = hosts[0]?.siteId ?? "";
  const taken = await sql.all<{ host: string; site_id: string }>(
    `SELECT host, site_id FROM site_hosts WHERE site_id <> ? AND host IN (${hosts.map(() => "?").join(", ")})`,
    [siteId, ...hosts.map((h) => h.host)],
  );
  const first = taken[0];
  if (first)
    throw new InvariantError(
      "host_taken",
      `${first.host} already serves another site of this installation (${first.site_id})`,
      { host: first.host, siteId: first.site_id },
    );
}

const GUARD = "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)";

/** Replaces the site's rows, guarded on the site node's new hash (hard rule 4). */
export function hostStatements(hosts: readonly SiteHost[], guard: SiteGuard): SqlStatement[] {
  const g = [guard.siteId, guard.hash];
  return [
    { sql: `DELETE FROM site_hosts WHERE site_id = ? AND ${GUARD}`, params: [guard.siteId, ...g] },
    ...hosts.map((h) => ({
      sql: `INSERT INTO site_hosts (host, site_id, locale, primary_host) SELECT ?, ?, ?, ? WHERE ${GUARD}`,
      params: [h.host, guard.siteId, h.locale ?? null, h.primary ? 1 : 0, ...g],
    })),
  ];
}

/** Every hostname of the installation, or of the given sites. */
export async function listHosts(sql: SqlDriver, siteIds?: readonly string[]): Promise<SiteHost[]> {
  const rows = await sql.all<{
    host: string;
    site_id: string;
    locale: string | null;
    primary_host: number;
  }>(
    siteIds
      ? `SELECT * FROM site_hosts WHERE site_id IN (${siteIds.map(() => "?").join(", ")}) ORDER BY site_id, host`
      : "SELECT * FROM site_hosts ORDER BY site_id, host",
    siteIds ? [...siteIds] : [],
  );
  return rows.map((r) => ({
    host: r.host,
    siteId: r.site_id,
    ...(r.locale ? { locale: r.locale } : {}),
    primary: r.primary_host === 1,
  }));
}
