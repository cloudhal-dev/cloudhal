/**
 * RFC-0041 §2, §3, §5: the typed-field part of an entry write, run by `EntryEngine.write`.
 *
 * - **Values:** `checkFieldValues` on the keys that changed against the stored entry (all keys for
 *   a new entry or one that moves collection), unknown keys refused once the collection has
 *   definitions, and a translation's own copy of a non-localized value refused.
 * - **Size:** the 256 KB cap applies in every collection (§2, "checked by the store"), but only
 *   when the write changes `fields`, so an entry stored before the cap still takes other edits.
 * - **`requiredToPublish`:** an entry written in review or published needs every required value
 *   (a translation reads non-localized ones from its original), like `required_term`.
 * - **Assets:** an image value is an image asset of the same site, and rich text's `asset:` links
 *   name files of the site; both are recorded in `asset_refs` under `fields.<key>`, in the write's
 *   batch and guarded like `planRefs` (rule 4), so a used asset cannot be deleted.
 *
 * Sites without any field definition run only the size check and add no statements.
 */
import type { Asset, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import {
  checkFieldValues,
  checkRequiredToPublish,
  convertContext,
  type FieldIssue,
  fieldDefinitions,
  normalizeThroughMarkers,
  refuseFieldIssues,
} from "../fields/index.ts";
import { sameJson } from "../fields/types.ts";
import { fieldAssetRefs } from "../media/field-refs.ts";
import type { AssetRefUse } from "../media/refs.ts";
import type { Cond } from "../node-sql.ts";
import type { StoreContext } from "./context.ts";

/** What the field checks add to an entry write. */
export interface EntryFieldsPlan {
  readonly guard: Cond | undefined;
  /** `asset_refs` rows under `fields.*`, anchored on the entry's new hash (after `planRefs`'s). */
  statements(hash: string): SqlStatement[];
  /** After a write that matched no row: the field-specific reason, if an asset moved. */
  diagnose(): Promise<void>;
}

const NOTHING: EntryFieldsPlan = {
  guard: undefined,
  statements: () => [],
  diagnose: async () => {},
};

const ANCHOR = "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)";

const hasDefinitions = (site: Site) =>
  Object.values(site.collections ?? {}).some((c) => (c?.fields?.length ?? 0) > 0);

/** The translation group's original in the same site, when `entry` is a translation. */
async function originalOf(
  ctx: StoreContext,
  entry: ContentEntry,
): Promise<ContentEntry | undefined> {
  const t = entry.translation;
  if (!t || t.group === entry.id || t.source?.siteId !== undefined) return undefined;
  const original = await ctx.graph.getContentEntry(t.group);
  return original?.siteId === entry.siteId ? original : undefined;
}

/**
 * RFC-0041 §6: while a field operation runs, a write goes through its marker (a renamed key moves,
 * a value still in the old type converts, a removed field or a translation's copy of a field that
 * stops being localized goes), so a person's edit and the operation converge.
 */
export function normalizeEntryFields(site: Site, draft: ContentEntry): ContentEntry {
  const defs = fieldDefinitions(site, draft.collection);
  if (!defs.some((d) => d.migration)) return draft;
  const t = draft.translation;
  const fields = normalizeThroughMarkers(defs, draft.fields, {
    convert: convertContext(site),
    translation: !!t && t.group !== draft.id && t.source?.siteId === undefined,
  });
  return fields ? { ...draft, fields } : draft;
}

/** Checks the field part of an entry write and plans its asset references; throws on issues. */
export async function planEntryFields(
  ctx: StoreContext,
  site: Site,
  draft: ContentEntry,
  stored: ContentEntry | undefined,
): Promise<EntryFieldsPlan> {
  const defs = fieldDefinitions(site, draft.collection);
  const values = draft.fields ?? {};
  const sameCollection = stored?.collection === draft.collection;
  if (defs.length === 0) {
    if (!stored || !sameJson(stored.fields ?? {}, values))
      refuseFieldIssues(checkFieldValues([], { values }));
    return hasDefinitions(site) ? refsPlan(ctx, { site, draft, refs: [], kept: [] }) : NOTHING;
  }
  const original = await originalOf(ctx, draft);
  const previous = sameCollection ? (stored?.fields ?? {}) : undefined;
  const issues = checkFieldValues(defs, {
    values,
    previous,
    original: original ? { id: original.id, values: original.fields ?? {} } : undefined,
    blocks: ctx.graph.blocks,
  });
  const refs = fieldAssetRefs(defs, values);
  const kept = stored
    ? fieldAssetRefs(fieldDefinitions(site, stored.collection), stored.fields)
    : [];
  const invalid = new Set(issues.map((i) => i.path.split("/").slice(0, 2).join("/")));
  const fresh = newRefs(refs, kept).filter((r) => !invalid.has(r.field.replace(".", "/")));
  issues.push(...(await assetIssues(ctx, { site, defs, refs: fresh, kept })));
  issues.push(...checkRequiredToPublish(site, draft, original));
  refuseFieldIssues(issues);
  return refsPlan(ctx, { site, draft, refs, kept, defs });
}

/** References a write adds: not held by the stored entry under the same field. */
function newRefs(refs: readonly AssetRefUse[], kept: readonly AssetRefUse[]): AssetRefUse[] {
  const held = new Set(kept.map((r) => `${r.assetId}\n${r.field}`));
  return refs.filter((r) => !held.has(`${r.assetId}\n${r.field}`));
}

interface AssetCheck {
  site: Site;
  defs: readonly FieldDefinition[];
  refs: readonly AssetRefUse[];
  kept: readonly AssetRefUse[];
}

/** RFC-0041 §2: new references name files of the site; an image field's is an image, not retired. */
async function assetIssues(ctx: StoreContext, check: AssetCheck): Promise<FieldIssue[]> {
  const { site, defs, refs, kept } = check;
  if (refs.length === 0) return [];
  const assets = await ctx.assets.getAssets(
    site.id,
    refs.map((r) => r.assetId),
  );
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

/**
 * The `fields.*` rows of `asset_refs` for an entry, rewritten: anchored on its new hash, so they
 * run only when the entry's write did (rule 4). Field operations use it for every entry they move.
 */
export function fieldRefStatements(
  siteId: string,
  nodeId: string,
  refs: readonly AssetRefUse[],
  hash: string,
): SqlStatement[] {
  const out: SqlStatement[] = [
    {
      sql: `DELETE FROM asset_refs WHERE node_id = ? AND field LIKE 'fields.%' AND ${ANCHOR}`,
      params: [nodeId, nodeId, hash],
    },
  ];
  if (refs.length > 0)
    out.push({
      sql: `INSERT INTO asset_refs (site_id, asset_id, node_id, node_kind, field)
            SELECT ?, json_extract(value, '$.a'), ?, 'contentEntry', json_extract(value, '$.f') FROM json_each(?) WHERE ${ANCHOR}`,
      params: [
        siteId,
        nodeId,
        JSON.stringify(refs.map((r) => ({ a: r.assetId, f: r.field }))),
        nodeId,
        hash,
      ],
    });
  return out;
}

interface RefsInput {
  site: Site;
  draft: ContentEntry;
  refs: readonly AssetRefUse[];
  kept: readonly AssetRefUse[];
  defs?: readonly FieldDefinition[];
}

/** The `fields.*` rows of `asset_refs`, rewritten with every write in a site that has fields. */
function refsPlan(ctx: StoreContext, input: RefsInput): EntryFieldsPlan {
  const { site, draft, refs, kept } = input;
  const nodeId = draft.id;
  const ids = [...new Set(refs.map((r) => r.assetId))];
  const keptIds = [...new Set(kept.map((r) => r.assetId))];
  const statements = (hash: string) => fieldRefStatements(site.id, nodeId, refs, hash);
  if (ids.length === 0) return { guard: undefined, statements, diagnose: async () => {} };
  // The files still exist, and are active unless the entry already used them (as `planRefs`).
  const guard: Cond = {
    sql: "(SELECT count(*) FROM nodes WHERE kind = 'asset' AND site_id = ? AND id IN (SELECT value FROM json_each(?)) AND (json_extract(body, '$.status') = 'active' OR id IN (SELECT value FROM json_each(?)))) = ?",
    params: [site.id, JSON.stringify(ids), JSON.stringify(keptIds), ids.length],
  };
  const diagnose = async () =>
    refuseFieldIssues(
      await assetIssues(ctx, { site, defs: input.defs ?? [], refs: newRefs(refs, kept), kept }),
    );
  return { guard, statements, diagnose };
}
