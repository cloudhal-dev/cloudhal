/**
 * RFC-0045 §2.7: the kind-aware dependency extractor of releases. References are not release
 * dependencies: closure dependencies are hard (they lock and fail), references are soft at
 * render. So reference values, top level and inside repeater items, are dropped from an entry's
 * body by the site's definitions as pinned (read through a running rename's `fromKey`) before
 * RFC-0008's generic `referencedNodeIds` walks it. Without the change a group id would be pulled
 * into the closure and locked, and an edition's foreign group id would fail the run as
 * `dependency_missing`. Other kinds and other values are walked as before. Worker-safe.
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { type NodeVersion, referencedNodeIds } from "@cloudhal/schedules/engine";
import { GROUP_ID_PATTERN } from "./fields/props.ts";
import { fieldDefinitions, isRecord, renamedFrom } from "./fields/types.ts";

/** One value with its reference ids removed (a repeater keeps its other sub-values). */
function withoutReferences(def: FieldDefinition, value: unknown): unknown {
  if (def.type === "reference") return undefined;
  if (def.type !== "repeater" || !Array.isArray(value)) return value;
  const refs = def.fields.filter((s) => s.type === "reference").map((s) => s.key);
  if (refs.length === 0) return value;
  return value.map((item) =>
    isRecord(item)
      ? Object.fromEntries(Object.entries(item).filter(([k]) => !refs.includes(k)))
      : item,
  );
}

const GROUP_ID = new RegExp(GROUP_ID_PATTERN);

/**
 * A value of a field an operation is rewriting, without the group ids it may still hold in its
 * old shape (RFC-0045 §7: a running conversion from references, a sub-field rename's old key).
 * Field values name no other entry, so every group-id string is a reference.
 */
function withoutIds(value: unknown): unknown {
  if (typeof value === "string") return GROUP_ID.test(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(withoutIds).filter((v) => v !== undefined);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutIds(v)]));
}

/** An entry body without its reference values, under the site's definitions (and markers). */
export function stripReferences(site: Pick<Site, "collections">, body: unknown): unknown {
  if (!isRecord(body) || typeof body.collection !== "string" || !isRecord(body.fields)) return body;
  const defs = fieldDefinitions(site, body.collection);
  if (!defs.some((d) => d.type === "reference" || d.type === "repeater" || d.migration))
    return body;
  const fields: Record<string, unknown> = { ...body.fields };
  for (const def of defs)
    for (const key of [def.key, renamedFrom(def)])
      if (key !== undefined && Object.hasOwn(fields, key)) {
        const value = withoutReferences(def, fields[key]);
        fields[key] = def.migration ? withoutIds(value) : value;
      }
  return { ...body, fields };
}

/** `depsOf` for `dependencyClosure`: the ids a node version needs live, references excepted. */
export function releaseDepsOf(
  site: Pick<Site, "collections">,
  bodyOf: (ref: NodeVersion) => Promise<string>,
): (ref: NodeVersion) => Promise<string[]> {
  return async (ref) => {
    const body = JSON.parse(await bodyOf(ref)) as unknown;
    return referencedNodeIds(ref.kind === "contentEntry" ? stripReferences(site, body) : body);
  };
}
