import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0034 §4: multi-site installations.
 *
 * - `site_hosts` maps a hostname to the one site it serves. It is derived from `Site.domains` and
 *   `Site.localization.domains` and written by the store in the site's own batch. A per-locale
 *   domain carries its locale.
 * - `site_workers` lists the site Workers attached to this installation, so a publish purges the
 *   Worker that serves the site.
 *
 * The backfill keeps the earliest site when two sites claim the same hostname (`OR IGNORE`, oldest
 * first); `cloudhal site list` and the API report the loser as a domain conflict.
 */
export const migration0027MultiSite: Migration = {
  name: "0027_multi_site",
  sql: `
CREATE TABLE site_hosts (
  host TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  locale TEXT,
  primary_host INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX site_hosts_site ON site_hosts (site_id);
CREATE TABLE site_workers (
  name TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  theme TEXT NOT NULL,
  site_ids TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO site_hosts (host, site_id, locale, primary_host)
  SELECT lower(json_extract(d.value, '$.hostname')), n.site_id, NULL,
         CASE WHEN json_extract(d.value, '$.primary') THEN 1 ELSE 0 END
  FROM nodes n, json_each(n.body, '$.domains') d
  WHERE n.kind = 'site' AND json_extract(d.value, '$.hostname') IS NOT NULL
  ORDER BY n.created_at, n.id;
INSERT OR IGNORE INTO site_hosts (host, site_id, locale, primary_host)
  SELECT lower(d.value), n.site_id, d.key, 0
  FROM nodes n, json_each(n.body, '$.localization.domains') d
  WHERE n.kind = 'site'
  ORDER BY n.created_at, n.id;
`,
};
