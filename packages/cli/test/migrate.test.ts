import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import { describeMigration, migrateTags, writeProjectConfig } from "../src/index.ts";

const person = { kind: "human" as const, id: "user_migrate0001", name: "Owner" };

describe("cloudhal migrate tags-to-terms", () => {
  let projectDir: string;
  let siteId: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-migrate-"));
    const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
    // A site from before RFC-0002: no taxonomies, tags on entries.
    const site = await local.store.createSite({
      projectId: "proj_migrate0001",
      name: "Old site",
      slug: "old-site",
      defaultLocale: "en",
      locales: ["en"],
      domains: [],
      pageIds: [],
      theme: { name: "blog" },
    });
    siteId = site.id;
    for (const [slug, tags] of [
      ["first", ["machine-learning", "ai"]],
      ["second", ["ai"]],
    ] as const)
      await local.store.createContentEntry({
        siteId,
        collection: "posts",
        slug,
        locale: "en",
        status: "published",
        title: slug,
        body: { format: "markdown", value: "x" },
        fields: {},
        tags: [...tags],
        author: person,
      });
    await local.close();
    await writeProjectConfig(projectDir, { siteId, dataDir: ".cloudhal" });
  });

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it("is in the help text, and refuses unknown migrations", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await main(["migrate", "--help"])).toBe(0);
      expect(out.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]",
      );
    } finally {
      out.mockRestore();
    }
    await expect(main(["migrate", "everything"])).rejects.toThrow(
      /usage: cloudhal migrate tags-to-terms/,
    );
    await expect(
      main(["migrate", "tags-to-terms", "--dry-run", "--revert", "snap_x"]),
    ).rejects.toThrow(/cannot be combined/);
  });

  it("dry-runs, migrates, is idempotent and reverts", async () => {
    const dry = await migrateTags({ projectDir, dryRun: true });
    expect(describeMigration(dry)).toEqual([
      "would migrate 2 entries: 2 distinct tags, 2 new terms, 0 reused",
      "would create taxonomies: category, tag (category not required on existing sites)",
    ]);

    const run = await migrateTags({ projectDir });
    if ("restored" in run) throw new Error("expected a migration");
    expect(run).toMatchObject({
      entries: 2,
      termsCreated: 2,
      taxonomiesCreated: ["category", "tag"],
    });
    expect(describeMigration(run)).toContain(
      `migration id ${run.migrationId} (undo: cloudhal migrate tags-to-terms --revert ${run.migrationId})`,
    );
    let local = await openLocalStore(path.join(projectDir, ".cloudhal"));
    try {
      const entries = await local.store.listContentEntries(siteId);
      expect(entries.map((e) => e.tags)).toEqual([[], []]);
      expect((await local.store.listContentEntries(siteId, { filter: "tag:ai" })).length).toBe(2);
    } finally {
      await local.close();
    }

    expect(describeMigration(await migrateTags({ projectDir }))).toEqual([
      "nothing to migrate: no entry has tags and the taxonomies exist",
    ]);

    const reverted = await migrateTags({ projectDir, revert: run.migrationId });
    expect(reverted).toMatchObject({ restored: 2, edited: [], termsDeleted: 2 });
    local = await openLocalStore(path.join(projectDir, ".cloudhal"));
    try {
      const entries = await local.store.listContentEntries(siteId);
      expect(entries.map((e) => e.tags)).toEqual([["machine-learning", "ai"], ["ai"]]);
      expect(await local.store.listTaxonomies(siteId)).toEqual([]);
    } finally {
      await local.close();
    }
  });
});
