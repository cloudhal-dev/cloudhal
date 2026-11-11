/**
 * RFC-0045 §2: the batch-time SQL every reference guard shares, so the guards, the live
 * `referencedBy` and Studio's "Used by" mean the same as `resolveFields`:
 *
 * - **membership** `COALESCE(translation.group, id) = G`, written so the primary key and
 *   `nodes_translation_locale` still serve it;
 * - **"shown by a published entry"**: rows of site S naming G whose holder is published, or that a
 *   published same-site member inherits (`shared` 1, or 2 without its own value of `root_key`);
 * - the **collections anchor** and the **definitions anchor**, bound from the `Site` object the
 *   write planned with (never a second read) and compared with `json(…) IS json(?)` over
 *   canonical bodies; an absent value binds SQL `NULL`, never the string `'null'`.
 *
 * Every probe filters `site_id`. Worker-safe; internal to core-ts.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { SqlValue } from "@cloudhal/storage";
import { canonicalJson } from "../hash.ts";
import type { Cond } from "../node-sql.ts";
import { definitionsPath } from "./rows.ts";

/** `alias` is a member of the group the SQL expression `group` names (two uses of it). */
export const memberSql = (alias: string, group: string): string =>
  `((${alias}.id = ${group} AND json_extract(${alias}.body, '$.translation.group') IS NULL) OR json_extract(${alias}.body, '$.translation.group') = ${group})`;

/** The published-entry condition over `entry_refs r`, after `r.site_id = ? AND r.target_id = ?`. */
const SHOWN = `(r.source_status = 'published' OR EXISTS (
    SELECT 1 FROM nodes m WHERE m.site_id = r.site_id AND m.kind = 'contentEntry'
      AND json_extract(m.body, '$.translation.group') = r.source_id AND m.id <> r.source_id
      AND json_extract(m.body, '$.translation.source.siteId') IS NULL
      AND json_extract(m.body, '$.status') = 'published'
      AND (r.shared = 1 OR json_type(m.body, '$.fields.' || r.root_key) IS NULL)))`;

/** `FROM entry_refs r WHERE …`: the rows of site `siteId` naming `group` that a published entry shows. */
export function shownRows(siteId: string, group: string): Cond {
  return {
    sql: `entry_refs r WHERE r.site_id = ? AND r.target_id = ? AND ${SHOWN}`,
    params: [siteId, group],
  };
}

/** Bound canonical JSON, or SQL `NULL` for an absent value (`json(NULL) IS json(NULL)` holds). */
const bound = (value: unknown): SqlValue => (value === undefined ? null : canonicalJson(value));

/**
 * §2.2: the site's `collections` are still those the write planned with. Every delete, move and
 * group change of an entry carries it: it holds every definition and field-operation marker, and
 * ignores `publishedSnapshotId`, theme, menus and other settings.
 */
export function collectionsAnchor(site: Pick<Site, "id" | "collections">): Cond {
  return {
    sql: "json((SELECT json_extract(body, '$.collections') FROM nodes WHERE id = ? AND kind = 'site')) IS json(?)",
    params: [site.id, bound(site.collections)],
  };
}

/** §2.1: one collection's definitions are still those the entry write planned with. */
export function definitionsAnchor(
  site: Pick<Site, "id" | "collections">,
  collection: string,
): Cond {
  return {
    sql: "json((SELECT json_extract(body, ?) FROM nodes WHERE id = ? AND kind = 'site')) IS json(?)",
    params: [definitionsPath(collection), site.id, bound(site.collections?.[collection]?.fields)],
  };
}

/** One target-guard pair: group, allowed collections, and whether the value is newly chosen. */
export interface TargetPair {
  t: string;
  c: readonly string[];
  /** 1: newly chosen, so its member must not be archived. */
  f: 0 | 1;
}

/**
 * §2.1's target guard: every pair's group has a member in this site, in one of its allowed
 * collections, and not archived when newly chosen. One count over one JSON parameter.
 */
export function targetGuard(siteId: string, pairs: readonly TargetPair[]): Cond | undefined {
  if (pairs.length === 0) return undefined;
  return {
    sql: `(SELECT count(*) FROM json_each(?) p WHERE EXISTS (
       SELECT 1 FROM nodes n WHERE n.site_id = ? AND n.kind = 'contentEntry'
         AND ${memberSql("n", "json_extract(p.value, '$.t')")}
         AND json_extract(n.body, '$.collection') IN (SELECT value FROM json_each(json_extract(p.value, '$.c')))
         AND (json_extract(p.value, '$.f') = 0 OR json_extract(n.body, '$.status') <> 'archived'))) = ?`,
    params: [JSON.stringify(pairs), siteId, pairs.length],
  };
}

/**
 * Another member of `group` than `nodeId` in this site, not archived, in one of `collections`
 * (the delete, move and group-change rules' "usable member").
 */
export function otherMember(
  siteId: string,
  group: string,
  nodeId: string,
  collections: readonly string[],
): Cond {
  return {
    sql: `EXISTS (SELECT 1 FROM nodes n WHERE n.site_id = ? AND n.kind = 'contentEntry' AND n.id <> ?
      AND ${memberSql("n", "?")}
      AND json_extract(n.body, '$.status') <> 'archived'
      AND json_extract(n.body, '$.collection') IN (SELECT value FROM json_each(?)))`,
    params: [siteId, nodeId, group, group, JSON.stringify(collections)],
  };
}
