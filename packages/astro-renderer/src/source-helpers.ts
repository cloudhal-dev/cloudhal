/** Small pure helpers of `source.ts`: ordering, visibility and filter compilation. */
import type { ContentEntry, Page, Taxonomy, Term } from "@cloudhal/core-contracts";
import { termName } from "@cloudhal/core-ts";
import { parseFilter, resolveFilter } from "@cloudhal/core-ts/filter";

export function byNewest(a: ContentEntry, b: ContentEntry): number {
  return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
}

export function byPosition(locale: string) {
  return (a: Term, b: Term) =>
    (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
    termName(a, locale).localeCompare(termName(b, locale)) ||
    a.slug.localeCompare(b.slug);
}

export function shown(term: Term, includeDrafts: boolean): boolean {
  return includeDrafts
    ? term.status !== "retired"
    : term.status === "active" && term.visibility === "public";
}

export function termFilter(key: string, slug: string, descendants: boolean): string {
  return `${key}:${slug}${descendants ? ">*" : ""}`;
}

/** Resolves a filter against a vocabulary; unknown terms match nothing and are logged. */
export function compile(filter: string, taxonomies: Taxonomy[], terms: Term[]) {
  const resolved = resolveFilter(
    parseFilter(filter),
    { taxonomies, terms },
    { unknown: "match-nothing" },
  );
  if (resolved.unknown.length > 0)
    console.warn(
      `cloudhal: filter "${filter}" names unknown terms: ${resolved.unknown.join(", ")}`,
    );
  return resolved;
}

export function visible<T extends { status: Page["status"] }>(
  nodes: T[],
  includeDrafts: boolean,
): T[] {
  return includeDrafts
    ? nodes.filter((n) => n.status !== "archived")
    : nodes.filter((n) => n.status === "published");
}
