/**
 * RFC-0045 §2.1: the reference part of an entry write (`EntryEngine.write`).
 *
 * - **Canonical values.** A member's id is replaced by its group id, `COALESCE(translation.group,
 *   id)`, before any check (as `canonicalImageRefs` does for assets).
 * - **The target guard**, ANDed into the entry's CAS: for changed reference keys, and for every
 *   own reference value when the entry becomes published, each group has a member in this site in
 *   an allowed collection, not archived when newly chosen. A newly chosen target also meets
 *   `where`, and no value names the entry's own group (checked when planned).
 * - **The definitions anchor**, on every write that changes `fields` or `collection`: the
 *   collection's definitions as planned.
 * - **The rows**, anchored on the entry's new hash: an anchored `DELETE`, then one plain
 *   `INSERT … SELECT` that reads `shared` from the site row as it is when the batch runs, by key
 *   or `migration.fromKey`. A key with no definition then yields `NULL` and fails the batch
 *   (`isSharedNullViolation` → `ConflictError`); it is never `OR IGNORE`.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import { matchesFieldQuery, parseFieldQuery } from "../fields/query.ts";
import { refuseFieldIssues } from "../fields/refusal.ts";
import { resolveFields } from "../fields/resolve.ts";
import { type FieldIssue, fieldDefinitions, isRecord, sameJson } from "../fields/types.ts";
import { and, type Cond } from "../node-sql.ts";
import { hasReferenceFields } from "./issues.ts";
import { memberGroup } from "./members.ts";
import { definitionsPath, entryRefRows, holdsReferences } from "./rows.ts";
import { definitionsAnchor, type TargetPair, targetGuard } from "./sql.ts";
import { type ReferenceUse, referenceUses } from "./values.ts";

const ANCHOR = "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)";

interface MemberRow {
  id: string;
  group: string;
  collection: string;
  status: string;
  body: ContentEntry;
}

/** The members of `groups` (and the nodes named by id) in this site, one read. */
async function readMembers(
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

/** Every group id a body's values name under `defs`. */
const namedIds = (defs: readonly FieldDefinition[], values: unknown): string[] => [
  ...new Set(entryRefRows(defs, values).map((r) => r.t)),
];

/** Replaces the reference values of one field with `map(id)`. */
function mapValue(def: FieldDefinition, value: unknown, map: (id: string) => string): unknown {
  if (def.type === "reference") {
    if (typeof value === "string") return map(value);
    return Array.isArray(value)
      ? [...new Set(value.map((v) => (typeof v === "string" ? map(v) : v)))]
      : value;
  }
  if (def.type !== "repeater" || !Array.isArray(value)) return value;
  const subs = def.fields.filter((s) => s.type === "reference").map((s) => s.key);
  return value.map((item) => {
    if (!isRecord(item)) return item;
    const next = { ...item };
    for (const k of subs)
      if (Object.hasOwn(next, k) && typeof next[k] === "string") next[k] = map(next[k] as string);
    return next;
  });
}

/**
 * The draft with every member id in a *changed* value canonicalized to its group id (one read,
 * only when such a value names ids). A stored value that does not change is kept as stored: its
 * id names the group it named when written, even if that node has since joined another group.
 */
export async function canonicalReferences(
  sql: SqlDriver,
  site: Site,
  input: { draft: ContentEntry; stored?: ContentEntry | undefined },
): Promise<ContentEntry> {
  const { draft, stored } = input;
  const before = stored?.collection === draft.collection ? (stored.fields ?? {}) : {};
  const values = draft.fields ?? {};
  const defs = fieldDefinitions(site, draft.collection).filter(
    (d) =>
      holdsReferences(d) && Object.hasOwn(values, d.key) && !sameJson(values[d.key], before[d.key]),
  );
  const ids = namedIds(defs, values);
  if (ids.length === 0) return draft;
  const rows = await sql.all<{ id: string; g: string | null }>(
    `SELECT id, json_extract(body, '$.translation.group') AS g FROM nodes
      WHERE site_id = ? AND kind = 'contentEntry' AND id IN (SELECT value FROM json_each(?))`,
    [site.id, JSON.stringify(ids)],
  );
  const groups = new Map(rows.flatMap((r) => (r.g && r.g !== r.id ? [[r.id, r.g] as const] : [])));
  if (groups.size === 0) return draft;
  const fields = { ...values };
  for (const def of defs)
    fields[def.key] = mapValue(def, fields[def.key], (id) => groups.get(id) ?? id);
  return { ...draft, fields };
}

/** What the reference rules add to an entry write. */
export interface EntryRefsPlan {
  readonly guard: Cond | undefined;
  /** The `entry_refs` rows, anchored on the entry's new hash. */
  statements(hash: string): SqlStatement[];
  /** After a write that matched no row: `unknown_entry` / `reference_target_moved` if a target went. */
  diagnose(): Promise<void>;
}

interface Use extends ReferenceUse {
  fresh: boolean;
  def: FieldDefinition;
}

/** The uses the target guard covers: changed keys, or every own value when the entry goes live. */
function guardedUses(
  defs: readonly FieldDefinition[],
  draft: ContentEntry,
  stored: ContentEntry | undefined,
): Use[] {
  const values = draft.fields ?? {};
  const same = stored?.collection === draft.collection;
  const before = same ? (stored?.fields ?? {}) : {};
  const goingLive = draft.status === "published" && (!same || stored?.status !== "published");
  const out: Use[] = [];
  for (const def of defs) {
    if (!holdsReferences(def) || !Object.hasOwn(values, def.key)) continue;
    const changed = !sameJson(values[def.key], before[def.key]);
    if (!changed && !goingLive) continue;
    const had = new Set(referenceUses(def, before[def.key], "").map((u) => u.groupId));
    for (const use of referenceUses(def, values[def.key], `fields/${def.key}`))
      out.push({ ...use, def, fresh: !had.has(use.groupId) });
  }
  return out;
}

/** Why `use` fails against the members read; undefined when a member satisfies it. */
function useIssue(site: Site, use: Use, members: readonly MemberRow[]): FieldIssue | undefined {
  const of = members.filter((m) => m.group === use.groupId);
  const allowed = of.filter((m) => use.collections.includes(m.collection));
  const usable = allowed.filter((m) => !use.fresh || m.status !== "archived");
  if (usable.length === 0) {
    if (of.length > 0 && allowed.length === 0)
      return {
        path: use.path,
        code: "reference_target_moved",
        message: `${use.groupId} has no entry in ${use.collections.join(", ")} of this site`,
      };
    return {
      path: use.path,
      code: "unknown_entry",
      message:
        allowed.length > 0
          ? `${use.groupId} is archived; choose an entry that is not`
          : `${use.groupId} is not an entry of this site`,
    };
  }
  const where = use.def.type === "reference" && use.fresh ? use.def.where : undefined;
  if (!where) return undefined;
  const target = use.collections[0] as string;
  const parsed = parseFieldQuery(site, target, { where });
  if (!parsed.ok) return undefined;
  const byId = new Map(members.map((m) => [m.id, m.body]));
  const meets = usable.some((m) => {
    const original = byId.get(m.group);
    const resolved = resolveFields(site, m.body, original);
    // `where` cannot use `now` (§1), so the instant is irrelevant.
    return matchesFieldQuery(resolved, parsed.query, 0);
  });
  return meets
    ? undefined
    : {
        path: use.path,
        code: "invalid_value",
        message: `${use.groupId} does not meet the conditions of ${use.def.key}`,
      };
}

/** The plan-time checks of the guarded uses: own group, targets, `where`. */
function useIssues(site: Site, draft: ContentEntry, uses: readonly Use[], members: MemberRow[]) {
  const own = memberGroup(draft);
  const issues: FieldIssue[] = [];
  for (const use of uses) {
    if (use.groupId === own) {
      issues.push({
        path: use.path,
        code: "invalid_value",
        message: "an entry cannot reference its own translation group",
      });
      continue;
    }
    const issue = useIssue(site, use, members);
    if (issue) issues.push(issue);
  }
  return issues;
}

/** The rows statements for `draft` (an anchored `DELETE`, then the plain `INSERT … SELECT`). */
function rowStatements(site: Site, draft: ContentEntry, hash: string): SqlStatement[] {
  const rows = entryRefRows(fieldDefinitions(site, draft.collection), draft.fields);
  const out: SqlStatement[] = [
    {
      sql: `DELETE FROM entry_refs WHERE source_id = ? AND ${ANCHOR}`,
      params: [draft.id, draft.id, hash],
    },
  ];
  if (rows.length === 0) return out;
  out.push({
    sql: `INSERT INTO entry_refs (site_id, target_id, source_id, source_collection, field, root_key, shared, source_status)
      SELECT ?, json_extract(p.value, '$.t'), ?, ?, json_extract(p.value, '$.f'), json_extract(p.value, '$.k'),
        (SELECT CASE json_extract(d.value, '$.localized') WHEN 1 THEN 2 ELSE 1 END
           FROM nodes s, json_each(json_extract(s.body, ?)) d
          WHERE s.id = ? AND s.kind = 'site'
            AND (json_extract(d.value, '$.key') = json_extract(p.value, '$.k')
                 OR json_extract(d.value, '$.migration.fromKey') = json_extract(p.value, '$.k'))
          ORDER BY json_extract(d.value, '$.key') = json_extract(p.value, '$.k') DESC LIMIT 1),
        ?
      FROM json_each(?) p WHERE ${ANCHOR}`,
    params: [
      site.id,
      draft.id,
      draft.collection,
      definitionsPath(draft.collection),
      site.id,
      draft.status,
      JSON.stringify(rows.map(({ t, f, k }) => ({ t, f, k }))),
      draft.id,
      hash,
    ],
  });
  return out;
}

/** True when the write changes the entry's values or collection (the definitions anchor applies). */
const changesFields = (draft: ContentEntry, stored: ContentEntry | undefined) =>
  !stored || stored.collection !== draft.collection || !sameJson(stored.fields, draft.fields);

/**
 * Plans the reference part of an entry write; throws the plan-time refusals. Sites without
 * reference fields add only the definitions anchor (to keep `field_key_in_use` true, R3).
 */
export async function planEntryRefs(
  sql: SqlDriver,
  site: Site,
  draft: ContentEntry,
  stored: ContentEntry | undefined,
): Promise<EntryRefsPlan> {
  const anchor = changesFields(draft, stored)
    ? definitionsAnchor(site, draft.collection)
    : undefined;
  if (!hasReferenceFields(site))
    return { guard: anchor, statements: () => [], diagnose: async () => {} };
  const defs = fieldDefinitions(site, draft.collection);
  const uses = guardedUses(defs, draft, stored);
  const groups = [...new Set(uses.map((u) => u.groupId))];
  const check = async () =>
    refuseFieldIssues(useIssues(site, draft, uses, await readMembers(sql, site.id, groups)));
  await check();
  const pairs = new Map<string, TargetPair>();
  for (const u of uses) {
    const pair: TargetPair = { t: u.groupId, c: u.collections, f: u.fresh ? 1 : 0 };
    pairs.set(JSON.stringify(pair), pair);
  }
  return {
    guard: and(anchor, targetGuard(site.id, [...pairs.values()])),
    statements: (hash) => rowStatements(site, draft, hash),
    diagnose: check,
  };
}
