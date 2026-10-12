/**
 * Shared API suite for RFC-0007 §12–§13 (reader comments) — runs against SQLite and D1 like
 * `testing.ts`: people only, role gating through `ROUTE_SCOPES` and "own" for Authors, the queue
 * and its views without private fields (C1), bulk moderation with per-comment results, audit rows
 * and purge rows (C6), staff replies, threads and settings with CAS, commenters and erasure behind
 * `commenters:data` (C10), bans, reports, export, approvals carried out on approval and bound to
 * the comments' state (C4), notifications and `features.comments`.
 */
import {
  ApprovalStore,
  AuditLog,
  PEOPLE_ONLY_OWNERSHIP,
  type Principal,
  type Role,
  roleScopes,
} from "@cloudhal/agent-runtime";
import {
  type CommentKeys,
  deriveCommentKeys,
  emailHmac,
  ID_PREFIX,
  newCommentsId,
  sealEmail,
} from "@cloudhal/comments";
import { exportPage, SqlCommentStore } from "@cloudhal/comments/sql";
import type { Actor, Comment, ContentEntry } from "@cloudhal/core-contracts";
import { canonicalJson, type SiteGraphStore, seedStarterSite, sha256Hex } from "@cloudhal/core-ts";
import type { CommentsDeps } from "@cloudhal/mcp-server/comments";
import { defineTools } from "@cloudhal/mcp-server/tools";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { StaffService } from "./auth.ts";

export interface CommentsApiFactory {
  create(): Promise<{ store: SiteGraphStore; sql: SqlDriver }>;
  dispose?(): Promise<void>;
}

type Json = Record<string, unknown>;

const NOW = new Date("2026-10-12T12:00:00.000Z");
const KEY = "comments-api-test-key-not-a-secret-00000";
const agent: Actor = { kind: "agent", id: "agent_triage0001", name: "Comment triage" };
/** Roles without Better Auth: ownership by people, no invites. */
const STAFF = {
  ownership: PEOPLE_ONLY_OWNERSHIP,
  store: { acceptedInvitesBy: async () => [], member: async () => undefined },
} as unknown as StaffService;

function person(role: Role): Principal {
  const id = `user_${role.padEnd(12, "0").slice(0, 12)}`;
  return {
    actor: { kind: "human", id, name: role },
    scopes: roleScopes(role),
    person: { id, userId: `u-${role}`, role, name: role },
  };
}

export function describeCommentsApi(label: string, factory: CommentsApiFactory): void {
  describe(`API comments: ${label}`, () => {
    let store: SiteGraphStore;
    let sql: SqlDriver;
    let siteId: string;
    let entry: ContentEntry;
    let authorEntry: ContentEntry;
    let comments: SqlCommentStore;
    let keys: CommentKeys;
    let audit: AuditLog;
    let approvals: ApprovalStore;
    let queued: string[];
    let purgedSites: string[];
    let app: ReturnType<typeof createApi>;

    const build = (o: { keys?: boolean } = {}) => {
      const deps: CommentsDeps = {
        store: comments,
        ...(o.keys === false ? {} : { keys }),
        onQueued: (_s, p) => queued.push(p),
        purgeSite: async (id) => {
          purgedSites.push(id);
        },
      };
      app = createApi({
        store,
        now: () => NOW,
        audit,
        comments: deps,
        mcp: { stateKey: "comments-api-state-key-0123456789abcdef", approvals, audit },
        staff: STAFF,
        resolvePrincipal: async (c) => {
          const who = c.req.header("x-test-user");
          if (!who) return undefined;
          if (who === "agent") return { actor: agent, scopes: ["comments:read"] };
          return person(who as Role);
        },
      });
    };

    const call = async (
      path: string,
      who: string | null = "editor",
      init: { method?: string; body?: unknown } = {},
    ) => {
      const res = await app.request(path, {
        method: init.method ?? "GET",
        headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await res.text();
      let body: Json;
      try {
        body = JSON.parse(text) as Json;
      } catch {
        body = { text };
      }
      return { status: res.status, body, text };
    };
    const S = () => `/api/sites/${siteId}`;
    const CM = () => `${S()}/comments`;

    async function seed(
      text: string,
      o: { nodeId?: string; email?: string; at?: Date; name?: string } = {},
    ): Promise<Comment> {
      const id = newCommentsId(ID_PREFIX.comment);
      const email = o.email
        ? {
            id: newCommentsId(ID_PREFIX.commenter),
            hmac: await emailHmac(keys, o.email),
            ...(await sealEmail(keys, siteId, o.email)),
          }
        : undefined;
      await comments.submit(siteId, {
        id,
        nodeId: o.nodeId ?? entry.id,
        name: o.name ?? "Mehmet",
        text,
        status: "pending",
        labels: [],
        ipHmac: "f".repeat(32),
        challengeId: null,
        proof: "pow",
        createdAt: (o.at ?? NOW).toISOString(),
        ...(email ? { email } : {}),
      });
      return (await comments.get(siteId, id)) as Comment;
    }

    async function approved(text: string, o: Parameters<typeof seed>[1] = {}) {
      const c = await seed(text, o);
      await comments.moderate(siteId, {
        ids: [c.id],
        action: "approve",
        actor: person("editor").actor,
        expectedRevs: { [c.id]: c.rev },
      });
      return (await comments.get(siteId, c.id)) as Comment;
    }

    beforeEach(async () => {
      ({ store, sql } = await factory.create());
      const site = await seedStarterSite(store, { name: "Comments Site", slug: "comments-site" });
      siteId = site.id;
      entry = (await store.listContentEntries(siteId))[0] as ContentEntry;
      authorEntry = await store.createContentEntry({
        siteId,
        collection: "posts",
        slug: "author-writes",
        locale: "en",
        status: "published",
        title: "Author writes",
        body: { format: "markdown", value: "Hello" },
        fields: {},
        tags: [],
        ...(entry.terms ? { terms: entry.terms } : {}),
        author: person("author").actor,
        publishedAt: NOW.toISOString(),
      });
      comments = new SqlCommentStore(sql, { now: () => NOW });
      await comments.putSettings(
        siteId,
        { enabled: true, collections: { posts: { enabled: true } } },
        0,
        "user_setup000001",
      );
      keys = await deriveCommentKeys(KEY);
      audit = new AuditLog(sql);
      approvals = new ApprovalStore(sql, { now: () => NOW });
      queued = [];
      purgedSites = [];
      build();
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("is for people: anonymous 401, agents 403, Contributors 403, Authors read", async () => {
      expect((await call(CM(), null)).status).toBe(401);
      const a = await call(CM(), "agent");
      expect(a.status).toBe(403);
      expect(String(a.body.message)).toMatch(/MCP/);
      expect((await call(CM(), "contributor")).body).toMatchObject({
        error: "missing_scope",
        details: { scope: "comments:read" },
      });
      for (const role of ["author", "editor", "administrator", "owner"])
        expect((await call(CM(), role)).status, role).toBe(200);
      // commenter data is for Editors and above
      expect((await call(`${S()}/commenters?commentId=cmt_abcdef123456`, "author")).status).toBe(
        403,
      );
      expect((await call(`${CM()}/export`, "author")).status).toBe(403);
    });

    it("the queue: filters, entry titles, reports — never an email or IP hash (C1)", async () => {
      const a = await seed("First comment", { email: "reader@example.com" });
      const b = await approved("Second comment", { nodeId: authorEntry.id });
      await comments.report(siteId, {
        id: newCommentsId(ID_PREFIX.report),
        commentId: b.id,
        reason: "abuse",
        details: "rude",
        ipHmac: null,
        challengeId: null,
        createdAt: NOW.toISOString(),
      });
      const all = await call(CM());
      expect(all.status).toBe(200);
      const items = all.body.items as Json[];
      expect(items.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
      expect(items.find((x) => x.id === b.id)).toMatchObject({
        entry: { title: "Author writes", path: "/posts/author-writes" },
        reports: { count: 1, reasons: ["abuse"] },
      });
      expect(all.body.counts).toMatchObject({ pending: 1, approved: 1, reported: 1 });
      for (const s of ["reader@example.com", "ffffffff", "email", "ipHmac", "ip_hmac"])
        expect(all.text).not.toContain(s);
      const pending = await call(`${CM()}?status=pending`);
      expect((pending.body.items as Json[]).map((x) => x.id)).toEqual([a.id]);
      const reported = await call(`${CM()}?status=reported`);
      expect((reported.body.items as Json[]).map((x) => x.id)).toEqual([b.id]);
      expect((await call(`${CM()}?status=nope`)).status).toBe(400);
      const one = await call(`${CM()}/${b.id}`);
      expect(one.body).toMatchObject({
        comment: { id: b.id, status: "approved" },
        history: [{ action: "approve" }],
        reports: [{ reason: "abuse", details: "rude" }],
        thread: { state: "open" },
      });
      const summary = await call(`${CM()}/summary?range=today`);
      expect(summary.body).toMatchObject({
        counts: { pending: 1 },
        dailyCap: { used: 2, cap: 1000, paused: false },
        purge: { pending: 1 },
      });
    });

    it("moderation: bulk with per-comment results, audit in the batch, purges; Authors own only", async () => {
      const a = await seed("One");
      const b = await seed("Two");
      const own = await seed("On the Author's post", { nodeId: authorEntry.id });
      const r = await call(`${CM()}/moderate`, "editor", {
        method: "POST",
        body: { ids: [a.id, b.id], action: "approve", revs: { [a.id]: 1, [b.id]: 9 } },
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        results: [
          { id: a.id, ok: true, status: "approved", rev: 2 },
          { id: b.id, ok: false, error: "conflict" },
        ],
        purge: "queued",
      });
      expect(queued).toEqual(["normal"]);
      const rows = await audit.list({ siteId, limit: 10 });
      expect(rows.find((x) => x.tool === "comments.moderate")?.input).toMatchObject({
        ids: [a.id, b.id],
        action: "approve",
      });
      const events = await comments.history(siteId, a.id);
      expect(events[0]).toMatchObject({
        action: "approve",
        actor: { id: person("editor").actor.id },
      });
      // hiding an approved comment is a takedown
      const hide = await call(`${CM()}/moderate`, "editor", {
        method: "POST",
        body: { ids: [a.id], action: "hide", reasonCode: "abuse", revs: { [a.id]: 2 } },
      });
      expect(hide.body.purge).toBe("queued");
      expect(queued).toEqual(["normal", "takedown"]);
      expect(
        (
          await call(`${CM()}/moderate`, "editor", {
            method: "POST",
            body: { ids: [b.id], action: "spam", revs: { [b.id]: 1 } },
          })
        ).status,
      ).toBe(400); // spam needs a reasonCode
      expect(
        (
          await call(`${CM()}/moderate`, "editor", {
            method: "POST",
            body: { ids: [b.id], action: "delete", reasonCode: "spam", revs: { [b.id]: 1 } },
          })
        ).status,
      ).toBe(400); // delete has its own route
      // an Author moderates their own entries' comments only
      const authored = await call(`${CM()}/moderate`, "author", {
        method: "POST",
        body: { ids: [own.id, b.id], action: "approve", revs: { [own.id]: 1, [b.id]: 1 } },
      });
      expect(authored.body.results).toEqual([
        { id: own.id, ok: true, status: "approved", rev: 2 },
        { id: b.id, ok: false, error: "not_own" },
      ]);
      // soft delete: Editors and above, with a reason
      expect(
        (await call(`${CM()}/${b.id}?rev=1&reasonCode=spam`, "author", { method: "DELETE" }))
          .status,
      ).toBe(403);
      expect((await call(`${CM()}/${b.id}?rev=1`, "editor", { method: "DELETE" })).status).toBe(
        400,
      );
      const del = await call(`${CM()}/${b.id}?rev=1&reasonCode=spam`, "editor", {
        method: "DELETE",
      });
      expect(del.body).toMatchObject({ results: [{ ok: true, status: "deleted" }] });
      expect((await comments.get(siteId, b.id))?.body).toBeUndefined();
    });

    it("labels and staff replies: Author badge on own entries, Team otherwise; editing one's own", async () => {
      const own = await approved("Question on the Author's post?", { nodeId: authorEntry.id });
      const foreign = await approved("Question elsewhere?");
      const label = await call(`${CM()}/${own.id}/labels`, "author", {
        method: "PATCH",
        body: { add: ["question"], rev: own.rev },
      });
      expect(label.body).toMatchObject({ ok: true, rev: own.rev + 1 });
      expect(
        (
          await call(`${CM()}/${foreign.id}/labels`, "author", {
            method: "PATCH",
            body: { add: ["question"] },
          })
        ).body.error,
      ).toBe("not_own");
      const reply = await call(`${CM()}/${own.id}/replies`, "author", {
        method: "POST",
        body: { text: "Thanks for reading!" },
      });
      expect(reply.status).toBe(201);
      const r = reply.body.comment as Json;
      expect(r).toMatchObject({
        status: "approved",
        parentId: own.id,
        author: { kind: "staff", badge: "author", personId: person("author").actor.id },
      });
      const team = await call(`${CM()}/${foreign.id}/replies`, "editor", {
        method: "POST",
        body: { text: "From the team" },
      });
      expect((team.body.comment as Json).author).toMatchObject({ badge: "team" });
      expect(
        (
          await call(`${CM()}/${foreign.id}/replies`, "author", {
            method: "POST",
            body: { text: "Not mine" },
          })
        ).status,
      ).toBe(403);
      const edited = await call(`${CM()}/${r.id}`, "author", {
        method: "PATCH",
        body: { text: "Thanks for reading, really!", rev: 1 },
      });
      expect(edited.body.comment).toMatchObject({
        rev: 2,
        body: { text: "Thanks for reading, really!" },
      });
      expect(
        (
          await call(`${CM()}/${r.id}`, "editor", {
            method: "PATCH",
            body: { text: "Someone else's", rev: 2 },
          })
        ).status,
      ).toBe(403);
    });

    it("threads and settings: CAS on rev, purges for rendering changes, secrets need the key", async () => {
      const t = await call(`${S()}/comment-threads/${entry.id}`);
      expect(t.body).toMatchObject({ thread: { state: "open", rev: 0, mode: "default" } });
      const closed = await call(`${S()}/comment-threads/${entry.id}`, "editor", {
        method: "PUT",
        body: { mode: "closed", rev: 0 },
      });
      expect(closed.body).toMatchObject({ thread: { state: "closed", rev: 1 } });
      expect(
        (
          await call(`${S()}/comment-threads/${entry.id}`, "editor", {
            method: "PUT",
            body: { mode: "open", rev: 0 },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await call(`${S()}/comment-threads/${entry.id}`, "author", {
            method: "PUT",
            body: { mode: "hidden", rev: 1 },
          })
        ).status,
      ).toBe(403);
      const hidden = await call(`${S()}/comment-threads/${authorEntry.id}`, "author", {
        method: "PUT",
        body: { mode: "hidden", rev: 0 },
      });
      expect(hidden.body).toMatchObject({ thread: { state: "hidden" } });
      expect(queued).toEqual(["normal", "takedown"]);

      const s = await call(`${CM()}/settings`, "author");
      expect(s.body).toMatchObject({
        settings: { enabled: true, rev: 1 },
        secrets: { "turnstile-secret": null },
        canStoreSecrets: true,
      });
      expect(
        (await call(`${CM()}/settings`, "editor", { method: "PUT", body: { rev: 1 } })).status,
      ).toBe(403);
      const put = await call(`${CM()}/settings`, "administrator", {
        method: "PUT",
        body: { rev: 1, showWhenOff: false, dailyCap: 500 },
      });
      expect(put.body).toMatchObject({ settings: { dailyCap: 500, rev: 2 }, purge: "tags" });
      expect(
        (await call(`${CM()}/settings`, "administrator", { method: "PUT", body: { rev: 1 } }))
          .status,
      ).toBe(409);
      expect(
        (
          await call(`${CM()}/settings`, "administrator", {
            method: "PUT",
            body: { rev: 2, nonsense: true },
          })
        ).status,
      ).toBe(400);
      const secret = await call(`${CM()}/settings/secrets/turnstile-secret`, "administrator", {
        method: "PUT",
        body: { value: "0x4AAAAAAA-secret-value" },
      });
      expect(secret.status).toBe(200);
      const after = await call(`${CM()}/settings`, "administrator");
      expect(after.text).not.toContain("0x4AAAAAAA");
      expect((after.body.secrets as Json)["turnstile-secret"]).toMatchObject({
        updatedBy: person("administrator").actor.id,
      });
      build({ keys: false });
      expect(
        (
          await call(`${CM()}/settings/secrets/turnstile-secret`, "administrator", {
            method: "PUT",
            body: { value: "x" },
          })
        ).status,
      ).toBe(503);
    });

    it("commenters: emails only with commenters:data; erasure anonymises, is audited and purged", async () => {
      const a = await approved("Mine", { email: "Reader@Example.com", name: "Ayla" });
      const found = await call(`${S()}/commenters?email=reader@example.com`);
      const who = found.body.commenter as Json;
      expect(who).toMatchObject({ email: "reader@example.com", commentIds: [a.id] });
      expect((await call(`${S()}/commenters?commentId=${a.id}`)).body.commenter).toMatchObject({
        id: who.id,
      });
      const detail = await call(`${S()}/commenters/${who.id}`);
      expect((detail.body.comments as Json[]).map((x) => x.id)).toEqual([a.id]);
      const exported = await call(`${S()}/commenters/${who.id}/export`, "editor", {
        method: "POST",
      });
      expect(exported.body).toMatchObject({ cloudhal: "commenter", comments: [{ id: a.id }] });
      expect(
        (
          await call(`${S()}/commenters/${who.id}/erase`, "editor", {
            method: "POST",
            body: { mode: "anonymise" },
          })
        ).status,
      ).toBe(400); // a reason is required
      const erased = await call(`${S()}/commenters/${who.id}/erase`, "editor", {
        method: "POST",
        body: { mode: "anonymise", reason: "Asked by email" },
      });
      expect(erased.body).toMatchObject({ comments: 1, emailDeleted: true, nodeIds: [entry.id] });
      expect((await comments.get(siteId, a.id))?.author).toEqual({ kind: "erased" });
      expect(queued).toEqual(["takedown"]);
      const rows = JSON.stringify(await audit.list({ siteId, limit: 20 }));
      expect(rows).toContain("comments.erase");
      expect(rows).not.toContain("reader@example.com");
      expect(rows).not.toContain("Ayla");
      // a guest without an email: erase by comment
      const guest = await approved("No email given");
      const byComment = await call(`${CM()}/erase`, "editor", {
        method: "POST",
        body: { commentIds: [guest.id], mode: "delete-text", reason: "Asked on the phone" },
      });
      expect(byComment.body).toMatchObject({ comments: 1 });
      expect((await comments.get(siteId, guest.id))?.status).toBe("deleted");
    });

    it("bans, reports and export", async () => {
      const a = await approved("Spammy", { email: "spam@example.com" });
      const ban = await call(`${S()}/comment-bans`, "editor", {
        method: "POST",
        body: { commentId: a.id, subjects: ["email", "ip"], reasonCode: "spam", hidePast: true },
      });
      expect(ban.status).toBe(201);
      expect(ban.body).toMatchObject({ hidden: 1 });
      expect((ban.body.bans as Json[]).map((b) => b.subject).sort()).toEqual(["email", "ip"]);
      expect((await comments.get(siteId, a.id))?.status).toBe("hidden");
      const list = await call(`${S()}/comment-bans`);
      expect(list.body.items).toHaveLength(2);
      expect(list.text).not.toContain("spam@example.com");
      const banId = (list.body.items as Json[])[0]?.id as string;
      expect(
        (await call(`${S()}/comment-bans/${banId}`, "author", { method: "DELETE" })).status,
      ).toBe(403);
      expect(
        (await call(`${S()}/comment-bans/${banId}`, "editor", { method: "DELETE" })).status,
      ).toBe(200);

      const b = await approved("Reported", { nodeId: authorEntry.id });
      const c2 = await approved("Reported elsewhere");
      for (const target of [b, c2])
        await comments.report(siteId, {
          id: newCommentsId(ID_PREFIX.report),
          commentId: target.id,
          reason: "spam",
          details: null,
          ipHmac: null,
          challengeId: null,
          createdAt: NOW.toISOString(),
        });
      // Authors see reports on their own entries only
      const authorReports = await call(`${CM()}/reports`, "author");
      expect((authorReports.body.items as Json[]).map((r) => r.commentId)).toEqual([b.id]);
      const reports = await call(`${CM()}/reports`, "editor");
      expect(reports.body.items).toHaveLength(2);
      const rid = (authorReports.body.items as Json[])[0]?.id as string;
      const resolved = await call(`${CM()}/reports/${rid}/resolve`, "author", {
        method: "POST",
        body: { resolution: "kept" },
      });
      expect(resolved.body).toMatchObject({ resolution: "kept" });
      expect(
        (
          await call(`${CM()}/reports/${rid}/resolve`, "author", {
            method: "POST",
            body: { resolution: "kept" },
          })
        ).status,
      ).toBe(409);

      const ex = await call(`${CM()}/export`, "editor");
      const lines = ex.text
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as Json);
      expect(lines[0]).toMatchObject({ cloudhal: "comments", version: 1, siteId });
      expect(lines.slice(1).map((l) => l.id)).toHaveLength(3);
      expect(ex.text).not.toContain("spam@example.com");
      const personal = await call(`${CM()}/export?personal=1`, "editor");
      expect(personal.text).toContain("spam@example.com");
    });

    it("operator (deployment token): status, paged export with personal data, idempotent import", async () => {
      const TOKEN = "comments-operator-deploy-token-0123456789";
      const a = await approved("First, with an email", { email: "reader@example.com" });
      await seed("Still waiting");
      const reply = await comments.reply(siteId, {
        commentId: a.id,
        text: "Thanks for reading",
        person: { id: "user_editor000000", name: "Editor" },
        badge: "team",
      });
      const operator = createApi({
        store,
        now: () => NOW,
        audit,
        comments: { store: comments, keys, onQueued: (_s, p) => queued.push(p) },
        admin: { deployToken: TOKEN, storage: { sql, blobs: new MemoryBlobStore() } },
      });
      const op = async (path: string, init: { method?: string; body?: string } = {}) => {
        const res = await operator.request(`/api/admin/sites/${siteId}/comments${path}`, {
          method: init.method ?? "GET",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/x-ndjson" },
          ...(init.body !== undefined ? { body: init.body } : {}),
        });
        return {
          status: res.status,
          text: await res.text(),
          next: res.headers.get("cloudhal-next-cursor"),
        };
      };
      // the deployment token, nothing else
      expect((await operator.request(`/api/admin/sites/${siteId}/comments/status`)).status).toBe(
        401,
      );
      expect(
        (
          await operator.request(`/api/admin/sites/site_doesnotexist1/comments/status`, {
            headers: { authorization: `Bearer ${TOKEN}` },
          })
        ).status,
      ).toBe(404);

      const status = JSON.parse((await op("/status")).text) as Json;
      expect(status).toMatchObject({
        siteId,
        key: true,
        settings: { enabled: true, collections: ["posts"], protection: "pow", stored: true },
        counts: { approved: 2, pending: 1 },
        pending: { count: 1 },
        today: { stored: 2, cap: 1000, paused: false },
      });
      expect((status.purge as Json).queued).toBeGreaterThanOrEqual(1);

      // one page here (500 per page); without personal data no email anywhere
      const plain = await op("/export");
      expect(plain.next).toBeNull();
      const lines = plain.text.trim().split("\n");
      expect(JSON.parse(lines[0] as string)).toMatchObject({
        cloudhal: "comments",
        version: 1,
        siteId,
      });
      expect(lines).toHaveLength(4);
      expect(plain.text).not.toContain("reader@example.com");
      expect(plain.text).not.toMatch(/ip_hmac|ipHmac|challenge|"proof"/);
      const personal = await op("/export?personal=1");
      const commenter = JSON.parse(personal.text.trim().split("\n").at(-1) as string) as Json;
      expect(commenter).toMatchObject({
        commenter: { email: "reader@example.com", commentIds: [a.id] },
      });

      // paging, as the CLI follows it: one comment per page, then one commenter per page
      const paged: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const page = await exportPage(comments, siteId, {
          ...(cursor ? { cursor } : {}),
          personal: true,
          keys,
          maxComments: 1,
          maxCommenters: 1,
        });
        paged.push(...page.lines);
        cursor = page.next;
        if (!cursor) break;
      }
      expect(paged).toHaveLength(5);
      expect(paged.slice(1, 4).map((l) => (JSON.parse(l) as Json).id)).toEqual(
        lines.slice(1).map((l) => (JSON.parse(l) as Json).id),
      );

      // moving: the rows go away, the file brings them back with their email link
      await sql.batch([
        { sql: "DELETE FROM comments WHERE site_id = ?", params: [siteId] },
        { sql: "DELETE FROM commenter_emails WHERE site_id = ?", params: [siteId] },
      ]);
      queued.length = 0;
      const forged = JSON.stringify({
        ...(JSON.parse(lines[2] as string) as Json),
        siteId: "site_elsewhere01",
      });
      const file = [
        lines[0],
        lines[1],
        forged,
        lines[3],
        "not json",
        personal.text.trim().split("\n").at(-1),
      ];
      const first = await op("/import", { method: "POST", body: file.join("\n") });
      expect(first.status).toBe(200);
      const report = JSON.parse(first.text) as Json;
      expect(report).toMatchObject({ imported: 3, skipped: 0, commenters: 1 });
      expect(report.invalid).toEqual([{ line: 5, error: "not JSON" }]);
      expect(report.purged).toEqual([`cloudhal-comments-${entry.id}`]);
      expect(queued).toEqual(["normal"]);
      // the site comes from the route (C14); the record is the same; the email is linked again
      expect(await comments.get(siteId, reply.id)).toEqual(reply);
      expect((await comments.get(siteId, a.id))?.status).toBe("approved");
      const who = await comments.findCommenter(siteId, { commentId: a.id });
      expect(who && (await comments.commenter(siteId, who, keys))?.email).toBe(
        "reader@example.com",
      );
      // again: nothing changes
      const again = JSON.parse(
        (await op("/import", { method: "POST", body: file.join("\n") })).text,
      ) as Json;
      expect(again).toMatchObject({ imported: 0, skipped: 3 });

      // importers' origin is the key too; foreign entries and orphans are refused
      const imported = (id: string, extra: Json = {}) =>
        JSON.stringify({
          schemaVersion: 1,
          id,
          siteId,
          nodeId: entry.id,
          source: "import",
          origin: { system: "disqus", id: "123" },
          author: { kind: "guest", name: "Ayşe" },
          body: { format: "text", text: "From Disqus" },
          status: "approved",
          createdAt: "2020-01-01T00:00:00.000Z",
          rev: 1,
          ...extra,
        });
      const disqus = JSON.parse(
        (
          await op("/import", {
            method: "POST",
            body: [
              imported("cmt_disqus000001"),
              imported("cmt_disqus000002"),
              imported("cmt_disqus000003", {
                origin: { system: "disqus", id: "124" },
                nodeId: "ent_notanentry01",
              }),
              imported("cmt_disqus000004", {
                origin: { system: "disqus", id: "125" },
                parentId: "cmt_missing0000001",
              }),
              imported("cmt_disqus000005", {
                origin: { system: "disqus", id: "126" },
                source: "webmention",
              }),
            ].join("\n"),
          })
        ).text,
      ) as Json;
      expect(disqus).toMatchObject({ imported: 1, skipped: 0 });
      expect((disqus.invalid as Json[]).map((p) => p.line)).toEqual([3, 4, 5]);
      const second = JSON.parse(
        (await op("/import", { method: "POST", body: imported("cmt_disqus000009") })).text,
      ) as Json;
      expect(second).toMatchObject({ imported: 0, skipped: 1 });
      expect(await comments.get(siteId, "cmt_disqus000009")).toBeNull();
      // not an export at all
      expect(
        (await op("/import", { method: "POST", body: '{"cloudhal":"analytics","version":1}' }))
          .status,
      ).toBe(400);
    });

    it("approvals: carried out as the approving person, bound to the comments' state (C4)", async () => {
      const tools = new Map(defineTools().map((t) => [t.name, t]));
      const file = async (tool: string, input: Json) => {
        const def = tools.get(tool);
        const ctx = {
          store,
          principal: { actor: agent, scopes: ["comments:read" as const] },
          comments: { store: comments },
        };
        return approvals.request({
          siteId,
          tool,
          argsHash: await sha256Hex(canonicalJson(input)),
          input,
          actor: agent,
          prompt: "Approve?",
          stateHash: (await def?.bindState?.(input, ctx)) ?? "",
          cause: "tool",
        });
      };
      const c1 = await seed("Please approve me");
      const req = await file("moderate_comments", {
        siteId,
        ids: [c1.id],
        action: "approve",
        expectedRevs: { [c1.id]: 1 },
      });
      expect(req.stateHash).toMatch(/^cm1:/);
      const listed = await call(`${S()}/approvals?status=pending`);
      expect((listed.body.items as Json[])[0]).toMatchObject({ id: req.id, canDecide: true });
      const notes = await call("/api/notifications", "editor");
      expect((notes.body.items as Json[]).map((n) => n.kind)).toContain("comments-approval");
      const ok = await call(`${S()}/approvals/${req.id}/approve`, "editor", { method: "POST" });
      expect(ok.status, ok.text).toBe(200);
      expect(ok.body).toMatchObject({
        status: "consumed",
        result: { results: [{ id: c1.id, ok: true, status: "approved" }], purge: "queued" },
      });
      const events = await comments.history(siteId, c1.id);
      expect(events.at(-1)).toMatchObject({
        action: "approve",
        approvalId: req.id,
        actor: { kind: "human", id: person("editor").actor.id },
        automated: false,
      });

      // a reply is published under the approver's name, drafted by the agent
      const reply = await file("draft_comment_reply", {
        siteId,
        commentId: c1.id,
        text: "Thanks — the team",
      });
      const rr = await call(`${S()}/approvals/${reply.id}/approve`, "editor", { method: "POST" });
      expect(rr.body).toMatchObject({
        result: {
          comment: {
            status: "approved",
            author: { kind: "staff", name: "editor", badge: "team", draftedBy: "Comment triage" },
          },
        },
      });

      // the comments changed after the agent asked: the request is denied
      const c2 = await seed("Changed meanwhile");
      const stale = await file("moderate_comments", {
        siteId,
        ids: [c2.id],
        action: "approve",
        expectedRevs: { [c2.id]: 1 },
      });
      await comments.label(siteId, {
        items: [{ commentId: c2.id, add: ["praise"] }],
        actor: agent,
        source: "agent",
      });
      const conflict = await call(`${S()}/approvals/${stale.id}/approve`, "editor", {
        method: "POST",
      });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe("state_changed");
      expect((await approvals.get(stale.id))?.status).toBe("denied");
      expect((await comments.get(siteId, c2.id))?.status).toBe("pending");

      // an Author decides requests on their own entries only
      const foreign = await file("moderate_comments", {
        siteId,
        ids: [c2.id],
        action: "approve",
        expectedRevs: { [c2.id]: 2 },
      });
      const no = await call(`${S()}/approvals/${foreign.id}/approve`, "author", {
        method: "POST",
      });
      expect(no.status).toBe(403);
      expect(no.body).toMatchObject({ error: "cannot_decide", details: { code: "not_own" } });
      const mine = await seed("On the Author's post", { nodeId: authorEntry.id });
      const own = await file("set_comment_thread", {
        siteId,
        nodeId: authorEntry.id,
        mode: "open",
        expectedRev: 0,
      });
      const yes = await call(`${S()}/approvals/${own.id}/approve`, "author", { method: "POST" });
      expect(yes.status, yes.text).toBe(200);
      expect(yes.body).toMatchObject({ result: { thread: { mode: "open", rev: 1 } } });
      expect(mine.id).toBeTruthy();
    });

    it("notifications and features.comments", async () => {
      await seed("Waiting");
      await seed("Waiting on the Author's post", { nodeId: authorEntry.id });
      const r = await approved("Reported");
      await comments.report(siteId, {
        id: newCommentsId(ID_PREFIX.report),
        commentId: r.id,
        reason: "abuse",
        details: null,
        ipHmac: null,
        challengeId: null,
        createdAt: NOW.toISOString(),
      });
      const editor = (await call("/api/notifications", "editor")).body.items as Json[];
      expect(editor.find((n) => n.kind === "comments-pending")).toMatchObject({ siteId, count: 2 });
      expect(editor.find((n) => n.kind === "comments-reported")).toMatchObject({ count: 1 });
      expect(editor.some((n) => n.kind === "comments-paused")).toBe(false);
      const author = (await call("/api/notifications", "author")).body.items as Json[];
      expect(author.find((n) => n.kind === "comments-pending")).toMatchObject({ count: 1 });
      expect(author.some((n) => n.kind === "comments-reported")).toBe(false);
      expect(
        ((await call("/api/notifications", "contributor")).body.items as Json[]).some((n) =>
          String(n.kind).startsWith("comments-"),
        ),
      ).toBe(false);
      // the daily cap reached; a takedown waiting over two minutes
      await comments.putSettings(siteId, { dailyCap: 3 }, 1, "user_setup000001");
      await comments.purgeQueue.enqueue(siteId, [`cloudhal-comments-${entry.id}`], "takedown");
      const later = new Date(NOW.getTime() + 3 * 60_000);
      app = createApi({
        store,
        now: () => later,
        comments: { store: comments },
        staff: STAFF,
        resolvePrincipal: async (c) => person(c.req.header("x-test-user") as Role),
      });
      const kinds = ((await call("/api/notifications", "editor")).body.items as Json[]).map(
        (n) => n.kind,
      );
      expect(kinds).toEqual(expect.arrayContaining(["comments-paused", "comments-purge-waiting"]));
      const instance = await call("/api/instance", "editor");
      expect((instance.body.features as Json).comments).toEqual({
        available: true,
        protection: ["pow", "turnstile"],
        aiLabels: false,
        keys: false,
        purge: { pending: 1 },
      });
    });
  });
}
