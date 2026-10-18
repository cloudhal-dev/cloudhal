/**
 * RFC-0033 / ADR-0035: the language versions of a page or entry. Each translation is its own node
 * that names its group (the original's id) and the source revision it was made from; staleness is
 * computed from the source's current hash, never stored. Write checks (invariants 1–6) and the
 * group read live here; the unique index `nodes_translation_locale` backs "one node per locale".
 */
import type { ContentEntry, Page, Site, TranslationMethod } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { InvariantError } from "../errors.ts";
import type { SiteGraphStore } from "../store.ts";

type Localized = Page | ContentEntry;
type LocalizedKind = "page" | "contentEntry";

/** One language version in a group, as Studio and agents see it. */
export interface TranslationMember {
  id: string;
  kind: LocalizedKind;
  siteId: string;
  locale: string;
  status: Localized["status"];
  /** `original` for the group's source; absent when the node has no `translation` (an unlinked original). */
  method?: TranslationMethod;
  layout?: "linked" | "independent";
  /** The node's current content hash: what a new translation records as `source.hash`. */
  hash: string;
  rev: number;
  /** The source changed since this translation was made (its hash differs from `source.hash`). */
  stale: boolean;
  /** The recorded source no longer exists. */
  sourceMissing: boolean;
  reviewed: boolean;
}

export interface TranslationGroup {
  group: string;
  members: TranslationMember[];
}

/** The collection a review rule names: an entry's collection, `pages` for pages. */
function collectionOf(kind: LocalizedKind, node: Localized): string {
  return kind === "page" ? "pages" : (node as ContentEntry).collection;
}

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new InvariantError("invalid_translation", message, details);
}

/** Invariants 1, 4–6 that need only the node and its site. */
export function checkLocalizedNode(kind: LocalizedKind, site: Site, node: Localized): void {
  if (!site.locales.includes(node.locale))
    throw new InvariantError(
      "locale_not_enabled",
      `${node.locale} is not one of the site's locales (${site.locales.join(", ")}); add it to the site first`,
      { locale: node.locale, locales: site.locales },
    );
  const t = node.translation;
  if (!t) return;
  if (t.method === "original") {
    if (t.group !== node.id) fail("an original's translation.group is its own id");
    if (t.source) fail("an original has no translation.source");
  } else {
    if (t.group === node.id) fail("only the original's group is its own id");
    if (!t.source)
      fail("a translation names the node and revision it was made from (translation.source)");
    if (t.source.id === node.id) fail("a translation cannot be its own source");
    if (t.source.locale === node.locale)
      fail("a translation's locale differs from its source's", { locale: node.locale });
  }
  const machine = t.method === "machine" || t.method === "machine-reviewed";
  if (machine && !t.provenance)
    fail("a machine translation keeps its provenance (engine, checks, score)");
  if (t.method === "machine-reviewed" && !t.review)
    fail("machine-reviewed needs review: who reviewed it and when");
  if (t.method === "machine" && t.review)
    fail("a reviewed machine translation is machine-reviewed");
  if (t.review && t.review.by.kind !== "human")
    fail("only a person reviews a translation", { by: t.review.by.kind });
  if (
    node.status === "published" &&
    t.method === "machine" &&
    t.provenance?.checks?.some((c) => c.startsWith("!"))
  )
    fail("a machine translation with failing checks is fixed before it is published", {
      checks: t.provenance.checks,
    });
  const required = site.localization?.review?.required ?? [];
  if (
    node.status === "published" &&
    t.method === "machine" &&
    required.includes(collectionOf(kind, node))
  )
    throw new InvariantError(
      "review_required",
      `machine translations in ${collectionOf(kind, node)} are published only after a person reviews them`,
      { collection: collectionOf(kind, node) },
    );
}

/** Invariants 2–3 that read the graph: the source exists, belongs to the group, stays in the project; one node per locale. */
export async function checkTranslationLinks(
  { graph, sql }: { graph: SiteGraphStore; sql: SqlDriver },
  write: { kind: LocalizedKind; site: Site; node: Localized; stored?: Localized | undefined },
): Promise<void> {
  const { kind, site, node, stored } = write;
  const t = node.translation;
  if (!t) return;
  const source = t.source;
  const before = stored?.translation;
  const sourceChanged =
    source !== undefined &&
    (before?.source?.id !== source.id || before.source.siteId !== source.siteId);
  if (source && sourceChanged) {
    const sourceSiteId = source.siteId ?? site.id;
    if (sourceSiteId !== site.id) {
      const other = await graph.getSite(sourceSiteId);
      if (!other || other.projectId !== site.projectId)
        fail("a translation's source is in this site or another site of the same project", {
          siteId: sourceSiteId,
        });
    }
    const row = await sql.get<{ body: string; site_id: string }>(
      "SELECT body, site_id FROM nodes WHERE id = ? AND kind = ?",
      [source.id, kind],
    );
    if (!row || row.site_id !== sourceSiteId)
      fail(`the source ${kind} ${source.id} does not exist`, { sourceId: source.id });
    const src = JSON.parse(row.body) as Localized;
    if (src.locale !== source.locale)
      fail(`the source is in ${src.locale}, not ${source.locale}`, { sourceId: source.id });
    if ((src.translation?.group ?? src.id) !== t.group)
      fail("translation.group is the source's group (its original's id)", { group: t.group });
  }
  if (before?.group === t.group && stored?.locale === node.locale) return;
  const taken = await sql.get<{ id: string }>(
    `SELECT id FROM nodes WHERE site_id = ? AND kind = ? AND id != ?
       AND json_extract(body, '$.translation.group') = ? AND json_extract(body, '$.locale') = ?`,
    [site.id, kind, node.id, t.group, node.locale],
  );
  if (taken)
    throw new InvariantError(
      "translation_exists",
      `the group already has a ${node.locale} version (${taken.id}); update that one instead`,
      { id: taken.id, locale: node.locale },
    );
}

/** Every language version of `group` across the sites of `site`'s project, with staleness. */
export async function readTranslationGroup(
  graph: SiteGraphStore,
  sql: SqlDriver,
  site: Site,
  group: string,
): Promise<TranslationGroup> {
  const siteIds = (await graph.listSites(site.projectId)).map((s) => s.id);
  if (!siteIds.includes(site.id)) siteIds.push(site.id);
  const rows = await sql.all<{
    id: string;
    kind: string;
    site_id: string;
    hash: string;
    body: string;
  }>(
    `SELECT id, kind, site_id, hash, body FROM nodes
      WHERE kind IN ('page', 'contentEntry') AND site_id IN (${siteIds.map(() => "?").join(", ")})
        AND (id = ? OR json_extract(body, '$.translation.group') = ?)`,
    [...siteIds, group, group],
  );
  const hashes = new Map(rows.map((r) => [r.id, r.hash]));
  const missing = rows
    .map((r) => (JSON.parse(r.body) as Localized).translation?.source?.id)
    .filter((id): id is string => id !== undefined && !hashes.has(id));
  for (const id of new Set(missing)) {
    const row = await sql.get<{ hash: string }>("SELECT hash FROM nodes WHERE id = ?", [id]);
    if (row) hashes.set(id, row.hash);
  }
  const members = rows.map((r): TranslationMember => {
    const node = JSON.parse(r.body) as Localized;
    const t = node.translation;
    const current = t?.source ? hashes.get(t.source.id) : undefined;
    return {
      id: node.id,
      kind: r.kind as LocalizedKind,
      siteId: r.site_id,
      locale: node.locale,
      status: node.status,
      ...(t ? { method: t.method } : {}),
      ...(t?.layout ? { layout: t.layout } : {}),
      hash: r.hash,
      rev: node.rev,
      stale: t?.source !== undefined && current !== undefined && current !== t.source.hash,
      sourceMissing: t?.source !== undefined && current === undefined,
      reviewed: t?.review !== undefined,
    };
  });
  members.sort((a, b) =>
    a.id === group ? -1 : b.id === group ? 1 : a.locale.localeCompare(b.locale),
  );
  return { group, members };
}
