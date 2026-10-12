/**
 * Shared suites (RFC-0007 §15.1, §16), run from vitest files against SQLite and Miniflare D1 like
 * the storage and analytics suites:
 *
 * - `describeCommentStoreConformance` — `SqlCommentStore`: settings and thread CAS, submissions and
 *   replay protection across store instances (C12), bulk moderation with partial results and its
 *   statement count (D1 Free write budget), labels (C9), staff replies, rendering, lists and counts,
 *   `cm1:` hashes, erasure (anonymise and delete text), bans, reports, the purge queue and
 *   retention with a mocked clock (C11). Every returned record is checked against the contract (C1).
 * - `describeCommentPipelineSuite` — the submission pipeline on the real store, counting written
 *   statements: hostile submissions write nothing (C2), only open threads of published entries
 *   accept comments (C5), a solved challenge is accepted once (C12).
 */
import type { Actor, Comment } from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import type { RunResult, SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type CommentKeys, deriveCommentKeys } from "./crypto.ts";
import { CommentConflictError, CommentForbiddenError, CommentInputError } from "./errors.ts";
import { emailHmac, ID_PREFIX, newCommentsId, randomSalt, sealEmail } from "./hashes.ts";
import { CommentLimiter, DailyCount } from "./limits.ts";
import { DAY_MS, type PreparedSubmission, utcMonth } from "./model.ts";
import {
  handleChallengeRequest,
  handleCommentSubmission,
  handleReportSubmission,
  type PipelineDeps,
  type PublishedEntry,
  submissionResponse,
} from "./pipeline.ts";
import { issueChallenge, ReplayCache, solutionBits, solveChallenge } from "./pow.ts";
import { planPurge } from "./purge.ts";
import { oldestSaltMonthToKeep, retentionPlan } from "./retention.ts";
import { SqlCommentStore } from "./sql/store.ts";

/** A key for tests only; deployments generate their own `CLOUDHAL_COMMENTS_KEY`. */
export const TEST_COMMENTS_KEY = "conformance-test-key-not-a-secret-0000000";

export interface CommentStoreFactory {
  /** A fresh, migrated, empty database. */
  create(): Promise<SqlDriver>;
  dispose?(): Promise<void>;
}

/** A driver that counts what it executes: write statements (run and batch), batches and reads. */
export interface CountingDriver extends SqlDriver {
  readonly writes: SqlStatement[];
  readonly batches: SqlStatement[][];
  reads: number;
  reset(): void;
}

export function countingDriver(inner: SqlDriver): CountingDriver {
  const writes: SqlStatement[] = [];
  const batches: SqlStatement[][] = [];
  const d: CountingDriver = {
    name: `counting(${inner.name})`,
    writes,
    batches,
    reads: 0,
    get: (sql, params) => {
      d.reads++;
      return inner.get(sql, params);
    },
    all: (sql, params) => {
      d.reads++;
      return inner.all(sql, params);
    },
    run: (sql: string, params?: readonly SqlValue[]): Promise<RunResult> => {
      writes.push({ sql, ...(params ? { params } : {}) });
      batches.push([{ sql, ...(params ? { params } : {}) }]);
      return inner.run(sql, params);
    },
    batch: (statements) => {
      writes.push(...statements);
      batches.push([...statements]);
      return inner.batch(statements);
    },
    exec: (sql) => inner.exec(sql),
    close: () => inner.close(),
    reset() {
      writes.length = 0;
      batches.length = 0;
      d.reads = 0;
    },
  };
  return d;
}

const SITE = "site_conform01";
const OTHER_SITE = "site_conform02";
const ENTRY = "entry_conform01";
const ENTRY2 = "entry_conform02";
const T0 = new Date("2026-10-12T10:00:00.000Z");
const EDITOR: Actor = { kind: "human", id: "user_editor01", name: "Ayşe" };
const AGENT: Actor = { kind: "agent", id: "agent_triage01", name: "Comment triage" };

/** Asserts a returned record is a valid `Comment` and carries no private column (C1). */
export function expectContractComment(c: Comment): void {
  expect(isValid("comment", c), JSON.stringify(c)).toBe(true);
  const raw = JSON.stringify(c);
  for (const k of ["email", "ip_hmac", "ipHmac", "challenge", "proof", '"op"'])
    expect(raw).not.toContain(k);
}

async function count(
  sql: SqlDriver,
  table: string,
  where = "1 = 1",
  params: SqlValue[] = [],
): Promise<number> {
  const r = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
    params,
  );
  return Number(r?.n ?? 0);
}

interface Ctx {
  sql: CountingDriver;
  store: SqlCommentStore;
  keys: CommentKeys;
  clock: { now: Date };
}

async function setup(factory: CommentStoreFactory): Promise<Ctx> {
  const sql = countingDriver(await factory.create());
  const clock = { now: T0 };
  return {
    sql,
    store: new SqlCommentStore(sql, { now: () => clock.now }),
    keys: await deriveCommentKeys(TEST_COMMENTS_KEY),
    clock,
  };
}

let seq = 0;
async function prepared(
  ctx: Ctx,
  o: Partial<Omit<PreparedSubmission, "email">> & { email?: string } = {},
): Promise<PreparedSubmission> {
  seq++;
  const { email, ...rest } = o;
  let e: PreparedSubmission["email"];
  if (email) {
    const sealed = await sealEmail(ctx.keys, SITE, email);
    e = {
      id: newCommentsId(ID_PREFIX.commenter),
      hmac: await emailHmac(ctx.keys, email),
      ...sealed,
    };
  }
  return {
    id: newCommentsId(ID_PREFIX.comment),
    nodeId: ENTRY,
    name: "Mehmet",
    text: `A thoughtful comment number ${seq}`,
    status: "pending",
    labels: [],
    ipHmac: "0".repeat(31) + String(seq % 10),
    challengeId: `chal${String(seq).padStart(18, "0")}`,
    proof: "pow",
    createdAt: ctx.clock.now.toISOString(),
    ...(e ? { email: e } : {}),
    ...rest,
  };
}

async function stored(ctx: Ctx, o: Parameters<typeof prepared>[1] = {}): Promise<Comment> {
  const p = await prepared(ctx, o);
  const r = await ctx.store.submit(SITE, p);
  if (!("id" in r)) throw new Error(`not stored: ${JSON.stringify(r)}`);
  const c = await ctx.store.get(SITE, r.id);
  if (!c) throw new Error("missing");
  return c;
}

async function approve(ctx: Ctx, c: Comment): Promise<Comment> {
  const [r] = await ctx.store.moderate(SITE, {
    ids: [c.id],
    action: "approve",
    actor: EDITOR,
    expectedRevs: { [c.id]: c.rev },
  });
  if (!r?.ok) throw new Error(`approve failed: ${JSON.stringify(r)}`);
  return (await ctx.store.get(SITE, c.id)) as Comment;
}

export function describeCommentStoreConformance(label: string, factory: CommentStoreFactory): void {
  describe(`comment store conformance: ${label}`, { timeout: 120_000 }, () => {
    let ctx: Ctx;
    beforeEach(async () => {
      ctx = await setup(factory);
    });
    afterAll(async () => {
      await factory.dispose?.();
    });

    it("settings: defaults, CAS on rev, one statement per write", async () => {
      const d = await ctx.store.settings(SITE);
      expect(d).toMatchObject({ enabled: false, rev: 0, dailyCap: 1000, closeAfterDays: 90 });
      ctx.sql.reset();
      const { after } = await ctx.store.putSettings(
        SITE,
        { enabled: true, collections: { posts: { enabled: true } } },
        0,
        EDITOR.id,
      );
      expect(ctx.sql.writes).toHaveLength(1);
      expect(after.rev).toBe(1);
      expect(await ctx.store.settings(SITE)).toMatchObject({
        enabled: true,
        rev: 1,
        collections: { posts: { enabled: true } },
      });
      await expect(
        ctx.store.putSettings(SITE, { enabled: false }, 0, EDITOR.id),
      ).rejects.toBeInstanceOf(CommentConflictError);
      await ctx.store.putSettings(
        SITE,
        { watchWords: ["kripto"], retention: { hiddenDays: 90 } },
        1,
        EDITOR.id,
      );
      const s = await ctx.store.settings(SITE);
      expect(s).toMatchObject({ rev: 2, watchWords: ["kripto"], enabled: true });
      expect(s.retention.hiddenDays).toBe(90);
      expect((await ctx.store.settings(OTHER_SITE)).rev).toBe(0);
    });

    it("secrets are encrypted at rest and readable only with the keys", async () => {
      await ctx.store.putSecret(
        SITE,
        "turnstile-secret",
        "0x4AAA-secret-value",
        ctx.keys,
        EDITOR.id,
      );
      const raw = await ctx.sql.get<{ ciphertext: string }>(
        "SELECT ciphertext FROM comment_secrets",
      );
      expect(raw?.ciphertext).not.toContain("secret-value");
      expect(await ctx.store.readSecret(SITE, "turnstile-secret", ctx.keys)).toBe(
        "0x4AAA-secret-value",
      );
      expect(await ctx.store.secretInfo(SITE, "turnstile-secret")).toMatchObject({
        updatedBy: EDITOR.id,
      });
      expect(await ctx.store.deleteSecret(SITE, "turnstile-secret")).toBe(true);
      expect(await ctx.store.readSecret(SITE, "turnstile-secret", ctx.keys)).toBeNull();
    });

    it("threads: CAS on rev and the purge row in the same batch", async () => {
      ctx.sql.reset();
      const t = await ctx.store.putThread(SITE, ENTRY, { mode: "closed" }, 0, EDITOR.id);
      expect(t).toMatchObject({ mode: "closed", rev: 1, closesAt: null });
      expect(ctx.sql.batches).toHaveLength(1);
      expect(ctx.sql.writes).toHaveLength(2);
      expect(await ctx.store.purgeQueue.queued(SITE)).toMatchObject([
        { tag: `cloudhal-comments-${ENTRY}`, priority: "normal" },
      ]);
      await expect(
        ctx.store.putThread(SITE, ENTRY, { mode: "open" }, 0, EDITOR.id),
      ).rejects.toBeInstanceOf(CommentConflictError);
      expect(await count(ctx.sql, "comment_purge_queue")).toBe(1);
      const h = await ctx.store.putThread(
        SITE,
        ENTRY,
        { mode: "hidden", closesAt: "2027-01-10T00:00:00Z" },
        1,
        EDITOR.id,
        { purge: "takedown" },
      );
      expect(h).toMatchObject({ rev: 2, closesAt: "2027-01-10T00:00:00.000Z" });
      expect(await ctx.store.purgeQueue.queued(SITE)).toMatchObject([{ priority: "takedown" }]);
      expect(await ctx.store.thread(SITE, ENTRY)).toMatchObject({ mode: "hidden", rev: 2 });
    });

    it("submit: one batch of 1–3 statements, contract-valid record, email encrypted (C1, C10)", async () => {
      ctx.sql.reset();
      const salt = { month: utcMonth(T0), salt: randomSalt() };
      const p = await prepared(ctx, { email: "Ayse@Example.com", newSalt: salt });
      expect(await ctx.store.submit(SITE, p)).toEqual({ id: p.id });
      expect(ctx.sql.batches).toEqual([expect.any(Array)]);
      expect(ctx.sql.writes).toHaveLength(3);
      ctx.sql.reset();
      expect(
        "id" in (await ctx.store.submit(SITE, await prepared(ctx, { email: "ayse@example.com" }))),
      ).toBe(true);
      expect(ctx.sql.writes).toHaveLength(2);
      ctx.sql.reset();
      await ctx.store.submit(SITE, await prepared(ctx));
      expect(ctx.sql.writes).toHaveLength(1);
      expect(await count(ctx.sql, "commenter_emails")).toBe(1);
      const raw = await ctx.sql.get<Record<string, string>>("SELECT * FROM commenter_emails");
      expect(JSON.stringify(raw)).not.toContain("ayse");
      const c = (await ctx.store.get(SITE, p.id)) as Comment;
      expectContractComment(c);
      expect(c).toMatchObject({
        status: "pending",
        author: { kind: "guest", name: "Mehmet" },
        rev: 1,
      });
      expect(await ctx.store.get(OTHER_SITE, p.id)).toBeNull();
      expect(await ctx.store.readSalt(salt.month)).toBe(salt.salt);
    });

    it("a replayed challenge is stored once, across store instances (C12)", async () => {
      const p = await prepared(ctx, { email: "x@example.com" });
      expect(await ctx.store.submit(SITE, p)).toEqual({ id: p.id });
      const second = new SqlCommentStore(ctx.sql, { now: () => ctx.clock.now });
      const replay = await prepared(ctx, {
        challengeId: p.challengeId,
        email: "other@example.com",
      });
      expect(await second.submit(SITE, replay)).toEqual({ duplicate: true });
      expect(await count(ctx.sql, "comments")).toBe(1);
      expect(await count(ctx.sql, "commenter_emails")).toBe(1);
      // a salt another isolate stored first wins
      const month = utcMonth(T0);
      await ctx.sql.run("INSERT INTO comment_salts (month, salt, created_at) VALUES (?, ?, ?)", [
        month,
        randomSalt(),
        T0.toISOString(),
      ]);
      expect(
        await ctx.store.submit(
          SITE,
          await prepared(ctx, { newSalt: { month, salt: randomSalt() } }),
        ),
      ).toEqual({ saltConflict: true });
      expect(await count(ctx.sql, "comments")).toBe(1);
    });

    it("pipeline reads: activity, duplicates, daily count, pending per entry, bans", async () => {
      const ip = "a".repeat(32);
      await stored(ctx, { ipHmac: ip, text: "Same text", proof: "none" });
      ctx.clock.now = new Date(T0.getTime() + 2 * 3_600_000);
      await stored(ctx, { ipHmac: ip });
      const since = (ms: number) => new Date(ctx.clock.now.getTime() - ms).toISOString();
      expect(
        await ctx.store.clientActivity(SITE, ip, {
          hour: since(3_600_000),
          day: since(DAY_MS),
          noScript: since(600_000),
        }),
      ).toEqual({ hour: 1, day: 2, noScript: 0 });
      expect(await ctx.store.isDuplicate(SITE, ENTRY, "Same text", since(DAY_MS))).toBe(true);
      expect(await ctx.store.isDuplicate(SITE, ENTRY2, "Same text", since(DAY_MS))).toBe(false);
      expect(await ctx.store.storedSince(SITE, "2026-10-12T00:00:00.000Z")).toEqual({
        total: 2,
        withoutScript: 1,
      });
      expect(await ctx.store.pendingOnEntry(SITE, ENTRY)).toBe(2);
      const c = await stored(ctx, { email: "ban@example.com" });
      const bans = await ctx.store.ban(SITE, {
        commentId: c.id,
        subjects: ["email", "ip"],
        until: null,
        reasonCode: "spam",
        by: EDITOR,
      });
      expect(bans.map((b) => b.subject).sort()).toEqual(["email", "ip"]);
      expect(JSON.stringify(await ctx.store.listBans(SITE))).not.toContain("ban@example.com");
      const h = await emailHmac(ctx.keys, "ban@example.com");
      expect(await ctx.store.isBanned(SITE, { emailHmac: h }, ctx.clock.now.toISOString())).toBe(
        true,
      );
      expect(
        await ctx.store.isBanned(OTHER_SITE, { emailHmac: h }, ctx.clock.now.toISOString()),
      ).toBe(false);
      await expect(
        ctx.store.ban(SITE, {
          commentId: c.id,
          subjects: ["ip"],
          until: null,
          reasonCode: "spam",
          by: AGENT,
        }),
      ).rejects.toBeInstanceOf(CommentForbiddenError);
      for (const b of bans) expect(await ctx.store.liftBan(SITE, b.id)).toBe(true);
      expect(await ctx.store.isBanned(SITE, { emailHmac: h }, ctx.clock.now.toISOString())).toBe(
        false,
      );
    });

    it("moderate: ≤ 50 ids in 3 statements, partial results, events and purge rows", async () => {
      const cs = [];
      for (let i = 0; i < 4; i++) cs.push(await stored(ctx, { nodeId: i < 3 ? ENTRY : ENTRY2 }));
      const [a, b, c, d] = cs as [Comment, Comment, Comment, Comment];
      ctx.sql.reset();
      const missing = "cmt_doesnotexist01";
      const res = await ctx.store.moderate(SITE, {
        ids: [a.id, b.id, c.id, d.id, missing],
        action: "approve",
        actor: EDITOR,
        expectedRevs: { [a.id]: 1, [b.id]: 1, [c.id]: 7, [d.id]: 1, [missing]: 1 },
        ownNodeIds: [ENTRY],
        audit: [
          {
            sql: "INSERT INTO comment_purge_queue (site_id, tag, priority, enqueued_at, attempts, next_at) VALUES ('site_audit0001', 'audit-row', 'normal', 't', 0, 't')",
          },
        ],
      });
      expect(res).toEqual([
        { id: a.id, ok: true, status: "approved", rev: 2 },
        { id: b.id, ok: true, status: "approved", rev: 2 },
        { id: c.id, ok: false, error: "conflict" },
        { id: d.id, ok: false, error: "not_own" },
        { id: missing, ok: false, error: "not_found" },
      ]);
      expect(ctx.sql.batches).toHaveLength(1);
      expect(ctx.sql.writes).toHaveLength(4); // update, events, purge, audit
      expect(await count(ctx.sql, "comment_events", "action = 'approve'")).toBe(2);
      expect(await ctx.store.purgeQueue.queued(SITE)).toMatchObject([
        { tag: `cloudhal-comments-${ENTRY}`, priority: "normal" },
      ]);
      const ap = (await ctx.store.get(SITE, a.id)) as Comment;
      expectContractComment(ap);
      expect(ap.moderation).toMatchObject({ action: "approve", automated: false, actor: EDITOR });
      expect((await ctx.store.history(SITE, a.id)).map((e) => e.action)).toEqual(["approve"]);

      // an agent hides an approved comment: takedown; an invalid transition is reported
      ctx.sql.reset();
      const hide = await ctx.store.moderate(SITE, {
        ids: [a.id, c.id],
        action: "hide",
        reasonCode: "abuse",
        note: "Insult.",
        actor: AGENT,
        expectedRevs: { [a.id]: 2, [c.id]: 1 },
      });
      expect(hide).toEqual([
        { id: a.id, ok: true, status: "hidden", rev: 3 },
        { id: c.id, ok: true, status: "hidden", rev: 2 },
      ]);
      expect(ctx.sql.writes).toHaveLength(3);
      expect(await ctx.store.purgeQueue.queued(SITE)).toMatchObject([{ priority: "takedown" }]);
      expect((await ctx.store.get(SITE, a.id))?.moderation).toMatchObject({
        automated: true,
        reasonCode: "abuse",
      });
      expect(
        await ctx.store.moderate(SITE, {
          ids: [d.id],
          action: "hold",
          actor: AGENT,
          expectedRevs: { [d.id]: 1 },
        }),
      ).toEqual([{ id: d.id, ok: false, error: "invalid_transition" }]);

      // people only, reasons required
      await expect(
        ctx.store.moderate(SITE, {
          ids: [d.id],
          action: "approve",
          actor: AGENT,
          expectedRevs: { [d.id]: 1 },
        }),
      ).rejects.toBeInstanceOf(CommentForbiddenError);
      await expect(
        ctx.store.moderate(SITE, {
          ids: [d.id],
          action: "spam",
          actor: EDITOR,
          expectedRevs: { [d.id]: 1 },
        }),
      ).rejects.toBeInstanceOf(CommentInputError);

      // 50 comments are still one batch of 3 statements
      const many: Comment[] = [];
      for (let i = 0; i < 50; i++)
        many.push(await stored(ctx, { nodeId: `entry_bulk${String(i % 12).padStart(4, "0")}` }));
      ctx.sql.reset();
      const bulk = await ctx.store.moderate(SITE, {
        ids: many.map((m) => m.id),
        action: "approve",
        actor: EDITOR,
        expectedRevs: Object.fromEntries(many.map((m) => [m.id, m.rev])),
      });
      expect(bulk.every((r) => r.ok)).toBe(true);
      expect(ctx.sql.writes).toHaveLength(3);
      expect(
        await count(ctx.sql, "comment_purge_queue", "tag LIKE 'cloudhal-comments-entry_bulk%'"),
      ).toBe(12);
      await expect(
        ctx.store.moderate(SITE, {
          ids: [...many.map((m) => m.id), a.id],
          action: "hold",
          actor: EDITOR,
          expectedRevs: {},
        }),
      ).rejects.toBeInstanceOf(CommentInputError);

      // delete removes the text and keeps a contract-valid tombstone
      const del = await ctx.store.moderate(SITE, {
        ids: [d.id],
        action: "delete",
        reasonCode: "other",
        actor: EDITOR,
        expectedRevs: { [d.id]: 1 },
      });
      expect(del[0]).toMatchObject({ ok: true, status: "deleted" });
      const dd = (await ctx.store.get(SITE, d.id)) as Comment;
      expect(dd.body).toBeUndefined();
      expectContractComment(dd);
    });

    it("labels bump rev, never change status or purge; agents touch only agent labels (C9)", async () => {
      const c = await stored(ctx, {
        labels: [{ label: "links", source: "rule", at: T0.toISOString() }],
      });
      ctx.sql.reset();
      const r = await ctx.store.label(SITE, {
        items: [{ commentId: c.id, add: ["question"], remove: ["links"], confidence: 80 }],
        actor: AGENT,
        source: "agent",
      });
      expect(r).toEqual([{ id: c.id, ok: true, status: "pending", rev: 2 }]);
      expect(ctx.sql.writes).toHaveLength(2);
      const after = (await ctx.store.get(SITE, c.id)) as Comment;
      expectContractComment(after);
      expect(after.labels?.map((l) => `${l.source}:${l.label}`)).toEqual([
        "rule:links",
        "agent:question",
      ]);
      expect(after.labels?.[1]).toMatchObject({ confidence: 80, by: AGENT });
      expect(await count(ctx.sql, "comment_purge_queue")).toBe(0);
      expect(
        await ctx.store.label(SITE, {
          items: [{ commentId: c.id, add: ["question"], confidence: 80 }],
          actor: AGENT,
          source: "agent",
        }),
      ).toEqual([{ id: c.id, ok: true, status: "pending", rev: 2 }]);
      expect(
        await ctx.store.label(SITE, {
          items: [{ commentId: c.id, remove: ["links"] }],
          actor: EDITOR,
          source: "person",
          expectedRevs: { [c.id]: 1 },
        }),
      ).toEqual([{ id: c.id, ok: false, error: "conflict" }]);
      await ctx.store.label(SITE, {
        items: [{ commentId: c.id, remove: ["links"] }],
        actor: EDITOR,
        source: "person",
      });
      expect((await ctx.store.get(SITE, c.id))?.labels?.map((l) => l.label)).toEqual(["question"]);
      await expect(
        ctx.store.label(SITE, {
          items: [{ commentId: c.id, add: ["bogus" as never] }],
          actor: AGENT,
          source: "agent",
        }),
      ).rejects.toBeInstanceOf(CommentInputError);
    });

    it("staff replies: approved at once, two levels, guarded on the parent, purge and event", async () => {
      const top = await approve(ctx, await stored(ctx));
      ctx.sql.reset();
      const r1 = await ctx.store.reply(SITE, {
        commentId: top.id,
        text: " Thanks! \r\n",
        person: { id: "user_editor01", name: "Ayşe" },
        badge: "team",
        draftedBy: AGENT,
      });
      expect(ctx.sql.writes).toHaveLength(3);
      expectContractComment(r1);
      expect(r1).toMatchObject({
        status: "approved",
        parentId: top.id,
        body: { text: "Thanks!" },
        author: { kind: "staff", draftedBy: AGENT },
      });
      expect(await ctx.store.get(SITE, r1.id)).toEqual(r1);
      const r2 = await ctx.store.reply(SITE, {
        commentId: r1.id,
        text: "And more.",
        person: { id: "user_editor01", name: "Ayşe" },
        badge: "author",
      });
      expect(r2).toMatchObject({ parentId: top.id, inReplyToId: r1.id });
      expect((await ctx.store.history(SITE, r1.id)).map((e) => e.action)).toEqual(["reply"]);
      const pending = await stored(ctx);
      await expect(
        ctx.store.reply(SITE, {
          commentId: pending.id,
          text: "No.",
          person: { id: "user_editor01", name: "Ayşe" },
          badge: "team",
        }),
      ).rejects.toBeInstanceOf(CommentInputError);
      await expect(
        ctx.store.reply(SITE, {
          commentId: top.id,
          text: "No.",
          person: { id: "agent_triage01", name: "Bot" },
          badge: "team",
        }),
      ).rejects.toBeInstanceOf(CommentForbiddenError);
      const edited = await ctx.store.editReply(
        SITE,
        r1.id,
        "Thanks a lot!",
        r1.rev,
        "user_editor01",
      );
      expect(edited).toMatchObject({
        rev: 2,
        body: { text: "Thanks a lot!" },
        editedAt: T0.toISOString(),
      });
      expectContractComment(edited);
      await expect(
        ctx.store.editReply(SITE, r1.id, "x y", 1, "user_editor01"),
      ).rejects.toBeInstanceOf(CommentConflictError);
    });

    it("render pages: approved only, oldest first, removed parents with approved replies", async () => {
      const a = await approve(ctx, await stored(ctx));
      ctx.clock.now = new Date(T0.getTime() + 1000);
      const b = await approve(ctx, await stored(ctx));
      await stored(ctx); // pending: never rendered
      const reply = await ctx.store.reply(SITE, {
        commentId: b.id,
        text: "Reply",
        person: { id: "user_editor01", name: "Ayşe" },
        badge: "team",
      });
      await ctx.store.moderate(SITE, {
        ids: [b.id],
        action: "hide",
        reasonCode: "abuse",
        actor: EDITOR,
        expectedRevs: { [b.id]: b.rev },
      });
      const page = await ctx.store.renderPage(SITE, ENTRY, 1);
      expect(page).toMatchObject({ total: 2, page: 1, pageCount: 1 });
      expect(page.items).toHaveLength(2);
      expect(page.items[0]).toMatchObject({ comment: { id: a.id }, replies: [] });
      expect(page.items[1]).toMatchObject({ removed: { id: b.id }, replies: [{ id: reply.id }] });
      expect(JSON.stringify(page.items[1])).not.toContain("A thoughtful");
      expect((await ctx.store.renderPage(SITE, ENTRY, 2)).items).toEqual([]);
      for (const item of page.items)
        for (const c of "comment" in item ? [item.comment, ...item.replies] : item.replies)
          expectContractComment(c);
    });

    it("lists, cursors, counts, reports and thread order", async () => {
      const made: Comment[] = [];
      for (let i = 0; i < 5; i++) {
        ctx.clock.now = new Date(T0.getTime() + i * 1000);
        made.push(
          await stored(
            ctx,
            i === 4
              ? { labels: [{ label: "instruction-like", source: "rule", at: T0.toISOString() }] }
              : {},
          ),
        );
      }
      const approved = await approve(ctx, made[0] as Comment);
      const page1 = await ctx.store.list(SITE, { limit: 2 });
      expect(page1.comments.map((c) => c.id)).toEqual([made[4]?.id, made[3]?.id]);
      const page2 = await ctx.store.list(SITE, { limit: 2, cursor: page1.nextCursor as string });
      expect(page2.comments.map((c) => c.id)).toEqual([made[2]?.id, made[1]?.id]);
      expect(
        (await ctx.store.list(SITE, { status: "approved" })).comments.map((c) => c.id),
      ).toEqual([approved.id]);
      expect(
        (await ctx.store.list(SITE, { label: "instruction-like" })).comments.map((c) => c.id),
      ).toEqual([made[4]?.id]);
      expect((await ctx.store.list(SITE, { order: "oldest", limit: 1 })).comments[0]?.id).toBe(
        made[0]?.id,
      );
      await expect(ctx.store.list(SITE, { cursor: "garbage!" })).rejects.toBeInstanceOf(
        CommentInputError,
      );
      // a report on an approved comment
      const rep = await ctx.store.report(SITE, {
        id: newCommentsId(ID_PREFIX.report),
        commentId: approved.id,
        reason: "abuse",
        details: "Rude",
        ipHmac: "b".repeat(32),
        challengeId: "rchal0000000000000001",
        createdAt: T0.toISOString(),
      });
      expect("id" in rep).toBe(true);
      expect(
        await ctx.store.report(SITE, {
          id: newCommentsId(ID_PREFIX.report),
          commentId: made[1]?.id as string,
          reason: "spam",
          details: null,
          ipHmac: null,
          challengeId: null,
          createdAt: T0.toISOString(),
        }),
      ).toEqual({ duplicate: true });
      expect(
        (await ctx.store.list(SITE, { status: "reported" })).comments.map((c) => c.id),
      ).toEqual([approved.id]);
      expect(await ctx.store.counts(SITE)).toEqual({
        pending: 4,
        approved: 1,
        hidden: 0,
        spam: 0,
        deleted: 0,
        reported: 1,
      });
      expect(await ctx.store.counts(SITE, { nodeId: ENTRY2 })).toEqual({
        pending: 0,
        approved: 0,
        hidden: 0,
        spam: 0,
        deleted: 0,
        reported: 0,
      });
      const [report] = await ctx.store.listReports(SITE, { open: true });
      expect(report).toMatchObject({
        commentId: approved.id,
        reason: "abuse",
        details: "Rude",
        hasEmail: false,
      });
      await ctx.store.resolveReport(SITE, report?.id as string, "kept", EDITOR);
      await expect(
        ctx.store.resolveReport(SITE, report?.id as string, "kept", EDITOR),
      ).rejects.toBeInstanceOf(CommentConflictError);
      expect((await ctx.store.counts(SITE)).reported).toBe(0);
      const thread = await ctx.store.threadComments(SITE, ENTRY);
      expect(thread.map((c) => c.id)).toEqual(made.map((c) => c.id));
      for (const c of thread) expectContractComment(c);
    });

    it("summary, node ids and thread rows: counts without reader text", async () => {
      const a = await stored(ctx, {
        labels: [{ label: "question", source: "rule", at: T0.toISOString() }],
      });
      ctx.clock.now = new Date(T0.getTime() + 60_000);
      await stored(ctx, { nodeId: ENTRY2 });
      ctx.clock.now = new Date(T0.getTime() + 120_000);
      await stored(ctx, { nodeId: ENTRY2 });
      const since = new Date(T0.getTime() - 1000).toISOString();
      const s = await ctx.store.summary(SITE, since);
      expect(s).toEqual({
        newComments: 3,
        busiest: [
          { nodeId: ENTRY2, comments: 2 },
          { nodeId: ENTRY, comments: 1 },
        ],
        labels: { question: 1 },
        pending: {
          count: 3,
          oldestAt: T0.toISOString(),
          medianAt: new Date(T0.getTime() + 60_000).toISOString(),
        },
        unansweredQuestions: 1,
      });
      // a staff reply answers the question
      const approved = await approve(ctx, a);
      await ctx.store.reply(SITE, {
        commentId: approved.id,
        text: "Here is the answer",
        person: { id: EDITOR.id, name: "Ayşe" },
        badge: "team",
      });
      expect((await ctx.store.summary(SITE, since)).unansweredQuestions).toBe(0);
      const own = await ctx.store.summary(SITE, since, { nodeIds: [ENTRY2] });
      expect(own.newComments).toBe(2);
      expect(own.pending.count).toBe(2);
      expect(await ctx.store.nodeIds(SITE)).toEqual([ENTRY, ENTRY2].sort());
      const many = await ctx.store.getMany(SITE, [a.id, "cmt_missing000", "not-an-id"]);
      expect(many.map((c) => c.id)).toEqual([a.id]);
      for (const c of many) expectContractComment(c);
      await ctx.store.putThread(SITE, ENTRY2, { mode: "closed" }, 0, EDITOR.id);
      expect((await ctx.store.threads(SITE)).map((t) => [t.nodeId, t.mode, t.rev])).toEqual([
        [ENTRY2, "closed", 1],
      ]);
    });

    it("cm1: hashes see moderation, labels and thread changes (C4)", async () => {
      const c = await stored(ctx);
      const threads = [{ nodeId: ENTRY, state: "open" as const }];
      const h1 = await ctx.store.stateHash(SITE, [c.id], threads);
      expect(h1).toMatch(/^cm1:/);
      expect(await ctx.store.stateHash(SITE, [c.id], threads)).toBe(h1);
      await ctx.store.label(SITE, {
        items: [{ commentId: c.id, add: ["question"] }],
        actor: AGENT,
        source: "agent",
      });
      const h2 = await ctx.store.stateHash(SITE, [c.id], threads);
      expect(h2).not.toBe(h1);
      await ctx.store.putThread(SITE, ENTRY, { mode: "open" }, 0, EDITOR.id);
      expect(await ctx.store.stateHash(SITE, [c.id], threads)).not.toBe(h2);
      expect(
        await ctx.store.stateHash(SITE, [c.id], [{ nodeId: ENTRY, state: "closed" }]),
      ).not.toBe(h2);
    });

    it("erasure: anonymise by default, delete text on request, audited, purged", async () => {
      const a = await approve(ctx, await stored(ctx, { email: "erase@example.com" }));
      const b = await stored(ctx, { email: "erase@example.com" });
      const other = await stored(ctx, { email: "keep@example.com" });
      await ctx.store.report(SITE, {
        id: newCommentsId(ID_PREFIX.report),
        commentId: a.id,
        reason: "other",
        details: null,
        email: (await prepared(ctx, { email: "erase@example.com" })).email as NonNullable<
          PreparedSubmission["email"]
        >,
        ipHmac: null,
        challengeId: null,
        createdAt: T0.toISOString(),
      });
      const commenterId = (await ctx.store.findCommenter(SITE, {
        emailHmac: await emailHmac(ctx.keys, "erase@example.com"),
      })) as string;
      expect(commenterId).toMatch(/^cmr_/);
      const who = await ctx.store.commenter(SITE, commenterId, ctx.keys);
      expect(who).toMatchObject({ email: "erase@example.com", commentIds: [a.id, b.id].sort() });
      await expect(
        ctx.store.erase(SITE, { commenterId }, "anonymise", AGENT),
      ).rejects.toBeInstanceOf(CommentForbiddenError);
      ctx.sql.reset();
      const res = await ctx.store.erase(SITE, { commenterId }, "anonymise", EDITOR, {
        audit: [
          { sql: "INSERT INTO cache_purge_log (at, source, requests) VALUES ('t', 'audit', 0)" },
        ],
      });
      expect(res).toEqual({ comments: 2, reports: 1, emailDeleted: true, nodeIds: [ENTRY] });
      expect(ctx.sql.writes.length).toBeLessThanOrEqual(6);
      for (const id of [a.id, b.id]) {
        const c = (await ctx.store.get(SITE, id)) as Comment;
        expectContractComment(c);
        expect(c.author).toEqual({ kind: "erased" });
        expect(c.body?.text).toContain("A thoughtful");
        expect(c.moderation).toMatchObject({
          action: "erase",
          reasonCode: "erasure-request",
          automated: false,
        });
      }
      expect(await count(ctx.sql, "commenter_emails")).toBe(1);
      expect(
        await count(ctx.sql, "comments", "email_id IS NOT NULL OR ip_hmac IS NOT NULL", []),
      ).toBe(1);
      expect(await count(ctx.sql, "comment_events", "action = 'erase'")).toBe(2);
      expect(await ctx.store.purgeQueue.queued(SITE)).toMatchObject([{ priority: "takedown" }]);
      // a guest without email: by comment, deleting the text
      const del = await ctx.store.erase(SITE, { commentIds: [other.id] }, "delete-text", EDITOR);
      expect(del.comments).toBe(1);
      const gone = (await ctx.store.get(SITE, other.id)) as Comment;
      expectContractComment(gone);
      expect(gone).toMatchObject({ status: "deleted", author: { kind: "erased" } });
      expect(gone.body).toBeUndefined();
    });

    it("purge queue: sent rows leave unless re-enqueued, failures back off, the log is shared", async () => {
      await ctx.store.purgeQueue.enqueue(
        SITE,
        ["cloudhal-comments-entry_aaaaaa", "cloudhal-comments-entry_bbbbbb"],
        "normal",
      );
      const rows = await ctx.store.purgeQueue.queued(SITE);
      expect(rows).toHaveLength(2);
      const plan = planPurge({
        rows,
        recent: await ctx.store.purgeQueue.recent(T0),
        now: new Date(T0.getTime() + 21_000),
      });
      expect(plan.requests).toHaveLength(1);
      ctx.clock.now = new Date(T0.getTime() + 22_000);
      await ctx.store.purgeQueue.enqueue(SITE, ["cloudhal-comments-entry_bbbbbb"], "takedown"); // changed after the plan
      await ctx.store.purgeQueue.sent(
        SITE,
        plan.requests[0]?.tags ?? [],
        new Date(T0.getTime() + 21_000),
      );
      expect((await ctx.store.purgeQueue.queued(SITE)).map((r) => r.tag)).toEqual([
        "cloudhal-comments-entry_bbbbbb",
      ]);
      await ctx.store.purgeQueue.log("publish", 2, new Date(T0.getTime() + 22_000));
      expect(await ctx.store.purgeQueue.recent(new Date(T0.getTime() + 30_000))).toEqual([
        { at: new Date(T0.getTime() + 21_000).toISOString(), requests: 1 },
        { at: new Date(T0.getTime() + 22_000).toISOString(), requests: 2 },
      ]);
      const left = await ctx.store.purgeQueue.queued(SITE);
      await ctx.store.purgeQueue.failed(SITE, left, new Date(T0.getTime() + 30_000));
      expect(await ctx.store.purgeQueue.queued(SITE)).toMatchObject([
        { attempts: 1, nextAt: new Date(T0.getTime() + 60_000).toISOString() },
      ]);
      expect(await ctx.store.purgeQueue.sites()).toEqual([SITE]);
    });

    it("retention: deletes and clears on schedule, in bounded runs, keeping tombstones (C11)", async () => {
      const old = new Date(T0.getTime() - 40 * DAY_MS);
      ctx.clock.now = old;
      const pending = await stored(ctx, { email: "gone@example.com" });
      const spam = await stored(ctx, { status: "spam" });
      const parent = await approve(ctx, await stored(ctx));
      await ctx.store.reply(SITE, {
        commentId: parent.id,
        text: "Kept",
        person: { id: "user_editor01", name: "Ayşe" },
        badge: "team",
      });
      await ctx.store.moderate(SITE, {
        ids: [parent.id],
        action: "spam",
        reasonCode: "spam",
        actor: EDITOR,
        expectedRevs: { [parent.id]: parent.rev },
      });
      const keep = await approve(ctx, await stored(ctx));
      await ctx.store.ban(SITE, {
        commentId: pending.id,
        subjects: ["ip"],
        until: new Date(T0.getTime() - DAY_MS).toISOString(),
        reasonCode: "spam",
        by: EDITOR,
      });
      await ctx.sql.run(
        "INSERT INTO comment_salts (month, salt, created_at) VALUES ('2026-07', ?, 't'), ('2026-09', ?, 't')",
        [randomSalt(), randomSalt()],
      );
      ctx.clock.now = T0;
      const fresh = await stored(ctx);

      const small = await ctx.store.retention.run(SITE, retentionPlan(undefined, T0, 1));
      expect(small.more).toBe(true);
      const report = await ctx.store.retention.run(SITE, retentionPlan(undefined, T0));
      expect(report.more).toBe(false);
      expect(await ctx.store.get(SITE, pending.id)).toBeNull();
      expect(await ctx.store.get(SITE, spam.id)).toBeNull();
      const tomb = (await ctx.store.get(SITE, parent.id)) as Comment;
      expect(tomb).toMatchObject({ status: "deleted", author: { kind: "erased" } });
      expect(tomb.body).toBeUndefined();
      expectContractComment(tomb);
      expect(await ctx.store.get(SITE, keep.id)).not.toBeNull();
      expect(await ctx.store.get(SITE, fresh.id)).not.toBeNull();
      expect(
        await count(ctx.sql, "comments", "ip_hmac IS NOT NULL AND created_at < ?", [
          T0.toISOString(),
        ]),
      ).toBe(0);
      expect(await count(ctx.sql, "comments", "ip_hmac IS NOT NULL")).toBe(1);
      expect(await count(ctx.sql, "commenter_emails")).toBe(0);
      expect(await count(ctx.sql, "comment_bans")).toBe(0);
      const dep = await ctx.store.retention.runDeployment(T0, oldestSaltMonthToKeep(T0));
      expect(dep.salts).toBe(1);
      expect(await ctx.store.retention.deleteEntries(SITE, [ENTRY])).toBeGreaterThan(0);
      expect(await count(ctx.sql, "comments", "node_id = ?", [ENTRY])).toBe(0);
    });
  });
}

// ───────────────────────────── the pipeline on the real store ─────────────────────────────

/** Bidi override and pop, by code point so the source never holds them literally. */
const RLO = String.fromCodePoint(0x202e);
const PDF = String.fromCodePoint(0x202c);
const HOST = "blog.example";
const PUBLISHED: PublishedEntry = {
  nodeId: ENTRY,
  collection: "posts",
  path: "/posts/ferries",
  publishedAt: "2026-10-01T00:00:00.000Z",
};

interface PipeCtx extends Ctx {
  deps: PipelineDeps;
  settingsRev: number;
}

async function pipeSetup(
  factory: CommentStoreFactory,
  o: { turnstile?: PipelineDeps["turnstile"] } = {},
): Promise<PipeCtx> {
  const ctx = await setup(factory);
  await ctx.store.putSettings(
    SITE,
    { enabled: true, collections: { posts: { enabled: true } }, blockedWords: ["casino"] },
    0,
    EDITOR.id,
  );
  const deps: PipelineDeps = {
    siteId: SITE,
    available: true,
    hosts: [HOST],
    clientAddress: "203.0.113.7",
    keys: ctx.keys,
    now: () => ctx.clock.now,
    settings: () => ctx.store.settings(SITE),
    resolveEntry: async (id) => (id === ENTRY ? PUBLISHED : null),
    store: ctx.store,
    limiter: new CommentLimiter({
      now: () => ctx.clock.now.getTime(),
      submissionsPerMinute: 100,
      sitePerMinute: 100,
    }),
    daily: new DailyCount({ now: () => ctx.clock.now.getTime(), ttlMs: 0 }),
    replay: new ReplayCache(),
    ...(o.turnstile ? { turnstile: o.turnstile } : {}),
  };
  ctx.sql.reset();
  return { ...ctx, deps, settingsRev: 1 };
}

async function solved(
  ctx: Ctx,
  target = ENTRY,
  kind: "comment" | "report" = "comment",
  at = new Date(T0.getTime() - 5000),
) {
  const c = await issueChallenge(ctx.keys.pow, { siteId: SITE, target, kind, bits: 4, now: at });
  return { challenge: c.challenge, solution: await solveChallenge(c.challenge) };
}

function post(
  body: Record<string, unknown>,
  o: { form?: boolean; headers?: Record<string, string>; path?: string } = {},
): Request {
  const text = o.form
    ? new URLSearchParams(body as Record<string, string>).toString()
    : JSON.stringify(body);
  return new Request(`https://${HOST}${o.path ?? "/__cloudhal/comments"}`, {
    method: "POST",
    headers: {
      "content-type": o.form ? "application/x-www-form-urlencoded" : "application/json",
      host: HOST,
      "sec-fetch-site": "same-origin",
      ...o.headers,
    },
    body: text,
  });
}

export function describeCommentPipelineSuite(label: string, factory: CommentStoreFactory): void {
  describe(`comment pipeline: ${label}`, { timeout: 120_000 }, () => {
    let ctx: PipeCtx;
    beforeEach(async () => {
      ctx = await pipeSetup(factory);
    });
    afterAll(async () => {
      await factory.dispose?.();
    });

    const good = async (extra: Record<string, unknown> = {}) => ({
      nodeId: ENTRY,
      name: "Ayşe",
      email: "ayse@example.com",
      body: "Do the ferries run on Sundays?",
      ...(await solved(ctx)),
      ...extra,
    });

    it("stores a good comment as pending in one batch and answers like every drop", async () => {
      const out = await handleCommentSubmission(post(await good()), ctx.deps);
      expect(out).toMatchObject({
        kind: "pending",
        stored: true,
        status: "pending",
        returnTo: "/posts/ferries",
      });
      expect(ctx.sql.batches).toHaveLength(1);
      expect(ctx.sql.writes).toHaveLength(3); // salt (first of the month), email, comment
      const res = submissionResponse(out);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "pending" });
      expect(res.headers.get("cache-control")).toBe("no-store");
      const [c] = (await ctx.store.list(SITE)).comments;
      expectContractComment(c as Comment);
      expect(c).toMatchObject({ status: "pending", author: { kind: "guest", name: "Ayşe" } });
      expect(c?.labels).toBeUndefined();
      ctx.sql.reset();
      await handleCommentSubmission(
        post(await good({ body: "Another question entirely?" })),
        ctx.deps,
      );
      expect(ctx.sql.writes).toHaveLength(2); // the salt exists now
    });

    it("hostile submissions write nothing (C2) and drops look like successes", async () => {
      const cases: [string, () => Promise<Request>, Record<string, unknown>][] = [
        [
          "honeypot",
          async () => post(await good({ website: "http://spam.example" })),
          { kind: "pending", stored: false, dropped: "honeypot" },
        ],
        [
          "forged challenge",
          async () => {
            const other = await deriveCommentKeys(`${TEST_COMMENTS_KEY}-forged`);
            const c = await issueChallenge(other.pow, {
              siteId: SITE,
              target: ENTRY,
              kind: "comment",
              bits: 0,
              now: new Date(T0.getTime() - 5000),
            });
            return post(await good({ challenge: c.challenge, solution: "0" }));
          },
          { kind: "pending", stored: false, dropped: "bad_proof" },
        ],
        [
          "challenge for another entry",
          async () => post(await good(await solved(ctx, ENTRY2))),
          { dropped: "bad_proof" },
        ],
        [
          "challenge solved too fast",
          async () => post(await good(await solved(ctx, ENTRY, "comment", T0))),
          { dropped: "too_fast" },
        ],
        [
          "wrong solution",
          async () => {
            const g = await good();
            let x = 1_000_000;
            while ((await solutionBits(g.challenge, String(x))) >= 4) x++;
            return post({ ...g, solution: String(x) });
          },
          { stored: false, dropped: "bad_proof" },
        ],
        [
          "solution without challenge",
          async () => {
            const g = await good();
            delete (g as Record<string, unknown>).challenge;
            return post(g);
          },
          { dropped: "bad_proof" },
        ],
        [
          "expired challenge",
          async () =>
            post(await good(await solved(ctx, ENTRY, "comment", new Date(T0.getTime() - 601_000)))),
          { kind: "error", status: 400, error: "challenge_expired" },
        ],
        [
          "cross-site",
          async () => post(await good(), { headers: { "sec-fetch-site": "cross-site" } }),
          { status: 403, error: "forbidden" },
        ],
        [
          "foreign origin",
          async () => {
            const r = post(await good(), {});
            const h = new Headers(r.headers);
            h.delete("sec-fetch-site");
            h.set("origin", "https://evil.example");
            return new Request(r.url, { method: "POST", headers: h, body: await r.text() });
          },
          { status: 403 },
        ],
        [
          "unknown host",
          async () => post(await good(), { headers: { host: "evil.example" } }),
          { status: 403 },
        ],
        [
          "draft entry",
          async () => post(await good({ nodeId: ENTRY2, ...(await solved(ctx, ENTRY2)) })),
          { status: 404, error: "not_found" },
        ],
        [
          "client status field",
          async () => post(await good({ status: "approved" })),
          { status: 400, error: "invalid", fields: ["status"] },
        ],
        ["client site id", async () => post(await good({ siteId: OTHER_SITE })), { status: 400 }],
        [
          "email with newline",
          async () => post(await good({ email: "a@b\nBcc: x@y" })),
          { status: 400 },
        ],
        [
          "oversized declared",
          async () => post(await good(), { headers: { "content-length": "40000" } }),
          { status: 413, error: "too_large" },
        ],
        [
          "oversized streamed",
          async () =>
            post(
              await good({
                body: "x".repeat(19_000),
                name: "y".repeat(150),
                website: "z".repeat(2000),
                email: undefined,
                turnstileToken: "t".repeat(2048),
                extra: "w".repeat(12_000),
              }),
            ),
          { status: 413 },
        ],
        [
          "not form or JSON",
          async () => post(await good(), { headers: { "content-type": "text/plain" } }),
          { status: 415 },
        ],
        [
          "name with a link",
          async () => post(await good({ name: "Cheap https://x.example" })),
          { status: 400, fields: ["name"] },
        ],
        [
          "too short after normalising",
          async () => post(await good({ body: ` ${RLO} x ${PDF} ` })),
          { status: 400, fields: ["body"] },
        ],
        [
          "eleven links",
          async () => post(await good({ body: Array(11).fill("https://x.example").join(" ") })),
          { status: 400, fields: ["body"] },
        ],
        [
          "GET",
          async () =>
            new Request(`https://${HOST}/__cloudhal/comments`, { headers: { host: HOST } }),
          { status: 405 },
        ],
      ];
      for (const [name, req, expected] of cases) {
        ctx.sql.reset();
        const out = await handleCommentSubmission(await req(), ctx.deps);
        expect(out, name).toMatchObject(expected);
        expect(ctx.sql.writes, name).toHaveLength(0);
      }
      expect(await count(ctx.sql, "comments")).toBe(0);
    });

    it("only open threads of published entries accept comments (C5); replies only to approved comments", async () => {
      await ctx.store.putThread(SITE, ENTRY, { mode: "closed" }, 0, EDITOR.id);
      ctx.sql.reset();
      const closed = await handleCommentSubmission(post(await good(), { form: true }), ctx.deps);
      expect(closed).toMatchObject({ kind: "error", status: 403, error: "closed" });
      expect(submissionResponse(closed).headers.get("location")).toBe(
        "/posts/ferries#comment-closed",
      );
      await ctx.store.putThread(SITE, ENTRY, { mode: "hidden" }, 1, EDITOR.id);
      expect(await handleCommentSubmission(post(await good()), ctx.deps)).toMatchObject({
        status: 404,
      });
      await ctx.store.putThread(SITE, ENTRY, { mode: "default" }, 2, EDITOR.id);
      ctx.clock.now = new Date("2027-01-01T00:00:00Z"); // past 90 days after publication
      expect(
        await handleCommentSubmission(
          post(
            await good(
              await solved(ctx, ENTRY, "comment", new Date(ctx.clock.now.getTime() - 5000)),
            ),
          ),
          ctx.deps,
        ),
      ).toMatchObject({ error: "closed" });
      ctx.clock.now = T0;
      const p = await handleCommentSubmission(post(await good()), ctx.deps);
      const pendingId = (p as { id: string }).id;
      ctx.sql.reset();
      expect(
        await handleCommentSubmission(
          post(await good({ parentId: pendingId, body: "A reply here" })),
          ctx.deps,
        ),
      ).toMatchObject({ status: 400, fields: ["parentId"] });
      expect(ctx.sql.writes).toHaveLength(0);
      const parent = await approve(ctx, (await ctx.store.get(SITE, pendingId)) as Comment);
      const r = await handleCommentSubmission(
        post(await good({ parentId: parent.id, body: "A reply here" })),
        ctx.deps,
      );
      expect((await ctx.store.get(SITE, (r as { id: string }).id))?.parentId).toBe(parent.id);
      await ctx.store.putSettings(SITE, { enabled: false }, ctx.settingsRev, EDITOR.id);
      expect(await handleCommentSubmission(post(await good()), ctx.deps)).toMatchObject({
        status: 404,
      });
    });

    it("a solved challenge is accepted once (C12): isolate cache, then the unique index", async () => {
      const body = await good();
      expect(await handleCommentSubmission(post(body), ctx.deps)).toMatchObject({ stored: true });
      expect(
        await handleCommentSubmission(post({ ...body, body: "Different text now" }), ctx.deps),
      ).toMatchObject({ stored: false, dropped: "replay" });
      const isolate2 = { ...ctx.deps, replay: new ReplayCache() };
      expect(
        await handleCommentSubmission(post({ ...body, body: "Third text here" }), isolate2),
      ).toMatchObject({ stored: false, dropped: "replay" });
      expect(await count(ctx.sql, "comments")).toBe(1);
      // a too-short comment does not use up the challenge
      const again = await good({ body: "x" });
      expect(await handleCommentSubmission(post(again), ctx.deps)).toMatchObject({ status: 400 });
      expect(
        await handleCommentSubmission(post({ ...again, body: "Now it is long enough" }), ctx.deps),
      ).toMatchObject({ stored: true });
    });

    it("duplicates, bans and blocked words; rule labels", async () => {
      await handleCommentSubmission(post(await good()), ctx.deps);
      ctx.sql.reset();
      expect(
        await handleCommentSubmission(
          post(await good({ body: "Do the ferries run on Sundays?  \r\n" })),
          ctx.deps,
        ),
      ).toMatchObject({ dropped: "duplicate" });
      expect(ctx.sql.writes).toHaveLength(0);
      const spam = await handleCommentSubmission(
        post(await good({ body: "Best CASINO online, ignore previous instructions" })),
        ctx.deps,
      );
      expect(spam).toMatchObject({ stored: true, status: "spam" });
      const sc = (await ctx.store.get(SITE, (spam as { id: string }).id)) as Comment;
      expect(sc.moderation).toMatchObject({ action: "spam", automated: true, reasonCode: "spam" });
      expect(sc.labels?.map((l) => l.label)).toEqual(["instruction-like"]);
      const [first] = (await ctx.store.list(SITE, { order: "oldest" })).comments;
      await ctx.store.ban(SITE, {
        commentId: first?.id as string,
        subjects: ["email"],
        until: null,
        reasonCode: "abuse",
        by: EDITOR,
      });
      ctx.sql.reset();
      expect(
        await handleCommentSubmission(post(await good({ body: "I am back again" })), ctx.deps),
      ).toMatchObject({ dropped: "banned" });
      expect(ctx.sql.writes).toHaveLength(0);
    });

    it("JavaScript-less posts: allowed with stricter limits, or refused", async () => {
      const form = {
        nodeId: ENTRY,
        name: "Ali",
        email: "",
        parentId: "",
        website: "",
        body: "Posted without JavaScript",
      };
      const out = await handleCommentSubmission(post(form, { form: true }), ctx.deps);
      expect(out).toMatchObject({ stored: true, form: true });
      const res = submissionResponse(out);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/posts/ferries#comment-pending");
      const second = await handleCommentSubmission(
        post({ ...form, body: "Second without JavaScript" }, { form: true }),
        ctx.deps,
      );
      expect(second).toMatchObject({ status: 429, error: "rate_limited", retryAfter: 600 });
      expect(submissionResponse(second).headers.get("location")).toBe(
        "/posts/ferries#comment-slow-down",
      );
      await ctx.store.putSettings(SITE, { allowWithoutScript: false }, ctx.settingsRev, EDITOR.id);
      const refused = await handleCommentSubmission(
        post({ ...form, body: "Third one" }, { form: true }),
        ctx.deps,
      );
      expect(refused).toMatchObject({ status: 403, error: "script_required" });
      expect(submissionResponse(refused).headers.get("location")).toBe(
        "/posts/ferries#comment-script-required",
      );
      // a JSON post without proof is a script that skipped the work
      expect(
        await handleCommentSubmission(
          post({ nodeId: ENTRY, name: "Bot", body: "Hello there" }),
          ctx.deps,
        ),
      ).toMatchObject({ stored: false, dropped: "bad_proof" });
      expect(
        await handleCommentSubmission(
          post(
            { ...form, name: "A", body: "dup", nodeId: ENTRY },
            { form: true, headers: { "content-type": "application/x-www-form-urlencoded" } },
          ),
          ctx.deps,
        ),
      ).toMatchObject({ kind: "error" });
    });

    it("the daily cap pauses comments; stored-per-client limits", async () => {
      await ctx.store.putSettings(SITE, { dailyCap: 2 }, ctx.settingsRev, EDITOR.id);
      await handleCommentSubmission(post(await good({ body: "One comment" })), ctx.deps);
      await handleCommentSubmission(post(await good({ body: "Two comments" })), ctx.deps);
      ctx.sql.reset();
      const paused = await handleCommentSubmission(
        post(await good({ body: "Three comments" })),
        ctx.deps,
      );
      expect(paused).toMatchObject({ status: 503, error: "paused" });
      expect(ctx.sql.writes).toHaveLength(0);
      await ctx.store.putSettings(SITE, { dailyCap: 100 }, ctx.settingsRev + 1, EDITOR.id);
      for (let i = 3; i <= 5; i++)
        await handleCommentSubmission(post(await good({ body: `Comment ${i} here` })), ctx.deps);
      expect(
        await handleCommentSubmission(post(await good({ body: "Comment six here" })), ctx.deps),
      ).toMatchObject({ status: 429, retryAfter: 3600 });
    });

    it("isolate limits answer 429 before anything is read from D1", async () => {
      const deps = {
        ...ctx.deps,
        limiter: new CommentLimiter({ now: () => ctx.clock.now.getTime() }),
      };
      for (let i = 0; i < 3; i++)
        await handleCommentSubmission(post(await good({ body: `Fast comment ${i}` })), deps);
      ctx.sql.reset();
      const limited = await handleCommentSubmission(
        post(await good({ body: "Fast comment 4" })),
        deps,
      );
      expect(limited).toMatchObject({ status: 429, error: "rate_limited" });
      expect(submissionResponse(limited).headers.get("retry-after")).toMatch(/^\d+$/);
      expect(ctx.sql.writes).toHaveLength(0);
    });

    it("reports: only approved comments, never changing them", async () => {
      const out = await handleCommentSubmission(post(await good()), ctx.deps);
      const id = (out as { id: string }).id;
      const reportBody = async () => ({
        commentId: id,
        reason: "abuse",
        details: `Rude${RLO} words`,
        ...(await solved(ctx, id, "report")),
      });
      expect(
        await handleReportSubmission(
          post(await reportBody(), { path: "/__cloudhal/comments/report" }),
          ctx.deps,
        ),
      ).toMatchObject({ status: 404 });
      const c = await approve(ctx, (await ctx.store.get(SITE, id)) as Comment);
      ctx.sql.reset();
      const r = await handleReportSubmission(
        post(await reportBody(), { path: "/__cloudhal/comments/report" }),
        ctx.deps,
      );
      expect(r).toMatchObject({ stored: true });
      expect(ctx.sql.writes.length).toBeLessThanOrEqual(2);
      expect(await ctx.store.listReports(SITE)).toMatchObject([
        { commentId: id, reason: "abuse", details: "Rude words" },
      ]);
      expect(await ctx.store.get(SITE, id)).toEqual(c);
      expect(
        await handleReportSubmission(
          post({ commentId: id, reason: "because", ...(await solved(ctx, id, "report")) }),
          ctx.deps,
        ),
      ).toMatchObject({ status: 400 });
      expect(submissionResponse(r, { pendingFragment: "comment-reported" }).status).toBe(200);
    });

    it("challenges: open threads only, difficulty from the daily cap, no writes", async () => {
      const get = (q: string) =>
        new Request(`https://${HOST}/__cloudhal/comments/challenge?${q}`, {
          headers: { host: HOST },
        });
      const ok = await handleChallengeRequest(get(`node=${ENTRY}&for=comment`), ctx.deps);
      expect(ok).toMatchObject({ kind: "challenge", challenge: { bits: 18 } });
      expect(
        await handleChallengeRequest(get(`node=${ENTRY2}&for=comment`), ctx.deps),
      ).toMatchObject({ status: 404 });
      expect(
        await handleChallengeRequest(get("node=cmt_nothere000&for=report"), ctx.deps),
      ).toMatchObject({ status: 404 });
      expect(await handleChallengeRequest(get("node=../etc&for=comment"), ctx.deps)).toMatchObject({
        status: 400,
      });
      expect(ctx.sql.writes).toHaveLength(0);
      await ctx.store.putSettings(SITE, { dailyCap: 2 }, ctx.settingsRev, EDITOR.id);
      await handleCommentSubmission(post(await good({ body: "Fill the cap one" })), ctx.deps);
      await handleCommentSubmission(post(await good({ body: "Fill the cap two" })), ctx.deps);
      expect(await handleChallengeRequest(get(`node=${ENTRY}`), ctx.deps)).toMatchObject({
        challenge: { bits: 21 },
      });
    });

    it("Turnstile: verified hostname and action, fail closed on outage", async () => {
      let answer: () => Promise<{ success: boolean; hostname?: string; action?: string }> =
        async () => ({ success: true, hostname: HOST, action: "comment" });
      const t = await pipeSetup(factory, { turnstile: () => answer() });
      await t.store.putSettings(
        SITE,
        { protection: "turnstile", turnstileSiteKey: "0x4AAAAAAAtest" },
        1,
        EDITOR.id,
      );
      const body = {
        nodeId: ENTRY,
        name: "Ayşe",
        body: "Hello with Turnstile",
        turnstileToken: "token-1",
      };
      expect(await handleCommentSubmission(post(body), t.deps)).toMatchObject({ stored: true });
      expect((await t.store.list(SITE)).comments).toHaveLength(1);
      expect(
        await handleCommentSubmission(post({ ...body, body: "Same token again" }), t.deps),
      ).toMatchObject({ dropped: "replay" });
      answer = async () => ({ success: true, hostname: "evil.example", action: "comment" });
      expect(
        await handleCommentSubmission(post({ ...body, turnstileToken: "token-2" }), t.deps),
      ).toMatchObject({ status: 403, error: "proof_failed" });
      answer = async () => {
        throw new Error("siteverify down");
      };
      expect(
        await handleCommentSubmission(post({ ...body, turnstileToken: "token-3" }), t.deps),
      ).toMatchObject({ status: 503, error: "try_again" });
      expect(
        await handleCommentSubmission(
          post({ nodeId: ENTRY, name: "A", body: "No token here" }),
          t.deps,
        ),
      ).toMatchObject({ status: 403, error: "proof_failed" });
    });
  });
}
