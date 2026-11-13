/**
 * RFC-0045 §2.4, rollout step 7: the one-time per-site rebuild of `entry_refs`, a safety net once
 * the types are enabled (the gate of §1 means it should find nothing to change). The admin Worker
 * runs it as the `refs.rebuild` system job, `openLocalStore` on Node; both resume by cursor.
 *
 * Per site, entries are read in key order, 100 at a time, with the site row read first:
 * - **Rows are the import rebuild's** (`entryRefItemsOf`, so `rebuildRows`: keys through
 *   `migration.fromKey`, a running conversion's path through its earlier type, old-shape values
 *   through `oldShapePairs`), with `shared` computed in JS from the site row read with the chunk
 *   and `source_status` the holder's own.
 * - **Each node is anchored on the hash it was read with.** The chunk's `DELETE` removes only the
 *   rows of nodes whose hash is still the one read, and its `INSERT`s write only those nodes' rows
 *   (`json_each` pairs joined to `nodes` on id and hash): the same as one anchored `DELETE` and
 *   `INSERT` per node, in a fixed number of statements a chunk, so the tick budget holds. A node a
 *   writer changed since the read is skipped, since its writer wrote fresh rows (R17). Never a
 *   site-wide `DELETE`.
 * - **The collections anchor** is on every statement of the chunk, the advance included: a
 *   definitions or marker change between the read and the batch makes the whole chunk a no-op,
 *   and it is read again under the new definitions.
 * - **The cursor** (`entry_refs_state`) moves in the same batch, guarded on the cursor as read, so
 *   a second runner never moves it back. The last chunk removes the rows of nodes that no longer
 *   exist (`source_id NOT IN (SELECT id FROM nodes WHERE site_id = ?)`) and marks the site done.
 *
 * No transactions (rule 4): progress lives in the state row, so a run stopped anywhere resumes.
 * Inserts stay below 90 KB a statement. Worker-safe: it takes a raw `SqlDriver`.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import { type ListValuesBudget, ListValuesMeter } from "../list-values/meter.ts";
import { chunks, REFS_STATEMENT_BYTES } from "../media/refs-rebuild.ts";
import { entryRefItemsOf } from "./rebuild.ts";

export interface RebuildEntryRefsOptions {
  /** One site (absent: every site not done yet). */
  readonly siteId?: string | undefined;
  /** Absent: until every site is done. */
  readonly budget?: ListValuesBudget | undefined;
}

export interface RebuiltEntryRefs {
  readonly siteId: string;
  readonly done: boolean;
  /** Entries read by the chunks this call committed (a node a writer moved meanwhile is skipped, but counted). */
  readonly written: number;
  /** Why it is not done: the budget ran out, or writers kept the cursor or the site busy. */
  readonly reason?: "budget" | "busy";
}

export interface RebuildEntryRefsResult {
  readonly sites: RebuiltEntryRefs[];
  /** The budget ran out before every site was done. */
  readonly exhausted: boolean;
}

/** Chunk batches in a row that changed nothing before a site is left for the next run. */
const MISSES = 20;
/**
 * Statements a chunk needs at least: the site row, the entries, a `DELETE`, one `INSERT` (one
 * entry's rows stay far below 90 KB: at most 100 references) and the advance.
 */
const CHUNK_COST = 5;

const COLLECTIONS =
  "(SELECT json_extract(body, '$.collections') FROM nodes WHERE id = ? AND kind = 'site') IS ?";

const DELETE_SQL = `DELETE FROM entry_refs WHERE source_id IN (
    SELECT n.id FROM json_each(?) j JOIN nodes n
      ON n.id = json_extract(j.value, '$.n') AND n.hash = json_extract(j.value, '$.x')
    WHERE n.site_id = ? AND n.kind = 'contentEntry')
  AND ${COLLECTIONS}`;

const INSERT_SQL = `INSERT INTO entry_refs (site_id, target_id, source_id, source_collection, field, root_key, shared, source_status)
  SELECT ?, json_extract(r.value, '$.t'), n.id, json_extract(r.value, '$.c'),
    json_extract(r.value, '$.f'), json_extract(r.value, '$.k'), json_extract(r.value, '$.h'), json_extract(r.value, '$.s')
  FROM json_each(?) r JOIN nodes n
    ON n.id = json_extract(r.value, '$.n') AND n.hash = json_extract(r.value, '$.x')
  WHERE n.site_id = ? AND n.kind = 'contentEntry' AND ${COLLECTIONS}`;

const ORPHANS_SQL =
  "DELETE FROM entry_refs WHERE site_id = ? AND source_id NOT IN (SELECT id FROM nodes WHERE site_id = ?)";

const ADVANCE_SQL = `INSERT INTO entry_refs_state (site_id, cursor, done, updated_at)
  SELECT ?, ?, ?, ? WHERE ${COLLECTIONS}
  ON CONFLICT (site_id) DO UPDATE SET cursor = excluded.cursor, done = excluded.done, updated_at = excluded.updated_at
  WHERE entry_refs_state.done = 0 AND entry_refs_state.cursor IS ?`;

/** Entries of a site after a key, in key order (`nodes_site_kind_key`). */
const ENTRIES_SQL = `SELECT id, key, hash, body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
  AND key > ? ORDER BY key LIMIT ?`;

const SITE_SQL = `SELECT id, body, json_extract(body, '$.collections') AS c FROM nodes WHERE id = ? AND kind = 'site'`;

interface State {
  readonly cursor: string | null;
  readonly done: boolean;
}

/** A chunk's entries with the rows each would get. */
interface Read {
  readonly key: string;
  /** JSON items for `INSERT_SQL`, each with the node's read hash (`x`). */
  readonly items: string[];
  /** `{n, x}` for `DELETE_SQL`. */
  readonly pin: string;
}

const encoder = new TextEncoder();
const stamp = () => new Date().toISOString();

async function readState(sql: SqlDriver, siteId: string): Promise<State | undefined> {
  const row = await sql.get<{ cursor: string | null; done: number }>(
    "SELECT cursor, done FROM entry_refs_state WHERE site_id = ?",
    [siteId],
  );
  return row ? { cursor: row.cursor, done: Number(row.done) === 1 } : undefined;
}

/** The sites to rebuild: one, or every site, and the states of those already started. */
async function discover(sql: SqlDriver, siteId: string | undefined) {
  const sites = siteId
    ? await sql.all<{ id: string }>("SELECT id FROM nodes WHERE id = ? AND kind = 'site'", [siteId])
    : await sql.all<{ id: string }>(
        "SELECT id FROM nodes WHERE kind = 'site' ORDER BY created_at, id",
      );
  const rows = siteId
    ? await sql.all<{ site_id: string; cursor: string | null; done: number }>(
        "SELECT site_id, cursor, done FROM entry_refs_state WHERE site_id = ?",
        [siteId],
      )
    : await sql.all<{ site_id: string; cursor: string | null; done: number }>(
        "SELECT site_id, cursor, done FROM entry_refs_state",
      );
  const states = new Map<string, State>(
    rows.map((r) => [r.site_id, { cursor: r.cursor, done: Number(r.done) === 1 }]),
  );
  return { ids: sites.map((s) => s.id), states };
}

/** The chunk after `cursor`, each entry's rows under `site` (`entryRefItemsOf`). */
async function readChunk(
  sql: SqlDriver,
  site: Pick<Site, "id" | "collections">,
  cursor: string | null,
  limit: number,
): Promise<Read[]> {
  const rows = await sql.all<{ id: string; key: string; hash: string; body: string }>(ENTRIES_SQL, [
    site.id,
    cursor ?? "",
    limit,
  ]);
  return rows.map((r) => {
    const entry = JSON.parse(r.body) as ContentEntry;
    return {
      key: r.key,
      items: entryRefItemsOf(site, r.id, entry).map((item) =>
        JSON.stringify({ ...item, x: r.hash }),
      ),
      pin: JSON.stringify({ n: r.id, x: r.hash }),
    };
  });
}

interface ChunkPlan {
  readonly siteId: string;
  /** The stored text of the site's `collections` as read (`NULL` when absent). */
  readonly collections: string | null;
  readonly before: string | null;
  readonly cursor: string | null;
  readonly last: boolean;
}

/** The chunk's batch: the anchored `DELETE`, the `INSERT`s, the orphans when last, the advance. */
function chunkStatements(reads: readonly Read[], plan: ChunkPlan): SqlStatement[] {
  const { siteId, collections } = plan;
  const anchor = [siteId, collections];
  const fixed = encoder.encode(INSERT_SQL + siteId + siteId + (collections ?? "")).length;
  const out: SqlStatement[] = [];
  if (reads.length > 0) {
    out.push({
      sql: DELETE_SQL,
      params: [`[${reads.map((r) => r.pin).join(",")}]`, siteId, ...anchor],
    });
    for (const items of chunks(
      reads.flatMap((r) => r.items),
      REFS_STATEMENT_BYTES - fixed,
    ))
      out.push({ sql: INSERT_SQL, params: [siteId, items, siteId, ...anchor] });
  }
  if (plan.last) out.push({ sql: ORPHANS_SQL, params: [siteId, siteId] });
  out.push({
    sql: ADVANCE_SQL,
    params: [siteId, plan.cursor, plan.last ? 1 : 0, stamp(), ...anchor, plan.before],
  });
  return out;
}

/** How many of `reads` (a prefix) one batch of at most `room` statements holds. */
function fitting(reads: readonly Read[], room: number, plan: (k: number) => ChunkPlan): number {
  const fits = (k: number) => chunkStatements(reads.slice(0, k), plan(k)).length <= room;
  if (fits(reads.length)) return reads.length;
  let lo = 0;
  let hi = reads.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

async function rebuildSite(
  meter: ListValuesMeter,
  siteId: string,
  found: State | undefined,
): Promise<RebuiltEntryRefs> {
  const { sql } = meter;
  const result = (done: boolean, written: number, reason?: RebuiltEntryRefs["reason"]) => ({
    siteId,
    done,
    written,
    ...(reason ? { reason } : {}),
  });
  let state: State = found ?? { cursor: null, done: false };
  let written = 0;
  let misses = 0;
  while (!state.done) {
    if (meter.out(CHUNK_COST)) return result(false, written, "budget");
    const row = await sql.get<{ id: string; body: string; c: string | null }>(SITE_SQL, [siteId]);
    if (!row) return result(true, written); // the site went: nothing of it is left to index
    const site = JSON.parse(row.body) as Site;
    const limit = meter.room();
    const reads = await readChunk(sql, site, state.cursor, limit);
    const plan = (k: number, last = false): ChunkPlan => ({
      siteId,
      collections: row.c ?? null,
      before: state.cursor,
      cursor: reads[k - 1]?.key ?? state.cursor,
      last,
    });
    const room = meter.left();
    const k = fitting(reads, room, (i) => plan(i));
    if (k === 0 && reads.length > 0) return result(false, written, "budget");
    // The end of the site, with the orphans' `DELETE`, when it fits; else the next chunk is empty.
    const end = k === reads.length && reads.length < limit;
    const closing = plan(k, true);
    const p = end && chunkStatements(reads.slice(0, k), closing).length <= room ? closing : plan(k);
    const results = await sql.batch(chunkStatements(reads.slice(0, k), p));
    meter.take(Math.max(1, k));
    if (results.at(-1)?.changes === 1) {
      written += k;
      misses = 0;
      state = { cursor: p.cursor, done: p.last };
      continue;
    }
    // The definitions changed since the read, or another runner moved the cursor.
    if (meter.left() < 1) return result(false, written, "budget");
    const now = await readState(sql, siteId);
    if (now?.done) return result(true, written);
    if (++misses > MISSES) return result(false, written, "busy");
    state = now ?? { cursor: null, done: false };
  }
  return result(true, written);
}

/**
 * Makes `entry_refs` match the stored entries once per site (of one site, or every site not done
 * yet), within `budget`. Safe to run concurrently with writers and with itself; a site marked
 * done is never read again.
 */
export async function rebuildEntryRefs(
  sql: SqlDriver,
  options: RebuildEntryRefsOptions = {},
): Promise<RebuildEntryRefsResult> {
  const meter = new ListValuesMeter(sql, options.budget);
  if (meter.left() < 2) return { sites: [], exhausted: true };
  const { ids, states } = await discover(meter.sql, options.siteId);
  const sites: RebuiltEntryRefs[] = [];
  for (const id of ids) {
    const state = states.get(id);
    if (state?.done) continue;
    sites.push(await rebuildSite(meter, id, state));
  }
  return { sites, exhausted: sites.some((s) => s.reason === "budget") };
}
