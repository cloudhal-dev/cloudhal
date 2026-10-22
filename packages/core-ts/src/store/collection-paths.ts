/**
 * RFC-0040 §3 invariant 3: the first entry of a new collection claims its default prefix
 * `/<collection>`, which may not overlap another collection's configured permalink, a taxonomy
 * archive or a reserved path (the gap RFC-0038 left: those checks ran only when a permalink, a
 * page or a taxonomy changed). Pages under a default prefix still win, as RFC-0038 decided.
 * Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { and, type Cond } from "../node-sql.ts";
import { configuredPrefixFree, noArchiveOverlapping, pathsOverlap } from "../permalink-paths.ts";
import { collectionPermalink, permalinkPrefix } from "../permalinks.ts";
import type { StoreContext } from "./context.ts";
import { checkReservedPrefix } from "./site-permalinks.ts";

/** What a write that opens a new collection adds: its race guard and the check behind it. */
export interface NewCollection {
  readonly guard: Cond | undefined;
  diagnose(): Promise<void>;
}

/**
 * Checks `collection`'s default prefix when it has no entries yet (other than `except`) and no
 * configured permalink; undefined when the collection is already in use or configured. Throws
 * `path_conflict` or `reserved_path`.
 */
export async function planNewCollection(
  ctx: StoreContext,
  site: Site,
  collection: string,
  except?: string,
): Promise<NewCollection | undefined> {
  if (site.collections?.[collection]?.permalink) return undefined;
  const used = await ctx.sql.all<{ id: string }>(
    "SELECT id FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.collection') = ? AND id != ? LIMIT 1",
    [site.id, collection, except ?? ""],
  );
  if (used.length > 0) return undefined;
  const prefix = permalinkPrefix(collectionPermalink(site, collection));
  await checkCollectionPrefix(ctx, site, collection, prefix);
  return {
    guard: and(
      configuredPrefixFree(site.id, prefix, "overlap"),
      noArchiveOverlapping(site.id, prefix),
    ),
    diagnose: () => checkCollectionPrefix(ctx, site, collection, prefix),
  };
}

/** The prefix against reserved paths, other configured prefixes and taxonomy archives. */
export async function checkCollectionPrefix(
  ctx: StoreContext,
  site: Site,
  collection: string,
  prefix: string,
): Promise<void> {
  checkReservedPrefix(site, prefix);
  const at = `collection "${collection}" at ${prefix}`;
  for (const [other, settings] of Object.entries(site.collections ?? {})) {
    if (other === collection || !settings?.permalink) continue;
    const theirs = permalinkPrefix(settings.permalink);
    if (pathsOverlap(theirs, prefix))
      conflict(`${at} collides with collection "${other}" at ${theirs}`, { collection: other });
  }
  for (const tax of await ctx.tax.listTaxonomies(site.id))
    if (pathsOverlap(tax.archive.basePath, prefix))
      conflict(`${at} collides with the ${tax.key} archive ${tax.archive.basePath}`, {
        taxonomy: tax.key,
      });
}

/**
 * RFC-0040 §3 invariants 2 and 3 for a site update: a declared key that still has entries, or that a
 * taxonomy names, cannot be dropped (`collection_in_use`), and a newly declared key without a
 * permalink and without entries claims its default prefix. Undefined when no key comes or goes.
 */
export async function planDeclarations(
  ctx: StoreContext,
  stored: Site | undefined,
  next: Site,
): Promise<NewCollection | undefined> {
  const before = Object.keys(stored?.collections ?? {});
  const after = Object.keys(next.collections ?? {});
  const removed = before.filter((k) => !after.includes(k));
  const added = after.filter((k) => !before.includes(k) && !next.collections?.[k]?.permalink);
  if (!stored || (removed.length === 0 && added.length === 0)) return undefined;
  const taxonomies = removed.length ? await ctx.tax.listTaxonomies(next.id) : [];
  for (const key of removed) {
    if (await hasEntries(ctx, next.id, key))
      throw new InvariantError("collection_in_use", `collection "${key}" still has entries`, {
        collection: key,
      });
    const tax = taxonomies.find((t) => t.collections?.includes(key));
    if (tax)
      throw new InvariantError(
        "collection_in_use",
        `the ${tax.key} taxonomy applies to collection "${key}"; remove it there first`,
        { collection: key, taxonomy: tax.key },
      );
  }
  const opened: string[] = [];
  for (const key of added) if (!(await hasEntries(ctx, next.id, key))) opened.push(key);
  const check = async () => {
    for (const key of opened) await checkCollectionPrefix(ctx, next, key, `/${key}`);
  };
  await check();
  return {
    guard: and(
      ...removed.map((key) => noEntryIn(next.id, key)),
      ...opened.flatMap((key) => [
        configuredPrefixFree(next.id, `/${key}`, "overlap"),
        noArchiveOverlapping(next.id, `/${key}`),
      ]),
    ),
    diagnose: check,
  };
}

async function hasEntries(ctx: StoreContext, siteId: string, key: string): Promise<boolean> {
  const rows = await ctx.sql.all<{ id: string }>(
    "SELECT id FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.collection') = ? LIMIT 1",
    [siteId, key],
  );
  return rows.length > 0;
}

/** Holds while the site has no entry in `collection`. */
function noEntryIn(siteId: string, collection: string): Cond {
  return {
    sql: "NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.collection') = ?)",
    params: [siteId, collection],
  };
}

/** Whether a write puts `entry` in a collection it was not in before. */
export function entersCollection(stored: ContentEntry | undefined, entry: ContentEntry): boolean {
  return stored?.collection !== entry.collection;
}

function conflict(message: string, details: Record<string, unknown>): never {
  throw new InvariantError("path_conflict", message, details);
}
