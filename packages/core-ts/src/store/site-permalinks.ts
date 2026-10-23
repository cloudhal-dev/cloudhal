/**
 * RFC-0038 §3–§4 on the store side: a site update that changes a collection's permalink leaves a
 * prefix redirect behind in the same batch as the site CAS, and a template may not overlap
 * another collection, a taxonomy archive, a page or a reserved path. The reverse checks for page
 * writes live here too. Worker-safe.
 */
import type { Page, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { InvariantError } from "../errors.ts";
import { ID_PREFIX } from "../ids.ts";
import { and, type Cond, hashIs, OpBatch } from "../node-sql.ts";
import {
  collectionPrefixes,
  configuredPrefixFree,
  noArchiveOverlapping,
  noPageUnder,
  pathsOverlap,
  pathUnder,
} from "../permalink-paths.ts";
import { changedPermalinks, type PermalinkChange } from "../permalinks.ts";
import { RedirectPlan, redirectLocale } from "../redirects.ts";
import { SEARCH_PATH } from "../search-common.ts";
import type { StoreContext } from "./context.ts";
import { checkReservedPath } from "./validation.ts";

/** What a site update with changed permalinks adds to its batch. */
export interface PermalinkPlan {
  readonly changes: readonly PermalinkChange[];
  /** Race guard on the site CAS: the new prefixes are still free when the batch runs. */
  readonly guard: Cond | undefined;
  /** Redirect writes plus their `op_guards` assertions, anchored on the site's new hash. */
  statements(hash: string): Promise<SqlStatement[]>;
  /** After a failed CAS at the same rev: the `path_conflict` that explains it, if any. */
  diagnose(): Promise<void>;
}

/**
 * Plans the permalink part of a site update from `stored` to `next`, or undefined when no
 * collection's effective template changed. Throws `path_conflict`, `reserved_path` or
 * `invalid_redirect` before anything is written.
 */
export async function planPermalinks(
  ctx: StoreContext,
  stored: Site | undefined,
  next: Site,
): Promise<PermalinkPlan | undefined> {
  const changes = changedPermalinks(stored, next);
  if (!stored || changes.length === 0) return undefined;
  await checkPermalinks(ctx, next, changes);
  const plan = new RedirectPlan(
    next.id,
    await ctx.tax.listRedirects(next.id),
    next.updatedAt,
    ctx.newId,
  );
  // Entries in every locale share the template (v1), and redirects are per locale (RFC-0033).
  const locales = new Set([next.defaultLocale, ...next.locales]);
  for (const locale of locales) {
    plan.forLocale(redirectLocale(locale, next.defaultLocale));
    for (const c of changes) plan.move(c.from, c.to, { match: "prefix", reason: "slug-change" });
  }
  return {
    changes,
    guard: and(
      ...changes.flatMap((c) => [
        noArchiveOverlapping(next.id, c.to),
        ...(c.configured ? [noPageUnder(next.id, c.to)] : []),
      ]),
    ),
    async statements(hash) {
      if (plan.writes === 0) return [];
      const ops = new OpBatch(ctx.newId(ID_PREFIX.operation), next.id, next.updatedAt);
      ops.anchorOn(hashIs(next.id, hash));
      await plan.emit(ops);
      return ops.statements();
    },
    diagnose: () => checkPermalinks(ctx, next, changes),
  };
}

/** RFC-0038 invariant 1 for the collections whose template changed, against the stored graph. */
async function checkPermalinks(
  ctx: StoreContext,
  site: Site,
  changes: readonly PermalinkChange[],
): Promise<void> {
  const used = await ctx.sql.all<{ c: string }>(
    "SELECT DISTINCT json_extract(body, '$.collection') AS c FROM nodes WHERE site_id = ? AND kind = 'contentEntry'",
    [site.id],
  );
  const prefixes = collectionPrefixes(
    site,
    used.map((r) => r.c),
  );
  const taxonomies = await ctx.tax.listTaxonomies(site.id);
  const pages = changes.some((c) => c.configured) ? await ctx.graph.listPages(site.id) : [];
  for (const c of changes) {
    const at = `collection "${c.collection}" at ${c.to}`;
    if (c.configured) checkReservedPrefix(site, c.to);
    for (const other of prefixes)
      if (other.collection !== c.collection && pathsOverlap(other.prefix, c.to))
        conflict(`${at} collides with collection "${other.collection}" at ${other.prefix}`);
    for (const tax of taxonomies)
      if (pathsOverlap(tax.archive.basePath, c.to))
        conflict(`${at} collides with the ${tax.key} archive ${tax.archive.basePath}`);
    // A default `/<collection>` keeps today's rule: a page there wins over an entry. A page at
    // the prefix itself is the collection's index page (RFC-0038 §"Out of scope" 3).
    if (!c.configured) continue;
    const page = pages.find((p) => pathUnder(p.path, c.to));
    if (page) conflict(`${at} would cover page ${page.path}`, { pageId: page.id });
  }
}

/** Media URLs, the search page and locale prefixes are not entry prefixes. */
export function checkReservedPrefix(site: Site, prefix: string): void {
  checkReservedPath(`${prefix}/`);
  const first = prefix.split("/")[1] ?? "";
  const locales = [site.defaultLocale, ...site.locales].map((l) => l.toLowerCase());
  if (pathsOverlap(prefix, SEARCH_PATH) || locales.includes(first))
    throw new InvariantError(
      "reserved_path",
      `${prefix} is reserved (the search page or a locale prefix); choose another permalink`,
    );
}

function conflict(message: string, details?: Record<string, unknown>): never {
  throw new InvariantError("path_conflict", message, details);
}

/** The reverse of invariant 1 for page writes: no page under a configured prefix, only at it. */
export async function checkPagePath(ctx: StoreContext, page: Page, site?: Site): Promise<void> {
  await ctx.tax.checkPagePath(page);
  const s = site ?? (await ctx.graph.getSite(page.siteId));
  for (const { collection, prefix } of collectionPrefixes(s, []))
    if (pathUnder(page.path, prefix))
      conflict(`page path ${page.path} lies in collection "${collection}" at ${prefix}`, {
        collection,
      });
}

/** Race guard for `checkPagePath`: archives (invariant 13) and configured collection prefixes. */
export function pageGuard(ctx: StoreContext, page: Page): Cond {
  return and(
    ctx.tax.pageGuard(page),
    configuredPrefixFree(page.siteId, page.path, "under"),
  ) as Cond;
}
