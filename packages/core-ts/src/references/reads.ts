/**
 * RFC-0045 §4 "Batching": the live renderer's reads (`cloudhal dev`, previews). Both filter by
 * `site_id`; neither applies status or gates, which the source decides for its view.
 *
 * - `getGroupMembers`: every entry of this site that is a member of one of the groups, by the
 *   membership rule (`memberSql`, served by the primary key and `nodes_translation_locale`); one
 *   read per resolution level.
 * - `referrerCandidates`: the rows naming a group, and the entries that may show them: each row's
 *   holder, and the same-site members inheriting from it by the `shared` rule (1: every one; 2:
 *   those without their own value of `root_key`). The renderer then resolves each candidate, so
 *   `referencedBy` equals what `resolveFields` shows. Snapshots never call these: purges and the
 *   snapshot source read snapshot bodies only.
 *
 * Worker-safe; no correlated outer references (workerd's SQLite rejects some that better-sqlite3
 * accepts).
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { parseRows } from "../node-sql.ts";
import { memberGroup } from "./members.ts";
import { memberSql } from "./sql.ts";

/** The entries of `siteId` that are members of `groupIds`, by group (every group has a list). */
export async function getGroupMembers(
  sql: SqlDriver,
  siteId: string,
  groupIds: readonly string[],
): Promise<Map<string, ContentEntry[]>> {
  const ids = [...new Set(groupIds)];
  const out = new Map<string, ContentEntry[]>(ids.map((g) => [g, []]));
  if (ids.length === 0) return out;
  const rows = await sql.all<{ body: string }>(
    `SELECT n.body AS body FROM json_each(?) g JOIN nodes n
      ON n.site_id = ? AND n.kind = 'contentEntry' AND ${memberSql("n", "g.value")}
      ORDER BY n.created_at, n.id`,
    [JSON.stringify(ids), siteId],
  );
  for (const entry of parseRows<ContentEntry>(rows)) out.get(memberGroup(entry))?.push(entry);
  return out;
}

export interface ReferrerCandidates {
  /** Holders and inheriting members, each once. */
  readonly candidates: readonly ContentEntry[];
  /** Every entry read, candidates and the originals of holders that are translations, by id. */
  readonly byId: ReadonlyMap<string, ContentEntry>;
}

const inSite = (e: ContentEntry) => e.translation?.source?.siteId === undefined;

/** The entries of `siteId` that may show a value naming `groupId` (see the module comment). */
export async function referrerCandidates(
  sql: SqlDriver,
  siteId: string,
  groupId: string,
): Promise<ReferrerCandidates> {
  const rows = await sql.all<{ holder: string; root_key: string; shared: number }>(
    "SELECT source_id AS holder, root_key, shared FROM entry_refs WHERE site_id = ? AND target_id = ?",
    [siteId, groupId],
  );
  const holders = [...new Set(rows.map((r) => r.holder))];
  if (holders.length === 0) return { candidates: [], byId: new Map() };
  const list = JSON.stringify(holders);
  const read = await sql.all<{ body: string }>(
    `SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
      AND (id IN (SELECT value FROM json_each(?))
        OR json_extract(body, '$.translation.group') IN (SELECT value FROM json_each(?)))
      ORDER BY id`,
    [siteId, list, list],
  );
  const byId = new Map(parseRows<ContentEntry>(read).map((e) => [e.id, e]));
  const held = new Set(holders);
  const candidates = [...byId.values()].filter((e) => {
    if (held.has(e.id)) return true;
    const from = e.translation?.group;
    if (from === undefined || !held.has(from) || !inSite(e)) return false;
    return rows.some(
      (r) => r.holder === from && (r.shared === 1 || !Object.hasOwn(e.fields ?? {}, r.root_key)),
    );
  });
  // A holder that is a same-site translation resolves through its own original.
  const missing = [
    ...new Set(
      candidates
        .filter(inSite)
        .map((e) => e.translation?.group)
        .filter((g): g is string => g !== undefined && !byId.has(g)),
    ),
  ];
  if (missing.length > 0) {
    const originals = await sql.all<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND id IN (SELECT value FROM json_each(?)) ORDER BY id",
      [siteId, JSON.stringify(missing)],
    );
    for (const e of parseRows<ContentEntry>(originals)) byId.set(e.id, e);
  }
  return { candidates, byId };
}
