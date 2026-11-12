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
import { type FieldIssue, isRecord, renamedFrom } from "../fields/types.ts";
import { type AssetRefUse, markdownAssetIds } from "./refs.ts";

const ASSET_ID = new RegExp(ASSET_ID_PATTERN);

/**
 * A field's asset reference with where it sits: `fields/cover`, or inside a repeater item
 * `fields/speakers/2/photo` (RFC-0045 §2.5), so issues map to their control.
 */
export interface FieldAssetRef extends AssetRefUse {
  /** The first use's path. */
  readonly path: string;
  /** Every use's path, in order (one asset in several items is one row, but several uses). */
  readonly paths: readonly string[];
}

type Slot = { type: string };

/** One value's assets: an image's id, a rich text's `asset:` links. */
function valueAssets(slot: Slot, value: unknown): string[] {
  if (typeof value !== "string") return [];
  if (slot.type === "image") return ASSET_ID.test(value) ? [value] : [];
  return slot.type === "richText" && value.includes("asset:") ? markdownAssetIds(value) : [];
}

/**
 * Every asset reference of an entry's field values under `defs`, sorted like `assetRefsOf`: top
 * level under `fields.<key>`, and in repeater items under `fields.<key>.<sub>` (one row per asset
 * and field; the first use's item path is kept).
 */
export function fieldAssetRefs(
  defs: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>> | undefined,
): FieldAssetRef[] {
  if (!values || defs.length === 0) return [];
  const out = new Map<string, { assetId: string; field: string; path: string; paths: string[] }>();
  const add = (assetId: string, field: string, path: string) => {
    const id = `${assetId}\n${field}`;
    const held = out.get(id);
    if (held) held.paths.push(path);
    else out.set(id, { assetId, field, path, paths: [path] });
  };
  for (const def of defs) {
    const value = Object.hasOwn(values, def.key) ? values[def.key] : undefined;
    for (const id of valueAssets(def, value)) add(id, `fields.${def.key}`, `fields/${def.key}`);
    if (def.type !== "repeater" || !Array.isArray(value)) continue;
    // RFC-0045 §7: a running sub-field rename's items still hold the old key.
    const m = def.migration;
    const held = (item: Record<string, unknown>, key: string) => {
      if (Object.hasOwn(item, key)) return item[key];
      const was = m?.sub === key ? m.fromKey : undefined;
      return was !== undefined && Object.hasOwn(item, was) ? item[was] : undefined;
    };
    value.forEach((item, i) => {
      if (!isRecord(item)) return;
      for (const sub of def.fields)
        for (const id of valueAssets(sub, held(item, sub.key)))
          add(id, `fields.${def.key}.${sub.key}`, `fields/${def.key}/${i}/${sub.key}`);
    });
  }
  return [...out.values()].sort(
    (a, b) => a.assetId.localeCompare(b.assetId) || a.field.localeCompare(b.field),
  );
}

/**
 * `values` as readers see them while a rename runs (RFC-0041 §6, `resolveFields`' `read`): a
 * defined key the entry does not hold yet reads its definition's `migration.fromKey`. For the
 * whole-site readers of stored bodies (the `asset_refs` rebuild, the purge planner's asset rule);
 * a write's own checks read the values it writes.
 */
export function migratedFieldValues(
  defs: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (!values || !defs.some((d) => renamedFrom(d))) return values;
  const out: Record<string, unknown> = { ...values };
  for (const def of defs) {
    const from = renamedFrom(def);
    if (from && !Object.hasOwn(values, def.key) && Object.hasOwn(values, from))
      out[def.key] = values[from];
  }
  return out;
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
  readonly refs: readonly UseRef[];
  /** `fieldAssetRefs` of the stored entry (empty for a new one). */
  readonly kept: readonly AssetRefUse[];
  /** Assets of the entry's site, by id. */
  readonly lookup: SiteAssetLookup;
  /**
   * Issue paths (`fields/<key>`, `fields/speakers/2/person`) whose value already has an issue:
   * a reference is not checked when one of these is a prefix of its path, or it of one.
   */
  readonly skip?: ReadonlySet<string>;
}

/** References a write adds: not held by the stored entry under the same field. */
export function newFieldAssetRefs<R extends AssetRefUse>(
  refs: readonly R[],
  kept: readonly AssetRefUse[],
): R[] {
  const held = new Set(kept.map((r) => `${r.assetId}\n${r.field}`));
  return refs.filter((r) => !held.has(`${r.assetId}\n${r.field}`));
}

/** A reference with where it is used: `fieldAssetRefs`' item paths, or none (a top-level ref). */
type UseRef = AssetRefUse & { readonly path?: string; readonly paths?: readonly string[] };

/** A ref's use paths, else its field's (`fields.<key>` → `fields/<key>`). */
const pathsOf = (r: UseRef): readonly string[] =>
  r.paths ?? [r.path ?? `fields/${r.field.slice("fields.".length)}`];

/** One path lies at or under the other (`fields/speakers` and `fields/speakers/2/photo`). */
const nested = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/** Field and sub-field types by `<key>` and `<key>.<sub>`. */
function slotTypes(defs: readonly FieldDefinition[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of defs) {
    out.set(d.key, d.type);
    if (d.type === "repeater") for (const s of d.fields) out.set(`${d.key}.${s.key}`, s.type);
  }
  return out;
}

/**
 * RFC-0041 §2: every reference a write adds names a file of the site; an image field's (or image
 * sub-field's) is an image; a retired file is not newly used unless the entry already used it.
 * Issues are `invalid_value` at the reference's path (`fields/<key>`, or an item path).
 */
export async function fieldAssetIssues(check: FieldAssetCheck): Promise<FieldIssue[]> {
  const { defs, kept, skip } = check;
  const skipped = [...(skip ?? [])];
  // Every use no skip path covers: one asset in several items is reported at each item.
  const uses = newFieldAssetRefs(check.refs, kept).flatMap((ref) =>
    pathsOf(ref)
      .filter((path) => !skipped.some((s) => nested(path, s)))
      .map((path) => ({ ref, path })),
  );
  if (uses.length === 0) return [];
  const refs = [...new Set(uses.map((u) => u.ref))];
  const assets = await check.lookup(refs.map((r) => r.assetId));
  const keptIds = new Set(kept.map((r) => r.assetId));
  const types = slotTypes(defs);
  const out: FieldIssue[] = [];
  for (const { ref, path } of uses) {
    const slot = ref.field.slice("fields.".length);
    const problem = assetProblem(
      assets.get(ref.assetId),
      types.get(slot),
      keptIds.has(ref.assetId),
    );
    if (problem) out.push({ path, code: "invalid_value", message: `${ref.assetId} ${problem}` });
  }
  return out;
}

function assetProblem(
  asset: Asset | undefined,
  type: string | undefined,
  kept: boolean,
): string | undefined {
  if (!asset) return "is not a file of this site";
  if (type === "image" && asset.kind !== "image") return `is a ${asset.kind} file, not an image`;
  if (asset.status === "retired" && !kept) return "was retired and cannot be newly used";
  return undefined;
}
