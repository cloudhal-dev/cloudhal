/**
 * RFC-0045 §4 in the renderer: reference cards, and the indexes both sources answer
 * `groupMembers` and `referencedBy` from.
 *
 * - **Cards** (`referenceCards`): breadth-first over the groups a page's values name, one
 *   `groupMembers` call per level (the live source: one store read; the snapshot: none). The member
 *   shown is `pickMember`'s, among the members the source's *view* shows (gates applied at its
 *   instant). Depth 1 (default) yields cards; depth 2 adds each card's own fields, whose references
 *   are cards without fields. Groups are fetched once (the visited set), so cycles cost nothing.
 *   Every card spends one of the request's 200 targets (`PlaceholderBudget.references`); past it
 *   the rest resolve to nothing, with one `console.warn` per request.
 * - **Indexes** (`ReferenceIndex`, snapshot only): members by group and referrers by group over the
 *   snapshot's published entries, gate-independent and built once per snapshot and isolate; every
 *   lookup then filters through the asking view.
 * - **`referencedBy`** equals the resolved values: a referrer is an entry whose `resolveFields`
 *   (with its published same-site original) names the group. The live source finds candidates in
 *   `entry_refs` and resolves them the same way (`referrerRecords`), so both answer alike.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  isReferenceFieldType,
  membersByGroup,
  originalsOf,
  pickMember,
  type ReferenceUse,
  type ResolvedFields,
  referenceUses,
  resolveFields,
} from "@cloudhal/core-ts/fields";
import { itemUrl } from "@cloudhal/core-ts/locale-paths";
import type { FieldImage, FieldsSource, RenderedFields } from "./fields.ts";
import { type PlaceholderBudget, REFERENCE_BUDGET } from "./media.ts";
import { conversionsFor } from "./reference-conversions.ts";
import { byNewest } from "./source-helpers.ts";

/** A referenced entry as a theme draws it: a card of the member the page's view shows. */
export interface ReferencedEntry {
  /** The translation group the value names. */
  groupId: string;
  id: string;
  collection: string;
  locale: string;
  slug: string;
  title: string;
  summary?: string;
  /** The member's public URL (its locale's path, or its locale's own domain). */
  url: string;
  /** The member's cover image, when the view shows its asset. */
  image?: FieldImage;
  /** The member is the default locale's, shown under `default-with-notice`: set `lang` on it. */
  fromFallbackLocale: boolean;
  /** Present only at depth 2: the member's own fields, its references as cards without fields. */
  fields?: RenderedFields;
}

/** `referencedBy`'s filters. */
export interface ReferencedByQuery {
  collection?: string;
  /** The referrer's top-level field key (`venue`, `speakers`). */
  field?: string;
  locale?: string;
  /** At most 100 (the default). */
  limit?: number;
}

export const REFERENCED_BY_LIMIT = 100;

/** What `referenceCards` needs from `entryFields`: the page, its budget and its media. */
export interface CardInput {
  readonly source: FieldsSource;
  readonly site: Site;
  /** The page's locale: the member shown is in it, else (with `default-with-notice`) the default. */
  readonly locale: string;
  readonly depth: 1 | 2;
  readonly budget: PlaceholderBudget;
  /** The member's cover through the view's assets, or none. */
  readonly cover: (member: ContentEntry) => Promise<FieldImage | undefined>;
  /** Renders a level-2 member's fields with its own references' cards. */
  readonly render: (
    resolved: ResolvedFields,
    cards: ReadonlyMap<string, ReferencedEntry>,
  ) => Promise<RenderedFields>;
}

/** The reference values under resolved fields, top-level and inside repeater items, in order. */
export function usesOf(resolved: ResolvedFields): ReferenceUse[] {
  return Object.entries(resolved).flatMap(([key, f]) =>
    isReferenceFieldType(f.def.type) ? referenceUses(f.def, f.value, `fields/${key}`) : [],
  );
}

/** One target spent; false (logged once per budget) when none are left. */
function spend(budget: PlaceholderBudget): boolean {
  budget.references ??= REFERENCE_BUDGET;
  if (budget.references > 0) {
    budget.references--;
    return true;
  }
  if (!budget.referencesWarned) {
    budget.referencesWarned = true;
    console.warn(
      `cloudhal: more than ${REFERENCE_BUDGET} reference targets on one page; the rest render nothing`,
    );
  }
  return false;
}

interface Level {
  readonly input: CardInput;
  /** The members of every group fetched so far (the visited set). */
  readonly members: Map<string, ContentEntry[]>;
}

/** Fetches the groups not fetched yet, in one `groupMembers` call. */
async function visit(level: Level, uses: readonly ReferenceUse[]): Promise<void> {
  const missing = [...new Set(uses.map((u) => u.groupId))].filter((g) => !level.members.has(g));
  const groupMembers = level.input.source.groupMembers;
  if (missing.length === 0 || !groupMembers) return;
  const got = await groupMembers.call(level.input.source, missing);
  for (const g of missing) level.members.set(g, got.get(g) ?? []);
}

type Picked = { use: ReferenceUse; member: ContentEntry; card: ReferencedEntry };

/** The cards of `uses` (spending the budget in order); unresolved uses get none. */
async function cardsOf(level: Level, uses: readonly ReferenceUse[]): Promise<Picked[]> {
  const { site, locale, budget, cover } = level.input;
  const out: Picked[] = [];
  for (const use of uses) {
    const picked = pickMember(use.groupId, level.members.get(use.groupId) ?? [], {
      locale,
      defaultLocale: site.defaultLocale,
      fallback: site.localization?.fallback,
      collections: use.collections,
    });
    if (!picked || !spend(budget)) continue;
    const m = picked.member;
    const image = await cover(m);
    const card: ReferencedEntry = {
      groupId: use.groupId,
      id: m.id,
      collection: m.collection,
      locale: m.locale,
      slug: m.slug,
      title: m.title,
      ...(m.summary ? { summary: m.summary } : {}),
      url: itemUrl(site, undefined, m),
      ...(image ? { image } : {}),
      fromFallbackLocale: picked.fromFallbackLocale,
    };
    out.push({ use, member: m, card });
  }
  return out;
}

/** A member's same-site original among the members the view shows (RFC-0041 §5). */
function originalIn(level: Level, member: ContentEntry): ContentEntry | undefined {
  const g = member.translation?.group;
  if (!g || g === member.id || member.translation?.source?.siteId !== undefined) return undefined;
  return level.members.get(g)?.find((m) => m.id === g);
}

/**
 * The cards of an entry's resolved values, by value path (`fields/venue`, `fields/speakers/0/
 * person`). Without `groupMembers` (sources from before RFC-0045) nothing resolves.
 */
export async function referenceCards(
  input: CardInput,
  resolved: ResolvedFields,
): Promise<Map<string, ReferencedEntry>> {
  const out = new Map<string, ReferencedEntry>();
  const uses = usesOf(resolved);
  if (uses.length === 0 || !input.source.groupMembers) return out;
  const level: Level = { input, members: new Map() };
  await visit(level, uses);
  const first = await cardsOf(level, uses);
  for (const p of first) out.set(p.use.path, p.card);
  if (input.depth !== 2 || first.length === 0) return out;
  // Level 2: each shown member's own fields, its references as cards without fields.
  const members = [...new Map(first.map((p) => [p.member.id, p.member])).values()];
  const resolvedOf = new Map<string, ResolvedFields>();
  for (const m of members) {
    const entries = await conversionsFor(input.source, input.site, m.collection);
    const r = resolveFields(input.site, m, originalIn(level, m), entries ? { entries } : undefined);
    resolvedOf.set(m.id, r);
  }
  await visit(level, [...resolvedOf.values()].flatMap(usesOf));
  const fieldsOf = new Map<string, RenderedFields>();
  for (const m of members) {
    const r = resolvedOf.get(m.id) ?? {};
    const inner = await cardsOf(level, usesOf(r));
    fieldsOf.set(m.id, await input.render(r, new Map(inner.map((p) => [p.use.path, p.card]))));
  }
  for (const p of first) {
    const fields = fieldsOf.get(p.member.id);
    if (fields) p.card.fields = fields;
  }
  return out;
}

/** One referrer of a group: the entry and the field whose resolved value names it. */
export interface Referrer {
  readonly entry: ContentEntry;
  /** The top-level field key. */
  readonly field: string;
  /** Set when the value came from the entry's original (which the view must show too). */
  readonly viaOriginal?: string;
}

/**
 * Referrers by group from `entries`' resolved values (`resolveFields` with `originalOf`); with
 * `only`, just that group's. The snapshot index and the live source share it.
 */
export function referrerRecords(
  site: Site,
  entries: readonly ContentEntry[],
  originalOf: (e: ContentEntry) => ContentEntry | undefined,
  only?: string,
): Map<string, Referrer[]> {
  const out = new Map<string, Referrer[]>();
  for (const entry of entries)
    for (const [key, f] of Object.entries(resolveFields(site, entry, originalOf(entry)))) {
      if (!isReferenceFieldType(f.def.type)) continue;
      const via = f.fromOriginal ? entry.translation?.group : undefined;
      for (const g of new Set(referenceUses(f.def, f.value, "").map((u) => u.groupId))) {
        if (only !== undefined && g !== only) continue;
        const list = out.get(g) ?? [];
        list.push({ entry, field: key, ...(via ? { viaOriginal: via } : {}) });
        out.set(g, list);
      }
    }
  return out;
}

const idSets = new WeakMap<readonly ContentEntry[], ReadonlySet<string>>();
/** The ids of a view's entry list, built once per list. */
function idsOf(list: readonly ContentEntry[]): ReadonlySet<string> {
  let ids = idSets.get(list);
  if (!ids) {
    ids = new Set(list.map((e) => e.id));
    idSets.set(list, ids);
  }
  return ids;
}

/** What a view shows: `listed` for "used by" lists, `reachable` for resolution and originals. */
export interface ReferenceView {
  readonly listed: readonly ContentEntry[];
  readonly reachable: readonly ContentEntry[];
}

/** `referencedBy` over records: shown referrers, filtered, newest first, at most 100. */
export function referrersIn(
  records: readonly Referrer[],
  q: ReferencedByQuery,
  view: ReferenceView,
): ContentEntry[] {
  const listed = idsOf(view.listed);
  const reachable = idsOf(view.reachable);
  const out = new Map<string, ContentEntry>();
  for (const r of records) {
    const e = r.entry;
    if (q.collection !== undefined && e.collection !== q.collection) continue;
    if (q.field !== undefined && r.field !== q.field) continue;
    if (q.locale !== undefined && e.locale !== q.locale) continue;
    if (!listed.has(e.id) || (r.viaOriginal !== undefined && !reachable.has(r.viaOriginal)))
      continue;
    out.set(e.id, e);
  }
  const limit = Math.max(0, Math.min(q.limit ?? REFERENCED_BY_LIMIT, REFERENCED_BY_LIMIT));
  return [...out.values()].sort(byNewest).slice(0, limit);
}

/** The members of `ids` among a view's reachable entries (every id gets a list). */
export function membersIn(
  all: ReadonlyMap<string, readonly ContentEntry[]>,
  ids: readonly string[],
  view: ReferenceView,
): Map<string, ContentEntry[]> {
  const reachable = idsOf(view.reachable);
  return new Map(ids.map((g) => [g, (all.get(g) ?? []).filter((m) => reachable.has(m.id))]));
}

/** A snapshot's gate-independent indexes over its published entries, each built on first use. */
export class ReferenceIndex {
  readonly #site: Site;
  readonly #published: readonly ContentEntry[];
  #members: Map<string, ContentEntry[]> | undefined;
  #referrers: Map<string, Referrer[]> | undefined;

  constructor(site: Site, published: readonly ContentEntry[]) {
    this.#site = site;
    this.#published = published;
  }

  members(): ReadonlyMap<string, readonly ContentEntry[]> {
    this.#members ??= membersByGroup(this.#published);
    return this.#members;
  }

  referrers(group: string): readonly Referrer[] {
    this.#referrers ??= referrerRecords(this.#site, this.#published, originalsOf(this.#published));
    return this.#referrers.get(group) ?? [];
  }
}
