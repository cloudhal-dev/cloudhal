/**
 * RFC-0033 §8: the coverage view's rows — one per work (an original page or article with its
 * translations), one cell per site language. A row needs work when a language has no version,
 * a version is out of date, or a machine translation waits for a person's review.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { collator } from "@cloudhal/messages/format";
import type { TranslationRow } from "./api/translations.ts";

export interface CoverageRow {
  group: string;
  kind: "page" | "contentEntry";
  /** The original's title. */
  title: string;
  /** The version in each site language, if any. */
  cells: Record<string, TranslationRow | undefined>;
  needsWork: boolean;
}

type Localized = Page | ContentEntry;

/** A node without a group shown as a group of one (an untranslated original). */
function single(n: Localized): TranslationRow {
  return {
    id: n.id,
    group: n.id,
    kind: "path" in n ? "page" : "contentEntry",
    siteId: n.siteId,
    locale: n.locale,
    status: n.status,
    rev: n.rev,
    stale: false,
    sourceMissing: false,
    reviewed: false,
    title: n.title,
    ...("path" in n ? { path: n.path } : { collection: n.collection, slug: n.slug }),
  };
}

export function coverageRows(input: {
  /** The Studio language: rows sort by title in its order. */
  uiLocale: string;
  locales: readonly string[];
  nodes: readonly Localized[];
  translations: readonly TranslationRow[];
}): CoverageRow[] {
  const { locales, nodes, translations } = input;
  const groups = new Map<string, TranslationRow[]>();
  for (const m of translations) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  for (const n of nodes) if (!n.translation) groups.set(n.id, [single(n)]);
  const rows: CoverageRow[] = [];
  for (const [group, members] of groups) {
    const original = members.find((m) => m.id === group) ?? members[0];
    if (!original) continue;
    const cells = Object.fromEntries(locales.map((l) => [l, members.find((m) => m.locale === l)]));
    const needsWork = locales.some((l) => {
      const m = cells[l];
      return !m || m.stale || m.sourceMissing || m.method === "machine";
    });
    rows.push({ group, kind: original.kind, title: original.title, cells, needsWork });
  }
  const order = collator(input.uiLocale);
  return rows.sort((a, b) => order.compare(a.title, b.title));
}
