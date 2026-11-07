/**
 * RFC-0034 §2: deleting one site of a multi-site installation, whole and on its own.
 *
 * Every table keyed by `site_id` is listed in `SITE_TABLES`; a test fails when a migration adds a
 * `site_id` table that is missing here, so a new feature cannot leave rows behind. Rows go in
 * chunks (D1 has no interactive transactions and limits a query's duration), the site node last,
 * so an interrupted delete leaves the site listed and running it again finishes the job.
 *
 * Node bodies (`nodes/<hash>.json`) are content-addressed and may be shared with other sites, so
 * they stay; the media and snapshot-bundle prefixes are the site's own and are removed.
 */
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { canonicalJson } from "./hash.ts";

/** Tables keyed by `site_id`, in deletion order. `nodes` comes last on purpose. */
export const SITE_TABLES = [
  "site_hosts",
  "site_members",
  "search_links",
  "search_index",
  "search_index_cjk",
  "search_state",
  "entry_list_values",
  "entry_list_state",
  "ai_usage",
  "ai_settings",
  "body_proposals",
  "release_items",
  "releases",
  "automations",
  "schedule_runs",
  "schedule_settings",
  "comment_purge_queue",
  "comment_bans",
  "comment_reports",
  "comment_events",
  "commenter_emails",
  "comments",
  "comment_threads",
  "comment_secrets",
  "comment_settings",
  "analytics_events",
  "analytics_rollup_runs",
  "analytics_daily",
  "analytics_settings",
  "media_uploads",
  "asset_refs",
  "snapshot_blobs",
  "media_blobs",
  "approvals",
  "audit",
  "snapshots",
  "nodes",
] as const;

const CHUNK = 2000;

export interface DeleteSiteResult {
  readonly rows: number;
  readonly objects: number;
}

async function deleteRows(sql: SqlDriver, table: string, where: string, params: string[]) {
  let total = 0;
  for (;;) {
    const r = await sql.run(
      `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${CHUNK})`,
      params,
    );
    total += r.changes;
    if (r.changes < CHUNK) return total;
  }
}

async function deletePrefix(blobs: BlobStore, prefix: string): Promise<number> {
  let n = 0;
  for (;;) {
    const keys = await blobs.list(prefix);
    if (keys.length === 0) return n;
    for (const key of keys) await blobs.delete(key);
    n += keys.length;
  }
}

/** Removes every row and object of `siteId`, then drops it from its project (deleting an empty one). */
export async function deleteSiteData(
  to: { sql: SqlDriver; blobs: BlobStore },
  siteId: string,
): Promise<DeleteSiteResult> {
  const site = await to.sql.get<{ body: string }>(
    "SELECT body FROM nodes WHERE site_id = ? AND kind = 'site'",
    [siteId],
  );
  const projectId = site ? (JSON.parse(site.body) as { projectId?: string }).projectId : undefined;
  if (!/^[a-z]+_[A-Za-z0-9]{6,32}$/.test(siteId)) throw new Error(`invalid site id ${siteId}`);
  let objects = await deletePrefix(to.blobs, `media/${siteId}/`);
  objects += await deletePrefix(to.blobs, `bundles/${siteId}/`);
  let rows = 0;
  for (const table of SITE_TABLES)
    rows +=
      table === "nodes"
        ? (await deleteRows(to.sql, table, "site_id = ? AND kind <> 'site'", [siteId])) +
          (await deleteRows(to.sql, table, "site_id = ?", [siteId]))
        : await deleteRows(to.sql, table, "site_id = ?", [siteId]);
  if (projectId) rows += await dropFromProject(to.sql, projectId, siteId);
  return { rows, objects };
}

async function dropFromProject(sql: SqlDriver, projectId: string, siteId: string) {
  const row = await sql.get<{ body: string; rev: number }>(
    "SELECT body, rev FROM projects WHERE id = ?",
    [projectId],
  );
  if (!row) return 0;
  const project = JSON.parse(row.body) as { siteIds: string[]; rev: number; updatedAt: string };
  const siteIds = project.siteIds.filter((id) => id !== siteId);
  if (siteIds.length === project.siteIds.length) return 0;
  if (siteIds.length === 0)
    return (await sql.run("DELETE FROM projects WHERE id = ? AND rev = ?", [projectId, row.rev]))
      .changes;
  const at = new Date().toISOString();
  const next = { ...project, siteIds, rev: row.rev + 1, updatedAt: at };
  return (
    await sql.run(
      "UPDATE projects SET body = ?, rev = ?, updated_at = ? WHERE id = ? AND rev = ?",
      [canonicalJson(next), next.rev, at, projectId, row.rev],
    )
  ).changes;
}
