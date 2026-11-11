/**
 * RFC-0045 §2.5 over MCP: the precheck reports the same asset issues inside repeater items as the
 * store, an item-level issue in one item not hiding a non-image in another (full issue paths, as
 * `store/entry-fields.ts` builds its skip set).
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { InvariantError, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../src/common.ts";
import { checkEntryFields } from "../src/entry-fields.ts";

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

describe("checkEntryFields: assets in repeater items", () => {
  it("reports an item-level issue and another item's non-image together", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const seeded = await seedStarterSite(store, { name: "Events", slug: "events" });
    const csv = await store.ingestAsset({
      siteId: seeded.id,
      bytes: new TextEncoder().encode("a,b\n1,2\n"),
      filename: "data.csv",
      uploadedBy: { kind: "human", id: "user_assets01", name: "Halil" },
      source: { kind: "upload" },
    });
    // The precheck takes the site as given: the definitions need no store capability here.
    const site = { ...seeded, collections: { events: { fields: [SPEAKERS] } } } as Site;
    const ctx = { store, principal: {} } as unknown as ToolContext;
    const next = {
      id: "entry_01HZX8K3QASSET",
      siteId: site.id,
      collection: "events",
      status: "draft" as const,
      fields: { speakers: [{ talk: "far too long a talk" }, { photo: csv.asset.id }] },
    };
    const error = await checkEntryFields(ctx, { site, next }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InvariantError);
    const issues = (error as InvariantError).details.issues as { path: string }[];
    expect(issues.map((i) => i.path).sort()).toEqual([
      "fields/speakers/0/talk",
      "fields/speakers/1/photo",
    ]);
  });
});
