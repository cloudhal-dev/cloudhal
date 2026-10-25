/**
 * `cloudhal export` (RFC-0039 §2, rollout step 2) on a real local project: what it writes reads
 * back into exactly the bundle `exportSite` returns (§1, invariant 1), the same content gives the
 * same bytes (invariant 7), the file is dated by its rows (seeded on a fixed day, not today),
 * `--no-media`, `--latest-only` and `--site`, a file at the default name is replaced only by the
 * same archive, a damaged local media file or Ctrl-C fails the export and leaves no file
 * (invariant 3), taken-down content never travels as bytes (invariant 5), nothing from §4's list
 * ends up in the file or the summary, and `importSite` refuses a crafted project row (step 3's
 * path).
 */
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Actor, ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import {
  continueFieldOperation,
  exportSite,
  importSite,
  runFieldOperation,
  type SiteBundle,
  seedStarterSite,
} from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { makePng, PNG_1X1 } from "@cloudhal/core-ts/media/fixtures";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ArchiveError, archiveStream, readArchive } from "../src/archive/index.ts";
import { HELP } from "../src/cli/help.ts";
import { main } from "../src/cli.ts";
import { bundleToArchive, latestOnly, snapshotRefs } from "../src/commands/archive-bundle.ts";
import { bundleFromArchive } from "../src/commands/archive-reassemble.ts";
import {
  describeExport,
  exportArchive,
  NAMED_IN_ARCHIVE,
  NEVER_IN_ARCHIVE,
} from "../src/commands/export.ts";
import { writeProjectConfig } from "../src/config.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const robot: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Newsroom Agent" };

interface Fixture {
  projectDir: string;
  siteId: string;
  trId: string;
  /** A: the entry's cover; B: taken down; C: deleted, kept by the first snapshot only. */
  sha: { a: string; b: string; c: string };
  snapshots: { s1: string; s2: string; s3: string };
}

const dirs: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function seed(projectDir: string): Promise<Omit<Fixture, "projectDir">> {
  const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
  const { store } = local;
  const site = await seedStarterSite(store, { name: "English", slug: "english" });
  const upload = (bytes: Uint8Array, filename: string) =>
    store.ingestAsset({
      siteId: site.id,
      bytes,
      filename,
      uploadedBy: robot,
      source: { kind: "upload" },
    });
  const a = await upload(PNG_1X1, "pixel.png");
  const entry = (await store.listContentEntries(site.id))[0] as ContentEntry;
  await store.updateContentEntry({
    ...entry,
    coverImage: { assetId: a.asset.id, alt: "" } as never,
  });
  const b = await upload(makePng({ width: 3, height: 3 }), "b.png");
  const c = await upload(makePng({ width: 5, height: 4 }), "c.png");
  const s1 = await store.createSnapshot(site.id, { actor: person, reason: "manual" });
  await store.deleteAsset(c.asset);
  await store.purgeBlob(site.id, b.asset.sha256, person, { text: "personal data", legal: false });
  const s2 = await store.createSnapshot(site.id, { actor: person, reason: "publish" });
  await store.publish((await store.getSite(site.id)) as Site, s2.id);
  const about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
  await store.updatePage({ ...about, title: "About us" });
  const s3 = await store.createSnapshot(site.id, { actor: person, reason: "manual" });
  const tr = await seedStarterSite(store, {
    name: "Türkçe",
    slug: "turkce",
    locale: "tr",
    projectId: site.projectId,
  });
  await local.close();
  await writeProjectConfig(projectDir, {
    siteId: site.id,
    dataDir: ".cloudhal",
    sites: [site.id, tr.id],
  });
  return {
    siteId: site.id,
    trId: tr.id,
    sha: { a: a.asset.sha256, b: b.asset.sha256, c: c.asset.sha256 },
    snapshots: { s1: s1.id, s2: s2.id, s3: s3.id },
  };
}

/** The fixture's rows are written on this day, so a file name dated by the clock would show. */
const SEEDED_AT = new Date("2026-01-02T03:04:05.000Z");
const SEEDED_DAY = "20260102";

let fx: Fixture;
beforeAll(async () => {
  const projectDir = await tempDir("cloudhal-export-");
  vi.useFakeTimers({ toFake: ["Date"], now: SEEDED_AT, shouldAdvanceTime: true });
  try {
    fx = { projectDir, ...(await seed(projectDir)) };
  } finally {
    vi.useRealTimers();
  }
});
afterAll(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

/** A copy of the fixture project (without the archives other tests wrote), for tests that change it. */
async function freshProject(): Promise<string> {
  const dir = await tempDir("cloudhal-export-copy-");
  await cp(fx.projectDir, dir, { recursive: true });
  for (const f of await readdir(dir))
    if (f !== ".cloudhal" && f.endsWith(".cloudhal")) await rm(path.join(dir, f));
  return dir;
}

/** The local store of `projectDir`, open for `fn` only. */
async function withStore<T>(
  projectDir: string,
  fn: (local: Awaited<ReturnType<typeof openLocalStore>>) => Promise<T>,
): Promise<T> {
  const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
  try {
    return await fn(local);
  } finally {
    await local.close();
  }
}

const bundleOf = (projectDir: string, siteId: string): Promise<SiteBundle> =>
  withStore(projectDir, (local) => exportSite(local, siteId));

const latestId = (projectDir: string, siteId: string): Promise<string> =>
  withStore(
    projectDir,
    async (local) => ((await local.store.latestSnapshot(siteId)) as { id: string }).id,
  );

const partials = async (dir: string) => (await readdir(dir)).filter((f) => f.includes(".partial-"));

const readBack = (file: string) => bundleFromArchive(readArchive(createReadStream(file)));
const day = (createdAt: string) => createdAt.slice(0, 10).replaceAll("-", "");

/** The newest timestamp of the bundle's rows, computed apart from `contentCreatedAt`. */
function newest(bundle: SiteBundle): string {
  const stamps = [
    ...bundle.nodes.flatMap((n) => [n.created_at, n.updated_at]),
    ...bundle.snapshots.map((s) => s.created_at),
    ...(bundle.project ? [bundle.project.created_at, bundle.project.updated_at] : []),
    ...(bundle.purged ?? []).map((p) => p.at),
  ];
  return new Date(
    Math.max(...stamps.map((s) => Date.parse(s)).filter((t) => !Number.isNaN(t))),
  ).toISOString();
}

describe("cloudhal export", () => {
  it("writes <slug>-<date>.cloudhal that reads back into exactly exportSite's bundle", async () => {
    const result = await exportArchive({ projectDir: fx.projectDir });
    const { manifest } = result;
    // Dated by the rows (seeded on SEEDED_AT), not by today.
    expect(result.file).toBe(path.join(fx.projectDir, `english-${SEEDED_DAY}.cloudhal`));
    expect(day(manifest.createdAt)).toBe(SEEDED_DAY);
    expect(result.replaced).toBe(false);
    expect((await stat(result.file)).size).toBe(result.bytes);
    const pkg = JSON.parse(
      await readFile(path.join(import.meta.dirname, "../package.json"), "utf8"),
    ) as {
      version: string;
    };
    expect(manifest).toMatchObject({
      siteId: fx.siteId,
      siteName: "English",
      createdBy: pkg.version,
    });
    const media = [fx.sha.a, fx.sha.c].sort();
    expect(manifest.files.map((f) => f.path)).toEqual([
      "project.json",
      "nodes/0001.ndjson",
      "snapshots/0001.ndjson",
      "blobs/0001.ndjson",
      ...media.map((sha) => `media/${sha}`),
      "ledger.ndjson",
    ]);
    const back = await readBack(result.file);
    const bundle = await bundleOf(fx.projectDir, fx.siteId);
    expect(back.bundle).toStrictEqual(bundle);
    expect(back.bundle.media?.map((m) => m.sha256)).toEqual(media);
    expect(back.bundle.purged?.map((p) => p.sha256)).toEqual([fx.sha.b]);
    expect(back.media.map((m) => m.sha256)).not.toContain(fx.sha.b);
    expect(manifest.createdAt).toBe(newest(bundle));
  });

  it("gives the same bytes for the same content, and replaces the default file", async () => {
    const first = await exportArchive({ projectDir: fx.projectDir, out: "one.cloudhal" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await exportArchive({ projectDir: fx.projectDir, out: "two.cloudhal" });
    const bytes = await readFile(first.file);
    expect(Buffer.compare(bytes, await readFile(second.file))).toBe(0);
    await exportArchive({ projectDir: fx.projectDir });
    const again = await exportArchive({ projectDir: fx.projectDir });
    expect(again.replaced).toBe(true);
    expect(Buffer.compare(bytes, await readFile(again.file))).toBe(0);
    expect(describeExport(again, fx.projectDir)[0]).toMatch(/; replaced the existing file\)$/);
  });

  it("--no-media writes the graph only; the media list is rebuilt from it", async () => {
    const result = await exportArchive({
      projectDir: fx.projectDir,
      out: "graph.cloudhal",
      noMedia: true,
    });
    expect(result.manifest.mediaOmitted).toBe(true);
    expect(result.manifest.counts.media).toBe(0);
    expect(result.manifest.files.some((f) => f.path.startsWith("media/"))).toBe(false);
    const back = await readBack(result.file);
    expect(back.media).toEqual([]);
    expect(back.bundle).toStrictEqual(await bundleOf(fx.projectDir, fx.siteId));
  });

  it("--latest-only keeps the published and the latest snapshot and what they need", async () => {
    const result = await exportArchive({
      projectDir: fx.projectDir,
      out: "latest.cloudhal",
      latestOnly: true,
    });
    const { bundle } = await readBack(result.file);
    const latest = await latestId(fx.projectDir, fx.siteId);
    expect(latest).toBe(fx.snapshots.s3);
    expect(new Set(bundle.snapshots.map((s) => s.id))).toEqual(
      new Set([fx.snapshots.s2, fx.snapshots.s3]),
    );
    const refs = bundle.snapshots.flatMap((s) => (snapshotRefs(s.body) ?? []).map((r) => r.hash));
    expect(Object.keys(bundle.blobs).sort()).toEqual([...new Set(refs)].sort());
    expect(bundle.media?.map((m) => m.sha256)).toEqual([fx.sha.a]);
    expect(bundle.purged?.map((p) => p.sha256)).toEqual([fx.sha.b]);
    expect(bundle).toStrictEqual(latestOnly(await bundleOf(fx.projectDir, fx.siteId), latest));
    expect(describeExport(result, fx.projectDir)).toContain(
      "history: the published and the latest snapshot only (--latest-only)",
    );
  });

  it("--site exports another listed site and refuses any other id", async () => {
    const result = await exportArchive({ projectDir: fx.projectDir, siteId: fx.trId });
    expect(result.manifest.siteId).toBe(fx.trId);
    expect(path.basename(result.file)).toBe(`turkce-${SEEDED_DAY}.cloudhal`);
    expect((await readBack(result.file)).bundle).toStrictEqual(
      await bundleOf(fx.projectDir, fx.trId),
    );
    const before = await readdir(fx.projectDir);
    await expect(
      exportArchive({ projectDir: fx.projectDir, siteId: "site_notlisted01" }),
    ).rejects.toThrow(/site site_notlisted01 is not listed in cloudhal\.json `sites`/);
    expect(await readdir(fx.projectDir)).toEqual(before);

    const projectDir = await freshProject();
    await writeProjectConfig(projectDir, {
      siteId: fx.siteId,
      dataDir: ".cloudhal",
      sites: [fx.siteId, fx.trId, "site_ghost00001"],
    });
    await expect(exportArchive({ projectDir, siteId: "site_ghost00001" })).rejects.toThrow(
      /the local store \(\.cloudhal\) has no such site/,
    );
  });
});

describe("cloudhal export and a file already at the default name", () => {
  const name = `english-${SEEDED_DAY}.cloudhal`;
  const refused = new RegExp(
    `^${name.replaceAll(".", "\\.")} already exists and is not this archive .*; pass --out ${name.replaceAll(".", "\\.")} to replace it`,
  );

  it("is replaced only by the same archive: not by another flag, a deletion or another file", async () => {
    const projectDir = await freshProject();
    const first = await exportArchive({ projectDir });
    expect(path.basename(first.file)).toBe(name);
    const bytes = await readFile(first.file);
    const unchanged = async () => {
      expect(Buffer.compare(await readFile(first.file), bytes)).toBe(0);
      expect(await partials(projectDir)).toEqual([]);
    };
    // Same content, same day, other flags: the full backup stays.
    for (const flags of [{ latestOnly: true }, { noMedia: true }]) {
      await expect(exportArchive({ projectDir, ...flags })).rejects.toThrow(refused);
      await unchanged();
    }
    // A deletion stamps no remaining row, so the date stays and the name is the same.
    await withStore(projectDir, async ({ store }) => {
      const [entry] = await store.listContentEntries(fx.siteId);
      await store.deleteContentEntry(entry as ContentEntry);
    });
    await expect(exportArchive({ projectDir })).rejects.toThrow(refused);
    await unchanged();
    // A file that is no archive at all stays too.
    const other = path.join(projectDir, `turkce-${SEEDED_DAY}.cloudhal`);
    await writeFile(other, "my notes");
    await expect(exportArchive({ projectDir, siteId: fx.trId })).rejects.toThrow(
      /^turkce-\d{8}\.cloudhal already exists and is not this archive/,
    );
    expect(await readFile(other, "utf8")).toBe("my notes");
    // --out naming it replaces it.
    const replaced = await exportArchive({ projectDir, out: name });
    expect(replaced).toMatchObject({ file: first.file, replaced: true });
    expect((await readBack(first.file)).bundle).toStrictEqual(
      await bundleOf(projectDir, fx.siteId),
    );
  });
});

describe("cloudhal export --latest-only and the store's history", () => {
  it("keeps the snapshot latestSnapshot picks when two share a created_at", async () => {
    const projectDir = await freshProject();
    // The newest snapshot (by insertion) ties with an earlier one whose id sorts after it, so the
    // bundle's last row (created_at, id) is not the store's latest (created_at, rowid). The
    // earlier one is the largest such id: other rows may already share newest's created_at (the
    // seed's clock moves in 20 ms steps), and it must still sort last among them.
    const tie = await withStore(projectDir, async ({ store, sql }) => {
      for (let i = 0; i < 40; i++) {
        const rows = await sql.all<{ id: string; created_at: string }>(
          "SELECT id, created_at FROM snapshots WHERE site_id = ? ORDER BY rowid",
          [fx.siteId],
        );
        const newest = rows.at(-1) as { id: string; created_at: string };
        const earlier = rows
          .slice(0, -1)
          .filter((r) => r.id > newest.id)
          // Code-unit order, as SQLite's BINARY collation sorts ids.
          .reduce<{ id: string } | undefined>(
            (max, r) => (max && max.id > r.id ? max : r),
            undefined,
          );
        if (earlier) {
          await sql.run("UPDATE snapshots SET created_at = ? WHERE id = ?", [
            newest.created_at,
            earlier.id,
          ]);
          return { newest: newest.id, earlier: earlier.id };
        }
        await store.createSnapshot(fx.siteId, { actor: person, reason: "manual" });
      }
      throw new Error("no two snapshots to tie");
    });
    expect(await latestId(projectDir, fx.siteId)).toBe(tie.newest);
    expect((await bundleOf(projectDir, fx.siteId)).snapshots.at(-1)?.id).toBe(tie.earlier);
    const result = await exportArchive({ projectDir, out: "tie.cloudhal", latestOnly: true });
    const { bundle } = await readBack(result.file);
    expect(new Set(bundle.snapshots.map((s) => s.id))).toEqual(
      new Set([fx.snapshots.s2, tie.newest]),
    );
  });

  it("is refused while a field operation is unfinished, and works once it is done", async () => {
    const projectDir = await freshProject();
    const op = {
      op: "rename_field" as const,
      collection: "events",
      from: "speaker",
      to: "presenter",
    };
    const operationId = await withStore(projectDir, async ({ store }) => {
      const site = (await store.getSite(fx.siteId)) as Site;
      const speaker = { key: "speaker", type: "text", labels: { en: { label: "Speaker" } } };
      await store.updateSite({
        ...site,
        collections: {
          ...site.collections,
          events: { fields: [{ ...speaker, localized: false }] },
        } as never,
      });
      for (const slug of ["one", "two", "three"])
        await store.createContentEntry({
          siteId: fx.siteId,
          collection: "events",
          slug,
          locale: "en",
          status: "draft",
          title: slug,
          body: { format: "markdown", value: "Body" },
          fields: { speaker: slug },
          tags: [],
          author: person,
        } as never);
      const part = await runFieldOperation(store, fx.siteId, op, {
        actor: person,
        budget: { entries: 1 },
      });
      expect(part.done).toBe(false);
      // A later snapshot: the operation's `before` is neither the published nor the latest one.
      await store.createSnapshot(fx.siteId, { actor: person, reason: "manual" });
      return part.operationId;
    });
    const out = path.join(projectDir, "template.cloudhal");
    await expect(
      exportArchive({ projectDir, out: "template.cloudhal", latestOnly: true }),
    ).rejects.toThrow(
      `field operation ${operationId} on events has not finished, and --latest-only would drop the snapshot it needs; finish or revert it first (\`cloudhal fields continue|revert events ${operationId}\`)`,
    );
    await expect(stat(out)).rejects.toMatchObject({ code: "ENOENT" });
    // The full history carries it.
    const full = await exportArchive({ projectDir, out: "full.cloudhal" });
    const back = await readBack(full.file);
    expect(back.bundle.snapshots.map((s) => s.id)).toContain(operationId);
    await withStore(projectDir, async ({ store }) => {
      const done = await continueFieldOperation(store, fx.siteId, operationId, { actor: person });
      expect(done.done).toBe(true);
    });
    const template = await exportArchive({
      projectDir,
      out: "template.cloudhal",
      latestOnly: true,
    });
    expect(template.manifest.counts.snapshots).toBe(2);
  });
});

describe("importSite and a crafted project row (the step 3 path)", () => {
  /** `bundle` written as an archive (graph only) and read back, as `cloudhal import` will. */
  async function throughArchive(bundle: SiteBundle): Promise<SiteBundle> {
    const content = bundleToArchive(bundle, {
      createdBy: "0.0.0",
      mediaOmitted: true,
      openMedia: () => {
        throw new Error("no media in a --no-media archive");
      },
    });
    return (await bundleFromArchive(readArchive(archiveStream(content).bytes))).bundle;
  }

  it("refuses a project that is not the site's, not valid, or whose columns disagree", async () => {
    const bundle = await bundleOf(fx.projectDir, fx.siteId);
    const project = bundle.project as NonNullable<SiteBundle["project"]>;
    const body = JSON.parse(project.body) as Record<string, unknown>;
    const id = project.id;
    const cases: [NonNullable<SiteBundle["project"]>, string][] = [
      [{ ...project, id: "prj_planted00001" }, "the bundle's project is not its site's project"],
      [{ ...project, body: "{not json" }, `project ${id}: body is not JSON`],
      [{ ...project, body: JSON.stringify({ id }) }, `project ${id}: not a valid project`],
      [{ ...project, rev: project.rev + 1 }, `project ${id}: columns do not match its body`],
      [
        { ...project, body: JSON.stringify({ ...body, id: "prj_other000001" }) },
        `project ${id}: columns do not match its body`,
      ],
    ];
    for (const [crafted, message] of cases) {
      const back = await throughArchive({ ...bundle, project: crafted });
      expect(back.project).toStrictEqual(crafted);
      const target = await tempDir("cloudhal-import-");
      await withStore(target, async (local) => {
        await expect(importSite(local, back)).rejects.toThrow(message);
        const count = (table: string) =>
          local.sql.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
        expect(await count("projects")).toEqual({ n: 0 });
        expect(await count("nodes")).toEqual({ n: 0 });
      });
    }
  });
});

describe("cloudhal export and damaged local media (invariant 3)", () => {
  const mediaFile = (projectDir: string, sha: string) =>
    path.join(projectDir, ".cloudhal", "blobs", "media", fx.siteId, sha);

  async function expectNoPartial(projectDir: string): Promise<void> {
    expect((await readdir(projectDir)).filter((f) => f.includes(".partial-"))).toEqual([]);
  }

  it("refuses a changed media file and leaves the existing archive as it was", async () => {
    const projectDir = await freshProject();
    const out = path.join(projectDir, "keep.cloudhal");
    await writeFile(out, "an older archive");
    const file = mediaFile(projectDir, fx.sha.a);
    const bytes = await readFile(file);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 0xff;
    await writeFile(file, bytes);
    const error = await exportArchive({ projectDir, out: "keep.cloudhal" }).catch((e) => e);
    expect(error).toBeInstanceOf(ArchiveError);
    expect((error as ArchiveError).code).toBe("damaged");
    expect((error as ArchiveError).message).toMatch(
      /the local copy is damaged: run `cloudhal media verify`/,
    );
    expect(await readFile(out, "utf8")).toBe("an older archive");
    await expectNoPartial(projectDir);

    await writeFile(file, Buffer.concat([bytes, Buffer.from("more")]));
    await expect(exportArchive({ projectDir, out: "keep.cloudhal" })).rejects.toMatchObject({
      code: "damaged",
    });
    expect(await readFile(out, "utf8")).toBe("an older archive");
    await expectNoPartial(projectDir);
  });

  it("refuses a missing media file before writing anything", async () => {
    const projectDir = await freshProject();
    await rm(mediaFile(projectDir, fx.sha.c));
    await expect(exportArchive({ projectDir, out: "new.cloudhal" })).rejects.toThrow(
      new RegExp(`local media ${fx.sha.c} is missing; run \`cloudhal media verify\``),
    );
    await expect(stat(path.join(projectDir, "new.cloudhal"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expectNoPartial(projectDir);
    // --no-media does not need the bytes.
    expect(
      (await exportArchive({ projectDir, out: "new.cloudhal", noMedia: true })).bytes,
    ).toBeGreaterThan(0);
  });
});

describe("cloudhal export: what it says and never holds (§4)", () => {
  it("names the file, the counts and what an archive never holds; no secrets anywhere", async () => {
    const projectDir = await freshProject();
    const marker = "placeholder-marker-not-a-secret-4f1c";
    await mkdir(path.join(projectDir, ".cloudhal", "deploy"), { recursive: true });
    await writeFile(
      path.join(projectDir, ".cloudhal", "deploy", "secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: marker }),
    );
    const result = await exportArchive({ projectDir, out: "site.cloudhal" });
    const lines = describeExport(result, projectDir);
    const { counts } = result.manifest;
    expect(lines[0]).toMatch(/^wrote site\.cloudhal \(\d+(\.\d)? (B|KiB)\)$/);
    expect(counts).toMatchObject({ snapshots: 3, media: 2 });
    expect(lines[1]).toMatch(
      new RegExp(
        `^site ${fx.siteId} \\(english\\): ${counts.nodes} node\\(s\\), 3 snapshot\\(s\\), ${counts.blobs} blob\\(s\\), 2 media file\\(s\\) \\(\\d+ B\\), 1 taken down$`,
      ),
    );
    const never = lines.find((l) => l.startsWith("not in the archive (RFC-0039 §4): "));
    for (const item of NEVER_IN_ARCHIVE) expect(never).toContain(item);
    expect(never).toContain("user accounts");
    expect(lines.at(-1)).toBe(`in the archive: ${NAMED_IN_ARCHIVE}`);
    const tar = Buffer.from(gunzipSync(await readFile(result.file))).toString("latin1");
    expect(tar).not.toContain(marker);
    expect(lines.join("\n")).not.toContain(marker);
    // What the last line says: the history names who made each change.
    // (A snapshot row's body is JSON inside the NDJSON line, so its quotes are escaped.)
    expect(tar.includes(`\\"name\\":\\"${person.name}\\"`)).toBe(true);
  });
});

describe("cloudhal export: the command", () => {
  it("is in --help and refuses positionals", async () => {
    expect(HELP).toMatch(
      /^ {2}cloudhal export \[--out <file>\] \[--site <id>\] \[--no-media\] \[--latest-only\]$/m,
    );
    await expect(main(["export", "x.cloudhal"])).rejects.toThrow(
      "usage: cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]",
    );
  });

  it("runs from the project folder with its flags and prints the summary", async () => {
    const projectDir = await freshProject();
    vi.spyOn(process, "cwd").mockReturnValue(projectDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const argv = ["export", "--no-media", "--latest-only", "--out", "sub/x.cloudhal"];
    expect(await main(argv)).toBe(0);
    expect((await stat(path.join(projectDir, "sub", "x.cloudhal"))).isFile()).toBe(true);
    const printed = log.mock.calls.map((c) => String(c[0]));
    expect(printed[0]).toMatch(/^wrote sub\/x\.cloudhal \(/);
    expect(printed).toContain(
      "media left out (--no-media): an import needs the media from elsewhere",
    );
    expect(printed).toContain(
      "history: the published and the latest snapshot only (--latest-only)",
    );
    await expect(exportArchive({ projectDir, out: "sub" })).rejects.toThrow(
      "--out sub is a directory; name a file",
    );
  });

  it("refuses --site, --no-media and --latest-only on every other command", async () => {
    await expect(main(["push", "--replace", "--site", "site_other00001"])).rejects.toThrow(
      "cloudhal push does not take --site (only cloudhal export does); every other command acts on cloudhal.json's siteId",
    );
    await expect(main(["pull", "--replace", "--no-media"])).rejects.toThrow(
      "cloudhal pull does not take --no-media (only cloudhal export does)",
    );
    await expect(main(["build", "--latest-only"])).rejects.toThrow(
      "cloudhal build does not take --latest-only (only cloudhal export does)",
    );
  });

  it("stops on Ctrl-C: exit 130, no file and no partial file, the listener removed", async () => {
    const projectDir = await freshProject();
    vi.spyOn(process, "cwd").mockReturnValue(projectDir);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.listeners("SIGINT");
    const beforeTerm = process.listeners("SIGTERM");
    const running = main(["export", "--out", "stopped.cloudhal"]);
    const ours = process.listeners("SIGINT").filter((l) => !before.includes(l));
    expect(ours).toHaveLength(1);
    (ours[0] as () => void)();
    expect(await running).toBe(130);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^cloudhal: export interrupted;/));
    await expect(stat(path.join(projectDir, "stopped.cloudhal"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await partials(projectDir)).toEqual([]);
    expect(process.listeners("SIGINT")).toEqual(before);
    expect(process.listeners("SIGTERM")).toEqual(beforeTerm);
  });
});
