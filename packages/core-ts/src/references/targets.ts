/**
 * RFC-0045 §2.1: whether a group id is a usable target for a field, the one rule the entry
 * writer's plan-time check and the language-edition mapping share, so they cannot drift.
 *
 * Members are read without a status filter (an archived same-site original still lends its
 * values to the translations that resolve through it). A target needs a member in one of the
 * field's collections; a *fresh* value (newly chosen) also needs one that is not archived and,
 * for a field with `where`, one that meets it. Pure but for `readMembers`.
 */
import type { ContentEntry, FieldCondition } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { matchesFieldQuery, parseFieldQuery } from "../fields/query.ts";
import { resolveFields } from "../fields/resolve.ts";
import type { SiteFields } from "../fields/types.ts";
import { memberGroup } from "./members.ts";

export interface MemberRow {
  id: string;
  group: string;
  collection: string;
  status: string;
  body: ContentEntry;
}

/** The members of `groups` (and the nodes named by id) in this site, one read, any status. */
export async function readMembers(
  sql: SqlDriver,
  siteId: string,
  ids: readonly string[],
): Promise<MemberRow[]> {
  if (ids.length === 0) return [];
  const rows = await sql.all<{ id: string; body: string }>(
    `SELECT n.id AS id, n.body AS body FROM nodes n WHERE n.site_id = ? AND n.kind = 'contentEntry'
      AND (n.id IN (SELECT value FROM json_each(?))
           OR json_extract(n.body, '$.translation.group') IN (SELECT value FROM json_each(?)))`,
    [siteId, JSON.stringify(ids), JSON.stringify(ids)],
  );
  return rows.map((r) => {
    const body = JSON.parse(r.body) as ContentEntry;
    return {
      id: r.id,
      group: memberGroup(body),
      collection: body.collection,
      status: body.status,
      body,
    };
  });
}

/** One value to check: its group, the field's collections and `where`, and whether it is new. */
export interface TargetCheck {
  groupId: string;
  collections: readonly string[];
  where?: readonly FieldCondition[] | undefined;
  /** Newly chosen: its member must not be archived, and must meet `where`. */
  fresh: boolean;
}

/**
 * Why `check` fails against `members`: `absent` (no member in this site), `collection` (members
 * only in collections the field does not allow), `archived` (a fresh value whose allowed members
 * are all archived), `where` (none meets the field's conditions); undefined when one satisfies it.
 */
export function targetProblem(
  site: SiteFields,
  check: TargetCheck,
  members: readonly MemberRow[],
): "absent" | "collection" | "archived" | "where" | undefined {
  const of = members.filter((m) => m.group === check.groupId);
  const allowed = of.filter((m) => check.collections.includes(m.collection));
  const usable = allowed.filter((m) => !check.fresh || m.status !== "archived");
  if (usable.length === 0) {
    if (of.length === 0) return "absent";
    return allowed.length === 0 ? "collection" : "archived";
  }
  const [target] = check.collections;
  if (!check.fresh || !check.where || target === undefined) return undefined;
  const parsed = parseFieldQuery(site, target, { where: [...check.where] });
  if (!parsed.ok) return undefined;
  const byId = new Map(members.map((m) => [m.id, m.body]));
  // `where` cannot use `now` (§1), so the instant is irrelevant.
  const meets = usable.some((m) =>
    matchesFieldQuery(resolveFields(site, m.body, byId.get(m.group)), parsed.query, 0),
  );
  return meets ? undefined : "where";
}
