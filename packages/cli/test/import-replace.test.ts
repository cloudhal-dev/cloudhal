/**
 * `cloudhal import --replace` and `--revert` (RFC-0039 §2, rollout step 4) on real local projects:
 * the local nodes become the archive's, its published snapshot included, after a `before import`
 * snapshot of them that `--revert` brings back (invariant 6), itself undone the same way; the
 * nodes a replace gives a rev no higher than they had are counted, and a revert moves revs forward
 * so a stale editor gets a conflict; an unchanged site gets no snapshot, and is refused when
 * another process changes it before the write; `--dry-run` shows the snapshots and the published
 * snapshot and writes nothing; open releases (RFC-0008) and an unfinished field operation
 * (RFC-0041) refuse it before anything is written; a storage failure after the snapshot names it,
 * and a second run reuses it. The site id switch is in `import-switch.test.ts`.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import type { ContentEntry, NodeRef, Page, Site, Snapshot } from "@cloudhal/core-contracts";
import { ConflictError, runFieldOperation } from "@cloudhal/core-ts";
import { ReleaseService } from "@cloudhal/core-ts/releases";
import { FsBlobStore } from "@cloudhal/storage/fs";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import { exportArchive } from "../src/commands/export.ts";
import { importArchive } from "../src/commands/import.ts";
import { describeImport, describeRevert } from "../src/commands/import-describe.ts";
import { revertImport } from "../src/commands/import-revert.ts";
import { writeProjectConfig } from "../src/config.ts";
import {
  bundleOf,
  copyProject,
  emptyProject,
  type Fixture,
  mediaFile,
  person,
  removeTempDirs,
  seedFixture,
  stateOf,
  tempDir,
  withStore,
} from "./site-fixture.ts";

let fx: Fixture;
let archive: string;

beforeAll(async () => {
  fx = await seedFixture("cloudhal-replace-src-");
  const out = path.join(await tempDir("cloudhal-replace-archives-"), "english.cloudhal");
  archive = (await exportArchive({ projectDir: fx.projectDir, out })).file;
});
afterAll(removeTempDirs);
afterEach(() => vi.restoreAllMocks());

const BEFORE = "before import english.cloudhal";
const AFTER = "import english.cloudhal";

type Row = { id: string; rev: number; hash: string; body: string };

/** The node rows without their timestamps (a restore rebuilds those from the bodies). */
const rowsOf = (dir: string, siteId = fx.siteId) =>
  withStore(dir, ({ sql }) =>
    sql.all<Row>("SELECT id, kind, key, rev, hash, body FROM nodes WHERE site_id = ? ORDER BY id", [
      siteId,
    ]),
  );

/** The rows' content: without the rev a revert moves forward, and the hash that follows it. */
const contentOf = (rows: readonly Row[]) =>
  rows.map(({ rev: _rev, hash: _hash, body, ...row }) => ({
    ...row,
    body: { ...(JSON.parse(body) as object), rev: undefined },
  }));

const REVS_TOOK = (n: number) =>
  `note: ${n} node(s) took the archive's rev, no higher than theirs here; reload Studio tabs open on this site: an edit a tab or agent still holds at that rev saves over them without a conflict`;

const snapshotsOf = (dir: string, siteId = fx.siteId): Promise<Snapshot[]> =>
  withStore(dir, ({ store }) => store.listSnapshots(siteId, 200));

async function labelled(dir: string, label: string): Promise<Snapshot> {
  const found = (await snapshotsOf(dir)).filter((s) => s.label === label);
  expect(found).toHaveLength(1);
  return found[0] as Snapshot;
}

const aboutOf = async (store: Parameters<Parameters<typeof withStore>[1]>[0]["store"]) =>
  (await store.listPages(fx.siteId)).find((p) => p.path === "/about") as Page;

/** A copy of the fixture with /about retitled here and published as `s4`. */
async function editedCopy(): Promise<{ dir: string; s4: string }> {
  const dir = await copyProject(fx);
  const s4 = await withStore(dir, async ({ store }) => {
    await store.updatePage({ ...(await aboutOf(store)), title: "Edited here" });
    const snap = await store.createSnapshot(fx.siteId, { actor: person, reason: "publish" });
    await store.publish((await store.getSite(fx.siteId)) as Site, snap.id);
    return snap.id;
  });
  return { dir, s4 };
}

const replace = (dir: string, dryRun = false) =>
  importArchive({ projectDir: dir, file: archive, replace: true, dryRun });

describe("cloudhal import --replace: the local nodes become the archive's", () => {
  it("replaces an edited site, published snapshot included, saving it first", async () => {
    const { dir, s4 } = await editedCopy();
    const refs = await withStore(dir, ({ store }) => store.currentNodeRefs(fx.siteId));
    const result = await replace(dir);
    const source = await bundleOf(fx.projectDir, fx.siteId);
    expect((await bundleOf(dir, fx.siteId)).nodes).toStrictEqual(source.nodes);
    const after = await withStore(dir, async ({ store }) => ({
      published: (await store.getSite(fx.siteId))?.publishedSnapshotId,
      latest: await store.latestSnapshot(fx.siteId),
      refs: await store.currentNodeRefs(fx.siteId),
      search: await store.searchStatus(fx.siteId),
    }));
    expect(after.published).toBe(fx.snapshots.s2);
    expect(after.search?.snapshotId).toBe(fx.snapshots.s2);
    const b = await labelled(dir, BEFORE);
    const a = await labelled(dir, AFTER);
    const extra = (await snapshotsOf(dir))
      .map((s) => s.id)
      .filter((id) => !source.snapshots.some((s) => s.id === id));
    expect(new Set(extra)).toEqual(new Set([s4, b.id, a.id]));
    expect(b).toMatchObject({
      reason: "import",
      metadata: { "cloudhal.import.phase": "before", "cloudhal.import.file": "english.cloudhal" },
    });
    expect(b.nodes).toEqual(refs);
    expect(a).toMatchObject({
      reason: "import",
      parentId: b.id,
      metadata: { "cloudhal.import.phase": "after", "cloudhal.import.of": b.id },
    });
    expect(a.nodes).toEqual(after.refs);
    expect(after.latest?.id).toBe(a.id);
    const printed = describeImport(result);
    expect(printed[0]).toBe(
      `imported ${archive}: site ${fx.siteId} (english) is in this project, its nodes replaced by the archive's`,
    );
    expect(printed).toContain(
      `published: snapshot ${fx.snapshots.s2}, as the archive has it (was: ${s4})`,
    );
    expect(printed).toContain(
      `saved first: snapshot ${b.id} "${BEFORE}" holds the site as it was (undo: cloudhal import --revert ${b.id}); ${a.id} "${AFTER}" holds the result`,
    );
    // The site node and /about went back to the archive's lower revs: a stale editor can save.
    expect(printed).toContain(REVS_TOOK(2));
  });

  it("is undone by --revert, edit and published snapshot included, and a revert is undone too", async () => {
    const { dir, s4 } = await editedCopy();
    const rows = await rowsOf(dir);
    await replace(dir);
    const imported = await rowsOf(dir);
    const b = await labelled(dir, BEFORE);
    const dry = await revertImport({ projectDir: dir, snapshotId: b.id, dryRun: true });
    expect(describeRevert(dry)).toContainEqual(
      expect.stringMatching(
        /^ {2}~ page "Edited here" \(\/about\), rev \d+ here, \d+ after the revert$/,
      ),
    );
    expect(await rowsOf(dir)).toEqual(imported);

    const reverted = await revertImport({ projectDir: dir, snapshotId: b.id });
    expect(await rowsOf(dir)).toEqual(rows);
    const live = await withStore(dir, async ({ store }) => ({
      title: (await aboutOf(store)).title,
      published: (await store.getSite(fx.siteId))?.publishedSnapshotId,
      search: (await store.searchStatus(fx.siteId))?.snapshotId,
      latest: (await store.latestSnapshot(fx.siteId))?.label,
    }));
    expect(live).toEqual({
      title: "Edited here",
      published: s4,
      search: s4,
      latest: `revert ${AFTER}`,
    });
    const r = await labelled(dir, `before revert ${AFTER}`);
    expect(r.metadata).toMatchObject({
      "cloudhal.import.phase": "before",
      "cloudhal.import.revert": b.id,
    });
    const printed = describeRevert(reverted);
    expect(printed[0]).toMatch(new RegExp(`^reverted to snapshot ${b.id} "${BEFORE}" \\(site `));
    expect(printed).toContain(
      `published: snapshot ${s4}, as the snapshot has it (was: ${fx.snapshots.s2})`,
    );
    expect(printed).toContainEqual(
      expect.stringContaining(`saved first: snapshot ${r.id} "before revert ${AFTER}"`),
    );
    expect(printed).not.toContainEqual(expect.stringMatching(/^note: \d+ node\(s\)/));

    // Again: nothing to do, no snapshot.
    const count = (await snapshotsOf(dir)).length;
    const again = await revertImport({ projectDir: dir, snapshotId: b.id });
    expect(describeRevert(again)).toEqual([
      expect.stringMatching(
        new RegExp(`^nothing to revert: the site already holds the nodes of snapshot ${b.id} `),
      ),
    ]);
    expect((await snapshotsOf(dir)).length).toBe(count);
    // The revert's own `before` snapshot brings the archive's content back, at revs past these.
    const revertedRows = await rowsOf(dir);
    await revertImport({ projectDir: dir, snapshotId: r.id });
    const back = await rowsOf(dir);
    expect(contentOf(back)).toEqual(contentOf(imported));
    // The site node and /about: the archive's content at the rev after the reverted one.
    const was = new Map(revertedRows.map((x) => [x.id, x]));
    const moved = back.filter((row) => was.get(row.id)?.hash !== row.hash);
    expect(moved.map((row) => row.rev)).toEqual(
      moved.map((row) => (was.get(row.id)?.rev ?? 0) + 1),
    );
    expect(moved).toHaveLength(2);
  });

  it("--revert moves revs forward: an editor holding a rev a node had gets a conflict", async () => {
    const { dir } = await editedCopy();
    await replace(dir);
    const b = await labelled(dir, BEFORE);
    // One edit after the import brings /about back to the rev the snapshot holds, with other
    // content; a Studio tab now holds that rev.
    const tab = await withStore(dir, async ({ store }) =>
      store.updatePage({ ...(await aboutOf(store)), title: "After the import" }),
    );
    expect(tab.rev).toBe(b.nodes.find((n) => n.id === tab.id)?.rev);
    const result = await revertImport({ projectDir: dir, snapshotId: b.id });
    await withStore(dir, async ({ store }) => {
      expect(await aboutOf(store)).toMatchObject({ title: "Edited here", rev: tab.rev + 1 });
      await expect(store.updatePage({ ...tab, title: "Stale tab" })).rejects.toThrow(ConflictError);
      expect((await aboutOf(store)).title).toBe("Edited here");
    });
    expect(result.outcome?.revsReused).toBeUndefined();
    // Again: the content is the snapshot's already, so nothing moves.
    const again = await revertImport({ projectDir: dir, snapshotId: b.id });
    expect(again.reverted?.nodes.unchanged).toBe(true);
  });

  it("takes no snapshot and changes nothing for a site that holds the archive's nodes", async () => {
    const dir = await copyProject(fx);
    const before = await stateOf(dir);
    const result = await replace(dir);
    expect(await stateOf(dir)).toEqual(before);
    expect(describeImport(result)).toEqual([
      `nothing to import: this project already holds ${archive} (site ${fx.siteId}, english)`,
    ]);
    expect((await snapshotsOf(dir)).some((s) => s.metadata?.["cloudhal.import.phase"])).toBe(false);
  });

  it("refuses a site found unchanged that another process changes before the write", async () => {
    const dir = await copyProject(fx);
    const [m] = (await bundleOf(dir, fx.siteId)).media ?? [];
    if (!m) throw new Error("the fixture has no media");
    // A missing media file makes the import read the archive again before it writes.
    await rm(mediaFile(dir, fx.siteId, m.sha256));
    const putStream = FsBlobStore.prototype.putStream;
    let edited = false;
    vi.spyOn(FsBlobStore.prototype, "putStream").mockImplementation(async function (
      this: FsBlobStore,
      ...args: Parameters<FsBlobStore["putStream"]>
    ) {
      if (!edited) {
        edited = true;
        await withStore(dir, async ({ store }) => {
          await store.updatePage({ ...(await aboutOf(store)), title: "Edited meanwhile" });
        });
      }
      return putStream.apply(this, args);
    });
    await expect(replace(dir)).rejects.toThrow(
      `cannot import ${archive}: site ${fx.siteId} changed after it was planned (another process wrote it); run it again; nothing was imported`,
    );
    vi.restoreAllMocks();
    expect(edited).toBe(true);
    const about = await withStore(dir, ({ store }) => aboutOf(store));
    expect(about.title).toBe("Edited meanwhile");
    expect((await snapshotsOf(dir)).some((s) => s.metadata?.["cloudhal.import.phase"])).toBe(false);
    // Again: the site now differs, so the edit is saved first, then replaced.
    await replace(dir);
    const b = await labelled(dir, BEFORE);
    const saved = await withStore(dir, async ({ store }) => ({
      page: await store.readSnapshotNode<Page>(b.nodes.find((n) => n.id === about.id) as NodeRef),
      now: (await aboutOf(store)).title,
    }));
    expect(saved).toEqual({
      page: expect.objectContaining({ title: "Edited meanwhile" }),
      now: "About us",
    });
  });

  it("acts as a bootstrap into a project without the site, with no snapshot", async () => {
    const dir = await emptyProject(fx);
    const result = await replace(dir);
    expect(result.replace?.snapshot).toBeUndefined();
    expect(await bundleOf(dir, fx.siteId)).toStrictEqual(await bundleOf(fx.projectDir, fx.siteId));
    expect((await snapshotsOf(dir)).some((s) => s.metadata?.["cloudhal.import.phase"])).toBe(false);
  });
});

describe("cloudhal import --replace --dry-run", () => {
  it("shows the change, the published snapshot and the snapshot it would take, and writes nothing", async () => {
    const { dir, s4 } = await editedCopy();
    const before = { ...(await stateOf(dir)), bundle: await bundleOf(dir, fx.siteId) };
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["import", archive, "--replace", "--dry-run"])).toBe(0);
    const printed = log.mock.calls.map((c) => String(c[0]));
    expect(printed).toContain(
      `dry run: replace import into site ${fx.siteId}, which this project already holds`,
    );
    expect(printed).toContain("nodes: 0 to add, 2 to change (1 site, 1 page), 0 to remove");
    expect(printed).toContainEqual(
      expect.stringMatching(
        /^ {2}~ page "About us" \(\/about\), rev \d+ here, \d+ in the archive$/,
      ),
    );
    expect(printed).toContain(
      `published: snapshot ${fx.snapshots.s2}, as the archive has it (here: ${s4})`,
    );
    expect(printed).toContainEqual(
      expect.stringMatching(
        /^saved first: this project's site \(\d+ nodes\) as snapshot "before import english\.cloudhal", the result as "import english\.cloudhal" \(undo: cloudhal import --revert <the first one>\)$/,
      ),
    );
    expect(printed).toContain(
      "note: 2 node(s) would take the archive's rev, no higher than theirs here; reload Studio tabs open on this site: an edit a tab or agent holds at that rev saves over them without a conflict",
    );
    expect(printed.at(-1)).toBe("nothing written (dry run)");
    expect({ ...(await stateOf(dir)), bundle: await bundleOf(dir, fx.siteId) }).toEqual(before);
  });
});

describe("cloudhal import --replace: refused before anything is written (invariant 6)", () => {
  it("refuses while the site has open releases (RFC-0008), and --revert too", async () => {
    const { dir } = await editedCopy();
    const draft = async (title: string) =>
      withStore(dir, async ({ store }) => {
        const about = await aboutOf(store);
        await store.updatePage({ ...about, title });
        const svc = new ReleaseService({ graph: store });
        return (await svc.create({ siteId: fx.siteId, set: [about.id], createdBy: person, title }))
          .release;
      });
    const cancel = (id: string, rev: number) =>
      withStore(dir, ({ store }) =>
        new ReleaseService({ graph: store }).cancel(fx.siteId, id, {
          expectedRev: rev,
          by: person,
        }),
      );
    const release = await draft("Launch");
    const before = await stateOf(dir);
    await expect(replace(dir)).rejects.toThrow(
      `site ${fx.siteId} has 1 open release(s) (${release.id} (draft, "Launch")), and --replace replaces the graph their pinned versions point into; cancel them in Studio (\`cloudhal studio\`) or with the MCP tool cancel_schedule, then import again; nothing was imported`,
    );
    expect(await stateOf(dir)).toEqual(before);
    const dry = await replace(dir, true);
    expect(dry.refusals).toHaveLength(1);
    expect(describeImport(dry)).toContainEqual(
      expect.stringMatching(/^would refuse: site .* has 1 open release/),
    );
    expect(await stateOf(dir)).toEqual(before);

    await cancel(release.id, release.rev);
    await replace(dir);
    const b = await labelled(dir, BEFORE);
    const second = await draft("Second");
    const count = (await snapshotsOf(dir)).length;
    await expect(revertImport({ projectDir: dir, snapshotId: b.id })).rejects.toThrow(
      new RegExp(
        `^cannot revert to ${b.id}: site ${fx.siteId} has 1 open release\\(s\\) \\(${second.id} .*, and --revert replaces .*then revert again; nothing was reverted$`,
      ),
    );
    expect((await snapshotsOf(dir)).length).toBe(count);
  });

  it("refuses while a field operation is unfinished (RFC-0041)", async () => {
    const dir = await copyProject(fx);
    const operationId = await withStore(dir, async ({ store }) => {
      const site = (await store.getSite(fx.siteId)) as Site;
      const speaker = { key: "speaker", type: "text", labels: { en: { label: "Speaker" } } };
      await store.updateSite({
        ...site,
        collections: {
          ...site.collections,
          events: { fields: [{ ...speaker, localized: false }] },
        },
      } as never);
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
      const part = await runFieldOperation(
        store,
        fx.siteId,
        { op: "rename_field", collection: "events", from: "speaker", to: "presenter" },
        { actor: person, budget: { entries: 1 } },
      );
      expect(part.done).toBe(false);
      return part.operationId;
    });
    const before = await stateOf(dir);
    await expect(replace(dir)).rejects.toThrow(
      `field operation ${operationId} on events has not finished, and --replace would drop its marker; finish or revert it first (\`cloudhal fields continue|revert events ${operationId}\`), then import again; nothing was imported`,
    );
    expect(await stateOf(dir)).toEqual(before);
  });
});

describe("cloudhal import --replace: a failure after the snapshot", () => {
  it("names the snapshot taken first; a second run reuses it and completes", async () => {
    const { dir } = await editedCopy();
    const rows = await rowsOf(dir);
    const batch = BetterSqlite3Driver.prototype.batch;
    let failed = false;
    vi.spyOn(BetterSqlite3Driver.prototype, "batch").mockImplementation(async function (
      this: BetterSqlite3Driver,
      statements: Parameters<BetterSqlite3Driver["batch"]>[0],
    ) {
      if (!failed && statements.some((s) => s.sql.startsWith("DELETE FROM nodes WHERE site_id"))) {
        failed = true;
        throw new Error("disk on fire");
      }
      return batch.call(this, statements);
    });
    const error = (await replace(dir).catch((e: unknown) => e)) as Error;
    vi.restoreAllMocks();
    const b = await labelled(dir, BEFORE);
    expect(error.message).toBe(
      `cannot import ${archive}: disk on fire; the import stopped after it began writing, so this project may hold part of it; run it again to finish; snapshot ${b.id} taken first holds the site as it was (undo: cloudhal import --revert ${b.id})`,
    );
    expect(await rowsOf(dir)).toEqual(rows);

    await replace(dir);
    expect((await labelled(dir, BEFORE)).id).toBe(b.id);
    expect((await labelled(dir, AFTER)).parentId).toBe(b.id);
    expect((await bundleOf(dir, fx.siteId)).nodes).toStrictEqual(
      (await bundleOf(fx.projectDir, fx.siteId)).nodes,
    );
  });

  it("takes the snapshot of the result a run that stopped after the node batch still owed", async () => {
    const { dir } = await editedCopy();
    const batch = BetterSqlite3Driver.prototype.batch;
    let stop = false;
    // The media ledger's batch comes right after the node batch.
    vi.spyOn(BetterSqlite3Driver.prototype, "batch").mockImplementation(async function (
      this: BetterSqlite3Driver,
      statements: Parameters<BetterSqlite3Driver["batch"]>[0],
    ) {
      const result = await batch.call(this, statements);
      if (!stop && statements.some((s) => s.sql.startsWith("DELETE FROM nodes WHERE site_id"))) {
        stop = true;
        throw new Error("disk on fire");
      }
      return result;
    });
    await expect(replace(dir)).rejects.toThrow(/the import stopped after it began writing/);
    vi.restoreAllMocks();
    const b = await labelled(dir, BEFORE);
    expect((await snapshotsOf(dir)).some((s) => s.label === AFTER)).toBe(false);
    const again = await replace(dir);
    expect((await labelled(dir, AFTER)).parentId).toBe(b.id);
    expect(describeImport(again)).toContainEqual(
      expect.stringContaining(`saved first: snapshot ${b.id} "${BEFORE}"`),
    );
  });
});

describe("cloudhal import --replace and --revert: the command", () => {
  it("checks its arguments and flags", async () => {
    const usage =
      "usage: cloudhal import <file> [--replace] [--dry-run] | --revert <snapshot-id> [--dry-run]";
    for (const argv of [
      ["import", "a.cloudhal", "--revert", "snap_x"],
      ["import", "--revert", "snap_x", "--replace"],
    ])
      await expect(main(argv)).rejects.toThrow(usage);
    await expect(main(["import", "x.cloudhal", "--replace", "--cancel-schedules"])).rejects.toThrow(
      "cloudhal import does not take --cancel-schedules (only cloudhal push does)",
    );
    const dir = await emptyProject(fx);
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    await expect(main(["import", "x.cloudhal", "--replace"])).rejects.toThrow(
      "cannot import x.cloudhal: no such file; nothing was imported",
    );
    await expect(main(["import", "--revert", "snap_x"])).rejects.toThrow(
      "cannot revert to snap_x: this project has no local store; nothing was reverted",
    );
  });

  it("reverts only a before-import snapshot of a site cloudhal.json lists", async () => {
    const dir = await copyProject(fx);
    const notBefore =
      'it is not a "before import" snapshot of this project (`cloudhal import --replace` names the one it takes); nothing was reverted';
    for (const id of ["snap_unknown01", fx.snapshots.s1])
      await expect(revertImport({ projectDir: dir, snapshotId: id })).rejects.toThrow(
        `cannot revert to ${id}: ${notBefore}`,
      );
    const tr = await withStore(dir, ({ store }) =>
      store.createSnapshot(fx.trId, {
        actor: person,
        reason: "import",
        label: "before import tr.cloudhal",
        metadata: { "cloudhal.import.phase": "before" },
      }),
    );
    await writeProjectConfig(dir, { siteId: fx.siteId, dataDir: ".cloudhal" });
    await expect(revertImport({ projectDir: dir, snapshotId: tr.id })).rejects.toThrow(
      `cannot revert to ${tr.id}: it is a snapshot of site ${fx.trId}, which cloudhal.json does not list (siteId and sites); nothing was reverted`,
    );
  });

  it("prints a revert's dry run and exits 1 when it would be refused", async () => {
    const { dir } = await editedCopy();
    await replace(dir);
    const b = await labelled(dir, BEFORE);
    await withStore(dir, async ({ store }) => {
      const entry = (await store.listContentEntries(fx.siteId))[0] as ContentEntry;
      await store.updateContentEntry({ ...entry, title: "Due later" });
      await new ReleaseService({ graph: store }).create({
        siteId: fx.siteId,
        set: [entry.id],
        createdBy: person,
      });
    });
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await main(["import", "--revert", b.id, "--dry-run"])).toBe(1);
    const printed = log.mock.calls.map((c) => String(c[0]));
    expect(printed[0]).toMatch(new RegExp(`^revert to snapshot ${b.id} "${BEFORE}"`));
    expect(printed).toContain("dry run: replace the site's nodes");
    expect(printed).toContainEqual(expect.stringMatching(/^would refuse: site .* open release/));
    expect(printed.at(-1)).toBe("nothing written (dry run)");
  });
});
