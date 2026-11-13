/**
 * Test helper for the shared suites: a replace import that really rebuilds `entry_refs`.
 * Re-importing a site's own export is planned `unchanged` (`sync-plan.ts`), so the batch writes
 * nothing and no rebuild runs. Here a node is added after the export (the import removes it), and
 * the site's rows are dropped first, so every row the test reads afterwards came from the rebuild.
 */
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { expect } from "vitest";
import type { FieldTypeSupport } from "./references/definitions.ts";
import { exportSite, importSite } from "./sync.ts";

export async function rebuildingImport(
  storage: { sql: SqlDriver; blobs: BlobStore },
  at: {
    siteId: string;
    fieldTypes: FieldTypeSupport;
    /** A store write that adds a node to the site (it is not in the export). */
    addNode: () => Promise<unknown>;
  },
): Promise<void> {
  const bundle = await exportSite(storage, at.siteId);
  await at.addNode();
  await storage.sql.run("DELETE FROM entry_refs WHERE site_id = ?", [at.siteId]);
  const result = await importSite(storage, bundle, {
    mode: "replace",
    fieldTypes: at.fieldTypes,
  });
  expect(result.nodes.unchanged).toBe(false);
}
