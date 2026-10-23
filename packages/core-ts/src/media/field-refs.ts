/**
 * RFC-0041 §2: typed custom fields refer to assets too. An `image` field's value is an asset id,
 * and a `richText` field's `asset:` links and images count like a body's (RFC-0004 §4.4). Each is
 * recorded in `asset_refs` under `fields.<key>`, so a used asset cannot be deleted. Only fields a
 * collection defines count: in a collection without definitions `fields` stays "any JSON".
 * `fieldAssetIssues` is the one asset check of field values, run by the store's entry write and by
 * MCP's precheck; it reads assets through a lookup, so it stays storage-free. Worker-safe.
 */
import type { Asset, FieldDefinition } from "@cloudhal/core-contracts";
import { ASSET_ID_PATTERN } from "../fields/props.ts";
import type { FieldIssue } from "../fields/types.ts";
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

/** The assets of one site among `ids` (absent ids are missing or belong to another site). */
export type SiteAssetLookup = (ids: readonly string[]) => Promise<ReadonlyMap<string, Asset>>;

/** What `fieldAssetIssues` checks: the references a write would hold and those the entry holds. */
export interface FieldAssetCheck {
  /** The entry's field definitions (its new collection's). */
  readonly defs: readonly FieldDefinition[];
  /** `fieldAssetRefs` of the values being written. */
  readonly refs: readonly AssetRefUse[];
  /** `fieldAssetRefs` of the stored entry (empty for a new one). */
  readonly kept: readonly AssetRefUse[];
  /** Assets of the entry's site, by id. */
  readonly lookup: SiteAssetLookup;
  /** Paths (`fields/<key>`) whose value already has an issue: their references are not checked. */
  readonly skip?: ReadonlySet<string>;
}

/** References a write adds: not held by the stored entry under the same field. */
export function newFieldAssetRefs(
  refs: readonly AssetRefUse[],
  kept: readonly AssetRefUse[],
): AssetRefUse[] {
  const held = new Set(kept.map((r) => `${r.assetId}\n${r.field}`));
  return refs.filter((r) => !held.has(`${r.assetId}\n${r.field}`));
}

/**
 * RFC-0041 §2: every reference a write adds names a file of the site; an image field's is an
 * image; a retired file is not newly used unless the entry already used it. Issues are
 * `invalid_value` at `fields/<key>`.
 */
export async function fieldAssetIssues(check: FieldAssetCheck): Promise<FieldIssue[]> {
  const { defs, kept, skip } = check;
  const refs = newFieldAssetRefs(check.refs, kept).filter(
    (r) => !skip?.has(r.field.replace(".", "/")),
  );
  if (refs.length === 0) return [];
  const assets = await check.lookup(refs.map((r) => r.assetId));
  const keptIds = new Set(kept.map((r) => r.assetId));
  const types = new Map(defs.map((d) => [d.key, d.type]));
  const out: FieldIssue[] = [];
  for (const ref of refs) {
    const key = ref.field.slice("fields.".length);
    const problem = assetProblem(assets.get(ref.assetId), types.get(key), keptIds.has(ref.assetId));
    if (problem)
      out.push({
        path: `fields/${key}`,
        code: "invalid_value",
        message: `${ref.assetId} ${problem}`,
      });
  }
  return out;
}

function assetProblem(
  asset: Asset | undefined,
  type: FieldDefinition["type"] | undefined,
  kept: boolean,
): string | undefined {
  if (!asset) return "is not a file of this site";
  if (type === "image" && asset.kind !== "image") return `is a ${asset.kind} file, not an image`;
  if (asset.status === "retired" && !kept) return "was retired and cannot be newly used";
  return undefined;
}
