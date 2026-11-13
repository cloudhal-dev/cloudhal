/**
 * RFC-0045 §2.5 over MCP: the precheck reports the same asset issues inside repeater items as the
 * store (it is the store's own plan, run as a dry run), an item-level issue in one item not hiding
 * a non-image in another (full issue paths, as `store/entry-fields.ts` builds its skip set).
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { type ToolContext, ToolError } from "../src/common.ts";
import { checkEntryWrite } from "../src/entry-fields.ts";

const L = (label: string) => ({ en: { label } });
const SPEAKERS: FieldDefinition = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [
    { key: "talk", type: "text", labels: L("Talk"), maxLength: 10 },
    { key: "photo", type: "image", labels: L("Photo") },
  ],
};

describe("checkEntryWrite: assets in repeater items", () => {
  it("reports an item-level issue and another item's non-image together", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({
      sql,
      blobs: new MemoryBlobStore(),
      fieldTypes: { supported: () => true },
    });
    const seeded = await seedStarterSite(store, { name: "Events", slug: "events" });
    const csv = await store.ingestAsset({
      siteId: seeded.id,
      bytes: new TextEncoder().encode("a,b\n1,2\n"),
      filename: "data.csv",
      uploadedBy: { kind: "human", id: "user_assets01", name: "Halil" },
      source: { kind: "upload" },
    });
    const site = await store.updateSite({
      ...seeded,
      collections: { events: { fields: [SPEAKERS] } },
    });
    const ctx = { store, principal: {} } as unknown as ToolContext;
    const create = {
      siteId: site.id,
      collection: "events",
      slug: "launch",
      locale: "en",
      status: "draft" as const,
      title: "Launch",
      body: { format: "markdown" as const, value: "Body" },
      fields: { speakers: [{ talk: "far too long a talk" }, { photo: csv.asset.id }] },
      tags: [],
      author: { kind: "human" as const, id: "user_assets01", name: "Halil" },
    };
    const error = await checkEntryWrite(ctx, { create }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ToolError);
    const issues = (error as ToolError).details?.issues as { path: string }[];
    expect(issues.map((i) => i.path).sort()).toEqual([
      "fields/speakers/0/talk",
      "fields/speakers/1/photo",
    ]);
  });
});
