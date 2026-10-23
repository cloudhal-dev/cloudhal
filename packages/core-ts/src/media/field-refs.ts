/**
 * RFC-0041 §2: typed custom fields refer to assets too. An `image` field's value is an asset id,
 * and a `richText` field's `asset:` links and images count like a body's (RFC-0004 §4.4). Each is
 * recorded in `asset_refs` under `fields.<key>`, so a used asset cannot be deleted. Only fields a
 * collection defines count: in a collection without definitions `fields` stays "any JSON".
 * Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { ASSET_ID_PATTERN } from "../fields/props.ts";
import { type AssetRefUse, markdownAssetIds } from "./refs.ts";

const ASSET_ID = new RegExp(ASSET_ID_PATTERN);

/** Every asset reference of an entry's field values under `defs`, sorted like `assetRefsOf`. */
export function fieldAssetRefs(
  defs: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>> | undefined,
): AssetRefUse[] {
  if (!values || defs.length === 0) return [];
  const out = new Map<string, AssetRefUse>();
  const add = (assetId: string, field: string) =>
    out.set(`${assetId}\n${field}`, { assetId, field });
  for (const def of defs) {
    const value = values[def.key];
    if (typeof value !== "string") continue;
    const field = `fields.${def.key}`;
    if (def.type === "image" && ASSET_ID.test(value)) add(value, field);
    else if (def.type === "richText" && value.includes("asset:"))
      for (const id of markdownAssetIds(value)) add(id, field);
  }
  return [...out.values()].sort(
    (a, b) => a.assetId.localeCompare(b.assetId) || a.field.localeCompare(b.field),
  );
}

/** Field definitions per collection of a site node (`{}` when it has none). */
export function siteFieldDefinitions(site: {
  collections?: Record<string, { fields?: FieldDefinition[] | undefined } | undefined> | undefined;
}): Record<string, readonly FieldDefinition[]> {
  const out: Record<string, readonly FieldDefinition[]> = {};
  for (const [key, settings] of Object.entries(site.collections ?? {}))
    if (settings?.fields?.length) out[key] = settings.fields;
  return out;
}
