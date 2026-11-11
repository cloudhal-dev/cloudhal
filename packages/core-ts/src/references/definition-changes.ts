/**
 * RFC-0045 §1, §2.8: the definition changes of reference and repeater fields that depend on
 * stored values, checked by a site write (`planFieldDefinitions`) and kept true by guards on the
 * site CAS (rule 4); entry writes in between carry the definitions anchor (R3).
 *
 * - **Adding** a reference or repeater field over a key entries already hold, or a reference
 *   sub-field over a key their items hold (`field_key_in_use`).
 * - **Removing a target collection** while a value's group has a member in it.
 * - **Removing or retyping a sub-field** that items hold.
 * - **Turning `multiple` on or off** is refused outright (`change_field_type`), as for selects.
 *
 * Each refusal names what to do instead.
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import type { FieldIssue } from "../fields/types.ts";
import type { Cond } from "../node-sql.ts";
import { memberSql } from "./sql.ts";

type Collections = NonNullable<Site["collections"]>;

/** One value-dependent change; `count` is the SQL counting what it would strand. */
export interface ReferenceDataChange {
  collection: string;
  key: string;
  issue(n: number): FieldIssue;
  count: Cond;
}

const IN_COLLECTION =
  "site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.collection') = ?";

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

function added(siteId: string, collection: string, def: FieldDefinition): ReferenceDataChange {
  return {
    collection,
    key: def.key,
    count: {
      sql: `SELECT count(*) AS n FROM nodes WHERE ${IN_COLLECTION} AND json_type(body, ?) IS NOT NULL`,
      params: [siteId, collection, `$.fields.${def.key}`],
    },
    issue: (n) => ({
      path: `collections/${collection}/fields/${def.key}`,
      code: "field_key_in_use",
      message: `${entries(n)} of ${collection} already hold ${def.key}; choose another key, or use change_field_type`,
    }),
  };
}

function collectionsRemoved(
  siteId: string,
  at: { collection: string; key: string; field: string },
  removed: readonly string[],
): ReferenceDataChange {
  return {
    collection: at.collection,
    key: at.key,
    count: {
      sql: `SELECT count(*) AS n FROM entry_refs r WHERE r.site_id = ? AND r.source_collection = ? AND r.field = ?
        AND EXISTS (SELECT 1 FROM nodes n WHERE n.site_id = r.site_id AND n.kind = 'contentEntry'
          AND ${memberSql("n", "r.target_id")}
          AND json_extract(n.body, '$.collection') IN (SELECT value FROM json_each(?)))`,
      params: [siteId, at.collection, at.field, JSON.stringify(removed)],
    },
    issue: (n) => ({
      path: `collections/${at.collection}/fields/${at.key}/collections`,
      code: "field_change_needs_operation",
      message: `${n} values of ${at.field} name entries in ${removed.join(", ")}; change them first`,
    }),
  };
}

function subFieldRemoved(siteId: string, collection: string, key: string, sub: string) {
  return {
    collection,
    key,
    count: {
      sql: `SELECT count(*) AS n FROM nodes WHERE ${IN_COLLECTION}
        AND EXISTS (SELECT 1 FROM json_each(body, ?) i WHERE json_type(i.value, ?) IS NOT NULL)`,
      params: [siteId, collection, `$.fields.${key}`, `$.${sub}`],
    },
    issue: (n: number): FieldIssue => ({
      path: `collections/${collection}/fields/${key}/fields`,
      code: "field_change_needs_operation",
      message: `${entries(n)} of ${collection} hold ${key}.${sub}; remove it with remove_field first`,
    }),
  } satisfies ReferenceDataChange;
}

/** A reference sub-field added to a repeater whose stored items already hold its key. */
function subFieldAdded(
  siteId: string,
  at: { collection: string; key: string; sub: string; index: number },
): ReferenceDataChange {
  const { collection, key, sub, index } = at;
  return {
    collection,
    key,
    count: {
      sql: `SELECT count(*) AS n FROM nodes WHERE ${IN_COLLECTION}
        AND EXISTS (SELECT 1 FROM json_each(body, ?) i WHERE json_type(i.value, ?) IS NOT NULL)`,
      params: [siteId, collection, `$.fields.${key}`, `$.${sub}`],
    },
    issue: (n) => ({
      path: `collections/${collection}/fields/${key}/fields/${index}`,
      code: "field_key_in_use",
      message: `${entries(n)} of ${collection} already hold ${key}.${sub} in their items; choose another key`,
    }),
  };
}

/** The changes of one field kept under its key (same type). */
function compare(
  siteId: string,
  collection: string,
  was: FieldDefinition,
  now: FieldDefinition,
): { data: ReferenceDataChange[]; refused: FieldIssue[] } {
  const data: ReferenceDataChange[] = [];
  const refused: FieldIssue[] = [];
  const at = `collections/${collection}/fields/${now.key}`;
  if (was.type === "reference" && now.type === "reference") {
    if ((was.multiple === true) !== (now.multiple === true))
      refused.push({
        path: at,
        code: "field_change_needs_operation",
        message: `changing multiple of ${now.key} needs change_field_type`,
      });
    const gone = was.collections.filter((c) => !now.collections.includes(c));
    if (gone.length > 0)
      data.push(collectionsRemoved(siteId, { collection, key: now.key, field: now.key }, gone));
  }
  if (was.type === "repeater" && now.type === "repeater") {
    const old = new Set(was.fields.map((x) => x.key));
    now.fields.forEach((sub, index) => {
      if (sub.type === "reference" && !old.has(sub.key))
        data.push(subFieldAdded(siteId, { collection, key: now.key, sub: sub.key, index }));
    });
  }
  if (was.type === "repeater" && now.type === "repeater")
    for (const sub of was.fields) {
      const next = now.fields.find((s) => s.key === sub.key);
      if (!next || next.type !== sub.type) {
        data.push(subFieldRemoved(siteId, collection, now.key, sub.key));
        continue;
      }
      if (sub.type !== "reference" || next.type !== "reference") continue;
      const gone = sub.collections.filter((c) => !next.collections.includes(c));
      const field = `${now.key}.${sub.key}`;
      if (gone.length > 0)
        data.push(collectionsRemoved(siteId, { collection, key: now.key, field }, gone));
    }
  return { data, refused };
}

/**
 * The reference and repeater changes from `before` to `after`: value-dependent ones to count and
 * guard, and the ones always refused. A collection dropped entirely is RFC-0040's.
 */
export function referenceDefinitionChanges(
  siteId: string,
  before: { collections?: Site["collections"] | undefined } | undefined,
  after: { collections?: Site["collections"] | undefined },
): { data: ReferenceDataChange[]; refused: FieldIssue[] } {
  const was: Collections = before?.collections ?? {};
  const now: Collections = after.collections ?? {};
  const data: ReferenceDataChange[] = [];
  const refused: FieldIssue[] = [];
  for (const [collection, settings] of Object.entries(now)) {
    const old = new Map((was[collection]?.fields ?? []).map((d) => [d.key, d]));
    for (const def of settings?.fields ?? []) {
      if (def.type !== "reference" && def.type !== "repeater") continue;
      const prior = old.get(def.key);
      if (!prior) {
        // A field an operation creates carries its marker; the operation owns its values.
        if (!def.migration) data.push(added(siteId, collection, def));
        continue;
      }
      const c = compare(siteId, collection, prior, def);
      data.push(...c.data);
      refused.push(...c.refused);
    }
  }
  return { data, refused };
}
