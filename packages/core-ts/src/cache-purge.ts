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
 *   every entry and page that refers to it, and the term tag of every term (archives, chips) that
 *   does. A newly added asset purges nothing (404s are never cached, and whatever starts showing
 *   it changed itself). Media never carry the site tag, so the site-wide purges above leave them.
 *
 * Falls back to purging everything when there is no previous snapshot, a snapshot or node cannot
 * be read, reading the diff would take more than `maxReads` node reads, or the result has more
 * than `maxTags` tags.
 */
import type {
  Asset,
  ContentEntry,
  NodeRef,
  Site,
  Snapshot,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import {
  assetCacheTag,
  listCacheTag,
  nodeCacheTag,
  siteCacheTag,
  termCacheTag,
} from "./cache-tags.ts";
import { canonicalJson } from "./hash.ts";
import { assetRefsOf } from "./media/refs.ts";

export interface SnapshotReader {
  getSnapshot(id: string): Promise<Snapshot | undefined>;
  readSnapshotNode(ref: NodeRef): Promise<unknown>;
}

export interface CachePurgeOptions {
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

  let reads = 0;
  const bodies = new Map<string, unknown>();
  const read = async <T>(ref: NodeRef): Promise<T> => {
    const hit = bodies.get(ref.hash);
    if (hit !== undefined) return hit as T;
    if (++reads > maxReads) throw new TooManyReads();
    const body = (await reader.readSnapshotNode(ref)) as T;
    bodies.set(ref.hash, body);
    return body;
  };

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
    const before = new Map((from as Snapshot).nodes.map((n) => [n.id, n]));
    const after = new Map((to as Snapshot).nodes.map((n) => [n.id, n]));
    const changed: Array<{ before?: NodeRef; after?: NodeRef }> = [];
    for (const [id, ref] of after) {
      const prev = before.get(id);
      if (!prev || prev.hash !== ref.hash)
        changed.push({ ...(prev ? { before: prev } : {}), after: ref });
    }
    for (const [id, ref] of before) if (!after.has(id)) changed.push({ before: ref });
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

    // The vocabulary of both snapshots, for ancestors (archives and breadcrumbs follow parents).
    const termsOf = async (refs: Map<string, NodeRef>) => {
      const out = new Map<string, Term>();
      for (const ref of refs.values())
        if (ref.kind === "term") out.set(ref.id, await read<Term>(ref));
      return out;
    };
    const entryChanges = changed.filter((c) => (c.after ?? c.before)?.kind === "contentEntry");
    const termChanges = changed.filter((c) => (c.after ?? c.before)?.kind === "term");
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

    const tags = new Set<string>();
    const why: string[] = [];

    // Media: an asset that left the live snapshot or changed (§7.4). Its own URLs, and the
    // responses that show it (they resolve its URL, alt, caption and size when they render).
    const assetChanges = changed.filter((c) => (c.after ?? c.before)?.kind === "asset" && c.before);
    if (assetChanges.length > 0) {
      const shown = new Set<string>();
      for (const c of assetChanges) {
        const id = (c.before as NodeRef).id;
        tags.add(assetCacheTag(id));
        if (!c.after) {
          why.push(`asset ${id} was removed`);
          continue;
        }
        const [a, b] = await Promise.all([read<Asset>(c.before as NodeRef), read<Asset>(c.after)]);
        if (a.slug !== b.slug || a.status !== b.status) why.push(`asset ${id}: slug or status changed`);
        else why.push(`asset ${id} changed`);
        shown.add(id);
      }
      if (shown.size > 0)
        for (const ref of (to as Snapshot).nodes) {
          if (ref.kind !== "contentEntry" && ref.kind !== "page" && ref.kind !== "term") continue;
          const body = await read<unknown>(ref);
          if (!assetRefsOf(ref.kind, body).some((r) => shown.has(r.assetId))) continue;
          if (ref.kind === "term")
            for (const id of withAncestors(ref.id)) tags.add(termCacheTag(id));
          else tags.add(nodeCacheTag(ref.id));
        }
    }

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
