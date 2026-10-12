/**
 * The admin Worker's reader comments (RFC-0007 rollout step 5): the purge flusher against the
 * budget it shares with publishing (takedowns first, normal tags coalesced, back-off on an empty
 * bucket — invariant C6), the publish path logging its purge requests, the hourly job (retention,
 * deleted entries, threads closed by time, salts — C11) and availability from the secrets. D1 is
 * Miniflare's; the `SITE` binding is a recording fake (the whole loop on real workerd is in
 * packages/cli/test/cloudflare-comments.test.ts).
 */
import { ID_PREFIX, newCommentsId, PURGE_LIMITS } from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";

type ContentEntry = Awaited<ReturnType<SiteGraphStore["listContentEntries"]>>[number];

import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AdminEnv, createAdminWorker } from "../src/admin-worker.ts";
import {
  adminComments,
  commentsHourlyDue,
  commentsOn,
  flushCommentPurges,
  runCommentsHourly,
} from "../src/comments.ts";
import { purgeSiteCache } from "../src/purge.ts";

const T0 = new Date("2026-10-12T12:00:00.000Z");
const KEY = "admin-comments-test-key-not-a-secret-000";
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;
const editor = { kind: "human" as const, id: "user_editor00001", name: "Ayşe" };

let d1: Awaited<ReturnType<typeof createMiniflareD1>>;
let sql: D1Driver;
let graph: SiteGraphStore;
let store: SqlCommentStore;
let clock: { now: Date };
let siteId: string;
let entry: ContentEntry;

beforeAll(async () => {
  d1 = await createMiniflareD1();
});
afterAll(async () => {
  await d1.dispose();
});

beforeEach(async () => {
  sql = new D1Driver(d1.db);
  await dropAllTables(sql);
  graph = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await graph.init();
  siteId = (await seedStarterSite(graph, { name: "Comments", slug: "comments" })).id;
  entry = (await graph.listContentEntries(siteId))[0] as ContentEntry;
  clock = { now: T0 };
  store = new SqlCommentStore(sql, { now: () => clock.now });
});

/** A fake site Worker: answers each purge with `status(n)`, records the tags. */
function site(status: (n: number) => number = () => 200) {
  const calls: (string[] | "everything")[] = [];
  const fetch = async (_url: string, init: RequestInit) => {
    const body = init.body ? (JSON.parse(String(init.body)) as { tags: string[] }) : undefined;
    calls.push(body ? body.tags : "everything");
    return new Response("{}", { status: status(calls.length) });
  };
  return { calls, fetch };
}

/** A draft entry (deleted later in the tests). */
const draft = (slug: string) =>
  graph.createContentEntry({
    siteId,
    collection: "posts",
    slug,
    locale: "en",
    status: "draft",
    title: slug,
    body: { format: "markdown", value: "x" },
    fields: {},
    tags: [],
    author: editor,
  });
const tag = (id: string) => `cloudhal-comments-${id}`;
const at = (ms: number) => new Date(T0.getTime() + ms);
const flush = (s: ReturnType<typeof site>, ms: number) =>
  flushCommentPurges({ store, fetch: s.fetch, token: "t".repeat(32), now: () => at(ms) });

describe("the comment purge flusher (§8.4)", () => {
  it("sends takedowns at once, coalesces normal tags for 20 s, and removes what was sent", async () => {
    await store.purgeQueue.enqueue(siteId, [tag("entry_a00001")], "takedown");
    await store.purgeQueue.enqueue(siteId, [tag("entry_b00001"), tag("entry_c00001")], "normal");
    const s = site();
    const first = await flush(s, 0);
    // the takedown request carries the normal tags along in its spare room
    expect(s.calls).toEqual([[tag("entry_a00001"), tag("entry_b00001"), tag("entry_c00001")]]);
    expect(first.sent).toHaveLength(1);
    expect(await store.purgeQueue.queued(siteId)).toEqual([]);

    clock.now = at(1000);
    await store.purgeQueue.enqueue(siteId, [tag("entry_d00001")], "normal");
    const early = await flush(s, 5_000);
    expect(early.sent).toEqual([]);
    expect(early.nextCheckAt).toBe(at(1000 + PURGE_LIMITS.normalDelayMs).toISOString());
    await flush(s, 21_000);
    expect(s.calls.at(-1)).toEqual([tag("entry_d00001")]);
    // every request is in the shared log
    expect(await store.purgeQueue.recent(at(21_000))).toHaveLength(2);
  });

  it("leaves room for publishes: normal purges wait while the minute holds 3 requests; takedowns do not", async () => {
    for (let i = 0; i < 3; i++) await store.purgeQueue.log("publish", 1, at(10_000 + i));
    await store.purgeQueue.enqueue(siteId, [tag("entry_n00001")], "normal");
    const s = site();
    const blocked = await flush(s, 30_000);
    expect(s.calls).toEqual([]);
    expect(blocked.nextCheckAt).toBe(at(70_000).toISOString());
    clock.now = at(31_000);
    await store.purgeQueue.enqueue(siteId, [tag("entry_t00001")], "takedown");
    await flush(s, 31_000);
    expect(s.calls).toEqual([[tag("entry_t00001"), tag("entry_n00001")]]);
  });

  it("backs off on an empty bucket and keeps the rows", async () => {
    await store.purgeQueue.enqueue(siteId, [tag("entry_x00001")], "takedown");
    const failing = site(() => 502);
    const r = await flush(failing, 0);
    expect(r.failed).toBe(1);
    const [row] = await store.purgeQueue.queued(siteId);
    expect(row).toMatchObject({
      attempts: 1,
      nextAt: at(PURGE_LIMITS.backoffBaseMs).toISOString(),
    });
    // not due yet: nothing is sent
    expect((await flush(failing, 10_000)).sent).toEqual([]);
    expect(failing.calls).toHaveLength(1);
    // the failed request counted against the budget too
    expect(await store.purgeQueue.recent(at(10_000))).toHaveLength(1);
    const ok = site();
    await flush(ok, PURGE_LIMITS.backoffBaseMs);
    expect(ok.calls).toEqual([[tag("entry_x00001")]]);
    // a takedown still queued after two minutes is reported
    await store.purgeQueue.enqueue(siteId, [tag("entry_y00001")], "takedown");
    const stuck = await flush(
      site(() => 502),
      0,
    );
    expect(stuck.takedownWaiting).toBe(false);
    expect(
      (
        await flush(
          site(() => 502),
          3 * 60_000,
        )
      ).takedownWaiting,
    ).toBe(true);
  });

  it("the publish path logs each purge request in the shared budget", async () => {
    const s = site();
    let logged = 0;
    await purgeSiteCache({
      fetch: s.fetch,
      token: "t",
      store: { planCachePurge: async () => ({ mode: "tags", tags: ["cloudhal-node-x"], why: [] }) },
      change: { from: "snap_a", to: "snap_b" },
      onRequest: () => {
        logged++;
      },
    });
    await purgeSiteCache({
      fetch: s.fetch,
      token: "t",
      store: { planCachePurge: async () => ({ mode: "everything", reason: "first" }) },
      change: { to: "snap_b" },
      onRequest: () => {
        logged++;
      },
    });
    expect(logged).toBe(2);
  });
});

describe("the hourly comments job (§8.5, §9.3)", () => {
  async function seed(nodeId: string, created: Date) {
    const id = newCommentsId(ID_PREFIX.comment);
    await store.submit(siteId, {
      id,
      nodeId,
      name: "Mehmet",
      text: "A comment",
      status: "pending",
      labels: [],
      ipHmac: "a".repeat(32),
      challengeId: null,
      proof: "pow",
      createdAt: created.toISOString(),
    });
    return id;
  }

  it("applies retention, deletes comments of entries deleted 30 days ago, purges threads that closed, deletes old salts", async () => {
    const old = await seed(entry.id, new Date(T0.getTime() - 40 * 86_400_000));
    const fresh = await seed(entry.id, T0);
    // a deleted entry with comments: its last snapshot is old
    const gone = await draft("gone");
    const goneComment = await seed(gone.id, T0);
    // approved, so only the deleted-entry rule (not pending retention) removes it
    await store.moderate(siteId, {
      ids: [goneComment],
      action: "approve",
      actor: editor,
      expectedRevs: { [goneComment]: 1 },
    });
    await graph.createSnapshot(siteId, { actor: editor, reason: "manual" });
    await graph.deleteContentEntry(gone);
    await graph.createSnapshot(siteId, { actor: editor, reason: "manual" });
    await store.putSettings(
      siteId,
      { enabled: true, collections: { posts: { enabled: true } } },
      0,
      editor.id,
    );
    // the published entry's thread closed 30 minutes ago
    await store.putThread(
      siteId,
      entry.id,
      { mode: "default", closesAt: new Date(T0.getTime() - 30 * 60_000).toISOString() },
      0,
      editor.id,
      { purge: null },
    );
    await sql.run("INSERT INTO comment_salts (month, salt, created_at) VALUES (?, ?, ?)", [
      "2026-07",
      "s",
      T0.toISOString(),
    ]);

    // the snapshots carry the real time: 40 days after T0 the deletion is due
    const now = new Date(T0.getTime() + 40 * 86_400_000);
    const r = await runCommentsHourly({ graph, store, now });
    expect(r.sites).toBe(1);
    expect(await store.get(siteId, old)).toBeNull();
    expect(r.retained).toBeGreaterThanOrEqual(1);
    expect(r.salts).toBe(1);
    expect(await store.get(siteId, goneComment)).toBeNull();
    expect(r.deletedEntries).toBeGreaterThanOrEqual(1);
    void fresh;

    // closing by time: within the last hour → one normal purge row
    const closing = await runCommentsHourly({ graph, store, now: T0 });
    expect(closing.closed).toBe(1);
    expect((await store.purgeQueue.queued(siteId)).map((x) => [x.tag, x.priority])).toContainEqual([
      tag(entry.id),
      "normal",
    ]);
    // an hour later it is not queued again
    expect((await runCommentsHourly({ graph, store, now: at(2 * 3_600_000) })).closed).toBe(0);
  });

  it("keeps comments of an entry deleted recently", async () => {
    const gone = await draft("recent");
    const c = await seed(gone.id, new Date());
    await graph.createSnapshot(siteId, { actor: editor, reason: "manual" });
    await graph.deleteContentEntry(gone);
    await graph.createSnapshot(siteId, { actor: editor, reason: "manual" });
    const r = await runCommentsHourly({ graph, store, now: new Date() });
    expect(r.deletedEntries).toBe(0);
    expect(await store.get(siteId, c)).not.toBeNull();
  });
});

describe("availability and the Worker", () => {
  const env = (extra: Partial<AdminEnv> = {}): AdminEnv =>
    ({
      DB: d1.db,
      BLOBS: {} as R2Bucket,
      BETTER_AUTH_SECRET: "x".repeat(32),
      MCP_STATE_KEY: "y".repeat(32),
      ...extra,
    }) as AdminEnv;

  it("comments need the deployment key and are not switched off", async () => {
    expect(commentsOn(env())).toBe(false);
    expect(commentsOn(env({ CLOUDHAL_COMMENTS_KEY: "short" }))).toBe(false);
    expect(commentsOn(env({ CLOUDHAL_COMMENTS_KEY: KEY }))).toBe(true);
    expect(
      commentsOn(env({ CLOUDHAL_COMMENTS_KEY: KEY, CLOUDHAL_COMMENTS_AVAILABLE: "false" })),
    ).toBe(false);
    expect(await adminComments(env(), sql)).toBeUndefined();
    const deps = await adminComments(env({ CLOUDHAL_COMMENTS_KEY: KEY }), sql);
    expect(deps?.keys).toBeDefined();
  });

  it("scheduled runs the comments job and flushes through SITE", async () => {
    const id = newCommentsId(ID_PREFIX.comment);
    await store.submit(siteId, {
      id,
      nodeId: entry.id,
      name: "Old",
      text: "Old pending comment",
      status: "pending",
      labels: [],
      ipHmac: null,
      challengeId: null,
      proof: "pow",
      createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    });
    await store.purgeQueue.enqueue(siteId, [tag(entry.id)], "takedown");
    const s = site();
    const lines: string[] = [];
    const worker = createAdminWorker({ log: (l) => lines.push(l) });
    await worker.scheduled(
      { scheduledTime: Date.now(), cron: "17 * * * *" } as ScheduledController,
      env({
        CLOUDHAL_COMMENTS_KEY: KEY,
        CLOUDHAL_PURGE_TOKEN: "p".repeat(32),
        SITE: { fetch: s.fetch } as unknown as Fetcher,
      }),
      ctx,
    );
    expect(await store.get(siteId, id)).toBeNull();
    expect(s.calls).toEqual([[tag(entry.id)]]);
    expect(lines.some((l) => /^comments hourly: 1 site\(s\)/.test(l))).toBe(true);
    expect(lines.at(-1)).toMatch(/comments purge backstop: 1 request\(s\), 0 failed/);
  });

  it("without a cron trigger the hourly job runs after an admin request, at most hourly", async () => {
    const id = newCommentsId(ID_PREFIX.comment);
    await store.submit(siteId, {
      id,
      nodeId: entry.id,
      name: "Old",
      text: "Old pending comment",
      status: "pending",
      labels: [],
      ipHmac: null,
      challengeId: null,
      proof: "pow",
      createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    });
    const lines: string[] = [];
    const worker = createAdminWorker({ log: (l) => lines.push(l) });
    const waits: Promise<unknown>[] = [];
    const waiting = { ...ctx, waitUntil: (p: Promise<unknown>) => waits.push(p) };
    const health = () =>
      worker.fetch(
        new Request("https://admin.example/api/health"),
        env({ CLOUDHAL_COMMENTS_KEY: KEY, CLOUDHAL_COMMENTS_CRON: "off" }),
        waiting as unknown as ExecutionContext,
      );
    expect((await health()).status).toBe(200);
    await Promise.all(waits);
    expect(await store.get(siteId, id)).toBeNull();
    expect(lines.filter((l) => l.startsWith("comments hourly (on request)"))).toHaveLength(1);
    // the same isolate within the hour: not again
    await health();
    await Promise.all(waits);
    expect(lines.filter((l) => l.startsWith("comments hourly (on request)"))).toHaveLength(1);
    // with a cron trigger (the default) requests never run it
    const other = createAdminWorker({ log: (l) => lines.push(l) });
    await other.fetch(
      new Request("https://admin.example/api/health"),
      env({ CLOUDHAL_COMMENTS_KEY: KEY }),
      waiting as unknown as ExecutionContext,
    );
    await Promise.all(waits);
    expect(lines.filter((l) => l.startsWith("comments hourly (on request)"))).toHaveLength(1);
    expect(commentsHourlyDue(env({ CLOUDHAL_COMMENTS_CRON: "off" }), 10 ** 13, 0)).toBe(false);
  });
});
