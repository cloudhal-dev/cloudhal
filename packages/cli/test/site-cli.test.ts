/** `cloudhal site list|create|delete` on the project's SQLite (RFC-0034 §2–3). */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedStarterSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterEach, describe, expect, it } from "vitest";
import { createSite, deleteSite, listSites } from "../src/commands/site.ts";
import { writeProjectConfig } from "../src/config.ts";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function project() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "cloudhal-site-"));
  dirs.push(projectDir);
  const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
  const site = await seedStarterSite(local.store, { name: "English", slug: "english" });
  await local.close();
  await writeProjectConfig(projectDir, { siteId: site.id, dataDir: ".cloudhal" });
  return { projectDir, site };
}

describe("cloudhal site (local)", () => {
  it("creates a second site in the project, lists both and deletes the new one", async () => {
    const { projectDir, site } = await project();
    const tr = await createSite(
      { projectDir },
      { name: "Türkçe", slug: "turkce", locale: "tr", projectId: site.projectId },
    );
    expect(tr.projectId).toBe(site.projectId);
    await expect(createSite({ projectDir }, { name: "Again", slug: "turkce" })).rejects.toThrow(
      /exists/,
    );
    expect((await listSites({ projectDir })).map((s) => `${s.slug}:${s.defaultLocale}`)).toEqual([
      "english:en",
      "turkce:tr",
    ]);

    await expect(deleteSite({ projectDir }, tr.id, "nope")).rejects.toThrow(/confirm/);
    await expect(deleteSite({ projectDir }, site.id, "english")).rejects.toThrow(
      /this project's site/,
    );
    const r = await deleteSite({ projectDir }, tr.id, "turkce");
    expect(r.rows).toBeGreaterThan(0);
    expect((await listSites({ projectDir })).map((s) => s.slug)).toEqual(["english"]);
  });

  it("creates a language edition of the project's site", async () => {
    const { projectDir, site } = await project();
    const ed = await createSite(
      { projectDir },
      { name: "Deutsch", slug: "deutsch", locale: "de", from: site.id },
    );
    expect(ed.projectId).toBe(site.projectId);
    expect(ed.edition?.pages).toBe(2);
    expect(ed.edition?.skipped).toEqual([]);
  });
});
