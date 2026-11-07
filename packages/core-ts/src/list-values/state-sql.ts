/**
 * RFC-0042 §4, #110: the SQL of `entry_list_state`, a listed collection's readiness. Builders
 * only: an entry write's state check, a site write's resets, import's restart, a field
 * operation pass's reset, and the backfill's guards and progress. Every reset sets a new `epoch`,
 * which the backfill's chunks are guarded on, so a reset in the middle of a run makes the rest of
 * it a no-op.
 */
import type { SqlStatement, SqlValue } from "@cloudhal/storage";
import type { Cond } from "../node-sql.ts";
import {
  at,
  head,
  NODE_MATCH,
  type NodeValues,
  ORIGINAL_OK,
  type OriginalRead,
  TRANSLATIONS_OF,
} from "./statements.ts";

/** A fresh token for `entry_list_state.epoch` (every reset changes it). */
export const newEpoch = (): string => crypto.randomUUID();

/** What an entry write or delete checks, to degrade instead of leaving rows stale. */
export interface StateCheck {
  readonly siteId: string;
  /**
   * The fingerprints the write was planned under (`none` for a collection without list fields);
   * `"none"` alone: the site listed no fields at all, so any state row is newer than the plan.
   */
  readonly seen: ReadonlyMap<string, string> | "none";
  /** The entry's rows read its original as `original`. */
  readonly own?: { readonly collection: string; readonly original: OriginalRead } | undefined;
  /** The entry is an original whose same-site translations were read as `read`. */
  readonly translations?:
    | {
        readonly group: string;
        readonly read: readonly { id: string; hash: string; collection: string }[];
      }
    | undefined;
  readonly anchor: Cond;
  readonly at: string;
}

const STATE_RESET =
  "UPDATE entry_list_state SET ready = 0, cursor = NULL, epoch = ?, updated_at = ?";

/**
 * Sets the affected collections not ready when the write was planned under other definitions
 * (`seen`), or when the original or translations it read changed before it committed. Runs only
 * once the write landed (`anchor`). Statements of the write that compare hashes come before
 * anything that changes the translations' hashes (source-forward).
 */
export function stateCheckStatement(c: StateCheck): SqlStatement {
  const params: SqlValue[] = [newEpoch(), c.at, c.siteId, ...c.anchor.params];
  if (c.seen === "none")
    return { sql: `${STATE_RESET} WHERE site_id = ? AND ${c.anchor.sql}`, params };
  const or: string[] = [
    `EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = entry_list_state.collection
       AND json_extract(j.value, '$[1]') <> entry_list_state.fingerprint)`,
  ];
  params.push(JSON.stringify([...c.seen]));
  if (c.own) {
    const o = c.own.original;
    or.push(
      o.hash === null
        ? "(entry_list_state.collection = ? AND EXISTS (SELECT 1 FROM nodes o WHERE o.id = ? AND o.site_id = ?))"
        : "(entry_list_state.collection = ? AND NOT EXISTS (SELECT 1 FROM nodes o WHERE o.id = ? AND o.hash = ?))",
    );
    params.push(c.own.collection, o.id, o.hash ?? c.siteId);
  }
  if (c.translations) {
    const { group, read } = c.translations;
    or.push(`((entry_list_state.collection IN (SELECT value FROM json_each(?))
        OR entry_list_state.collection IN (SELECT json_extract(t.body, '$.collection') FROM nodes t WHERE ${TRANSLATIONS_OF}))
      AND ((SELECT count(*) FROM nodes t WHERE ${TRANSLATIONS_OF}) <> ?
        OR EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM nodes t
          WHERE t.id = json_extract(j.value, '$[0]') AND t.hash = json_extract(j.value, '$[1]')))))`);
    params.push(
      JSON.stringify([...new Set(read.map((t) => t.collection))]),
      c.siteId,
      group,
      group,
      c.siteId,
      group,
      group,
      read.length,
      JSON.stringify(read.map((t) => [t.id, t.hash])),
    );
  }
  return {
    sql: `${STATE_RESET} WHERE site_id = ? AND ${c.anchor.sql} AND (${or.join(" OR ")})`,
    params,
  };
}

/**
 * A site write's readiness changes, anchored on the site's new hash: every collection whose
 * fingerprint changed is reset (ready at once when it holds no entry: keys are
 * `collection:locale:slug` and collections are slugs, so the key range is exactly the
 * collection), and collections that list no fields any more lose their state row. Rows are left
 * in place: every entry write replaces its own, and the backfill rewrites a collection's.
 */
export function siteStateStatements(
  siteId: string,
  changed: ReadonlyMap<string, string>,
  write: { anchor: Cond; at: string },
): SqlStatement[] {
  const listed = [...changed].filter(([, fp]) => fp !== "none");
  const dropped = [...changed].filter(([, fp]) => fp === "none").map(([c]) => c);
  const out: SqlStatement[] = [];
  if (listed.length > 0)
    out.push({
      sql: `INSERT INTO entry_list_state (site_id, collection, fingerprint, epoch, ready, cursor, updated_at)
        SELECT ?, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), ?,
          NOT EXISTS (SELECT 1 FROM nodes n WHERE n.site_id = ? AND n.kind = 'contentEntry'
            AND n.key > json_extract(j.value, '$[0]') || ':' AND n.key < json_extract(j.value, '$[0]') || ';'),
          NULL, ?
        FROM json_each(?) j WHERE ${write.anchor.sql}
        ON CONFLICT (site_id, collection) DO UPDATE SET fingerprint = excluded.fingerprint,
          epoch = excluded.epoch, ready = excluded.ready, cursor = NULL, updated_at = excluded.updated_at`,
      params: [
        siteId,
        newEpoch(),
        siteId,
        write.at,
        JSON.stringify(listed),
        ...write.anchor.params,
      ],
    });
  if (dropped.length > 0)
    out.push({
      sql: `DELETE FROM entry_list_state WHERE site_id = ?
        AND collection IN (SELECT value FROM json_each(?)) AND ${write.anchor.sql}`,
      params: [siteId, JSON.stringify(dropped), ...write.anchor.params],
    });
  return out;
}

/** One listed collection of an imported site: its fingerprint, and whether it holds no entry. */
export interface ImportedList {
  readonly collection: string;
  readonly fingerprint: string;
  readonly empty: boolean;
}

/**
 * Import replaces a site's node set in one batch: its rows and states go, and each listed
 * collection starts over (ready at once when empty). Rows are rebuilt after the batch.
 */
export function importResetStatements(
  siteId: string,
  listed: readonly ImportedList[],
  at: string,
): SqlStatement[] {
  const out: SqlStatement[] = [
    { sql: "DELETE FROM entry_list_values WHERE site_id = ?", params: [siteId] },
    { sql: "DELETE FROM entry_list_state WHERE site_id = ?", params: [siteId] },
  ];
  if (listed.length > 0)
    out.push({
      sql: `INSERT INTO entry_list_state (site_id, collection, fingerprint, epoch, ready, cursor, updated_at)
        SELECT ?, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), ?, json_extract(j.value, '$[2]'), NULL, ?
        FROM json_each(?) j`,
      params: [
        siteId,
        newEpoch(),
        at,
        JSON.stringify(listed.map((l) => [l.collection, l.fingerprint, l.empty ? 1 : 0])),
      ],
    });
  return out;
}

/**
 * A field operation's pass rewrote `ids` (phase B, or a revert's restore) without touching their
 * rows: the collections whose listed values may have moved are reset in the same batch. That is
 * the operation's collection and those of the rewritten entries' same-site translations, each
 * only while it lists one of `keys` (the operation's, and any other the batch's bodies change;
 * the site as it is when the batch runs).
 */
export function passResetStatement(p: {
  siteId: string;
  collection: string;
  ids: readonly string[];
  keys: readonly string[];
  at: string;
}): SqlStatement {
  return {
    sql: `${STATE_RESET} WHERE site_id = ?
      AND (collection = ? OR collection IN (SELECT json_extract(t.body, '$.collection') FROM nodes t
        WHERE t.site_id = ? AND t.kind = 'contentEntry'
          AND json_extract(t.body, '$.translation.group') IN (SELECT value FROM json_each(?))
          AND json_extract(t.body, '$.translation.source.siteId') IS NULL))
      AND EXISTS (SELECT 1 FROM nodes s,
          json_each(s.body, '$.collections."' || entry_list_state.collection || '".listFields') f
        WHERE s.id = ? AND s.kind = 'site' AND f.value IN (SELECT value FROM json_each(?)))`,
    params: [
      newEpoch(),
      p.at,
      p.siteId,
      p.collection,
      p.siteId,
      JSON.stringify(p.ids),
      p.siteId,
      JSON.stringify(p.keys),
    ],
  };
}

/** A backfill run's view of a state row: chunks are written only while it is still this. */
export interface StateView {
  readonly siteId: string;
  readonly collection: string;
  readonly fingerprint: string;
  readonly epoch: string;
  readonly cursor: string | null;
}

/** The state row is still `v` and not ready (every backfill statement's guard). */
export function stateIs(v: StateView): Cond {
  return {
    sql: `EXISTS (SELECT 1 FROM entry_list_state s WHERE s.site_id = ? AND s.collection = ?
      AND s.fingerprint = ? AND s.epoch = ? AND s.cursor IS ? AND s.ready = 0)`,
    params: [v.siteId, v.collection, v.fingerprint, v.epoch, v.cursor],
  };
}

/**
 * The backfill's progress, last in a chunk's batch: the cursor moves to `cursor` (and `ready`
 * becomes 1 after the last chunk) only while the state is `v` and every node of the chunk that
 * still exists has the hash, and original, its rows were computed from.
 */
export function advanceStatement(
  v: StateView,
  chunk: readonly NodeValues[],
  next: { cursor: string | null; ready: boolean; at: string },
): SqlStatement {
  return {
    sql: `UPDATE entry_list_state SET cursor = ?, ready = ?, updated_at = ?
      WHERE site_id = ? AND collection = ? AND fingerprint = ? AND epoch = ? AND cursor IS ? AND ready = 0
        AND NOT EXISTS (SELECT 1 FROM json_each(?) e
          WHERE EXISTS (SELECT 1 FROM nodes n WHERE n.id = ${at(0)})
            AND NOT (${NODE_MATCH} AND ${ORIGINAL_OK}))`,
    params: [
      next.cursor,
      next.ready ? 1 : 0,
      next.at,
      v.siteId,
      v.collection,
      v.fingerprint,
      v.epoch,
      v.cursor,
      JSON.stringify(chunk.map(head)),
      v.siteId,
    ],
  };
}

/**
 * The backfill's start on a collection without a state row, or with one from other
 * definitions: not ready, from the beginning, under `v.epoch` (a fresh one, so one changed row
 * means the state is exactly `v` with no cursor), while the site still has the hash it was read at.
 */
export function staleStateStatement(
  v: Omit<StateView, "cursor">,
  site: { id: string; hash: string },
  at: string,
): SqlStatement {
  return {
    sql: `INSERT INTO entry_list_state (site_id, collection, fingerprint, epoch, ready, cursor, updated_at)
      SELECT ?, ?, ?, ?, 0, NULL, ? WHERE EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)
      ON CONFLICT (site_id, collection) DO UPDATE SET fingerprint = excluded.fingerprint,
        epoch = excluded.epoch, ready = 0, cursor = NULL, updated_at = excluded.updated_at
      WHERE entry_list_state.fingerprint <> excluded.fingerprint`,
    params: [v.siteId, v.collection, v.fingerprint, v.epoch, at, site.id, site.hash],
  };
}
