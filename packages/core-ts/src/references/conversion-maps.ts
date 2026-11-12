/**
 * RFC-0045 §7 "Where the graph reads happen": the prefetched maps the two text ↔ reference
 * conversion rows read (`ConvertContext.entries`), built from one read of the entries. Every
 * converter builds them with this one function, so a writer, an operation pass, the live source
 * and the snapshot source convert identically over the same entries:
 *
 * - `byText`: case-folded slug or default-locale title → the groups with such a member among the
 *   target collections (text → reference picks the one group; none or several is unconvertible);
 * - `titles`: group → its default-locale member's title (reference → text).
 *
 * Archived entries count nothing: a converted value is a newly chosen target, which the store's
 * target guard requires to be usable (§2.1). Pure and Worker-safe; the conversion rows that read
 * the maps land with rollout step 4.
 */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import { memberGroup } from "./members.ts";

/** What the text ↔ reference conversions read of the site's entries. */
export interface ConversionEntries {
  /** Case-folded slug or default-locale title → group ids, in first-seen order. */
  readonly byText: ReadonlyMap<string, readonly string[]>;
  /** Group id → its default-locale member's title. */
  readonly titles: ReadonlyMap<string, string>;
}

/** The one case fold every converter compares with. */
export const foldText = (text: string): string => text.normalize("NFC").trim().toLowerCase();

/**
 * The entry collections a definition's running conversion reads, or `undefined` when it needs no
 * maps: a text → reference conversion (top-level, or a repeater's sub-field with `sub`) reads its
 * target collections; a reference → text conversion reads titles of every collection (`"*"`).
 */
export function conversionTargets(def: FieldDefinition): readonly string[] | undefined {
  const m = def.migration;
  if (m?.fromType === undefined) return undefined;
  let to: { type: string; collections?: readonly string[] } | undefined = def;
  if (m.sub !== undefined)
    to = def.type === "repeater" ? def.fields.find((s) => s.key === m.sub) : undefined;
  if (to === undefined) return undefined;
  if (m.fromType === "text" && to.type === "reference") return to.collections ?? [];
  if (m.fromType === "reference" && to.type === "text") return ["*"];
  return undefined;
}

/** The collections the running conversions of `defs` read (`"*"`: all), or none. */
export function conversionCollections(
  defs: readonly FieldDefinition[],
): ReadonlySet<string> | undefined {
  const out = new Set<string>();
  for (const def of defs) for (const c of conversionTargets(def) ?? []) out.add(c);
  return out.size === 0 ? undefined : out;
}

/**
 * The maps over `entries` (any order; archived ones are skipped), narrowed to `collections` (the
 * conversions' target collections; `"*"` or absent: all), so a reader that loads only those
 * collections builds the same maps as one that holds every entry.
 */
export function conversionEntries(
  entries: Iterable<
    Pick<ContentEntry, "id" | "collection" | "locale" | "slug" | "title" | "status" | "translation">
  >,
  defaultLocale: string,
  collections?: ReadonlySet<string>,
): ConversionEntries {
  const byText = new Map<string, string[]>();
  const titles = new Map<string, string>();
  const all = collections === undefined || collections.has("*");
  const add = (text: string, group: string) => {
    const key = foldText(text);
    if (key === "") return;
    const list = byText.get(key);
    if (!list) byText.set(key, [group]);
    else if (!list.includes(group)) list.push(group);
  };
  for (const e of entries) {
    if (e.status === "archived") continue;
    if (!all && !collections.has(e.collection)) continue;
    const group = memberGroup(e);
    const isDefault = e.locale === defaultLocale;
    if (isDefault && !titles.has(group)) titles.set(group, e.title);
    add(e.slug, group);
    if (isDefault) add(e.title, group);
  }
  return { byText, titles };
}
