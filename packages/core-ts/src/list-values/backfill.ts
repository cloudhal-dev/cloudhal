/**
 * RFC-0042 §4, #110: the resumable rebuild of `entry_list_values`. A collection's rows are read
 * only while its `entry_list_state` row is ready under the current fingerprint; this makes it so.
 *
 * Discovery is two statements whatever the deployment's size: the sites, then their state rows;
 * collections already ready under their fingerprint cost nothing more. Per collection that is
 * not: the state row is (re)started when it is missing (a deployment from before migration 0029)
 * or was built under other definitions; then entries are read in key order, 100 at a time with
 * their originals, their rows computed in JS (`listValueRows`, the writers' function) and written
 * in one atomic batch per chunk. Every statement of a chunk is guarded on the state row being
 * exactly as read (fingerprint, `epoch`, `cursor`, not ready), so two runners never interleave
 * and a reset in between makes the rest of the run a no-op; each node's rows also need the node,
 * and its original, to still have the hash they were computed from. The cursor moves only when
 * every node of the chunk did, so a node a concurrent writer changed is read again. The last
 * chunk sets the state ready. No transactions (rule 4); progress lives in the state row, so a run
 * that stops anywhere resumes.
 *
 * The budget (`meter.ts`) is asked before each unit of work, statements included: a chunk whose
 * batch would not fit is cut short (the cursor stops at its last written node).
 *
 * Worker-safe: it takes a raw `SqlDriver`, as `importSite` does.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { hasListedMarker, listedCollections, listFingerprint } from "./fingerprint.ts";
import { type ListValuesBudget, ListValuesMeter } from "./meter.ts";
import { dependsOnOriginal, listValueRows, originalIdOf } from "./rows.ts";
import {
  advanceStatement,
  newEpoch,
  type StateView,
  staleStateStatement,
  stateIs,
} from "./state-sql.ts";
import { type NodeValues, nodeRowsStatements, rowStatementCount } from "./statements.ts";
import { tidyRows } from "./tidy.ts";

export type { ListValuesBudget } from "./meter.ts";

/** What a settings change rebuilds before `updateSite` returns; the rest is the job's. */
export const INLINE_LIST_BUDGET: ListValuesBudget = { entries: 500, ms: 2_000 };

export interface RebuildListValuesOptions {
  /** One site (absent: every site). */
  readonly siteId?: string | undefined;
  /** Only these collections of it. */
  readonly collections?: readonly string[] | undefined;
  /** Absent: until every collection is ready. */
  readonly budget?: ListValuesBudget | undefined;
  /** Also remove rows of collections that list no fields any more (the admin job). */
  readonly tidy?: boolean | undefined;
  /**
   * Where the work starts in the list of collections that are not ready (taken modulo its
   * length): a job passes a number that changes between runs, so a collection writers keep busy
   * cannot hold the others back.
   */
  readonly start?: number | undefined;
}

export interface RebuiltCollection {
  readonly siteId: string;
  readonly collection: string;
  readonly ready: boolean;
  /** Entries whose rows this call wrote. */
  readonly written: number;
  /** Why it is not ready: a field operation rewrites a listed field, the budget ran out, the definitions changed meanwhile, or writers kept changing its entries. */
  readonly reason?: "operation_running" | "budget" | "changed" | "busy";
}

export interface RebuildListValuesResult {
  readonly collections: RebuiltCollection[];
  /** The budget ran out before every collection was ready. */
  readonly exhausted: boolean;
  /** Rows of unlisted collections removed (`tidy`). */
  readonly tidied: number;
}

/** Chunk batches in a row that changed nothing before a collection is left for the next run. */
const MISSES = 20;
/** Statements a state (re)start may take: the upsert, and a read when it changed nothing. */
const START_COST = 2;
/** Statements a chunk needs at least: its read, its originals, a DELETE, an INSERT, the advance. */
const CHUNK_COST = 5;

type StateRow = {
  fingerprint: string;
  epoch: string;
  ready: number;
  cursor: string | null;
};

interface SiteRead {
  readonly site: Site;
  readonly hash: string;
}

/** A listed collection that is not ready (or has no state row) under `fingerprint`. */
interface Work extends SiteRead {
  readonly collection: string;
  readonly fingerprint: string;
  /** Its state row as discovery read it, when that row has the fingerprint. */
  readonly found: StateRow | undefined;
}

const stamp = () => new Date().toISOString();
const stateKey = (siteId: string, collection: string) => `${siteId}\n${collection}`;

async function readState(sql: SqlDriver, siteId: string, collection: string) {
  return sql.get<StateRow>(
    "SELECT fingerprint, epoch, ready, cursor FROM entry_list_state WHERE site_id = ? AND collection = ?",
    [siteId, collection],
  );
}

async function readSites(sql: SqlDriver, siteId: string | undefined): Promise<SiteRead[]> {
  const rows = siteId
    ? await sql.all<{ hash: string; body: string }>(
        "SELECT hash, body FROM nodes WHERE id = ? AND kind = 'site'",
        [siteId],
      )
    : await sql.all<{ hash: string; body: string }>(
        "SELECT hash, body FROM nodes WHERE kind = 'site' ORDER BY created_at, id",
      );
  return rows.map((r) => ({ site: JSON.parse(r.body) as Site, hash: r.hash }));
}

/** Every state row of the site (or of every site), in one statement. */
async function readStates(sql: SqlDriver, siteId: string | undefined) {
  const columns = "site_id, collection, fingerprint, epoch, ready, cursor";
  const rows = siteId
    ? await sql.all<StateRow & { site_id: string; collection: string }>(
        `SELECT ${columns} FROM entry_list_state WHERE site_id = ?`,
        [siteId],
      )
    : await sql.all<StateRow & { site_id: string; collection: string }>(
        `SELECT ${columns} FROM entry_list_state`,
      );
  return new Map(
    rows.map((r) => [
      stateKey(r.site_id, r.collection),
      { fingerprint: r.fingerprint, epoch: r.epoch, ready: r.ready, cursor: r.cursor },
    ]),
  );
}

/** A chunk: the entries after a key in a collection's key range (`collection:locale:slug`). */
export const CHUNK_SQL = `SELECT key, hash, body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
  AND key > ? AND key < ? ORDER BY key LIMIT ?`;

/** The chunk after `cursor`. */
async function readChunk(sql: SqlDriver, w: Work, cursor: string | null, limit: number) {
  const rows = await sql.all<{ key: string; hash: string; body: string }>(CHUNK_SQL, [
    w.site.id,
    cursor ?? `${w.collection}:`,
    `${w.collection};`,
    limit,
  ]);
  return rows.map((r) => ({ key: r.key, hash: r.hash, entry: JSON.parse(r.body) as ContentEntry }));
}

/**
 * The originals a chunk's translations read, by id. Driven by the id list (`CROSS JOIN`): left to
 * the planner, `site_id = ? AND kind = ?` made it walk the site's entries for every chunk.
 */
export const ORIGINALS_SQL = `SELECT n.id AS id, n.hash AS hash, n.body AS body FROM json_each(?) j
  CROSS JOIN nodes n ON n.id = j.value WHERE n.site_id = ? AND n.kind = 'contentEntry'`;

/** The chunk's rows, each translation's with its original as stored now. */
async function chunkValues(
  sql: SqlDriver,
  site: Site,
  chunk: readonly { hash: string; entry: ContentEntry }[],
): Promise<NodeValues[]> {
  const dep = (e: ContentEntry) => (dependsOnOriginal(site, e) ? originalIdOf(e) : undefined);
  const ids = [...new Set(chunk.map((r) => dep(r.entry)).filter((id) => id !== undefined))];
  const originals = new Map<string, { hash: string; entry: ContentEntry }>();
  if (ids.length > 0) {
    const rows = await sql.all<{ id: string; hash: string; body: string }>(ORIGINALS_SQL, [
      JSON.stringify(ids),
      site.id,
    ]);
    for (const r of rows)
      originals.set(r.id, { hash: r.hash, entry: JSON.parse(r.body) as ContentEntry });
  }
  return chunk.map((r) => {
    const id = dep(r.entry);
    const o = id === undefined ? undefined : originals.get(id);
    return {
      id: r.entry.id,
      hash: r.hash,
      original: id === undefined ? undefined : { id, hash: o?.hash ?? null },
      values: listValueRows(site, r.entry, o?.entry),
    };
  });
}

/** How many of `values` (a prefix) a batch of at most `room` statements holds with its advance. */
function fitting(values: readonly NodeValues[], room: number): number {
  if (rowStatementCount(values) + 1 <= room) return values.length;
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (rowStatementCount(values.slice(0, mid)) + 1 <= room) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The state row restarted for `w.fingerprint` (missing, or from other definitions). */
async function startState(sql: SqlDriver, w: Work): Promise<StateRow | undefined> {
  const view = {
    siteId: w.site.id,
    collection: w.collection,
    fingerprint: w.fingerprint,
    epoch: newEpoch(),
  };
  const s = staleStateStatement(view, { id: w.site.id, hash: w.hash }, stamp());
  const r = await sql.run(s.sql, s.params ?? []);
  if (r.changes === 1)
    return { fingerprint: w.fingerprint, epoch: view.epoch, ready: 0, cursor: null };
  const now = await readState(sql, w.site.id, w.collection);
  return now?.fingerprint === w.fingerprint ? now : undefined;
}

async function rebuildCollection(meter: ListValuesMeter, w: Work): Promise<RebuiltCollection> {
  const { sql } = meter;
  const siteId = w.site.id;
  const result = (ready: boolean, written: number, reason?: RebuiltCollection["reason"]) => ({
    siteId,
    collection: w.collection,
    ready,
    written,
    ...(reason ? { reason } : {}),
  });
  let state = w.found;
  if (!state) {
    if (meter.out(START_COST)) return result(false, 0, "budget");
    state = await startState(sql, w);
    if (!state) return result(false, 0, "changed");
  }
  let written = 0;
  let misses = 0;
  while (state.ready !== 1) {
    if (meter.out(CHUNK_COST)) return result(false, written, "budget");
    const view: StateView = {
      siteId,
      collection: w.collection,
      fingerprint: w.fingerprint,
      epoch: state.epoch,
      cursor: state.cursor,
    };
    const limit = meter.room();
    const chunk = await readChunk(sql, w, state.cursor, limit);
    const all = await chunkValues(sql, w.site, chunk);
    const k = fitting(all, meter.left());
    const values = all.slice(0, k);
    const last = k === chunk.length && chunk.length < limit;
    const cursor: string | null = chunk[k - 1]?.key ?? state.cursor;
    const results = await sql.batch([
      ...nodeRowsStatements(siteId, values, stateIs(view)),
      advanceStatement(view, values, { cursor, ready: last, at: stamp() }),
    ]);
    meter.take(Math.max(1, k));
    if (results.at(-1)?.changes === 1) {
      written += k;
      misses = 0;
      state = { ...state, cursor, ready: last ? 1 : 0 };
      continue;
    }
    // A writer reset the state, another runner moved it, or an entry of the chunk changed.
    if (meter.left() < 1) return result(false, written, "budget");
    const now = await readState(sql, siteId, w.collection);
    if (now?.fingerprint !== w.fingerprint) return result(false, written, "changed");
    if (++misses > MISSES) return result(false, written, "busy");
    state = now;
  }
  return result(true, written);
}

/** Each listed collection of `sites`: settled now (ready, or under an operation), or work. */
async function discover(
  sites: readonly SiteRead[],
  states: ReadonlyMap<string, StateRow>,
  only: readonly string[] | undefined,
): Promise<(RebuiltCollection | Work)[]> {
  const out: (RebuiltCollection | Work)[] = [];
  for (const read of sites)
    for (const collection of listedCollections(read.site)) {
      if (only && !only.includes(collection)) continue;
      const siteId = read.site.id;
      // Phase B still rewrites values; phase C changes the fingerprint and resets the state.
      if (hasListedMarker(read.site, collection)) {
        out.push({ siteId, collection, ready: false, written: 0, reason: "operation_running" });
        continue;
      }
      const fingerprint = await listFingerprint(read.site, collection);
      const s = states.get(stateKey(siteId, collection));
      const found = s?.fingerprint === fingerprint ? s : undefined;
      if (found?.ready === 1) out.push({ siteId, collection, ready: true, written: 0 });
      else out.push({ ...read, collection, fingerprint, found });
    }
  return out;
}

const isWork = (x: RebuiltCollection | Work): x is Work => "fingerprint" in x;

/**
 * Makes every listed collection's `entry_list_values` complete and ready (of one site, or all),
 * within `budget`. Safe to run concurrently with writers and with itself; idempotent.
 */
export async function rebuildListValues(
  sql: SqlDriver,
  options: RebuildListValuesOptions = {},
): Promise<RebuildListValuesResult> {
  const meter = new ListValuesMeter(sql, options.budget);
  if (meter.left() < 2) return { collections: [], exhausted: true, tidied: 0 };
  const sites = await readSites(meter.sql, options.siteId);
  const states = await readStates(meter.sql, options.siteId);
  const found = await discover(sites, states, options.collections);
  const work = found.flatMap((x, i) => (isWork(x) ? [i] : []));
  const n = work.length;
  const from = n ? ((Math.trunc(options.start ?? 0) % n) + n) % n : 0;
  for (const i of [...work.slice(from), ...work.slice(0, from)])
    found[i] = await rebuildCollection(meter, found[i] as Work);
  const collections = found as RebuiltCollection[];
  const tidied = options.tidy ? await tidyRows(meter, sites) : 0;
  return { collections, exhausted: collections.some((c) => c.reason === "budget"), tidied };
}

/** `rebuildListValues` for the collections a write reset; never throws (the job repairs). */
export async function settleListValues(
  sql: SqlDriver,
  siteId: string,
  options: { collections?: readonly string[]; budget?: ListValuesBudget } = {},
): Promise<RebuildListValuesResult | undefined> {
  try {
    return await rebuildListValues(sql, {
      siteId,
      collections: options.collections,
      budget: options.budget ?? INLINE_LIST_BUDGET,
    });
  } catch {
    return undefined;
  }
}
