/**
 * `cloudhal import --replace` of another site's archive (RFC-0039 §2): `cloudhal.json`'s `siteId`
 * (and the old id in `sites`) switches to the archive's, editing only those values in the file's
 * text, last: a failed import leaves it as it was, and one that landed while the file changed says
 * so and a second run only switches; the old site stays in the local store, unlisted and
 * untouched, and writing its id back undoes the switch; `--dry-run` shows the switch and writes
 * nothing; a deployed project is warned that its deployment serves the old site (invariant 1),
 * from `state.json` alone; a hostname the old site serves refuses it before anything is written.
 * Then the text edit on its own.
 */
import { writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page, Site } from "@cloudhal/core-contracts";
import { seedStarterSite } from "@cloudhal/core-ts";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import { exportArchive } from "../src/commands/export.ts";
import { importArchive } from "../src/commands/import.ts";
import { describeImport } from "../src/commands/import-describe.ts";
import { listSites } from "../src/commands/site.ts";
import { readProjectConfig } from "../src/config.ts";
import { planSiteIdSwitch, type SiteIdSwitch, writeSiteIdSwitch } from "../src/config-site.ts";
import {
  bundleOf,
  copyProject,
  exists,
  type Fixture,
  removeTempDirs,
  seedFixture,
  stateOf,
  tempDir,
  withStore,
} from "./site-fixture.ts";

let fx: Fixture;
let archive: string;

beforeAll(async () => {
  fx = await seedFixture("cloudhal-switch-src-");
  const out = path.join(await tempDir("cloudhal-switch-archives-"), "english.cloudhal");
  archive = (await exportArchive({ projectDir: fx.projectDir, out })).file;
});
afterAll(removeTempDirs);
afterEach(() => vi.restoreAllMocks());

const LISTED = "site_Listed0001";

/**
 * A project whose store holds another site (slug `other`, optionally serving `host`), with a
 * cloudhal.json written by hand: four-space indents, a key the CLI does not own, a one-line
 * `sites` and `dataDir` last.
 */
async function otherProject(host?: string) {
  const dir = await tempDir("cloudhal-switch-");
  const other = await withStore(dir, async ({ store }) => {
    const site = await seedStarterSite(store, { name: "Other", slug: "other" });
    if (!host) return site;
    return store.updateSite({ ...site, domains: [{ hostname: host, primary: true }] });
  });
  const raw = `{\n    "siteId": "${other.id}",\n    "media": { "keep": true },\n    "sites": ["${other.id}", "${LISTED}"],\n    "dataDir": ".cloudhal"\n}\n`;
  await writeFile(path.join(dir, "cloudhal.json"), raw);
  return { dir, other, raw };
}

/** Every row of the old site, as the switch must leave them. */
const rowsOfSite = (dir: string, siteId: string) =>
  withStore(dir, async ({ sql }) => ({
    nodes: await sql.all("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [siteId]),
    snapshots: await sql.all("SELECT * FROM snapshots WHERE site_id = ? ORDER BY id", [siteId]),
    hosts: await sql.all("SELECT * FROM site_hosts WHERE site_id = ? ORDER BY host", [siteId]),
  }));

const configOf = (dir: string) => readFile(path.join(dir, "cloudhal.json"), "utf8");

/** `state.json` only, as `cloudhal deploy` leaves it (no secrets file is written or read). */
async function deployed(dir: string) {
  await mkdir(path.join(dir, ".cloudhal", "deploy"), { recursive: true });
  await writeFile(path.join(dir, ".cloudhal", "deploy", "state.json"), '{ "name": "smoke" }\n');
}

const secretsFile = (dir: string) => path.join(dir, ".cloudhal", "deploy", "secrets.json");

/** The switch line, real or dry run (`stays` ends it). */
const switchLine = (from: string, stays: string) =>
  `cloudhal.json: siteId ${from} → ${fx.siteId}, sites ${from}, ${LISTED} → ${fx.siteId}, ${LISTED} (undo: write ${from} back in place of ${fx.siteId} by hand; --revert does not); site ${from} ${stays}`;

describe("cloudhal import --replace of another site: the site id switch", () => {
  it("switches cloudhal.json in place and keeps the old site in the store, unlisted", async () => {
    const { dir, other, raw } = await otherProject();
    const old = await rowsOfSite(dir, other.id);
    const result = await importArchive({ projectDir: dir, file: archive, replace: true });
    expect(await configOf(dir)).toBe(raw.replaceAll(other.id, fx.siteId));
    const cfg = await readProjectConfig(dir);
    expect(cfg.siteId).toBe(fx.siteId);
    expect(cfg.sites).toEqual([fx.siteId, LISTED]);
    expect(await rowsOfSite(dir, other.id)).toEqual(old);
    expect((await bundleOf(dir, fx.siteId)).nodes).toStrictEqual(
      (await bundleOf(fx.projectDir, fx.siteId)).nodes,
    );
    const labels = await withStore(dir, async ({ store }) =>
      (await store.listSnapshots(fx.siteId, 200)).map((s) => s.label ?? ""),
    );
    expect(labels.some((l) => l.includes("import"))).toBe(false);
    await expect(exportArchive({ projectDir: dir, siteId: other.id })).rejects.toThrow(
      `site ${other.id} is not listed in cloudhal.json \`sites\``,
    );
    expect((await listSites({ projectDir: dir })).map((s) => s.id)).toContain(other.id);
    expect(describeImport(result)).toContain(
      switchLine(
        other.id,
        `stays in the local store, unlisted and untouched (\`cloudhal site delete ${other.id} --confirm other\` deletes it for good)`,
      ),
    );
    // Again: nothing changes, and cloudhal.json already names the site.
    const again = await importArchive({ projectDir: dir, file: archive, replace: true });
    expect(again.replace?.switch).toBeUndefined();
    expect(describeImport(again)[0]).toMatch(/^nothing to import: /);
    // The undo it names: the old id written back makes the old site the project's again.
    await writeFile(path.join(dir, "cloudhal.json"), raw);
    const out = path.join(await tempDir("cloudhal-switch-undo-"), "other.cloudhal");
    expect((await exportArchive({ projectDir: dir, out })).manifest.siteId).toBe(other.id);
    expect(await rowsOfSite(dir, other.id)).toEqual(old);
  });

  it("--dry-run shows the switch and writes nothing", async () => {
    const { dir, other } = await otherProject();
    const before = await stateOf(dir);
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["import", archive, "--replace", "--dry-run"])).toBe(0);
    const printed = log.mock.calls.map((c) => String(c[0]));
    expect(printed).toContain(
      `dry run: replace import into site ${fx.siteId}, which is new to this project`,
    );
    expect(printed).toContain("saved first: nothing (the site is new to this project)");
    expect(printed).toContain(switchLine(other.id, "would stay in the local store, unlisted"));
    expect(printed.at(-1)).toBe("nothing written (dry run)");
    expect(await stateOf(dir)).toEqual(before);
  });

  it("refuses a hostname the old site serves, before anything is written; a bootstrap dry run reports it too", async () => {
    const host = "english.example.com";
    const source = await copyProject(fx);
    await withStore(source, async ({ store }) => {
      const site = (await store.getSite(fx.siteId)) as Site;
      await store.updateSite({ ...site, domains: [{ hostname: host, primary: true }] });
    });
    const file = path.join(source, "hosted.cloudhal");
    await exportArchive({ projectDir: source, out: file });
    const { dir, other } = await otherProject(host);
    const before = await stateOf(dir);
    const refusal = `the archive's site serves ${host}, which site ${other.id} of this project's store already serves; remove it from that site's domains in Studio, or delete that site when it is a leftover (\`cloudhal site delete ${other.id} --confirm <its slug>\`)`;
    await expect(importArchive({ projectDir: dir, file, replace: true })).rejects.toThrow(
      `cannot import ${file}: ${refusal}; nothing was imported`,
    );
    expect(await stateOf(dir)).toEqual(before);
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["import", file, "--replace", "--dry-run"])).toBe(1);
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(`would refuse: ${refusal}`);
    expect(await stateOf(dir)).toEqual(before);
    // Bootstrap, with the archive's site listed: the same refusal, reported by the dry run.
    await writeFile(
      path.join(dir, "cloudhal.json"),
      `${JSON.stringify({ siteId: fx.siteId, sites: [fx.siteId, other.id], dataDir: ".cloudhal" })}\n`,
    );
    const dry = await importArchive({ projectDir: dir, file, dryRun: true });
    expect(dry.refusals).toEqual([refusal]);
    expect(dry.plan).toBeUndefined();
  });
});

describe("cloudhal import --replace of another site: cloudhal.json is switched last", () => {
  it("leaves cloudhal.json and the old site as they were when the graph write fails", async () => {
    const { dir, other, raw } = await otherProject();
    const old = await rowsOfSite(dir, other.id);
    const batch = BetterSqlite3Driver.prototype.batch;
    vi.spyOn(BetterSqlite3Driver.prototype, "batch").mockImplementation(async function (
      this: BetterSqlite3Driver,
      statements: Parameters<BetterSqlite3Driver["batch"]>[0],
    ) {
      if (statements.some((s) => s.sql.startsWith("DELETE FROM nodes WHERE site_id")))
        throw new Error("disk on fire");
      return batch.call(this, statements);
    });
    await expect(importArchive({ projectDir: dir, file: archive, replace: true })).rejects.toThrow(
      `cannot import ${archive}: disk on fire; the import stopped after it began writing`,
    );
    vi.restoreAllMocks();
    expect(await configOf(dir)).toBe(raw);
    expect(await rowsOfSite(dir, other.id)).toEqual(old);
    // Again: the import completes, and the switch comes with it.
    await importArchive({ projectDir: dir, file: archive, replace: true });
    expect(await configOf(dir)).toBe(raw.replaceAll(other.id, fx.siteId));
  });

  it("says the import landed when cloudhal.json changed meanwhile; a second run only switches", async () => {
    const { dir, other, raw } = await otherProject();
    const file = path.join(dir, "cloudhal.json");
    // `log` runs after the first pass, before anything is written.
    const log = () => writeFileSync(file, `${raw} `);
    await expect(
      importArchive({ projectDir: dir, file: archive, replace: true, log }),
    ).rejects.toThrow(
      `imported ${archive}, but cloudhal.json changed while importing, so it still names site ${other.id}; run the import again, which only switches siteId to ${fx.siteId}, or set it by hand`,
    );
    expect(await configOf(dir)).toBe(`${raw} `);
    expect((await bundleOf(dir, fx.siteId)).nodes).toStrictEqual(
      (await bundleOf(fx.projectDir, fx.siteId)).nodes,
    );
    await writeFile(file, raw);
    const again = await importArchive({ projectDir: dir, file: archive, replace: true });
    expect(await configOf(dir)).toBe(raw.replaceAll(other.id, fx.siteId));
    const printed = describeImport(again);
    expect(printed[0]).toMatch(/^imported /);
    expect(printed).toContain(
      switchLine(
        other.id,
        `stays in the local store, unlisted and untouched (\`cloudhal site delete ${other.id} --confirm other\` deletes it for good)`,
      ),
    );
  });
});

describe("cloudhal import --replace in a deployed project (invariant 1)", () => {
  it("warns that the deployment serves the old site, from state.json alone", async () => {
    const { dir, other } = await otherProject();
    await deployed(dir);
    const warning = (verb: string) =>
      `warning: this project is deployed (smoke) and its deployment serves site ${other.id}: \`cloudhal push\` ${verb} site ${fx.siteId} there as another site, and the next \`cloudhal deploy\` serves it instead; a deployment of site ${fx.siteId} itself is updated from the project that deployed it, not from here`;
    const dry = await importArchive({
      projectDir: dir,
      file: archive,
      replace: true,
      dryRun: true,
    });
    expect(describeImport(dry)).toContain(warning("would send"));
    const done = await importArchive({ projectDir: dir, file: archive, replace: true });
    const printed = describeImport(done);
    expect(printed).toContain(warning("now sends"));
    // A push to another admin URL would send this project's deploy token there.
    expect(printed.some((l) => l.includes("--admin-url"))).toBe(false);
    expect(await exists(secretsFile(dir))).toBe(false);
  });

  it("notes that a push carries the replaced graph and the deployment keeps its published snapshot", async () => {
    const dir = await copyProject(fx);
    await withStore(dir, async ({ store }) => {
      const about = (await store.listPages(fx.siteId)).find((p) => p.path === "/about") as Page;
      await store.updatePage({ ...about, title: "Edited here" });
    });
    await deployed(dir);
    const done = await importArchive({ projectDir: dir, file: archive, replace: true });
    expect(describeImport(done)).toContain(
      "note: this project is deployed (smoke); `cloudhal push --replace` sends this graph there, and the deployment keeps its own published snapshot",
    );
    expect(await exists(secretsFile(dir))).toBe(false);
  });
});

describe("the cloudhal.json switch on its own", () => {
  const A = "site_Aaaaaa0001";
  const B = "site_Bbbbbb0002";
  const planned = (raw: string) => {
    const p = planSiteIdSwitch(raw, B);
    if ("refusal" in p) throw new Error(p.refusal);
    return p;
  };

  it("edits only the siteId and sites values, in any layout", () => {
    const layouts = [
      `{\n  "siteId": "${A}",\n  "dataDir": ".cloudhal"\n}\n`,
      `{\n    "siteId" : "${A}",\n    "sites": [\n        "${A}",\n        "site_Tttttt0003"\n    ]\n}\n`,
      `{\n\t"sites": ["site_Tttttt0003"],\n\t"siteId": "${A}"\n}`,
      `{\r\n  "siteId": "${A}",\r\n  "sites": ["${A}", "${A}"]\r\n}\r\n`,
      `{"siteId":"${A}","sites":["${A}"],"media":{"keep":true}}`,
    ];
    for (const raw of layouts) expect(planned(raw).text).toBe(raw.replaceAll(A, B));
    expect(planned(layouts[0] as string).sites).toBeUndefined();
    expect(planned(layouts[1] as string).sites).toEqual({
      before: [A, "site_Tttttt0003"],
      after: [B, "site_Tttttt0003"],
    });
    // A list without the old id keeps it as written; the project's site comes first on reading.
    expect(planned(layouts[2] as string).sites).toEqual({
      before: [A, "site_Tttttt0003"],
      after: [B, "site_Tttttt0003"],
    });
  });

  it("refuses what it cannot place exactly", () => {
    const refusals = [
      `{"siteId": "${A}", "search": {"siteId": "${A}"}}`,
      `{"siteId": "site\\u005fAaaaaa0001"}`,
      `{"dataDir": ".cloudhal"}`,
      "not json",
    ];
    for (const raw of refusals)
      expect(planSiteIdSwitch(raw, B)).toEqual({
        refusal: expect.stringMatching(
          new RegExp(
            `; set cloudhal\\.json siteId to ${B} by hand \\(push and deploy then use it\\), then import again$`,
          ),
        ),
      });
  });

  it("writes through a temporary file, and refuses a file changed since it was read", async () => {
    const dir = await tempDir("cloudhal-switch-write-");
    const raw = `{\n  "siteId": "${A}",\n  "dataDir": ".cloudhal"\n}\n`;
    await writeFile(path.join(dir, "cloudhal.json"), raw);
    const change: SiteIdSwitch = planned(raw);
    await writeFile(path.join(dir, "cloudhal.json"), `${raw} `);
    await expect(writeSiteIdSwitch(dir, change)).rejects.toThrow(
      `cloudhal.json changed while importing, so it still names site ${A}; run the import again, which only switches siteId to ${B}, or set it by hand`,
    );
    expect(await configOf(dir)).toBe(`${raw} `);
    await writeFile(path.join(dir, "cloudhal.json"), raw);
    await writeSiteIdSwitch(dir, change);
    expect(await configOf(dir)).toBe(raw.replaceAll(A, B));
    expect(await readdir(dir)).toEqual(["cloudhal.json"]);
  });
});
