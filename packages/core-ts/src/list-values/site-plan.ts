/**
 * RFC-0042 §4, #110: what a site write adds to its batch for `entry_list_values`. Every write of
 * the site node that changes a collection's list fingerprint (`updateSite`, `createSite`, a field
 * operation's phases) resets that collection's readiness in the same batch, anchored on the
 * site's new hash, so rows built under other definitions are never read; the backfill rebuilds
 * them. Writes that leave the definitions alone (publish, rollback, page lists) add nothing.
 */
import type { SqlStatement } from "@cloudhal/storage";
import type { SiteFields } from "../fields/types.ts";
import { hashIs } from "../node-sql.ts";
import { changedFingerprints, listedCollections, listFingerprint } from "./fingerprint.ts";
import { type ImportedList, importResetStatements, siteStateStatements } from "./state-sql.ts";

export interface ListStatePlan {
  /** Collections whose fingerprint changes (the backfill's work after the write). */
  readonly changed: readonly string[];
  /** The state statements, once the site's new hash is known. */
  statements(hash: string, at: string): SqlStatement[];
}

/** The readiness changes of writing `next` over `stored` (absent: a new site). */
export async function planListState(
  stored: SiteFields | undefined,
  next: SiteFields & { id: string },
): Promise<ListStatePlan> {
  const changed = await changedFingerprints(stored, next);
  return {
    changed: [...changed.keys()],
    statements: (hash, at) =>
      changed.size === 0
        ? []
        : siteStateStatements(next.id, changed, { anchor: hashIs(next.id, hash), at }),
  };
}

/**
 * Import (`importSite`, push, pull, `cloudhal import`) replaces the node set in one batch: these
 * statements reset the site's list values in it, a listed collection that holds no imported entry
 * being ready at once. The rows are rebuilt after the batch (`rebuildListValues`), so the
 * batch's statement count stays fixed whatever the values are.
 */
export async function importListStatements(
  siteId: string,
  rows: readonly { id: string; kind: string; key: string; body: string }[],
  at: string,
): Promise<SqlStatement[]> {
  const row = rows.find((n) => n.kind === "site" && n.id === siteId);
  const site = row ? (JSON.parse(row.body) as SiteFields) : undefined;
  const listed: ImportedList[] = [];
  for (const collection of site ? listedCollections(site) : [])
    listed.push({
      collection,
      fingerprint: await listFingerprint(site as SiteFields, collection),
      empty: !rows.some((n) => n.kind === "contentEntry" && n.key.startsWith(`${collection}:`)),
    });
  return importResetStatements(siteId, listed, at);
}
