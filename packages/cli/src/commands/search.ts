/**
 * `cloudhal search reindex` (RFC-0019 §3): rebuilds the site's search index from its live snapshot,
 * on the project's SQLite or with `--remote` on the deployment (deployment token). Publishing keeps
 * the index current on its own; this is for restored backups (`wrangler d1 export` skips virtual
 * tables) and for sites published before search existed.
 */
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";
import { brief, deployment, type SyncOptions } from "./sync.ts";

export interface SearchCliOptions extends SyncOptions {
  readonly remote?: boolean;
}

export interface ReindexReport {
  readonly where: "local" | "remote";
  readonly published: string | null;
  readonly index: { readonly snapshotId: string; readonly entries: number } | null;
}

export async function searchReindex(options: SearchCliOptions): Promise<ReindexReport> {
  if (options.remote) {
    const { cfg, adminUrl, token, fetch: f } = await deployment(options);
    const res = await f(new URL(`/api/admin/sites/${cfg.siteId}/search/reindex`, adminUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    if (res.status === 404 && !text.includes("site not found"))
      throw new Error(
        "the deployment has no search yet (deploy this version with `cloudhal deploy` first)",
      );
    if (!res.ok) throw new Error(`the deployment answered ${res.status}: ${brief(text)}`);
    return { where: "remote", ...(JSON.parse(text) as Omit<ReindexReport, "where">) };
  }
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error(`site ${cfg.siteId} not found`);
    await local.store.refreshSearch(cfg.siteId, { full: true });
    const index = await local.store.searchStatus(cfg.siteId);
    return { where: "local", published: site.publishedSnapshotId ?? null, index: index ?? null };
  } finally {
    await local.close();
  }
}

export function describeReindex(r: ReindexReport): string {
  if (!r.published) return `${r.where}: the site has not been published yet; nothing to index`;
  return `${r.where}: indexed ${r.index?.entries ?? 0} item(s) from ${r.published}`;
}
