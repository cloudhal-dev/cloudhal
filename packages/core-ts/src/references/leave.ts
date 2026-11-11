/**
 * RFC-0045 §2.2: writes that make a translation group lose a member in a site, a delete, a move
 * to another collection, or a change of `translation.group`, and the conditions their batch
 * carries so a group never loses its last usable member while a published entry shows it.
 *
 * - **The collections anchor**, always (R4, R5, R12): `site.collections` as planned.
 * - **Blocking rows** ("shown by a published entry", `shownRows`) of the group, with the planned
 *   pairs P (`"<collection>.<field>"`): `NOT EXISTS (blocking) OR (<usable members> AND NOT EXISTS
 *   (blocking with a pair not in P))`, so a field the plan did not see forces a retry (R13).
 * - **Usable members** are checked per pair: another member of the group, not archived, in a
 *   collection that pair's field allows. A move keeps the pairs whose field allows the new
 *   collection satisfied by the node itself, unless it is archived.
 * - **`field_operation_running`**: while a marker converts text into references whose targets may
 *   sit in the node's collection, readers show groups with no rows yet, so these writes wait.
 *
 * Refusals: `entry_referenced` (delete, group change) and `reference_target_moved` (move), with up
 * to 20 referrers and the total.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { InvariantError } from "../errors.ts";
import { fieldDefinitions } from "../fields/types.ts";
import { and, type Cond } from "../node-sql.ts";
import { hasReferenceFields } from "./issues.ts";
import { memberGroup } from "./members.ts";
import { definitionOfPath } from "./rows.ts";
import { collectionsAnchor, otherMember, shownRows } from "./sql.ts";

/** What a delete, move or group change of an entry adds to its batch. */
export interface LeavePlan {
  readonly guard: Cond;
  /** After a batch that matched no row: the refusal when the group is now locked. */
  diagnose(): Promise<void>;
}

/** The collections a running text → reference conversion may resolve targets in. */
export function convertingTargets(site: Pick<Site, "collections">): Set<string> {
  const out = new Set<string>();
  const into = (from: string | undefined) => from !== undefined && from !== "reference";
  for (const settings of Object.values(site.collections ?? {}))
    for (const def of settings?.fields ?? []) {
      const m = def.migration;
      if (!m) continue;
      if (def.type === "reference" && into(m.fromType)) for (const c of def.collections) out.add(c);
      if (def.type === "repeater" && m.sub !== undefined) {
        const sub = def.fields.find((s) => s.key === m.sub);
        if (sub?.type === "reference" && into(m.fromType))
          for (const c of sub.collections) out.add(c);
      }
    }
  return out;
}

interface BlockingRow {
  c: string;
  f: string;
  s: string;
}

interface Pair {
  key: string;
  collections: readonly string[];
}

/** The pairs of the blocking rows, with each field's allowed collections from the planned site. */
function pairsOf(site: Site, rows: readonly BlockingRow[]): Pair[] {
  const out = new Map<string, Pair>();
  for (const r of rows) {
    const key = `${r.c}.${r.f}`;
    if (out.has(key)) continue;
    const defs: readonly FieldDefinition[] = fieldDefinitions(site, r.c);
    out.set(key, { key, collections: definitionOfPath(defs, r.f)?.collections ?? [] });
  }
  return [...out.values()];
}

/** Up to 20 referrers with their titles, for the refusal. */
async function referrers(sql: SqlDriver, siteId: string, rows: readonly BlockingRow[]) {
  const ids = [...new Set(rows.map((r) => r.s))];
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const found = await sql.all<{ id: string; title: string | null }>(
      `SELECT id, json_extract(body, '$.title') AS title FROM nodes
        WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))`,
      [siteId, JSON.stringify(ids.slice(0, 20))],
    );
    for (const f of found) titles.set(f.id, f.title ?? "");
  }
  const shown = rows.slice(0, 20).map((r) => ({
    id: r.s,
    title: titles.get(r.s) ?? "",
    collection: r.c,
    field: r.f,
  }));
  return { referrers: shown, total: rows.length };
}

export interface LeaveInput {
  /** The stored node. */
  stored: ContentEntry;
  /** The node after the write; absent for a delete. */
  next?: ContentEntry | undefined;
}

type Kind = "delete" | "group" | "move";

function kindOf({ stored, next }: LeaveInput): Kind | undefined {
  if (!next) return "delete";
  if (memberGroup(next) !== memberGroup(stored)) return "group";
  return next.collection !== stored.collection ? "move" : undefined;
}

function refuse(kind: Kind, group: string, details: Record<string, unknown>): never {
  const moved = kind === "move";
  throw new InvariantError(
    moved ? "reference_target_moved" : "entry_referenced",
    moved
      ? `published entries show ${group} from a collection this move leaves; unpublish or edit them first`
      : `published entries show ${group}, and this is its last usable entry in the site; unpublish or edit them first`,
    { group, ...details },
  );
}

/**
 * The plan of a delete, move or group change of an entry (undefined for other writes). Throws the
 * plan-time refusals; the guard re-checks them at batch time.
 */
export async function planLeave(
  sql: SqlDriver,
  site: Site,
  input: LeaveInput,
): Promise<LeavePlan | undefined> {
  const kind = kindOf(input);
  if (!kind) return undefined;
  const { stored, next } = input;
  const anchor = collectionsAnchor(site);
  if (convertingTargets(site).has(stored.collection))
    throw new InvariantError(
      "field_operation_running",
      `a field operation is converting values into references to ${stored.collection}; wait until it finishes`,
      { collection: stored.collection },
    );
  if (!hasReferenceFields(site)) return { guard: anchor, diagnose: async () => {} };
  const group = memberGroup(stored);
  const shown = shownRows(site.id, group);
  const read = () =>
    sql.all<BlockingRow & Record<string, unknown>>(
      `SELECT r.source_collection AS c, r.field AS f, r.source_id AS s FROM ${shown.sql}`,
      shown.params,
    );
  const rows = await read();
  const pairs = pairsOf(site, rows);
  // A move keeps the pairs that allow its new collection (unless the node is archived).
  const needs = pairs.filter(
    (p) =>
      kind !== "move" ||
      next?.status === "archived" ||
      !p.collections.includes(next?.collection ?? ""),
  );
  const members = needs.map((p) => otherMember(site.id, group, stored.id, p.collections));
  const check = async () => {
    for (const m of members) {
      const ok = await sql.get<{ ok: number }>(`SELECT ${m.sql} AS ok`, m.params);
      if (!ok?.ok) refuse(kind, group, await referrers(sql, site.id, await read()));
    }
  };
  await check();
  const unseen: Cond = {
    sql: `NOT EXISTS (SELECT 1 FROM ${shown.sql} AND r.source_collection || '.' || r.field NOT IN (SELECT value FROM json_each(?)))`,
    params: [...shown.params, JSON.stringify(pairs.map((p) => p.key))],
  };
  const none: Cond = { sql: `NOT EXISTS (SELECT 1 FROM ${shown.sql})`, params: shown.params };
  const kept = and(...members, unseen) as Cond;
  return {
    guard: and(anchor, {
      sql: `${none.sql} OR (${kept.sql})`,
      params: [...none.params, ...kept.params],
    }) as Cond,
    // The pairs may have grown since: planning again reads them and throws the refusal.
    diagnose: async () => {
      await planLeave(sql, site, input);
    },
  };
}
