/**
 * RFC-0042 §4 and §8 step 2 for site writes: the stage 3 settings are checked when they change
 * (`checkCollectionSettings`), and a list field `contentList` sections still filter or sort by
 * cannot be unlisted, dropped or retyped, nor can a select option they compare with be dropped
 * (`list_field_in_use`, naming the pages). The refusal counts with one query per change, and a
 * guard on the site CAS keeps "no section uses it" true (rule 4).
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { isBeingRemoved } from "../fields/migration.ts";
import { sameJson } from "../fields/types.ts";
import { and, type Cond } from "../node-sql.ts";
import { checkCollectionSettings } from "./collection-settings.ts";
import type { StoreContext } from "./context.ts";
import { noSectionUse, pagesUsing, sectionUse } from "./section-uses.ts";

export interface SiteListingsPlan {
  readonly guard: Cond | undefined;
  diagnose(): Promise<void>;
}

/** A list field that stops being usable as it was, and how sections may still use it. */
export interface ListFieldChange {
  readonly collection: string;
  readonly key: string;
  /** What happened, for the message. */
  readonly why: string;
  /** Only conditions comparing with these values break (dropped select options). */
  readonly values?: readonly string[];
}

const liveDef = (site: Site, collection: string, key: string): FieldDefinition | undefined =>
  site.collections?.[collection]?.fields?.find((d) => d.key === key && !isBeingRemoved(d));

/** How one stored list field changes in `next`; undefined when sections keep working. */
function changeOf(stored: Site, next: Site, collection: string, key: string) {
  const before = liveDef(stored, collection, key);
  if (!before) return undefined;
  const settings = next.collections?.[collection];
  if (!settings) return { collection, key, why: `${collection} is no longer declared` };
  const after = liveDef(next, collection, key);
  if (!after) return { collection, key, why: `${key} is no longer a field of ${collection}` };
  if (!settings.listFields?.includes(key))
    return { collection, key, why: `${key} is no longer a list field of ${collection}` };
  if (after.type !== before.type)
    return { collection, key, why: `${key} would change from ${before.type} to ${after.type}` };
  if (before.type !== "select" || after.type !== "select") return undefined;
  const kept = new Set(after.options.map((o) => o.value));
  const values = before.options.map((o) => o.value).filter((v) => !kept.has(v));
  return values.length
    ? { collection, key, why: `${key} would lose ${values.join(", ")}`, values }
    : undefined;
}

/** Every stored list field `next` unlists, drops or retypes (and every dropped option). */
export function listFieldChanges(stored: Site, next: Site): ListFieldChange[] {
  const out: ListFieldChange[] = [];
  for (const [collection, settings] of Object.entries(stored.collections ?? {}))
    for (const key of settings?.listFields ?? []) {
      const change = changeOf(stored, next, collection, key);
      if (change) out.push(change);
    }
  return out;
}

const useOf = (siteId: string, c: ListFieldChange) =>
  sectionUse(siteId, c.collection, c.key, c.values);

/** Throws `list_field_in_use` naming the pages whose sections still use a changed list field. */
export async function refuseListFieldUses(
  ctx: Pick<StoreContext, "sql">,
  siteId: string,
  changes: readonly ListFieldChange[],
): Promise<void> {
  const issues: { path: string; code: string; message: string }[] = [];
  const pages = new Map<string, { id: string; path: string; locale: string }>();
  for (const c of changes) {
    const using = await pagesUsing(ctx.sql, useOf(siteId, c));
    if (using.length === 0) continue;
    for (const p of using) pages.set(p.id, { id: p.id, path: p.path, locale: p.locale });
    issues.push({
      path: `collections/${c.collection}/listFields`,
      code: "list_field_in_use",
      message: `${c.why}, but contentList sections on ${using.map((p) => p.path).join(", ")} filter or sort by it; change those sections first`,
    });
  }
  if (issues.length === 0) return;
  throw new InvariantError("list_field_in_use", issues.map((i) => i.message).join("; "), {
    issues,
    pages: [...pages.values()],
  });
}

/**
 * Checks `next`'s stage 3 settings (when they change) and refuses list-field changes that
 * sections still depend on; returns the CAS guard, undefined when nothing needs one.
 */
export async function planListings(
  ctx: StoreContext,
  stored: Site | undefined,
  next: Site,
): Promise<SiteListingsPlan | undefined> {
  if (stored && sameJson(stored.collections, next.collections)) return undefined;
  checkCollectionSettings(next);
  if (!stored) return undefined;
  const changes = listFieldChanges(stored, next);
  if (changes.length === 0) return undefined;
  await refuseListFieldUses(ctx, next.id, changes);
  return {
    guard: and(...changes.map((c) => noSectionUse(useOf(next.id, c)))),
    diagnose: () => refuseListFieldUses(ctx, next.id, changes),
  };
}
