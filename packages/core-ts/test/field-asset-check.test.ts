/**
 * RFC-0041 §2: the one asset check of typed field values (`fieldAssetIssues`), shared by the
 * store's entry write and MCP's precheck: files of the site, images for image fields, retired files
 * only where the entry already used them, unchanged references not re-checked.
 */
import type { Asset, FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { fieldAssetIssues, fieldAssetRefs, newFieldAssetRefs } from "../src/media/index.ts";

const DEFS: FieldDefinition[] = [
  { key: "poster", type: "image", labels: { en: { label: "Poster" } }, localized: false },
  { key: "agenda", type: "richText", labels: { en: { label: "Agenda" } }, localized: true },
];

const asset = (id: string, kind: Asset["kind"], status: Asset["status"] = "active") =>
  ({ id, kind, status }) as Asset;

const ASSETS = new Map<string, Asset>([
  ["asset_image01", asset("asset_image01", "image")],
  ["asset_data01", asset("asset_data01", "document")],
  ["asset_retired01", asset("asset_retired01", "image", "retired")],
]);

function lookup() {
  const asked: string[][] = [];
  const fn = async (ids: readonly string[]) => {
    asked.push([...ids]);
    return new Map([...ASSETS].filter(([id]) => ids.includes(id)));
  };
  return { fn, asked };
}

describe("fieldAssetIssues", () => {
  it("accepts image assets and rich-text links to files of the site", async () => {
    const values = { poster: "asset_image01", agenda: "See [data](asset:asset_data01)." };
    const refs = fieldAssetRefs(DEFS, values);
    const { fn } = lookup();
    expect(await fieldAssetIssues({ defs: DEFS, refs, kept: [], lookup: fn })).toEqual([]);
  });

  it("refuses missing files, non-images in image fields and newly used retired files", async () => {
    const values = {
      poster: "asset_data01",
      agenda: "[a](asset:asset_gone01) [b](asset:asset_retired01)",
    };
    const refs = fieldAssetRefs(DEFS, values);
    const { fn } = lookup();
    const issues = await fieldAssetIssues({ defs: DEFS, refs, kept: [], lookup: fn });
    expect(issues).toEqual([
      {
        path: "fields/poster",
        code: "invalid_value",
        message: "asset_data01 is a document file, not an image",
      },
      {
        path: "fields/agenda",
        code: "invalid_value",
        message: "asset_gone01 is not a file of this site",
      },
      {
        path: "fields/agenda",
        code: "invalid_value",
        message: "asset_retired01 was retired and cannot be newly used",
      },
    ]);
  });

  it("skips references the entry already holds and allows a retired file it used", async () => {
    const kept = fieldAssetRefs(DEFS, { poster: "asset_retired01" });
    const moved = fieldAssetRefs(DEFS, { agenda: "![x](asset:asset_retired01)" });
    const { fn, asked } = lookup();
    expect(await fieldAssetIssues({ defs: DEFS, refs: kept, kept, lookup: fn })).toEqual([]);
    expect(asked).toEqual([]);
    expect(await fieldAssetIssues({ defs: DEFS, refs: moved, kept, lookup: fn })).toEqual([]);
    expect(newFieldAssetRefs([...kept, ...moved], kept)).toEqual(moved);
  });

  it("does not check the references of a value that already has an issue", async () => {
    const refs = fieldAssetRefs(DEFS, { poster: "asset_gone01" });
    const { fn, asked } = lookup();
    const skip = new Set(["fields/poster"]);
    expect(await fieldAssetIssues({ defs: DEFS, refs, kept: [], lookup: fn, skip })).toEqual([]);
    expect(asked).toEqual([]);
  });
});
