/**
 * RFC-0045 §5 "API" and §6 `list_references`: an entry's references in both directions, read from
 * `entry_refs` (the stored values, whatever their targets' state), site-scoped. One module for the
 * API's `GET …/entries/:entryId/references` and MCP's `list_references`.
 *
 * - `listReferrers` ("to"): the rows naming the entry's group, published holders first, each holder
 *   with the same-site members that show its value by the `shared` rule (1: every one; 2: those
 *   without their own value of `root_key`), paged.
 * - `listReferenceTargets` ("from"): the groups the entry's own rows name, and for a same-site
 *   translation the rows of its original it shows by the same rule, each with the group's members
 *   in this site.
 *
 * Neither applies status or gates: these are editors' views of the working copy. Worker-safe.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { parseRows } from "../node-sql.ts";
import { memberGroup } from "./members.ts";
import { getGroupMembers } from "./reads.ts";

/** An entry as a reference list shows it. */
export interface ReferenceCard {
  groupId: string;
  id: string;
  title: string;
  collection: string;
  status: ContentEntry["status"];
  locale: string;
}

export const referenceCard = (e: ContentEntry): ReferenceCard => ({
  groupId: memberGroup(e),
  id: e.id,
  title: e.title,
  collection: e.collection,
  status: e.status,
  locale: e.locale,
});

export interface Referrer extends ReferenceCard {
  /** The field path holding the value (`venue`, `speakers.person`). */
  field: string;
  /** Same-site members of the holder's group that show its value without holding it. */
  shownBy: ReferenceCard[];
}

interface RefRow {
  holder: string;
  field: string;
  shared: number;
  root_key: string;
  body: string;
}

/** True when `member` shows `row`'s value by the `shared` rule (it is not the holder). */
const shows = (
  row: Pick<RefRow, "shared" | "root_key">,
  member: Pick<ContentEntry, "fields">,
): boolean => row.shared === 1 || !Object.hasOwn(member.fields ?? {}, row.root_key);

/** One page of the rows naming `group`, each holder with the members that show its value. */
export async function listReferrers(
  sql: SqlDriver,
  siteId: string,
  page: { group: string; limit: number; offset: number },
): Promise<{ referrers: Referrer[]; next?: number }> {
  const rows = await sql.all<RefRow & Record<string, unknown>>(
    `SELECT r.source_id AS holder, r.field AS field, r.shared AS shared, r.root_key AS root_key,
        n.body AS body
      FROM entry_refs r JOIN nodes n ON n.id = r.source_id AND n.site_id = r.site_id
      WHERE r.site_id = ? AND r.target_id = ?
      ORDER BY r.source_status = 'published' DESC, r.source_id, r.field LIMIT ? OFFSET ?`,
    [siteId, page.group, page.limit + 1, page.offset],
  );
  const shown = rows.slice(0, page.limit);
  const holders = [...new Set(shown.map((r) => r.holder))];
  const members = holders.length
    ? await sql.all<{ body: string }>(
        `SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
          AND json_extract(body, '$.translation.group') IN (SELECT value FROM json_each(?))
          AND json_extract(body, '$.translation.source.siteId') IS NULL`,
        [siteId, JSON.stringify(holders)],
      )
    : [];
  const inheriting = parseRows<ContentEntry>(members);
  const referrers = shown.map((r) => ({
    ...referenceCard(JSON.parse(r.body) as ContentEntry),
    field: r.field,
    shownBy: inheriting
      .filter(
        (m) =>
          m.translation?.group === r.holder &&
          // Only the row's own holder is left out: another holder on this page may still show it.
          m.id !== r.holder &&
          shows(r, m),
      )
      .map(referenceCard),
  }));
  return { referrers, ...(rows.length > page.limit ? { next: page.offset + page.limit } : {}) };
}

export interface ReferenceTarget {
  /** The field path holding the value (`venue`, `speakers.person`). */
  field: string;
  /** The stored value: a translation group id. */
  groupId: string;
  /** The value is the same-site original's, which this translation shows (`shared` rule). */
  inherited?: true;
  /** The group's members in this site, any status; empty when none is left. */
  members: ReferenceCard[];
}

/** The groups `entry` names (its own rows, then the ones it shows of its same-site original). */
export async function listReferenceTargets(
  sql: SqlDriver,
  entry: Pick<ContentEntry, "id" | "siteId" | "fields" | "translation">,
): Promise<ReferenceTarget[]> {
  const original =
    entry.translation && entry.translation.group !== entry.id && !entry.translation.source?.siteId
      ? entry.translation.group
      : undefined;
  const rows = await sql.all<Omit<RefRow, "body"> & { target: string }>(
    `SELECT source_id AS holder, field, shared, root_key, target_id AS target FROM entry_refs
      WHERE site_id = ? AND source_id IN (SELECT value FROM json_each(?))
      ORDER BY source_id = ? DESC, field, target_id`,
    [entry.siteId, JSON.stringify(original ? [entry.id, original] : [entry.id]), entry.id],
  );
  const own = (r: (typeof rows)[number]) => r.holder === entry.id;
  const kept = rows.filter((r) => own(r) || shows(r, entry));
  const members = await getGroupMembers(
    sql,
    entry.siteId,
    kept.map((r) => r.target),
  );
  return kept.map((r) => ({
    field: r.field,
    groupId: r.target,
    ...(own(r) ? {} : { inherited: true as const }),
    members: (members.get(r.target) ?? []).map(referenceCard),
  }));
}
