/**
 * `cloudhal import` (RFC-0039 §2, rollout step 3) on real local projects, in bootstrap mode: an
 * archive comes back as the same site (invariant 1) and a second import changes nothing; rows and
 * node bodies are validated and printed clean (invariant 2); a damaged file, a file that changes
 * between the passes, a `--no-media` archive without its media, a newer format, a conflict,
 * another site's archive, content taken down here, and Ctrl-C are refused or stopped before
 * anything is written (invariants 3, 4, 5, 6), and a storage failure after the first write says
 * so; `--dry-run` shows the difference by kind and title and writes nothing.
 */
import { writeFileSync } from "node:fs";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@cloudhal/core-contracts";
import { type NodeRow, type SiteBundle, SyncConflictError } from "@cloudhal/core-ts";
import { makePng } from "@cloudhal/core-ts/media/fixtures";
import { FsBlobStore } from "@cloudhal/storage/fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { writeArchiveFile } from "../src/archive/index.ts";
import { HELP } from "../src/cli/help.ts";
import { main } from "../src/cli.ts";
import { bundleToArchive } from "../src/commands/archive-bundle.ts";
import { exportArchive } from "../src/commands/export.ts";
import {
  type ImportArchiveResult,
  ImportInterruptedError,
  importArchive,
} from "../src/commands/import.ts";
import { importFailure } from "../src/commands/import-checks.ts";
import { describeImport } from "../src/commands/import-describe.ts";
import { type ProjectConfig, writeProjectConfig } from "../src/config.ts";
import { archiveOf, baseFiles, bodyOffset, flip, retar, sha256, utf8 } from "./archive-fixture.ts";
import {
  blobListing,
  bundleOf,
  copyProject,
  type Fixture,
  mediaFile,
  person,
  removeTempDirs,
  seedFixture,
  tempDir,
  withStore,
} from "./site-fixture.ts";

let fx: Fixture;
let files: string;
const archives = { full: "", graph: "", tr: "" };

beforeAll(async () => {
  fx = await seedFixture("cloudhal-import-src-");
  files = await tempDir("cloudhal-archives-");
  const out = (name: string) => path.join(files, name);
  const { projectDir } = fx;
  archives.full = (await exportArchive({ projectDir, out: out("english.cloudhal") })).file;
  archives.graph = (
    await exportArchive({ projectDir, out: out("graph.cloudhal"), noMedia: true })
  ).file;
  archives.tr = (
    await exportArchive({ projectDir, out: out("tr.cloudhal"), siteId: fx.trId })
  ).file;
});
afterAll(removeTempDirs);
afterEach(() => vi.restoreAllMocks());

/** A project with only its cloudhal.json (no .cloudhal): the fixture's sites unless `cfg` says. */
async function emptyProject(cfg?: Pick<ProjectConfig, "siteId" | "sites">): Promise<string> {
  const dir = await tempDir("cloudhal-import-");
  await writeProjectConfig(dir, {
    dataDir: ".cloudhal",
    ...(cfg ?? { siteId: fx.siteId, sites: [fx.siteId, fx.trId] }),
  });
  return dir;
}

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

async function expectNoStore(dir: string): Promise<void> {
  expect(await exists(path.join(dir, ".cloudhal"))).toBe(false);
}

/** What a refused import must leave as it was (opens the store: call it only where one exists). */
async function stateOf(dir: string) {
  const rows = await withStore(dir, async ({ sql }) => ({
    nodes: await sql.all("SELECT id, site_id, rev, hash FROM nodes ORDER BY id"),
    snapshots: await sql.all("SELECT id FROM snapshots ORDER BY id"),
    projects: await sql.all("SELECT id, rev FROM projects ORDER BY id"),
    media: await sql.all("SELECT site_id, sha256, state FROM media_blobs ORDER BY site_id, sha256"),
  }));
  return {
    rows,
    blobs: await blobListing(dir),
    config: await readFile(path.join(dir, "cloudhal.json"), "utf8"),
  };
}

const sourceBytes = (sha: string) => readFile(mediaFile(fx.projectDir, fx.siteId, sha));

/** An archive in its own folder. */
async function archiveFile(bytes: Uint8Array): Promise<string> {
  const file = path.join(await tempDir("cloudhal-crafted-"), "crafted.cloudhal");
  await writeFile(file, bytes);
  return file;
}

/** A `--no-media` archive of a crafted bundle, written as `cloudhal export` writes one. */
async function craftedArchive(bundle: SiteBundle, name = "crafted.cloudhal"): Promise<string> {
  const content = bundleToArchive(bundle, {
    createdBy: "0.0.0",
    mediaOmitted: true,
    openMedia: () => {
      throw new Error("no media in a --no-media archive");
    },
  });
  const file = path.join(await tempDir("cloudhal-crafted-"), name);
  await writeArchiveFile(file, content);
  return file;
}

/** The fixture's bundle with the first ref of `kind` in its published snapshot (s2) at `text`. */
async function publishedRefAt(kind: string, text: string) {
  const bundle = await bundleOf(fx.projectDir, fx.siteId);
  const hash = sha256(utf8(text));
  const snapshots = bundle.snapshots.map((s) => {
    if (s.id !== fx.snapshots.s2) return s;
    const body = JSON.parse(s.body) as { nodes: { kind: string; hash: string }[] };
    const ref = body.nodes.find((r) => r.kind === kind);
    if (!ref) throw new Error(`no ${kind} ref`);
    ref.hash = hash;
    return { ...s, body: JSON.stringify(body) };
  });
  return { hash, bundle: { ...bundle, snapshots, blobs: { ...bundle.blobs, [hash]: text } } };
}

describe("cloudhal import: the same site comes back (invariant 1)", () => {
  it("imports into an empty project: nodes, history, media, takedowns and the publish pointer", async () => {
    const dir = await emptyProject();
    const lines: string[] = [];
    const result = await importArchive({
      projectDir: dir,
      file: archives.full,
      log: (l) => lines.push(l),
    });
    expect(result.newStore).toBe(true);
    expect(await bundleOf(dir, fx.siteId)).toStrictEqual(await bundleOf(fx.projectDir, fx.siteId));
    for (const sha of [fx.sha.a, fx.sha.c])
      expect(
        Buffer.compare(await readFile(mediaFile(dir, fx.siteId, sha)), await sourceBytes(sha)),
      ).toBe(0);
    // Invariant 5: the taken-down content stays down, its ledger row as the archive has it.
    expect(await exists(mediaFile(dir, fx.siteId, fx.sha.b))).toBe(false);
    const source = await bundleOf(fx.projectDir, fx.siteId);
    const ledger = await withStore(dir, async ({ sql, store }) => ({
      row: await sql.get(
        'SELECT state, purge_reason AS reason, purged_by AS "by", purged_at AS "at" FROM media_blobs WHERE site_id = ? AND sha256 = ?',
        [fx.siteId, fx.sha.b],
      ),
      published: (await store.getSite(fx.siteId))?.publishedSnapshotId,
    }));
    const [purge] = source.purged ?? [];
    expect(ledger.row).toEqual({
      state: "purged",
      reason: "personal data",
      by: purge?.by,
      at: purge?.at,
    });
    expect(ledger.published).toBe(fx.snapshots.s2);
    expect(result.imported).toMatchObject({
      nodes: { unchanged: false, deleted: 0 },
      snapshots: 3,
      media: { copied: 2, present: 0 },
      takedowns: 1,
      searchRefreshed: true,
    });
    const printed = describeImport(result);
    expect(printed[0]).toBe(
      `imported ${archives.full}: site ${fx.siteId} (english) is in this project`,
    );
    expect(printed).toContain(
      `media: 2 file(s) copied (${result.imported?.media.bytes} B), 0 already here; 1 taken down, never imported`,
    );
    expect(lines[0]).toMatch(/^verified .*english\.cloudhal: 8 file\(s\), \d+(\.\d)? (B|KiB)$/);
    expect(lines[1]).toMatch(/^copying 2 media file\(s\) \(\d+ B\)$/);

    // Another listed site of the same project.
    await importArchive({ projectDir: dir, file: archives.tr });
    expect(await bundleOf(dir, fx.trId)).toStrictEqual(await bundleOf(fx.projectDir, fx.trId));
  });

  it("changes nothing the second time", async () => {
    const dir = await emptyProject();
    await importArchive({ projectDir: dir, file: archives.full });
    const before = { ...(await stateOf(dir)), bundle: await bundleOf(dir, fx.siteId) };
    const lines: string[] = [];
    const again = await importArchive({
      projectDir: dir,
      file: archives.full,
      log: (l) => lines.push(l),
    });
    expect(again.newStore).toBe(false);
    expect(again.imported).toMatchObject({
      nodes: { inserted: 0, deleted: 0, unchanged: true },
      snapshots: 0,
      blobs: 0,
      media: { copied: 0, present: 2 },
    });
    expect(describeImport(again)).toEqual([
      `nothing to import: this project already holds ${archives.full} (site ${fx.siteId}, english)`,
    ]);
    expect(lines.some((l) => l.startsWith("copying"))).toBe(false);
    expect({ ...(await stateOf(dir)), bundle: await bundleOf(dir, fx.siteId) }).toEqual(before);
  });

  it("replaces a local media file of another size from a full archive", async () => {
    const dir = await emptyProject();
    const file = mediaFile(dir, fx.siteId, fx.sha.a);
    await cp(path.dirname(mediaFile(fx.projectDir, fx.siteId, fx.sha.a)), path.dirname(file), {
      recursive: true,
    });
    await writeFile(file, "not the picture");
    const result = await importArchive({ projectDir: dir, file: archives.full });
    expect(result.imported?.media).toMatchObject({ copied: 1, present: 1 });
    expect(Buffer.compare(await readFile(file), await sourceBytes(fx.sha.a))).toBe(0);
  });
});

describe("cloudhal import: untrusted rows (invariant 2)", () => {
  it("refuses a row whose id carries escapes, before any write, and prints it clean", async () => {
    const bundle = await bundleOf(fx.projectDir, fx.siteId);
    const page = bundle.nodes.find((n) => n.kind === "page") as NodeRow;
    const crafted = {
      ...bundle,
      nodes: bundle.nodes.map((n) => (n === page ? { ...n, id: "page_\u001b[2J‮evil" } : n)),
    };
    const file = await craftedArchive(crafted, "rows.cloudhal");
    const dir = await emptyProject();
    const error = (await importArchive({ projectDir: dir, file }).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toMatch(
      /^cannot import .*rows\.cloudhal: node page_ \[2J evil: columns do not match its body; nothing was imported$/,
    );
    expect(error.message).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    await expectNoStore(dir);
  });

  it("refuses a node body behind the published snapshot that is not a valid node, dry run too", async () => {
    // What the renderer would read for the live site, with its correct hash.
    const text = '{"blocks":"<script>x</script>","id":"not-a-page","title":42}';
    const { hash, bundle } = await publishedRefAt("page", text);
    const file = await craftedArchive(bundle);
    const dir = await emptyProject();
    for (const dryRun of [true, false])
      await expect(importArchive({ projectDir: dir, file, dryRun })).rejects.toThrow(
        `cannot import ${file}: blob ${hash} is not a valid page; nothing was imported`,
      );
    await expectNoStore(dir);
    // An asset body the media ledger reads is refused while the archive is read.
    const asset = await publishedRefAt("asset", '{"a":1}');
    const assetFile = await craftedArchive(asset.bundle);
    for (const dryRun of [true, false])
      await expect(importArchive({ projectDir: dir, file: assetFile, dryRun })).rejects.toThrow(
        /^cannot import .*crafted\.cloudhal: snapshots\/0001\.ndjson line \d+: an asset body it references needs storage, an object with a kind; nothing was imported$/,
      );
    await expectNoStore(dir);
  });
});

describe("cloudhal import: every file verified before use (invariant 3)", () => {
  it("refuses a damaged archive before anything is written", async () => {
    const last = [fx.sha.a, fx.sha.c].sort().at(-1) as string;
    const damaged = await archiveFile(
      retar(await readFile(archives.full), (tar) => {
        flip(tar, bodyOffset(tar, `media/${last}`) + 10);
        return tar;
      }),
    );
    const refused = new RegExp(
      `^cannot import .*crafted\\.cloudhal: media/${last}: its SHA-256 does not match manifest\\.json .*; the file is damaged or incomplete, export it again; nothing was imported$`,
    );
    const fresh = await emptyProject();
    await expect(importArchive({ projectDir: fresh, file: damaged })).rejects.toThrow(refused);
    await expectNoStore(fresh);
    // Into a project with a store: no media file was written, so the first pass refused it.
    const dir = await emptyProject();
    await withStore(dir, async () => {});
    const before = await stateOf(dir);
    await expect(importArchive({ projectDir: dir, file: damaged })).rejects.toThrow(refused);
    expect(await stateOf(dir)).toEqual(before);
    expect(before.blobs).toEqual([]);
  });

  it("refuses a file that changes between the passes: another archive, or a media byte", async () => {
    const file = path.join(await tempDir("cloudhal-swap-"), "swap.cloudhal");
    // Pass 2 opens the file right after this line.
    const swapTo = (bytes: Uint8Array) => (line: string) => {
      if (line.startsWith("copying")) writeFileSync(file, bytes);
    };
    // Another site's archive, which this project's cloudhal.json does not list.
    await cp(archives.full, file);
    const dir = await emptyProject({ siteId: fx.siteId });
    await expect(
      importArchive({ projectDir: dir, file, log: swapTo(await readFile(archives.tr)) }),
    ).rejects.toThrow(
      `cannot import ${file}: the file changed while it was being imported; nothing was imported`,
    );
    expect(await exists(path.join(dir, ".cloudhal", "data.db"))).toBe(false);
    expect(await blobListing(dir)).toEqual([]);
    // The same manifest, one media byte flipped: verified again as it is copied, never stored.
    const last = [fx.sha.a, fx.sha.c].sort().at(-1) as string;
    const flipped = retar(await readFile(archives.full), (tar) => {
      flip(tar, bodyOffset(tar, `media/${last}`) + 10);
      return tar;
    });
    await cp(archives.full, file);
    const other = await emptyProject();
    await expect(importArchive({ projectDir: other, file, log: swapTo(flipped) })).rejects.toThrow(
      new RegExp(
        `^cannot import .*swap\\.cloudhal: media/${last}: its SHA-256 does not match manifest\\.json .*; nothing was imported; 1 media file\\(s\\) already copied stay in `,
      ),
    );
    expect(await exists(mediaFile(other, fx.siteId, last))).toBe(false);
    expect(await exists(path.join(other, ".cloudhal", "data.db"))).toBe(false);
  });

  it("refuses a --no-media archive the project lacks media for, and imports it when it has them", async () => {
    const dir = await emptyProject();
    await expect(importArchive({ projectDir: dir, file: archives.graph })).rejects.toThrow(
      `the archive has no media (written with --no-media) and this project lacks 2 of the 2 media file(s) it needs (first ${[fx.sha.a, fx.sha.c].sort()[0]}); copy them into .cloudhal/blobs/media/${fx.siteId}/ or import an archive with media; nothing was imported`,
    );
    await expectNoStore(dir);
    const dry = await importArchive({ projectDir: dir, file: archives.graph, dryRun: true });
    const printed = describeImport(dry);
    expect(printed).toContain(
      "warning: the archive was written with --no-media; its 2 media file(s) (" +
        `${dry.mediaNeeded.bytes} B) must already be in this project`,
    );
    expect(printed).toContain(
      "media: none in the archive (--no-media); 0 of 2 already here, 2 missing",
    );
    await expectNoStore(dir);

    // With the media folder copied (and nothing else), it imports without a second read.
    const media = path.dirname(mediaFile(dir, fx.siteId, fx.sha.a));
    await cp(path.dirname(mediaFile(fx.projectDir, fx.siteId, fx.sha.a)), media, {
      recursive: true,
    });
    const lines: string[] = [];
    const result = await importArchive({
      projectDir: dir,
      file: archives.graph,
      log: (l) => lines.push(l),
    });
    expect(lines.some((l) => l.startsWith("copying"))).toBe(false);
    expect(result.imported?.media).toMatchObject({ copied: 0, present: 2 });
    expect(await bundleOf(dir, fx.siteId)).toStrictEqual(await bundleOf(fx.projectDir, fx.siteId));
  });

  it("refuses a --no-media archive over a local media file of another size", async () => {
    const dir = await emptyProject();
    const media = path.dirname(mediaFile(dir, fx.siteId, fx.sha.a));
    await cp(path.dirname(mediaFile(fx.projectDir, fx.siteId, fx.sha.a)), media, {
      recursive: true,
    });
    await writeFile(mediaFile(dir, fx.siteId, fx.sha.c), "short");
    await expect(importArchive({ projectDir: dir, file: archives.graph })).rejects.toThrow(
      /this project lacks or has a damaged copy of 1 of the 2 media file\(s\) it needs/,
    );
    expect(await exists(path.join(dir, ".cloudhal", "data.db"))).toBe(false);
  });
});

describe("cloudhal import: newer archives (invariant 4)", () => {
  it("refuses a newer archive format or contracts version, naming the CLI version needed", async () => {
    const newer: ((m: Record<string, unknown>) => void)[] = [
      (m) => {
        m.format = "cloudhal.site-archive@2";
      },
      (m) => {
        m.contracts = { schemaVersion: 2 };
      },
    ];
    for (const edit of newer) {
      const file = await archiveFile(
        archiveOf(baseFiles(), {
          manifest: (m) => {
            edit(m);
            m.createdBy = "9.9.9";
          },
        }),
      );
      const dir = await emptyProject();
      await expect(importArchive({ projectDir: dir, file })).rejects.toThrow(
        /^cannot import .*: this archive was written by a newer Cloudhal \(.*\); update @cloudhal\/cli to 9\.9\.9 or later; nothing was imported$/,
      );
      await expectNoStore(dir);
    }
  });
});

describe("cloudhal import: taken-down content stays down (invariant 5)", () => {
  it("deletes local bytes of content the archive's ledger took down", async () => {
    const dir = await emptyProject();
    const b = makePng({ width: 3, height: 3 });
    expect(sha256(b)).toBe(fx.sha.b);
    const file = mediaFile(dir, fx.siteId, fx.sha.b);
    await cp(path.dirname(mediaFile(fx.projectDir, fx.siteId, fx.sha.a)), path.dirname(file), {
      recursive: true,
    });
    await writeFile(file, b);
    const dry = await importArchive({ projectDir: dir, file: archives.full, dryRun: true });
    expect(describeImport(dry)).toContain(
      "taken down: 1 file(s) in the archive's ledger, never imported; 1 of them are in this project and would be deleted",
    );
    expect(await exists(file)).toBe(true);
    await importArchive({ projectDir: dir, file: archives.full });
    expect(await exists(file)).toBe(false);
  });

  it("says so when it deletes a local copy of content the source took down since", async () => {
    const dir = await emptyProject();
    await importArchive({ projectDir: dir, file: archives.full });
    expect(await exists(mediaFile(dir, fx.siteId, fx.sha.c))).toBe(true);
    // C is in the first snapshot only: taking it down changes no node.
    const source = await copyProject(fx);
    await withStore(source, ({ store }) =>
      store.purgeBlob(fx.siteId, fx.sha.c, person, { text: "court order", legal: true }),
    );
    const v2 = path.join(source, "v2.cloudhal");
    await exportArchive({ projectDir: source, out: v2 });
    const dry = await importArchive({ projectDir: dir, file: v2, dryRun: true });
    expect(describeImport(dry)).toContain(
      "taken down: 2 file(s) in the archive's ledger, never imported; 1 of them are in this project and would be deleted",
    );
    const result = await importArchive({ projectDir: dir, file: v2 });
    expect(result.imported).toMatchObject({
      nodes: { unchanged: true },
      snapshots: 0,
      blobs: 0,
      media: { copied: 0, present: 1 },
      takedowns: 2,
      takedownsDeleted: 1,
    });
    expect(describeImport(result)).toEqual([
      `imported ${v2}: site ${fx.siteId} (english) is in this project`,
      "nodes: unchanged; snapshots: 0 added; node bodies: 0 added",
      "media: 0 file(s) copied (0 B), 1 already here; 2 taken down, never imported; 1 of them deleted from this project",
    ]);
    expect(await exists(mediaFile(dir, fx.siteId, fx.sha.c))).toBe(false);
    const row = await withStore(dir, ({ sql }) =>
      sql.get(
        "SELECT state, purge_legal AS legal FROM media_blobs WHERE site_id = ? AND sha256 = ?",
        [fx.siteId, fx.sha.c],
      ),
    );
    expect(row).toEqual({ state: "purged", legal: 1 });
  });

  it("refuses an archive carrying content this project has taken down", async () => {
    const dir = await emptyProject();
    await importArchive({ projectDir: dir, file: archives.full });
    await withStore(dir, ({ store }) =>
      store.purgeBlob(fx.siteId, fx.sha.c, person, { text: "notice", legal: false }),
    );
    const before = await stateOf(dir);
    await expect(importArchive({ projectDir: dir, file: archives.full })).rejects.toThrow(
      `the archive carries 1 media file(s) this project has taken down (first ${fx.sha.c}); an import never brings taken-down content back; nothing was imported`,
    );
    expect(await exists(mediaFile(dir, fx.siteId, fx.sha.c))).toBe(false);
    expect(await stateOf(dir)).toEqual(before);
  });
});

/** A project that imported the archive and edited /about; an archive of a source that moved on. */
async function divergedProject() {
  const target = await emptyProject();
  await importArchive({ projectDir: target, file: archives.full });
  const page = await withStore(target, async ({ store }) => {
    const about = (await store.listPages(fx.siteId)).find((p) => p.path === "/about") as Page;
    return store.updatePage({ ...about, title: "Edited here" });
  });
  const source = await copyProject(fx);
  const d = await withStore(source, async ({ store }) => {
    const { asset } = await store.ingestAsset({
      siteId: fx.siteId,
      bytes: makePng({ width: 7, height: 7 }),
      filename: "d.png",
      uploadedBy: person,
      source: { kind: "upload" },
    });
    await store.createSnapshot(fx.siteId, { actor: person, reason: "manual" });
    return asset;
  });
  const moved = path.join(source, "moved.cloudhal");
  await exportArchive({ projectDir: source, out: moved });
  return { target, page, d, moved };
}

describe("cloudhal import: a refused import leaves the project as it was (invariant 6)", () => {
  it("refuses a project whose site differs: no node body, snapshot or media lands", async () => {
    const { target, page, d, moved } = await divergedProject();
    const before = { ...(await stateOf(target)), bundle: await bundleOf(target, fx.siteId) };
    const error = (await importArchive({ projectDir: target, file: moved }).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toMatch(
      new RegExp(
        `^cannot import .*moved\\.cloudhal: this project's site ${fx.siteId} differs from the archive in 2 node\\(s\\) \\(.*\\); bootstrap imports only into a project without the site or holding exactly its nodes, and --replace is not available yet; nothing was imported$`,
      ),
    );
    expect(error.message).toContain(page.id);
    expect(error.message).toContain(d.id);
    expect({ ...(await stateOf(target)), bundle: await bundleOf(target, fx.siteId) }).toEqual(
      before,
    );
    expect(await exists(mediaFile(target, fx.siteId, d.sha256))).toBe(false);
  });

  it("says a storage failure after the first write may have left part of it; a second run completes it", async () => {
    const dir = await emptyProject();
    // The last write: deleting the bytes of the content the archive's ledger took down.
    vi.spyOn(FsBlobStore.prototype, "delete").mockRejectedValueOnce(new Error("disk on fire"));
    const error = (await importArchive({ projectDir: dir, file: archives.full }).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toBe(
      `cannot import ${archives.full}: disk on fire; the import stopped after it began writing, so this project may hold part of it; run it again to finish (the 2 media file(s) copied are reused)`,
    );
    vi.restoreAllMocks();
    const again = await importArchive({ projectDir: dir, file: archives.full });
    expect(again.imported).toMatchObject({
      media: { copied: 0, present: 2 },
      searchRefreshed: true,
    });
    expect(await bundleOf(dir, fx.siteId)).toStrictEqual(await bundleOf(fx.projectDir, fx.siteId));
    // The node set had landed, so only the search index was behind: it is brought to the live one.
    const search = await withStore(dir, ({ store }) => store.searchStatus(fx.siteId));
    expect(search?.snapshotId).toBe(fx.snapshots.s2);
    // A refusal raised before importSite's first write still says nothing was imported.
    const refused = importFailure(new SyncConflictError(fx.siteId, ["page_aaaaaa01"]), {
      file: "x.cloudhal",
      mediaCopied: 0,
      mediaDir: "",
      siteId: fx.siteId,
      applying: true,
    });
    expect(refused.message).toMatch(/; nothing was imported$/);
  });

  it("stops on an abort between the passes", async () => {
    const abortAfterVerify = () => {
      const controller = new AbortController();
      const log = (l: string) => {
        if (l.startsWith("verified ")) controller.abort();
      };
      return { signal: controller.signal, log };
    };
    const fresh = await emptyProject();
    const error = await importArchive({
      projectDir: fresh,
      file: archives.full,
      ...abortAfterVerify(),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportInterruptedError);
    expect(error).toMatchObject({
      mediaCopied: 0,
      message: "import interrupted; nothing was imported",
    });
    await expectNoStore(fresh);
    const dir = await emptyProject();
    await withStore(dir, async () => {});
    const before = await stateOf(dir);
    await expect(
      importArchive({ projectDir: dir, file: archives.full, ...abortAfterVerify() }),
    ).rejects.toBeInstanceOf(ImportInterruptedError);
    expect(await stateOf(dir)).toEqual(before);
  });

  it("stops during the media copy: the copied file stays unreferenced, the next import reuses it", async () => {
    const dir = await emptyProject();
    const controller = new AbortController();
    const putStream = FsBlobStore.prototype.putStream;
    vi.spyOn(FsBlobStore.prototype, "putStream").mockImplementation(async function (
      this: FsBlobStore,
      ...args: Parameters<FsBlobStore["putStream"]>
    ) {
      await putStream.apply(this, args);
      controller.abort();
    });
    const error = await importArchive({
      projectDir: dir,
      file: archives.full,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportInterruptedError);
    expect(error).toMatchObject({
      mediaCopied: 1,
      message: `import interrupted; nothing was imported; 1 media file(s) already copied stay in .cloudhal/blobs/media/${fx.siteId}/, unreferenced, and the next import reuses them`,
    });
    expect((await blobListing(dir)).filter((f) => f.startsWith("media"))).toHaveLength(1);
    expect(await exists(path.join(dir, ".cloudhal", "data.db"))).toBe(false);
    vi.restoreAllMocks();
    const result = await importArchive({ projectDir: dir, file: archives.full });
    expect(result.imported?.media).toMatchObject({ copied: 1, present: 1 });
  });

  it("stops on Ctrl-C through the command: exit 130, the listeners removed", async () => {
    const dir = await emptyProject();
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.listeners("SIGINT");
    const beforeTerm = process.listeners("SIGTERM");
    const running = main(["import", archives.full]);
    const ours = process.listeners("SIGINT").filter((l) => !before.includes(l));
    expect(ours).toHaveLength(1);
    (ours[0] as () => void)();
    expect(await running).toBe(130);
    expect(error).toHaveBeenCalledWith("cloudhal: import interrupted; nothing was imported");
    await expectNoStore(dir);
    expect(process.listeners("SIGINT")).toEqual(before);
    expect(process.listeners("SIGTERM")).toEqual(beforeTerm);
  });
});

describe("cloudhal import: which site (the archive's id is kept)", () => {
  it("refuses another site's archive, naming both ids; the hint works without a store", async () => {
    const dir = await emptyProject({ siteId: "site_other00001" });
    const config = await readFile(path.join(dir, "cloudhal.json"));
    await expect(importArchive({ projectDir: dir, file: archives.full })).rejects.toThrow(
      `it holds site ${fx.siteId}, and this project's site is site_other00001 (cloudhal.json siteId); importing another site into a project comes with \`cloudhal import --replace\`, not available yet; this project has no local store yet, so setting cloudhal.json siteId to ${fx.siteId} also works (push and deploy then use ${fx.siteId}); nothing was imported`,
    );
    await expectNoStore(dir);
    expect(Buffer.compare(await readFile(path.join(dir, "cloudhal.json")), config)).toBe(0);
    // A dry run reads the whole archive and says so, without a plan.
    const dry = await importArchive({ projectDir: dir, file: archives.full, dryRun: true });
    expect(dry.plan).toBeUndefined();
    expect(describeImport(dry).at(-2)).toMatch(/^would refuse: it holds site /);
    // As the hint says.
    await writeProjectConfig(dir, { siteId: fx.siteId, dataDir: ".cloudhal" });
    await importArchive({ projectDir: dir, file: archives.full });
    expect(await bundleOf(dir, fx.siteId)).toStrictEqual(await bundleOf(fx.projectDir, fx.siteId));
  });

  it("refuses another site's archive into a project with a store, without the hint", async () => {
    const dir = await copyProject(fx);
    await writeProjectConfig(dir, { siteId: fx.trId, dataDir: ".cloudhal" });
    const before = await stateOf(dir);
    const error = (await importArchive({ projectDir: dir, file: archives.full }).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toContain(
      `it holds site ${fx.siteId}, and this project's site is ${fx.trId} (cloudhal.json siteId); importing another site into a project comes with \`cloudhal import --replace\`, not available yet; nothing was imported`,
    );
    expect(await stateOf(dir)).toEqual(before);
  });
});

describe("cloudhal import --dry-run", () => {
  it("lists what a fresh import adds, by kind and title, and writes nothing", async () => {
    const dir = await emptyProject();
    const result = await importArchive({ projectDir: dir, file: archives.full, dryRun: true });
    const lines = describeImport(result);
    expect(result.refusals).toEqual([]);
    expect(lines[0]).toMatch(
      /^archive .*english\.cloudhal: cloudhal\.site-archive@1 \(contracts 1\), written by @cloudhal\/cli \S+ at 2026-01-02T/,
    );
    expect(lines[1]).toMatch(
      new RegExp(`^site ${fx.siteId} "English" \\(english\\): \\d+ node\\(s\\), 3 snapshot\\(s\\)`),
    );
    expect(lines).toContain(
      `dry run: bootstrap import into site ${fx.siteId}, which is new to this project`,
    );
    expect(lines).toContain('  + page "About us" (/about)');
    expect(lines).toContain('  + media "pixel.png"');
    expect(lines).toContain('  + site "English"');
    expect(lines.find((l) => l.startsWith("nodes: "))).toMatch(
      /^nodes: \d+ to add \(1 site, .*2 media, 2 pages.*\), 0 to change, 0 to remove$/,
    );
    // In bundle order (created_at, id), as the archive holds them.
    const ids = (await bundleOf(fx.projectDir, fx.siteId)).snapshots.map((x) => x.id);
    expect(lines.find((l) => l.startsWith("snapshots: "))).toMatch(
      new RegExp(`^snapshots: 3 to add \\(${ids.join(", ")}\\), with \\d+ node bodies$`),
    );
    expect(lines).toContain(
      `media: 2 file(s) to copy (${result.mediaNeeded.bytes} B), 0 already here`,
    );
    expect(lines).toContain("taken down: 1 file(s) in the archive's ledger, never imported");
    expect(lines.at(-1)).toBe("nothing written (dry run)");
    await expectNoStore(dir);
  });

  it("shows the change and the refusal for a diverged project and exits 1, writing nothing", async () => {
    const { target, moved } = await divergedProject();
    const before = { ...(await stateOf(target)), bundle: await bundleOf(target, fx.siteId) };
    vi.spyOn(process, "cwd").mockReturnValue(target);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["import", moved, "--dry-run"])).toBe(1);
    const printed = log.mock.calls.map((c) => String(c[0]));
    expect(printed).toContainEqual(
      expect.stringMatching(
        /^ {2}~ page "About us" \(\/about\), rev \d+ here, \d+ in the archive$/,
      ),
    );
    expect(printed).toContain('  + media "d.png"');
    expect(printed).toContainEqual(
      expect.stringMatching(new RegExp(`^would refuse: this project's site ${fx.siteId} differs`)),
    );
    expect(printed.at(-1)).toBe("nothing written (dry run)");
    expect({ ...(await stateOf(target)), bundle: await bundleOf(target, fx.siteId) }).toEqual(
      before,
    );
  });

  it("prints titles clean and caps each group at 20 lines", async () => {
    const source = await copyProject(fx);
    await withStore(source, async ({ store }) => {
      const about = (await store.listPages(fx.siteId)).find((p) => p.path === "/about") as Page;
      await store.updatePage({ ...about, title: "Evil\u001b[31m‮title​" });
    });
    const file = path.join(source, "titles.cloudhal");
    await exportArchive({ projectDir: source, out: file, noMedia: true });
    const dry = await importArchive({ projectDir: await emptyProject(), file, dryRun: true });
    const lines = describeImport(dry);
    expect(lines).toContain('  + page "Evil [31m title" (/about)');
    for (const line of lines) expect(line).not.toMatch(/[\p{Cc}\p{Cf}]/u);

    const page = dry.plan?.nodes.added.find((n) => n.kind === "page") as NodeRow;
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...page,
      id: `page_many${String(i).padStart(4, "0")}`,
    }));
    const plan = { ...(dry.plan as NonNullable<ImportArchiveResult["plan"]>) };
    const capped = describeImport({
      ...dry,
      plan: { ...plan, nodes: { ...plan.nodes, added: many } },
    });
    const added = capped.filter((l) => l.startsWith("  + "));
    expect(added).toHaveLength(20);
    expect(capped[capped.lastIndexOf(added.at(-1) as string) + 1]).toBe("  … and 5 more");
  });
});

describe("cloudhal import: the command", () => {
  it("is in --help and checks its arguments and flags", async () => {
    expect(HELP).toMatch(/^ {2}cloudhal import <file> \[--dry-run\] +a \.cloudhal file/m);
    for (const argv of [["import"], ["import", "a", "b"]])
      await expect(main(argv)).rejects.toThrow("usage: cloudhal import <file> [--dry-run]");
    await expect(main(["import", "x.cloudhal", "--replace"])).rejects.toThrow(
      "cloudhal import --replace is not available yet; this version imports in bootstrap mode only",
    );
    await expect(main(["import", "x.cloudhal", "--site", "site_other00001"])).rejects.toThrow(
      "cloudhal import does not take --site (only cloudhal export does)",
    );
  });

  it("names a missing file or a folder, and imports from the project folder", async () => {
    const dir = await emptyProject();
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    await expect(main(["import", "x.cloudhal"])).rejects.toThrow(
      "cannot import x.cloudhal: no such file; nothing was imported",
    );
    await expect(main(["import", "."])).rejects.toThrow(
      "cannot import .: it is a directory; name a .cloudhal file; nothing was imported",
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await cp(archives.full, path.join(dir, "site.cloudhal"));
    expect(await main(["import", "site.cloudhal"])).toBe(0);
    expect(log).toHaveBeenCalledWith(
      `imported site.cloudhal: site ${fx.siteId} (english) is in this project`,
    );
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/^verified site\.cloudhal: /));
    await rm(path.join(dir, "site.cloudhal"));
  });
});
