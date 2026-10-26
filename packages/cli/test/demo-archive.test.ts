/**
 * The committed starter demo archive (RFC-0039 rollout step 5): it reads and verifies in full, and
 * imports into a fresh project as the starter site with its published snapshot, once. It is an
 * archive an older CLI may have written (its `createdBy`). Regenerating it, and failing when it is
 * stale, is `scripts/demo-archive.ts`'s job (`pnpm check`).
 */
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { readArchive, type SiteArchiveManifest } from "../src/archive/index.ts";
import { importArchive } from "../src/commands/import.ts";
import { writeProjectConfig } from "../src/config.ts";
import { removeTempDirs, tempDir, withStore } from "./site-fixture.ts";

const DEMO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/site-archives/starter-blog.cloudhal",
);
const SITE = "site_starter0001";

afterAll(removeTempDirs);

/** A project naming the demo's site, without a local store. */
async function project(): Promise<string> {
  const dir = await tempDir("cloudhal-demo-");
  await writeProjectConfig(dir, { siteId: SITE, dataDir: ".cloudhal" });
  return dir;
}

describe("the starter demo archive", () => {
  it("reads and verifies in full", async () => {
    let manifest: SiteArchiveManifest | undefined;
    const paths: string[] = [];
    for await (const item of readArchive(createReadStream(DEMO))) {
      if (item.type === "manifest") manifest = item.manifest;
      else paths.push(item.path);
    }
    expect(manifest).toMatchObject({
      format: "cloudhal.site-archive@1",
      bundle: "cloudhal.site-bundle@1",
      siteId: SITE,
      siteName: "Starter Blog",
      createdAt: "2026-10-26T00:00:00.000Z",
      counts: { nodes: 9, snapshots: 1, blobs: 9, media: 0, mediaBytes: 0 },
    });
    expect(paths).toEqual([
      "project.json",
      "nodes/0001.ndjson",
      "snapshots/0001.ndjson",
      "blobs/0001.ndjson",
    ]);
  });

  it("imports into a fresh project as the published starter site, once", async () => {
    const dir = await project();
    const dry = await importArchive({ projectDir: dir, file: DEMO, dryRun: true });
    expect(dry.refusals).toEqual([]);
    expect(dry.plan?.nodes.added).toHaveLength(9);
    expect(dry.plan?.snapshots).toEqual(["snap_starter0001"]);
    expect(dry.newStore).toBe(true);

    const first = await importArchive({ projectDir: dir, file: DEMO });
    expect(first.imported).toMatchObject({ nodes: { inserted: 9 }, snapshots: 1, blobs: 9 });
    const site = await withStore(dir, (local) => local.store.getSite(SITE));
    expect(site?.publishedSnapshotId).toBe("snap_starter0001");
    expect(site?.theme.config?.motion).toBe("standard");

    const again = await importArchive({ projectDir: dir, file: DEMO });
    expect(again.plan?.unchanged).toBe(true);
    expect(again.imported).toMatchObject({
      nodes: { inserted: 0, deleted: 0, unchanged: true },
      snapshots: 0,
      blobs: 0,
    });
  });
});
