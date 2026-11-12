/**
 * What a publish or rollback must purge from the edge cache (RFC-0002 §7, ADR-0012): the tags of
 * what changed between the previously live snapshot and the new one, so editing one article purges
 * that article and the lists it appears on, not the whole site.
 *
 * Rules (tags are defined in `cache-tags.ts`):
 * - a changed, added or removed **entry**: its node tag (its page, the archives and articles that
 *   list or link it), the site's list tag (site feed, sitemap, pages with a `ContentList`), and the
 *   list tag of every term it was or is filed under, with their ancestors (hierarchical archives
 *   list their sub-categories' entries);
 * - a **term** whose name, intro, image or SEO changed: its term tag and its ancestors' (every
 *   response that shows its name), and the site's list tag (the sitemap's `lastmod`, feed
 *   categories). Terms that are public in neither snapshot change nothing public;
 * - the **site tag** — everything — when the site node (other than its publish pointer), a page, a
 *   taxonomy or a redirect changed, when a public term was added, removed, renamed (slug), moved,
 *   re-ordered, retired or changed visibility, and when a top-level category gains its first or
 *   loses its last published entry (the header's category menu on every page changes). Redirects
 *   can affect any path, and new URLs may sit in shared navigation, so these purge the site.
 *
 * - an **asset** (RFC-0004 §7.4) that left the live snapshot or changed: its media URLs
 *   (`cloudhal-asset-<id>`), and — when it changed — the responses that show it: the node tag of
 *   every entry and page that refers to it (typed fields included, RFC-0045 §2.5), and the term tag
 *   of every term (archives, chips) that does (`cache-purge-assets.ts`). A newly added asset purges
 *   nothing (404s are never cached, and whatever starts showing it changed itself). Media never
 *   carry the site tag, so the site-wide purges above leave them.
 *
 * - RFC-0045 **references**: the referrers of every changed entry's group, two hops deep, and the
 *   targets a changed entry names ("used by"), found from the two snapshots' own bodies, never
 *   the working copy (`references/purge.ts`; one bundle, then only the missing hashes, within
 *   byte and node budgets). Any field-operation marker on either site node purges everything.
 *
 * Falls back to purging everything when there is no previous snapshot, a snapshot or node cannot
 * be read, reading the diff would take more than `maxReads` node reads, or the result has more
 * than `maxTags` tags.
 */
import type {
  ContentEntry,
  NodeRef,
  Site,
  Snapshot,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { planAssetPurge } from "./cache-purge-assets.ts";
import { listCacheTag, nodeCacheTag, siteCacheTag, termCacheTag } from "./cache-tags.ts";
import { canonicalJson } from "./hash.ts";
import {
  planReferencePurge,
  type ReferencePurgeLimits,
  type ReferencePurgeReader,
} from "./references/purge.ts";

export interface SnapshotReader extends ReferencePurgeReader {
  getSnapshot(id: string): Promise<Snapshot | undefined>;
  readSnapshotNode(ref: NodeRef): Promise<unknown>;
}

export interface CachePurgeOptions extends ReferencePurgeLimits {
  /** More tags than this purge everything instead (default 300: three requests of 100). */
  readonly maxTags?: number;
  /** More node reads than this purge everything instead (default 2000). */
  readonly maxReads?: number;
}

export type CachePurgePlan =
  | {
      readonly mode: "tags";
      /** Deduplicated; empty when the two snapshots render the same site. */
      readonly tags: readonly string[];
      /** One line per rule that fired, for logs. */
      readonly why: readonly string[];
    }
  | { readonly mode: "everything"; readonly reason: string };

export const DEFAULT_PURGE_MAX_TAGS = 300;
export const DEFAULT_PURGE_MAX_READS = 2000;

/** Fields of a term that decide URLs, navigation or whether it is public at all. */
const STRUCTURAL_TERM_FIELDS = [
  "slug",
  "status",
  "visibility",
  "parentId",
  "taxonomyId",
  "mergedInto",
  "position",
] as const;

class TooManyReads extends Error {}

const isPublic = (t: Term | undefined): t is Term =>
  t !== undefined && t.status === "active" && t.visibility === "public";

/** The site node without what publishing itself rewrites (pointer, revision, timestamp). */
function siteContent(site: Site): string {
  const { publishedSnapshotId: _p, rev: _r, updatedAt: _u, ...rest } = site;
  return canonicalJson(rest);
}

function sameField(a: unknown, b: unknown): boolean {
  return canonicalJson(a ?? null) === canonicalJson(b ?? null);
}

/** Term ids an entry is filed under, every taxonomy. */
function filedUnder(e: ContentEntry | undefined): string[] {
  if (!e?.terms) return [];
  return Object.values(e.terms).flatMap((a) => a?.ids ?? []);
}

type Change = { before?: NodeRef; after?: NodeRef };

/** The planner's one hash-keyed body cache; reads past `maxReads` (bundle shards too) throw. */
function countedReader(reader: SnapshotReader, maxReads: number) {
  let reads = 0;
  const bodies = new Map<string, unknown>();
  const spend = (n: number) => {
    reads += n;
    if (reads > maxReads) throw new TooManyReads();
  };
  const read = async <T>(ref: NodeRef): Promise<T> => {
    const hit = bodies.get(ref.hash);
    if (hit !== undefined) return hit as T;
    spend(1);
    const body = (await reader.readSnapshotNode(ref)) as T;
    bodies.set(ref.hash, body);
    return body;
  };
  return { read, spend, cached: (hash: string) => bodies.get(hash) };
}

/** Both snapshots' vocabularies, and a term with its ancestors in either (archives follow parents). */
async function ancestry(
  before: Map<string, NodeRef>,
  after: Map<string, NodeRef>,
  read: <T>(ref: NodeRef) => Promise<T>,
) {
  const termsOf = async (refs: Map<string, NodeRef>) => {
    const out = new Map<string, Term>();
    for (const ref of refs.values())
      if (ref.kind === "term") out.set(ref.id, await read<Term>(ref));
    return out;
  };
  const oldTerms = await termsOf(before);
  const newTerms = await termsOf(after);
  const withAncestors = (id: string): string[] => {
    const out = new Set<string>();
    for (const terms of [oldTerms, newTerms]) {
      let cursor: string | undefined = id;
      while (cursor && !out.has(cursor)) {
        out.add(cursor);
        cursor = terms.get(cursor)?.parentId;
      }
    }
    return [...out];
  };
  return { oldTerms, newTerms, withAncestors };
}

/** The nodes of both snapshots by id, and every node that differs between them. */
function diffNodes(from: Snapshot, to: Snapshot) {
  const before = new Map(from.nodes.map((n) => [n.id, n]));
  const after = new Map(to.nodes.map((n) => [n.id, n]));
  const changed: Change[] = [];
  for (const [id, ref] of after) {
    const prev = before.get(id);
    if (!prev || prev.hash !== ref.hash)
      changed.push({ ...(prev ? { before: prev } : {}), after: ref });
  }
  for (const [id, ref] of before) if (!after.has(id)) changed.push({ before: ref });
  return { before, after, changed };
}

export async function planCachePurge(
  reader: SnapshotReader,
  fromId: string | undefined,
  toId: string | undefined,
  options: CachePurgeOptions = {},
): Promise<CachePurgePlan> {
  const maxTags = options.maxTags ?? DEFAULT_PURGE_MAX_TAGS;
  const maxReads = options.maxReads ?? DEFAULT_PURGE_MAX_READS;
  if (!fromId) return { mode: "everything", reason: "no previously published snapshot" };
  if (!toId) return { mode: "everything", reason: "the site is no longer published" };
  if (fromId === toId) return { mode: "tags", tags: [], why: [] };
  const [from, to] = await Promise.all([reader.getSnapshot(fromId), reader.getSnapshot(toId)]);
  if (!from) return { mode: "everything", reason: `snapshot ${fromId} not found` };
  if (!to) return { mode: "everything", reason: `snapshot ${toId} not found` };
  if (from.siteId !== to.siteId) return { mode: "everything", reason: "different sites" };

  const { read, spend, cached } = countedReader(reader, maxReads);

  try {
    return await plan();
  } catch (e) {
    if (e instanceof TooManyReads)
      return { mode: "everything", reason: `the diff needs more than ${maxReads} node reads` };
    return {
      mode: "everything",
      reason: `could not read the diff: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  async function plan(): Promise<CachePurgePlan> {
    const site = siteCacheTag(to?.siteId as string);
    const wholeSite = (why: string): CachePurgePlan => ({ mode: "tags", tags: [site], why: [why] });
    const { before, after, changed } = diffNodes(from as Snapshot, to as Snapshot);
    if (changed.length === 0) return { mode: "tags", tags: [], why: [] };

    // Structure first: no node body needs reading to know these purge the site.
    for (const c of changed) {
      const kind = (c.after ?? c.before)?.kind;
      if (kind === "asset") continue; // handled below; never the site tag
      // A menu is rendered on every page (RFC-0003), like pages, taxonomies and redirects.
      if (kind === "page" || kind === "taxonomy" || kind === "redirect" || kind === "menu")
        return wholeSite(`a ${kind} changed (${(c.after ?? c.before)?.id})`);
      if (kind !== "site" && kind !== "contentEntry" && kind !== "term")
        return wholeSite(`unknown node kind ${kind}`);
    }
    const siteChange = changed.find((c) => (c.after ?? c.before)?.kind === "site");
    if (siteChange) {
      if (!siteChange.before || !siteChange.after) return wholeSite("the site node changed");
      const [a, b] = await Promise.all([
        read<Site>(siteChange.before),
        read<Site>(siteChange.after),
      ]);
      if (siteContent(a) !== siteContent(b))
        return wholeSite("the site settings or navigation changed");
    }

    const entryChanges = changed.filter((c) => (c.after ?? c.before)?.kind === "contentEntry");
    const termChanges = changed.filter((c) => (c.after ?? c.before)?.kind === "term");
    const { oldTerms, newTerms, withAncestors } = await ancestry(before, after, read);

    const tags = new Set<string>();
    const why: string[] = [];

    // Media (§7.4): an asset that left the live snapshot or changed (`cache-purge-assets.ts`).
    const reached = await planAssetPurge({
      changed,
      to: to as Snapshot,
      read,
      withAncestors,
      tags,
      why,
    });

    for (const c of termChanges) {
      const a = c.before ? await read<Term>(c.before) : undefined;
      const b = c.after ? await read<Term>(c.after) : undefined;
      if (!isPublic(a) && !isPublic(b)) continue;
      if (!a || !b || STRUCTURAL_TERM_FIELDS.some((f) => !sameField(a[f], b[f])))
        return wholeSite(`public term ${(b ?? a)?.id} was added, removed, moved or re-addressed`);
      for (const id of withAncestors(b.id)) tags.add(termCacheTag(id));
      tags.add(listCacheTag(to?.siteId as string));
      why.push(`term ${b.id}: its name or presentation changed`);
    }

    const entries: Array<{ before?: ContentEntry; after?: ContentEntry }> = [];
    for (const c of entryChanges) {
      const a = c.before ? await read<ContentEntry>(c.before) : undefined;
      const b = c.after ? await read<ContentEntry>(c.after) : undefined;
      entries.push({ ...(a ? { before: a } : {}), ...(b ? { after: b } : {}) });
      const id = (b ?? a)?.id as string;
      tags.add(nodeCacheTag(id));
      tags.add(listCacheTag(to?.siteId as string));
      for (const t of new Set([...filedUnder(a), ...filedUnder(b)]))
        for (const x of withAncestors(t)) tags.add(listCacheTag(x));
      why.push(`entry ${id}`);
    }

    // The header lists top-level categories that have a published entry (in the default locale).
    // A change that gives one its first entry or takes its last one changes every page.
    if (entries.length > 0) {
      const flip = await headerFlip(entries, oldTerms, newTerms);
      if (flip) return wholeSite(flip);
    }

    // RFC-0045: the referrer closure, from the two snapshots' bodies (`references/purge.ts`).
    const all = await planReferencePurge({
      ...{ reader, read, cached, spend, limits: options, entries, reached, tags, why },
      ...{ from: from as Snapshot, to: to as Snapshot },
    });
    if (all) return { mode: "everything", reason: all };
    if (tags.size > maxTags)
      return { mode: "everything", reason: `${tags.size} tags (more than ${maxTags})` };
    return { mode: "tags", tags: [...tags], why };
  }

  async function headerFlip(
    entries: Array<{ before?: ContentEntry; after?: ContentEntry }>,
    oldTerms: Map<string, Term>,
    newTerms: Map<string, Term>,
  ): Promise<string | undefined> {
    const afterRefs = (to as Snapshot).nodes;
    const siteRef = afterRefs.find((n) => n.kind === "site");
    const locale = siteRef ? (await read<Site>(siteRef)).defaultLocale : undefined;
    const taxonomies = new Map<string, Taxonomy>();
    for (const ref of afterRefs)
      if (ref.kind === "taxonomy") {
        const t = await read<Taxonomy>(ref);
        taxonomies.set(t.id, t);
      }
    const rootOf = (id: string, terms: Map<string, Term>): Term | undefined => {
      let t = terms.get(id);
      const seen = new Set<string>();
      while (t?.parentId && !seen.has(t.id)) {
        seen.add(t.id);
        t = terms.get(t.parentId);
      }
      return t;
    };
    /** Public top-level terms of hierarchical taxonomies with archives: what a header can list. */
    const navRoot = (t: Term | undefined): t is Term => {
      const tax = t ? taxonomies.get(t.taxonomyId) : undefined;
      return isPublic(t) && !t.parentId && tax?.hierarchical === true && tax.archive.enabled;
    };
    const counted = (e: ContentEntry | undefined): e is ContentEntry =>
      e !== undefined && e.status === "published" && (locale === undefined || e.locale === locale);
    const roots = (e: ContentEntry | undefined, terms: Map<string, Term>) =>
      new Set(
        filedUnder(e)
          .map((id) => rootOf(id, terms))
          .filter(navRoot)
          .map((t) => t.id),
      );

    const affected = new Set<string>();
    const oldHas = new Set<string>();
    const newHas = new Set<string>();
    for (const { before, after } of entries) {
      for (const r of roots(before, oldTerms)) {
        affected.add(r);
        if (counted(before)) oldHas.add(r);
      }
      for (const r of roots(after, newTerms)) {
        affected.add(r);
        if (counted(after)) newHas.add(r);
      }
    }
    const open = [...affected].filter((r) => oldHas.has(r) !== newHas.has(r));
    if (open.length === 0) return undefined;
    // Only the changed entries disagree: an unchanged published entry under the same category
    // keeps it in the menu in both snapshots. Read unchanged entries until each is settled.
    const changedIds = new Set(entries.map((e) => (e.after ?? e.before)?.id));
    const unsettled = new Set(open);
    for (const ref of afterRefs) {
      if (unsettled.size === 0) return undefined;
      if (ref.kind !== "contentEntry" || changedIds.has(ref.id)) continue;
      const e = await read<ContentEntry>(ref);
      if (!counted(e)) continue;
      for (const r of roots(e, newTerms)) unsettled.delete(r);
    }
    return unsettled.size > 0
      ? `top-level ${[...unsettled].join(", ")} gained its first or lost its last published entry`
      : undefined;
  }
}
