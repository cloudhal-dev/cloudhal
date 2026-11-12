/**
 * RFC-0045 §2 "Publish warns, never fails": `referenceIssues` lists the references of published
 * entries that will not resolve at an instant. Studio's publish dialog, the MCP `publish` tool's
 * approval text, `cloudhal snapshot --publish` and `cloudhal import --dry-run` show it; nothing
 * refuses on it. Pure: the caller passes a snapshot's site and entries, and `now`.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { derivedGates, entryVisibility, originalsOf } from "../fields/entry-gates.ts";
import { resolveFields } from "../fields/resolve.ts";
import { isReferenceFieldType } from "../fields/types.ts";
import { membersByGroup, pickMember } from "./members.ts";
import { type ReferenceUse, referenceUses } from "./values.ts";

/**
 * Why a reference does not resolve:
 * - `missing`: the group has no member in this site in a collection the field allows;
 * - `hidden`: it has, but none the published site shows at `now` (draft, archived, gated);
 * - `locale`: shown members exist, but none in the referrer's locale, and the site does not fall
 *   back to its default locale (or has no member there either).
 */
export type ReferenceIssueReason = "missing" | "hidden" | "locale";

export interface ReferenceIssue {
  /** The published entry holding (or inheriting) the reference. */
  entryId: string;
  collection: string;
  locale: string;
  /** Where the value sits: `fields/venue`, `fields/speakers/1/person`. */
  path: string;
  groupId: string;
  reason: ReferenceIssueReason;
}

/** What `referenceIssues` reads of a snapshot: its site and every entry in it. */
export interface ReferenceSnapshot {
  site: Pick<Site, "collections" | "defaultLocale" | "localization" | "timeZone">;
  entries: readonly ContentEntry[];
}

/**
 * True when some collection of the site has a reference or repeater field, or a field still
 * converting from one (RFC-0045 §7: until phase B rewrites them, its entries keep rows, which
 * every write and guard must still see).
 */
export function hasReferenceFields(site: Pick<Site, "collections">): boolean {
  return Object.values(site.collections ?? {}).some((c) =>
    (c?.fields ?? []).some(
      (d) =>
        isReferenceFieldType(d.type) ||
        (d.migration?.fromType !== undefined && isReferenceFieldType(d.migration.fromType)),
    ),
  );
}

type Groups = ReadonlyMap<string, readonly ContentEntry[]>;

/** Why `use` does not resolve; undefined when it does. */
function unresolved(
  use: ReferenceUse,
  locale: string,
  view: { all: Groups; visible: Groups; site: ReferenceSnapshot["site"] },
): ReferenceIssueReason | undefined {
  const shown = view.visible.get(use.groupId) ?? [];
  const pick = {
    locale,
    defaultLocale: view.site.defaultLocale,
    fallback: view.site.localization?.fallback,
    collections: use.collections,
  };
  if (pickMember(use.groupId, shown, pick)) return undefined;
  const allowed = (m: ContentEntry) => use.collections.includes(m.collection);
  if (!(view.all.get(use.groupId) ?? []).some(allowed)) return "missing";
  return shown.some(allowed) ? "locale" : "hidden";
}

/**
 * The references of entries shown at `now` (published, gates open, not hidden by a derived gate;
 * `unlist`ed entries count) that resolve to nothing, by the locale rule (`pickMember`) over the
 * entries shown at `now`. A translation's inherited values are checked in its own locale.
 */
export function referenceIssues(snapshot: ReferenceSnapshot, now: number): ReferenceIssue[] {
  const { site, entries } = snapshot;
  if (!hasReferenceFields(site)) return [];
  const derived = derivedGates(site, entries);
  const shown = entries.filter((e) => entryVisibility(e, derived.get(e.id), now) !== "hidden");
  const view = { all: membersByGroup(entries), visible: membersByGroup(shown), site };
  const originalOf = originalsOf(entries);
  const out: ReferenceIssue[] = [];
  for (const entry of shown)
    for (const [key, field] of Object.entries(resolveFields(site, entry, originalOf(entry)))) {
      if (!isReferenceFieldType(field.def.type)) continue;
      for (const use of referenceUses(field.def, field.value, `fields/${key}`)) {
        const reason = unresolved(use, entry.locale, view);
        if (reason)
          out.push({
            entryId: entry.id,
            collection: entry.collection,
            locale: entry.locale,
            path: use.path,
            groupId: use.groupId,
            reason,
          });
      }
    }
  return out;
}
