/**
 * RFC-0045 §2 "Archives" and OQ 14 for `cloudhal import --dry-run`: what an archive's references
 * will show, reported, never refused. `referenceIssues` lists the references of entries shown now
 * that will not resolve (a dangling or foreign group id, a draft or gated target, a missing
 * language version); a relinked original (other nodes name it as their group while it belongs to
 * another) stops lending its non-localized values to them. Pure over the bundle's rows.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SiteBundle } from "@cloudhal/core-ts";
import { referenceIssues } from "@cloudhal/core-ts/fields";
import { displayText } from "./import-checks.ts";

const SHOWN = 20;

/** Originals other entries use as their group whose own group is another node's. */
function relinkedOriginals(entries: readonly ContentEntry[]): ContentEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out = new Map<string, ContentEntry>();
  for (const e of entries) {
    const group = e.translation?.group;
    const original = group && group !== e.id ? byId.get(group) : undefined;
    if (original && (original.translation?.group ?? original.id) !== original.id)
      out.set(original.id, original);
  }
  return [...out.values()];
}

/** The warning lines of a dry run for the bundle's working copy (none when all is well). */
export function referenceLines(bundle: SiteBundle, now: number): string[] {
  const siteRow = bundle.nodes.find((n) => n.kind === "site" && n.id === bundle.siteId);
  if (!siteRow) return [];
  const site = JSON.parse(siteRow.body) as Site;
  const entries = bundle.nodes
    .filter((n) => n.kind === "contentEntry")
    .map((n) => JSON.parse(n.body) as ContentEntry);
  const lines: string[] = [];
  const issues = referenceIssues({ site, entries }, now);
  if (issues.length > 0) {
    lines.push(`warning: ${issues.length} reference(s) of published entries will show nothing:`);
    for (const i of issues.slice(0, SHOWN))
      lines.push(
        `  ${i.entryId} (${i.locale}) ${i.path} → ${displayText(i.groupId, 48)}: ${i.reason}`,
      );
    if (issues.length > SHOWN) lines.push(`  … and ${issues.length - SHOWN} more`);
  }
  const relinked = relinkedOriginals(entries);
  if (relinked.length > 0)
    lines.push(
      `warning: ${relinked.length} original(s) belong to another translation group, so their translations read none of their non-localized values: ${relinked
        .slice(0, SHOWN)
        .map((e) => e.id)
        .join(", ")}`,
    );
  return lines;
}
