/**
 * RFC-0045 §2 "Purges": the purge planner's referrer closure. Pages carry only the node tags they
 * already carry (`cloudhal-node-<id>`); no new tags and no theme code. Exact by construction: it
 * reads only the immutable `from` and `to` snapshots' bodies, never the working copy or
 * `entry_refs`, so a referrer edited away or deleted since is still found where a cached page
 * came from.
 *
 * 1. **Seeds:** the groups (`COALESCE(translation.group, id)`) of every changed, added or removed
 *    entry, before and after (a group change seeds both), and of every entry the asset rule
 *    reached (its cover changed). Their members' pages go too (a translation inheriting a changed
 *    original's reference shows a new card).
 * 2. **Two hops:** the referrers of the seed groups, then the referrers of *their* groups (pages
 *    draw cards to depth 2), from both snapshots, whatever their status. Each referrer purges its
 *    node tag and every member of its group's.
 * 3. **"Used by":** every member of each group a changed or reached entry names, before or after,
 *    so a target page listing `referencedBy` follows its referrers.
 *
 * "Names" means the resolved values (`resolveFields`, with the same snapshot's same-site original
 * and without it, since a page reads whichever its view shows), so a translation that only
 * inherits counts.
 *
 * Reads, only when something seeds it: one hash-keyed cache over both snapshots. It loads one
 * bundle, `to`'s, else `from`'s (RFC-0010; none for a snapshot known to have none, `unbundled`),
 * streamed: each body is cut to what the closure needs as its shard is parsed, and the byte and
 * node budgets are checked before each parse. Bodies the planner already holds are reused; the
 * hashes still missing are read by the closure itself (`only`, six at a time, the same budgets),
 * never into the planner's cache of full bodies. Shard and node reads count against `maxReads`.
 *
 * Purges everything (`string` result) when a budget is passed, and whenever a field-operation
 * marker is on either site node (renames and conversions in flight read through markers). Skipped
 * entirely for sites whose two snapshots define no reference (top-level, inside a repeater, or
 * still converting from one), and at a release's pin time (`references: false`).
 */
import type {
  ContentEntry,
  FieldDefinition,
  NodeRef,
  Site,
  Snapshot,
} from "@cloudhal/core-contracts";
import { BundleBudgetError, type BundleReadOptions, bundleShardCount } from "../bundles.ts";
import { nodeCacheTag } from "../cache-tags.ts";
import { originalsOf } from "../fields/entry-gates.ts";
import { resolveFields } from "../fields/resolve.ts";
import { isReferenceFieldType } from "../fields/types.ts";
import { memberGroup } from "./members.ts";
import { referenceUses } from "./values.ts";

/** What the closure reads of a snapshot (the planner's `SnapshotReader`). */
export interface ReferencePurgeReader {
  readSnapshotBundle?(
    snapshot: Snapshot,
    options?: BundleReadOptions,
  ): Promise<Map<string, unknown> | undefined>;
}

export interface ReferencePurgeLimits {
  /** Bytes of bundle bodies (default 32 MB). */
  readonly maxBodyBytes?: number | undefined;
  /** Entry bodies across both snapshots, and nodes of the bundle read (default 50,000). */
  readonly maxNodes?: number | undefined;
  /** Snapshots known to have no bundle (a release run could not write one): no shard reads. */
  readonly unbundled?: ReadonlySet<string> | undefined;
  /**
   * `false`: skip the closure (a release's pin-time plan, which is the batch's expected outcome
   * only; the run-time re-plan covers referrers, or purges everything).
   */
  readonly references?: false | undefined;
}

export const DEFAULT_PURGE_MAX_BODY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_PURGE_MAX_NODES = 50_000;

export interface ReferencePurgeInput {
  readonly reader: ReferencePurgeReader;
  readonly from: Snapshot;
  readonly to: Snapshot;
  /** The planner's counted, hash-keyed reader. */
  readonly read: <T>(ref: NodeRef) => Promise<T>;
  /** A body the planner already holds, by hash (no read). */
  readonly cached: (hash: string) => unknown;
  /** Counts `n` reads against the planner's `maxReads` (throws past it). */
  readonly spend: (n: number) => void;
  /** Every changed, added or removed entry: before (in `from`) and after (in `to`). */
  readonly entries: readonly { before?: ContentEntry; after?: ContentEntry }[];
  /** Entries of `to` the asset rule reached (a shown asset of theirs changed). */
  readonly reached: ReadonlySet<string>;
  readonly tags: Set<string>;
  readonly why: string[];
  readonly limits?: ReferencePurgeLimits | undefined;
}

/** What the closure keeps of an entry body. */
type Slim = Pick<ContentEntry, "id" | "collection" | "locale" | "status" | "fields"> & {
  translation?: ContentEntry["translation"];
};

const defsOf = (site: Site): FieldDefinition[] =>
  Object.values(site.collections ?? {}).flatMap((c) => c?.fields ?? []);

/**
 * A `reference` field, a repeater with a `reference` sub-field, or a field (or `sub`) still
 * converting *from* references: during `change_field_type` reference → text its values render
 * the targets' titles through the conversion maps until phase B rewrites them.
 */
const namesEntries = (d: FieldDefinition): boolean =>
  d.type === "reference" ||
  (d.type === "repeater" && d.fields.some((s) => s.type === "reference")) ||
  d.migration?.fromType === "reference";

/** True when some collection of the site holds or converts references (top-level or in items). */
export function definesReferences(site: Pick<Site, "collections">): boolean {
  return defsOf(site as Site).some(namesEntries);
}

/** Any field-operation marker on the site node. */
const hasMarker = (site: Site): boolean => defsOf(site).some((d) => d.migration !== undefined);

/** Per collection, the field keys the closure keeps (references and repeaters of either site). */
function keptKeys(sites: readonly Site[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const site of sites)
    for (const [c, col] of Object.entries(site.collections ?? {})) {
      const keys = out.get(c) ?? new Set<string>();
      for (const d of col?.fields ?? []) if (isReferenceFieldType(d.type)) keys.add(d.key);
      out.set(c, keys);
    }
  return out;
}

function slimmer(keys: Map<string, Set<string>>): (body: unknown) => Slim {
  return (body) => {
    const e = body as ContentEntry;
    const own = keys.get(e.collection);
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e.fields ?? {})) if (own?.has(k)) fields[k] = v;
    return {
      id: e.id,
      collection: e.collection,
      locale: e.locale,
      status: e.status,
      fields,
      ...(e.translation ? { translation: e.translation } : {}),
    };
  };
}

/** One snapshot's referrer index: names by entry, referrers and members by group. */
interface Index {
  readonly named: Map<string, Set<string>>;
  readonly referrers: Map<string, Set<string>>;
  readonly members: Map<string, Set<string>>;
  readonly groupOf: Map<string, string>;
}

function indexOf(site: Site, entries: readonly Slim[]): Index {
  const index: Index = {
    named: new Map(),
    referrers: new Map(),
    members: new Map(),
    groupOf: new Map(),
  };
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };
  const originalOf = originalsOf(entries as ContentEntry[]);
  for (const e of entries) {
    const g = memberGroup(e);
    index.groupOf.set(e.id, g);
    add(index.members, g, e.id);
    const names = new Set<string>();
    const original = originalOf(e as ContentEntry);
    for (const r of original ? [original, undefined] : [undefined])
      for (const f of Object.values(resolveFields(site, e, r)))
        if (isReferenceFieldType(f.def.type))
          for (const u of referenceUses(f.def, f.value, "")) names.add(u.groupId);
    index.named.set(e.id, names);
    for (const n of names) add(index.referrers, n, e.id);
  }
  return index;
}

/** Loads every entry body of both snapshots as `Slim`, by hash (see the module comment). */
async function slimBodies(
  input: ReferencePurgeInput,
  slim: (body: unknown) => Slim,
): Promise<Map<string, Slim>> {
  const { from, to, limits } = input;
  const read = input.reader.readSnapshotBundle?.bind(input.reader);
  if (!read) throw new Error("the snapshot reader cannot stream bodies");
  const maxNodes = limits?.maxNodes ?? DEFAULT_PURGE_MAX_NODES;
  // One byte total over the bundle and the node reads: nothing is parsed past it.
  const budget = {
    maxBytes: limits?.maxBodyBytes ?? DEFAULT_PURGE_MAX_BODY_BYTES,
    maxNodes,
    spent: { bytes: 0 },
    keep: (body: unknown, ref: NodeRef) => (ref.kind === "contentEntry" ? slim(body) : undefined),
  };
  const out = new Map<string, Slim>();
  const bundleOf = async (snapshot: Snapshot) => {
    if (limits?.unbundled?.has(snapshot.id)) return undefined;
    input.spend(bundleShardCount(snapshot));
    return read(snapshot, budget);
  };
  const bundle = (await bundleOf(to)) ?? (await bundleOf(from));
  for (const [hash, s] of bundle ?? []) out.set(hash, s as Slim);
  // The rest: bodies the planner already holds, then the missing hashes, read by this closure
  // alone (counted, budgeted, cut to `Slim`; never into the planner's cache of full bodies).
  const missing = new Map<string, NodeRef>();
  for (const snapshot of [from, to])
    for (const ref of snapshot.nodes) {
      if (ref.kind !== "contentEntry" || out.has(ref.hash) || missing.has(ref.hash)) continue;
      const held = input.cached(ref.hash);
      if (held !== undefined) out.set(ref.hash, slim(held));
      else missing.set(ref.hash, ref);
    }
  if (out.size + missing.size > maxNodes)
    throw new BundleBudgetError(`more than ${maxNodes} entries`);
  if (missing.size > 0) {
    input.spend(missing.size);
    const got = await read(to, { ...budget, only: [...missing.values()] });
    for (const [hash, s] of got ?? []) out.set(hash, s as Slim);
  }
  return out;
}

/**
 * Adds the referrer closure's node tags to `input.tags`; returns a reason to purge everything
 * instead, or undefined.
 */
export async function planReferencePurge(input: ReferencePurgeInput): Promise<string | undefined> {
  const { from, to, read, tags } = input;
  if (input.limits?.references === false) return undefined;
  const siteOf = (s: Snapshot) => {
    const ref = s.nodes.find((n) => n.kind === "site" && n.id === s.siteId);
    return ref ? read<Site>(ref) : Promise.resolve(undefined);
  };
  const [a, b] = await Promise.all([siteOf(from), siteOf(to)]);
  if (!a || !b) return "a snapshot has no site node";
  if (!definesReferences(a) && !definesReferences(b)) return undefined;
  if (hasMarker(a) || hasMarker(b)) return "a field operation is running in a published snapshot";
  // Nothing changed that a card shows: no entry and no shown asset (a term-only, asset-only or
  // site-only publish). The closure could add no tag, so it reads nothing.
  if (input.entries.length === 0 && input.reached.size === 0) return undefined;
  if (!input.reader.readSnapshotBundle) return "the snapshot reader cannot stream bodies";
  let bodies: Map<string, Slim>;
  try {
    bodies = await slimBodies(input, slimmer(keptKeys([a, b])));
  } catch (e) {
    if (e instanceof BundleBudgetError) return `the referrer closure is too large: ${e.message}`;
    throw e;
  }
  const entriesOf = (s: Snapshot) =>
    s.nodes.flatMap((n) => (n.kind === "contentEntry" ? [bodies.get(n.hash) as Slim] : []));
  const indexes = [indexOf(a, entriesOf(from)), indexOf(b, entriesOf(to))];
  const before = input.entries.length;
  const purge = (id: string) => tags.add(nodeCacheTag(id));
  const members = (g: string) => {
    for (const ix of indexes) for (const id of ix.members.get(g) ?? []) purge(id);
  };
  const referrersOf = (groups: Iterable<string>) => {
    const out = new Set<string>();
    for (const g of groups)
      for (const ix of indexes) for (const id of ix.referrers.get(g) ?? []) out.add(id);
    return out;
  };
  const groupsOf = (ids: Iterable<string>) => {
    const out = new Set<string>();
    for (const id of ids)
      for (const ix of indexes) {
        const g = ix.groupOf.get(id);
        if (g) out.add(g);
      }
    return out;
  };
  // 1. seeds
  const touched = new Set<string>(input.reached);
  for (const { before: x, after: y } of input.entries)
    for (const e of [x, y]) if (e) touched.add(e.id);
  const seeds = new Set<string>(groupsOf(touched));
  for (const { before: x, after: y } of input.entries)
    for (const e of [x, y]) if (e) seeds.add(memberGroup(e));
  for (const g of seeds) members(g);
  // 2. two hops: referrers of the seeds, then of their groups; each with its group's members
  const hop1 = referrersOf(seeds);
  const hop2 = referrersOf(groupsOf(hop1));
  for (const g of groupsOf([...hop1, ...hop2])) members(g);
  for (const id of [...hop1, ...hop2]) purge(id);
  // 3. "used by": the members of every group a touched entry names, before or after
  for (const id of touched)
    for (const ix of indexes) for (const g of ix.named.get(id) ?? []) members(g);
  input.why.push(
    `references: ${hop1.size + hop2.size} referrers of ${seeds.size} groups (${before} entries changed)`,
  );
  return undefined;
}
