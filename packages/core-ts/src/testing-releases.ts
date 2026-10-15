/**
 * RFC-0008 releases on the site graph (rollout step 5): `publishRelease`, holds in
 * `createSnapshot` and `pendingChanges`, locks, "Edit and re-approve", "Publish now", the stored
 * purge plan, and the tick that runs them (`runScheduledTick`) — on SQLite and Miniflare D1.
 * Test names cite the invariants of RFC-0008 §17 they prove.
 */
import type { Actor, ContentEntry, Release, Site, Snapshot } from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import { TICK_BUDGETS } from "@cloudhal/schedules";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CachePurgePlan } from "./cache-purge.ts";
import { ScheduledLockedError } from "./errors.ts";
import { type PersonApproval, ReleaseService, runScheduledTick } from "./releases.ts";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";
import { racingDriver } from "./testing-taxonomy.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const agent: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Desk" };
/** 2026-10-12T12:00:00Z; the release runs two hours later. */
const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const HOUR = 3_600_000;
const T = T0 + 2 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

/** Statements of the paths measured here (for the RFC's implementation notes). */
export const RELEASE_STATEMENTS: Record<string, number> = {};

export function releasesSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`releases on the site graph (RFC-0008 §6): ${label}`, { timeout: 120_000 }, () => {
    let sql: SqlDriver;
    let blobs: BlobStore;
    let now = T0;
    let store: SiteGraphStore;
    let svc: ReleaseService;
    let site: Site;
    let news: string;
    let category: string;
    const logs: string[] = [];

    beforeEach(async () => {
      ({ sql, blobs } = await factory.create());
      await dropAllTables(sql);
      now = T0;
      logs.length = 0;
      store = new SiteGraphStore({ sql, blobs, now: () => new Date(now) });
      await store.init();
      site = await seedStarterSite(store, { name: "Releases", slug: "releases" });
      news = (await store.getTermBySlug(site.id, "category", "news"))?.id as string;
      category = (await store.getTaxonomyByKey(site.id, "category"))?.id as string;
      svc = new ReleaseService({ graph: store, now: () => new Date(now) });
      await publishSite();
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const approval = (): PersonApproval => ({
      kind: "person",
      by: { id: human.id, name: "Halil" },
      at: iso(now),
    });
    const fresh = async () => (await store.getSite(site.id)) as Site;
    const live = async (): Promise<Snapshot> => {
      const s = await fresh();
      return (await store.getSnapshot(s.publishedSnapshotId as string)) as Snapshot;
    };
    const liveRef = async (id: string) => (await live()).nodes.find((n) => n.id === id);
    const publishSite = async () => {
      const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
      site = await store.publish(await fresh(), snap.id);
      return snap;
    };
    const story = (over: Partial<ContentEntry> = {}) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "election-results",
        locale: "en",
        status: "published",
        title: "Election results",
        body: { format: "markdown", value: "The count." },
        fields: {},
        tags: [],
        terms: { category: { ids: [news], primary: news } },
        author: human,
        ...over,
      });
    const scheduled = async (set: string[], o: { at?: number; remove?: string[] } = {}) => {
      const { release, closureAdded } = await svc.create({
        siteId: site.id,
        set,
        ...(o.remove ? { remove: o.remove } : {}),
        createdBy: agent,
        when: { at: iso(o.at ?? T) },
      });
      const r = await svc.schedule(site.id, release.id, {
        expectedRev: release.rev,
        approval: approval(),
      });
      return { release: r, closureAdded };
    };
    const tick = (at: number, o: Partial<Parameters<typeof runScheduledTick>[0]> = {}) =>
      runScheduledTick({
        sql,
        blobs,
        now: new Date(at),
        trigger: "cron",
        wake: "minute",
        budget: TICK_BUDGETS.free,
        log: (l) => logs.push(l),
        ...o,
      });
    const get = async (id: string) => (await svc.get(site.id, id)).release;

    it("S1/S2: publishes exactly the pinned versions on top of what is live, at T and not before", async () => {
      const s = await story();
      // An unrelated pending change that must not go live with the release.
      const home = (await store.listPages(site.id)).find((p) => p.path === "/");
      if (!home) throw new Error("no home page");
      await store.updatePage({ ...home, title: "Unpublished retitle" });
      const L = await live();
      const { release, closureAdded } = await scheduled([s.id]);
      expect(closureAdded).toEqual([]);
      expect(release.state).toBe("scheduled");

      const early = await tick(T - 1000);
      expect(early.ran).toBe(0);
      expect((await fresh()).publishedSnapshotId).toBe(L.id);

      const report = await tick(T + 41_000);
      RELEASE_STATEMENTS["release published by a tick (publishRelease)"] = report.statements ?? -1;
      // overview 1, due releases 1, claim 2, purge plan 1, site + live + parent 3, the batch 7 (no
      // asset blobs to root), the search index brought to the new snapshot 6 (RFC-0019 §3: its
      // reads and one guarded batch), then the overview after work 1 and the heartbeat 1 (S17).
      expect(report.statements).toBe(23);
      expect(report).toMatchObject({ ran: 1, failed: 0, more: false });
      expect(report.statements).toBeLessThanOrEqual(TICK_BUDGETS.free.maxQueries);
      const S = await live();
      expect(S.id).not.toBe(L.id);
      expect(isValid("snapshot", S)).toBe(true);
      expect(S).toMatchObject({
        reason: "scheduled",
        label: "Scheduled: Election results",
        actor: { kind: "system", id: "sys_scheduler" },
        summary: { added: 1, changed: 0, removed: 0 },
        metadata: {
          "cloudhal.release": release.id,
          "cloudhal.releaseHash": release.hash,
          "cloudhal.base": L.id,
          "cloudhal.approvedBy": human.id,
        },
      });
      // nodes(S) = nodes(L) − ids + targets: the home page stays at its live version.
      const target = release.items[0];
      expect(S.nodes.map((n) => n.id).sort()).toEqual([...L.nodes.map((n) => n.id), s.id].sort());
      expect(S.nodes.find((n) => n.id === home.id)).toEqual(L.nodes.find((n) => n.id === home.id));
      expect(S.nodes.find((n) => n.id === s.id)).toMatchObject(
        target?.kind === "set" ? target.target : {},
      );
      expect(S.parentId).toBeDefined();
      const done = await get(release.id);
      expect(isValid("release", done)).toBe(true);
      expect(done).toMatchObject({
        state: "published",
        outcome: {
          kind: "published",
          snapshotId: S.id,
          baseSnapshotId: L.id,
          latenessSeconds: 41,
          purge: "none",
        },
      });
      expect((await store.heldNodes(site.id)).size).toBe(0);
      const audit = await sql.get<Record<string, unknown>>(
        "SELECT actor_id, tool, release_id, run_id, snapshot_id, input FROM audit WHERE release_id = ?",
        [release.id],
      );
      expect(audit).toMatchObject({
        actor_id: "sys_scheduler",
        tool: "release.publish",
        snapshot_id: S.id,
      });
      expect(JSON.parse(String(audit?.input))).toMatchObject({
        onBehalfOf: { id: human.id },
        requestedBy: { id: agent.id },
      });
      // Nothing runs twice.
      expect((await tick(T + 2 * 60_000)).ran).toBe(0);
    });

    it("approving a release of a draft publishes it: marked published, dated at T, live after the run", async () => {
      const s = await story({ status: "draft" });
      // Creating (or proposing) a release never changes the node's status.
      const { release: draft } = await svc.create({
        siteId: site.id,
        set: [s.id],
        createdBy: agent,
        when: { at: iso(T) },
      });
      expect((await store.getContentEntry(s.id))?.status).toBe("draft");
      const release = await svc.schedule(site.id, draft.id, {
        expectedRev: draft.rev,
        approval: approval(),
      });
      expect(release.state).toBe("scheduled");
      expect(release.hash).not.toBe(draft.hash);
      expect(await store.getContentEntry(s.id)).toMatchObject({
        status: "published",
        publishedAt: iso(T),
      });
      // Held: an ordinary publish keeps it off the live site until T.
      await publishSite();
      expect(await liveRef(s.id)).toBeUndefined();
      expect((await tick(T + 5_000)).ran).toBe(1);
      const ref = await liveRef(s.id);
      if (!ref) throw new Error("not live");
      expect(await store.readSnapshotNode(ref)).toMatchObject({
        status: "published",
        publishedAt: iso(T),
      });
    });

    it("refuses to approve a release of a draft that could not be published (no primary term)", async () => {
      const s = await story({ status: "draft", terms: {} });
      const { release } = await svc.create({
        siteId: site.id,
        set: [s.id],
        createdBy: agent,
        when: { at: iso(T) },
      });
      await expect(
        svc.schedule(site.id, release.id, { expectedRev: release.rev, approval: approval() }),
      ).rejects.toThrow(/primary/);
      expect((await store.getContentEntry(s.id))?.status).toBe("draft");
      expect((await get(release.id)).state).toBe("draft");
    });

    it("S5: an ordinary publish keeps held nodes at their live version; pendingChanges and stateHash agree", async () => {
      const s = await story();
      const before = await store.stateHash(site.id);
      const pendingBefore = await store.pendingChanges(site.id);
      expect(pendingBefore.added.map((n) => n.id)).toContain(s.id);
      const { release } = await scheduled([s.id]);
      // The approval binding sees the hold even though no content changed.
      expect(await store.stateHash(site.id)).not.toBe(before);
      expect((await store.pendingChanges(site.id)).added.map((n) => n.id)).not.toContain(s.id);
      // A publish now does not release the scheduled story.
      const snap = await publishSite();
      expect(snap.nodes.some((n) => n.id === s.id)).toBe(false);
      expect(await liveRef(s.id)).toBeUndefined();
      // A whole-working-copy snapshot cannot be published around the hold.
      const manual = await store.createSnapshot(site.id, { actor: human, reason: "manual" });
      expect(manual.nodes.some((n) => n.id === s.id)).toBe(true);
      await expect(store.publish(await fresh(), manual.id)).rejects.toBeInstanceOf(
        ScheduledLockedError,
      );
      await expect(store.publish(await fresh(), manual.id)).rejects.toMatchObject({
        code: "scheduled_locked",
        details: { nodeId: s.id, releaseId: release.id, executeAt: iso(T) },
      });
      // Unscheduled: the story is an ordinary pending change again.
      const whileHeld = await store.stateHash(site.id);
      await svc.unschedule(site.id, release.id, { expectedRev: release.rev });
      expect(await store.stateHash(site.id)).not.toBe(whileHeld);
      expect((await publishSite()).nodes.some((n) => n.id === s.id)).toBe(true);
    });

    it("§6.2 locks: held nodes refuse updates and deletes; people may edit and re-approve", async () => {
      const s = await story();
      const { release } = await scheduled([s.id]);
      await expect(store.updateContentEntry({ ...s, title: "Typo fixed" })).rejects.toMatchObject({
        name: "InvariantError",
        code: "scheduled_locked",
        details: { nodeId: s.id, releaseId: release.id, state: "scheduled" },
      });
      await expect(store.deleteContentEntry(s)).rejects.toMatchObject({
        code: "scheduled_locked",
      });
      const term = (await store.getTerm(news)) as NonNullable<
        Awaited<ReturnType<typeof store.getTerm>>
      >;
      // the term is live, so it is not in the release and stays editable
      expect(
        (await store.updateTerm({ ...term, labels: { en: { name: "All the news" } } })).rev,
      ).toBe(term.rev + 1);
      // Edit and re-approve: the edit goes through, the item is re-pinned, the approval recorded.
      const edited = await svc.editHeldEntry(
        site.id,
        release.id,
        { ...s, title: "Election results: final" },
        { approval: approval() },
      );
      expect(edited.entry.title).toBe("Election results: final");
      const r2 = edited.release.release;
      expect(r2).toMatchObject({ state: "scheduled", approval: { kind: "person" } });
      expect(r2.hash).not.toBe(release.hash);
      const item = r2.items[0];
      expect(item?.kind === "set" ? item.target.rev : 0).toBe(edited.entry.rev);
      // Without an approval the edit sends the release for approval (still held and locked).
      const again = await svc.editHeldEntry(site.id, release.id, {
        ...edited.entry,
        title: "Election results: final count",
      });
      expect(again.release.release.state).toBe("awaiting_approval");
      await expect(
        store.updateContentEntry({ ...again.entry, title: "Sneaky" }),
      ).rejects.toMatchObject({ code: "scheduled_locked" });
      // Another release's edit option does not unlock it.
      await expect(
        store.updateContentEntry({ ...again.entry, title: "x" }, { releaseEdit: "rel_OTHER00001" }),
      ).rejects.toMatchObject({ code: "scheduled_locked" });
      // Unschedule and edit.
      const back = await svc.unschedule(site.id, release.id, {
        expectedRev: again.release.release.rev,
      });
      expect(back.state).toBe("draft");
      expect((await store.updateContentEntry({ ...again.entry, title: "Free" })).title).toBe(
        "Free",
      );
    });

    it("S4: a base that changed after pinning holds the release as a conflict; nothing is applied", async () => {
      const L0 = await live();
      const s = await story();
      await publishSite(); // v1 live
      const v1 = await liveRef(s.id);
      const edited = await store.updateContentEntry({
        ...((await store.getContentEntry(s.id)) as ContentEntry),
        title: "Corrected",
      });
      const { release } = await scheduled([s.id]);
      expect(release.items[0]?.base).toEqual({ rev: v1?.rev, hash: v1?.hash });
      // A rollback moves the held node's live version (allowed; the release becomes a conflict).
      const { site: rolled } = await store.rollback(await fresh(), L0.id, human);
      const pointer = rolled.publishedSnapshotId;
      const report = await tick(T);
      expect(report.ran).toBe(0);
      expect((await fresh()).publishedSnapshotId).toBe(pointer);
      const r = await get(release.id);
      expect(isValid("release", r)).toBe(true);
      expect(r).toMatchObject({
        state: "conflict",
        outcome: {
          kind: "conflict",
          conflicts: [{ nodeId: s.id, expected: release.items[0]?.base }],
        },
      });
      expect(edited.rev).toBeGreaterThan(v1?.rev ?? 0);
      // Re-pin takes the current working copy against the new live state.
      const repinned = await svc.repin(site.id, release.id, { expectedRev: r.rev });
      expect(repinned.release.state).toBe("draft");
      expect(repinned.release.items[0]?.base).toBeUndefined();
    });

    it("adds the dependency closure, and fails a release whose dependency is gone at T", async () => {
      const breaking = await store.createTerm({
        siteId: site.id,
        taxonomyId: category,
        slug: "breaking",
        status: "active",
        visibility: "public",
        labels: { en: { name: "Breaking" } },
      });
      const s = await story({ terms: { category: { ids: [breaking.id], primary: breaking.id } } });
      const { release, closureAdded } = await scheduled([s.id]);
      expect(closureAdded).toEqual([breaking.id]);
      expect(release.items.map((i) => i.nodeId).sort()).toEqual([breaking.id, s.id].sort());
      expect((await tick(T)).ran).toBe(1);
      expect(await liveRef(breaking.id)).toBeDefined();
      expect(await liveRef(s.id)).toBeDefined();

      // A dependency that was live when pinned and is gone at T: dependency_missing.
      const L1 = await live();
      const opinion = await store.createTerm({
        siteId: site.id,
        taxonomyId: category,
        slug: "opinion",
        status: "active",
        visibility: "public",
        labels: { en: { name: "Opinion" } },
      });
      await publishSite();
      const column = await story({
        slug: "column",
        title: "Column",
        terms: { category: { ids: [opinion.id], primary: opinion.id } },
      });
      const second = await scheduled([column.id], { at: T + HOUR });
      expect(second.closureAdded).toEqual([]);
      await store.rollback(await fresh(), L1.id, human);
      now = T + HOUR;
      expect((await tick(T + HOUR)).failed).toBe(1);
      expect(await get(second.release.id)).toMatchObject({
        state: "failed",
        outcome: { kind: "failed", code: "dependency_missing" },
      });
    });

    it("removes a live entry and keeps everything else", async () => {
      const s = await story();
      await publishSite();
      const L = await live();
      const { release } = await svc.create({
        siteId: site.id,
        remove: [s.id],
        createdBy: human,
        when: { at: iso(T) },
      });
      await svc.schedule(site.id, release.id, { expectedRev: release.rev, approval: approval() });
      expect((await tick(T)).ran).toBe(1);
      const S = await live();
      expect(S.nodes.some((n) => n.id === s.id)).toBe(false);
      expect(S.nodes).toHaveLength(L.nodes.length - 1);
      expect(S.summary).toEqual({ added: 0, changed: 0, removed: 1 });
    });

    it("S4 inside the batch: the site moving between the reads and the write is re-read once", async () => {
      const s = await story();
      const { release } = await scheduled([s.id]);
      let raced = 0;
      const racing = racingDriver(
        sql,
        async () => {
          raced++;
          await store.updateSite({ ...(await fresh()), name: "Renamed meanwhile" });
        },
        (q) => q.includes("INSERT INTO snapshots"),
      );
      const report = await tick(T, { sql: racing });
      expect(raced).toBe(1);
      expect(report.ran).toBe(1);
      const after = await fresh();
      expect(after.name).toBe("Renamed meanwhile");
      const done = await get(release.id);
      expect(after.publishedSnapshotId).toBe(
        done.outcome?.kind === "published" ? done.outcome.snapshotId : "(not published)",
      );
      // Exactly one scheduled snapshot was written.
      const n = await sql.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM snapshots WHERE site_id = ? AND json_extract(body, '$.reason') = 'scheduled'",
        [site.id],
      );
      expect(Number(n?.n)).toBe(1);
    });

    it("S3: two concurrent ticks publish once", async () => {
      const s = await story();
      const { release } = await scheduled([s.id]);
      const [a, b] = await Promise.all([tick(T), tick(T)]);
      expect(a.ran + b.ran).toBe(1);
      const n = await sql.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM snapshots WHERE json_extract(body, '$.metadata.\"cloudhal.release\"') = ?",
        [release.id],
      );
      expect(Number(n?.n)).toBe(1);
      expect((await get(release.id)).state).toBe("published");
    });

    it("sends the purge plan stored at pin time and records a deferred purge", async () => {
      const s = await story();
      await scheduled([s.id]);
      const plans: CachePurgePlan[] = [];
      const report = await tick(T, {
        purge: () => async (_siteId, plan) => {
          plans.push(plan);
          return "deferred";
        },
      });
      expect(report.ran).toBe(1);
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({ mode: "tags" });
      expect(plans[0]?.mode === "tags" ? plans[0].tags : []).toContain(`cloudhal-node-${s.id}`);
      const r = (await svc.list(site.id))[0] as Release;
      expect(r.outcome).toMatchObject({ kind: "published", purge: "deferred" });
      expect(isValid("release", r)).toBe(true);
    });

    it("S8 and Publish now: more than an hour late is missed; a person publishes it now", async () => {
      const s = await story();
      const { release } = await scheduled([s.id]);
      now = T + 2 * HOUR;
      await tick(now);
      const missed = await get(release.id);
      expect(missed).toMatchObject({ state: "missed", outcome: { kind: "missed" } });
      expect(await liveRef(s.id)).toBeUndefined();
      // missed releases hold nothing: the node is editable again
      expect((await store.heldNodes(site.id)).size).toBe(0);
      const { release: done, report } = await svc.publishNow(site.id, release.id, {
        expectedRev: missed.rev,
        by: { id: human.id, name: "Halil" },
      });
      RELEASE_STATEMENTS["Publish now (outside a tick, unmetered)"] = -1;
      expect(report.ran).toBe(1);
      expect(done).toMatchObject({
        state: "published",
        approval: { kind: "person", by: { id: human.id } },
        outcome: { kind: "published", latenessSeconds: 0 },
      });
      expect(await liveRef(s.id)).toBeDefined();
      const runs = await svc.schedules.listRuns(site.id, { subjectId: release.id });
      expect(runs.map((r) => r.state).sort()).toEqual(["missed", "succeeded"]);
      expect(runs.find((r) => r.state === "succeeded")?.trigger).toBe("manual");
    });

    it("refuses a release time under a minute away and keeps one release at a time per site", async () => {
      const s = await story();
      await expect(
        svc.create({
          siteId: site.id,
          set: [s.id],
          createdBy: human,
          when: { at: iso(now + 30_000) },
        }),
      ).rejects.toMatchObject({ code: "too_soon" });
      const other = await story({ slug: "other", title: "Other" });
      const a = await scheduled([s.id]);
      const b = await scheduled([other.id]);
      const report = await tick(T);
      // Workers Free runs one release per tick; the second follows on the next.
      expect(report.ran).toBe(1);
      expect(report.more).toBe(true);
      expect((await tick(T + 1000)).ran).toBe(1);
      expect((await get(a.release.id)).state).toBe("published");
      expect((await get(b.release.id)).state).toBe("published");
    });
  });
}
