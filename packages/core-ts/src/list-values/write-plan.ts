/**
 * RFC-0042 §4, #110: what an entry write or delete adds to its own batch so `entry_list_values`
 * stays exact (AGENTS.md rule 4).
 *
 * - The entry's rows: all of them go (whatever collection they were in), then its listed values
 *   come back, anchored on its new hash. A translation's rows read its original as stored, and
 *   only while the original still has that hash.
 * - An original whose values changed (or that is created or deleted) rewrites the rows of its
 *   same-site translations that read a listed value from it, each anchored on the translation's
 *   hash as read.
 * - Last, the state check: a race (definitions changed under the plan, the original or the
 *   translations moved) never refuses the write; it sets the affected collections not ready,
 *   and the backfill rebuilds them. Every write rewrites its own rows: no "unchanged" shortcut,
 *   which a running backfill would turn into stale rows.
 *
 * The statements come before source-forward's, which change the translations' hashes.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import { sameJson } from "../fields/types.ts";
import { type Cond, hashIs } from "../node-sql.ts";
import { listedCollections, listFingerprint } from "./fingerprint.ts";
import { dependsOnOriginal, listValueRows, originalIdOf } from "./rows.ts";
import { stateCheckStatement } from "./state-sql.ts";
import {
  dropGoneRows,
  dropOwnRows,
  type NodeValues,
  nodeRowsStatements,
  type OriginalRead,
  rowInserts,
  TRANSLATIONS_OF,
} from "./statements.ts";

/** A node as read, with the hash its rows are computed against. */
export interface ReadEntry {
  readonly entry: ContentEntry;
  readonly hash: string;
}

/** Statements built once the entry's new hash is known. */
export type ListStatements = (hash: string) => SqlStatement[];

const parse = (r: { hash: string; body: string }): ReadEntry => ({
  entry: JSON.parse(r.body) as ContentEntry,
  hash: r.hash,
});

/** The node `id` when it is an entry of `siteId` (an original lives in the same site). */
export async function readEntry(
  sql: SqlDriver,
  siteId: string,
  id: string,
): Promise<ReadEntry | undefined> {
  const row = await sql.get<{ hash: string; body: string }>(
    "SELECT hash, body FROM nodes WHERE id = ? AND site_id = ? AND kind = 'contentEntry'",
    [id, siteId],
  );
  return row ? parse(row) : undefined;
}

/** The same-site translations of `group` (through the translation index). */
export async function readTranslations(
  sql: SqlDriver,
  siteId: string,
  group: string,
): Promise<ReadEntry[]> {
  const rows = await sql.all<{ hash: string; body: string }>(
    `SELECT t.hash, t.body FROM nodes t WHERE ${TRANSLATIONS_OF} ORDER BY t.id`,
    [siteId, group, group],
  );
  return rows.map(parse);
}

async function fingerprints(site: Site, collections: Iterable<string>) {
  const out = new Map<string, string>();
  for (const c of new Set(collections)) out.set(c, await listFingerprint(site, c));
  return out;
}

/** The translations of an original that read a listed value from it, recomputed. */
function translationValues(
  site: Site,
  translations: readonly ReadEntry[],
  original: ContentEntry | undefined,
): NodeValues[] {
  return translations
    .filter((t) => dependsOnOriginal(site, t.entry))
    .map((t) => ({
      id: t.entry.id,
      hash: t.hash,
      values: listValueRows(site, t.entry, original),
    }));
}

const readSet = (group: string, translations: readonly ReadEntry[]) => ({
  group,
  read: translations.map((t) => ({ id: t.entry.id, hash: t.hash, collection: t.entry.collection })),
});

/** The statements of `EntryEngine.write` for `entry` (its final body), `stored` being what it replaces. */
export async function planListValues(
  sql: SqlDriver,
  site: Site,
  write: { stored: ContentEntry | undefined; entry: ContentEntry; at: string },
): Promise<ListStatements> {
  const { stored, entry, at } = write;
  if (listedCollections(site).length === 0)
    return (hash) => {
      const anchor = hashIs(entry.id, hash);
      return [
        dropOwnRows(entry.id, hash),
        stateCheckStatement({ siteId: site.id, seen: "none", anchor, at }),
      ];
    };
  const groupId = originalIdOf(entry);
  const reads = groupId !== undefined && dependsOnOriginal(site, entry);
  const original = reads ? await readEntry(sql, site.id, groupId) : undefined;
  const own: OriginalRead | undefined = reads
    ? { id: groupId, hash: original?.hash ?? null }
    : undefined;
  const values = listValueRows(site, entry, original?.entry);
  // RFC-0041 §5: translations read an original's values live, so their rows follow it.
  const changed = !stored || !sameJson(stored.fields ?? {}, entry.fields ?? {});
  const translations = changed ? await readTranslations(sql, site.id, entry.id) : [];
  const others = translationValues(site, translations, entry);
  const seen = await fingerprints(site, [
    entry.collection,
    ...translations.map((t) => t.entry.collection),
  ]);
  return (hash) => {
    const anchor = hashIs(entry.id, hash);
    return [
      dropOwnRows(entry.id, hash),
      ...rowInserts(site.id, [{ id: entry.id, hash, original: own, values }]),
      ...nodeRowsStatements(site.id, others, anchor),
      stateCheckStatement({
        siteId: site.id,
        seen,
        own: own && values ? { collection: entry.collection, original: own } : undefined,
        translations: changed ? readSet(entry.id, translations) : undefined,
        anchor,
        at,
      }),
    ];
  };
}

/** `entry` is gone (rule 4's anchor of a delete). */
const gone = (id: string): Cond => ({
  sql: "NOT EXISTS (SELECT 1 FROM nodes WHERE id = ?)",
  params: [id],
});

/** The statements of `EntryEngine.delete`: its rows go, its translations fall back to their own. */
export async function planListValuesDelete(
  sql: SqlDriver,
  site: Site | undefined,
  entry: ContentEntry,
  at: string,
): Promise<SqlStatement[]> {
  const anchor = gone(entry.id);
  if (!site || listedCollections(site).length === 0)
    return [
      dropGoneRows(entry.id),
      stateCheckStatement({ siteId: entry.siteId, seen: "none", anchor, at }),
    ];
  const translations = await readTranslations(sql, site.id, entry.id);
  const others = translationValues(site, translations, undefined).map((n) => ({
    ...n,
    original: { id: entry.id, hash: null },
  }));
  const seen = await fingerprints(
    site,
    translations.map((t) => t.entry.collection),
  );
  return [
    dropGoneRows(entry.id),
    ...nodeRowsStatements(site.id, others, anchor),
    stateCheckStatement({
      siteId: site.id,
      seen,
      translations: readSet(entry.id, translations),
      anchor,
      at,
    }),
  ];
}
