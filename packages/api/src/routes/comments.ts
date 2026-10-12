/**
 * Reader comments for people (RFC-0007 §12; agents use the MCP comment tools). Mounted at
 * `/api/sites/:siteId`; every route is declared in `ROUTE_SCOPES` (default-deny, I15):
 *
 * - `comments:read` — the queue (`GET /comments`), summary, one comment with its history and
 *   reports, settings and thread state. No email, IP hash or challenge (C1).
 * - `comments:moderate:own` — moderate (≤ 50, per-comment results), labels, reports and their
 *   resolution, thread overrides; Authors only on their own entries (`not_own` per comment, 403
 *   for single targets). `comments:moderate` — soft delete, export, bans, the last-resort purge.
 * - `comments:reply:own` — a person's staff reply (approved at once) and editing one's own reply.
 * - `commenters:data` (people only, Editor and above) — commenters with their email, a
 *   commenter's export and erasure (C10).
 * - `site:settings` — the site's comment settings (CAS on `rev`) and the write-only secrets.
 *
 * `siteId` always comes from the route after the scope check (C14). Writes put their audit row in
 * the same batch where the store allows it; visible changes queue purges (C6) and wake the
 * flusher through `CommentsDeps.onQueued`.
 */
import { AuditLog, holds, type Principal, type Scope } from "@cloudhal/agent-runtime";
import {
  type AuditStatement,
  type BanSubject,
  type Comment,
  type CommentReport,
  type CommentSettingsInput,
  emailHmac,
  type LabelName,
  type ModerateAction,
  type ModerationResult,
  normalizeEmail,
  type PurgePriority,
  REASON_CODES,
  type ReasonCode,
  settingsPurgeTags,
  utcDayStart,
} from "@cloudhal/comments";
import { CommentImportError, exportPage } from "@cloudhal/comments/sql";
import type { Actor } from "@cloudhal/core-contracts";
import {
  type CommentEntry,
  type CommentsDeps,
  commentEntries,
  commentsAvailable,
  ownedNodeIds,
  reportsByComment,
  threadView,
} from "@cloudhal/mcp-server/comments";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound, unauthorized } from "../errors.ts";
import { requireSite } from "../governance.ts";
import { param } from "../params.ts";

type Json = Record<string, unknown>;

function deps(c: Context<Env>): CommentsDeps {
  const d = c.get("comments");
  if (!commentsAvailable(d)) throw notFound("reader comments are not enabled on this server");
  return d;
}

function unavailable(message: string): HTTPException {
  return new HTTPException(503, {
    res: Response.json({ error: "comments_key_missing", message }, { status: 503 }),
  });
}

function keysOf(d: CommentsDeps) {
  if (!d.keys)
    throw unavailable(
      "this deployment has no CLOUDHAL_COMMENTS_KEY, so commenter emails and secrets cannot be read or stored",
    );
  return d.keys;
}

/** The signed-in person (comment writes are people's, RFC-0007 §0.1 decision 3). */
function person(c: Context<Env>): Actor & { kind: "human" } {
  const actor = c.get("actor");
  if (!actor) throw unauthorized();
  if (actor.kind !== "human")
    throw apiError(403, "forbidden", "only a person can do this; agents use the MCP tools");
  const p = c.get("principal")?.person;
  return { ...actor, kind: "human", ...(p?.name && !actor.name ? { name: p.name } : {}) };
}

/** Holds `scope` in full (or the server has no membership source). */
function full(c: Context<Env>, scope: Scope): boolean {
  const p: Principal | undefined = c.get("principal");
  return !c.get("staff") || !p?.person || holds(p.scopes, scope);
}

/** Entry ids the caller may act on under an own scope; `undefined` = every entry. */
async function ownScope(
  c: Context<Env>,
  scope: "comments:moderate" | "comments:reply",
  entries: Iterable<CommentEntry>,
): Promise<string[] | undefined> {
  if (full(c, scope)) return undefined;
  const p = c.get("principal");
  return ownedNodeIds(c.get("ownership"), p?.person?.id ?? p?.actor.id, entries);
}

async function assertOwn(
  c: Context<Env>,
  scope: "comments:moderate" | "comments:reply",
  entries: CommentEntry[],
): Promise<void> {
  const own = await ownScope(c, scope, entries);
  if (own && entries.some((e) => !own.includes(e.nodeId)))
    throw apiError(
      403,
      "not_own",
      "your role moderates and replies only on your own articles; an Editor can do this",
    );
}

async function body(c: Context<Env>): Promise<Json> {
  const b = (await c.req.json().catch(() => undefined)) as unknown;
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw badRequest("a JSON object is required");
  return b as Json;
}

function audit(
  c: Context<Env>,
  siteId: string,
  tool: string,
  input: Json,
  reason?: string,
): AuditStatement[] {
  if (!c.get("audit")) return [];
  const actor = c.get("actor") as Actor;
  return [
    AuditLog.statement({
      at: c.get("now")().toISOString(),
      actor,
      siteId,
      tool,
      decision: "allow",
      outcome: "ok",
      input,
      ...(reason ? { reason } : {}),
    }),
  ];
}

async function record(c: Context<Env>, siteId: string, tool: string, input: Json): Promise<void> {
  const actor = c.get("actor");
  if (!actor) return;
  await c.get("audit")?.record({
    at: c.get("now")().toISOString(),
    actor,
    siteId,
    tool,
    decision: "allow",
    outcome: "ok",
    input,
  });
}

function reasonCode(v: unknown, required: boolean): ReasonCode | undefined {
  if (v === undefined || v === null) {
    if (required) throw badRequest("reasonCode is required");
    return undefined;
  }
  if (!(REASON_CODES as readonly unknown[]).includes(v)) throw badRequest("unknown reasonCode");
  return v as ReasonCode;
}

function note(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw badRequest("note must be a string");
  return v;
}

function revs(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest("revs is required");
  for (const n of Object.values(v)) if (!Number.isInteger(n)) throw badRequest("revs are integers");
  return v as Record<string, number>;
}

/** A comment as Studio sees it: the contract plus the entry and open reports (never an email). */
export interface CommentView extends Comment {
  entry: { title: string; path: string } | null;
  reports: { count: number; reasons: string[] };
}

function view(c: Comment, entry: CommentEntry | undefined, reports: CommentReport[]): CommentView {
  const open = reports.filter((r) => r.resolvedAt === null);
  return {
    ...c,
    entry: entry ? { title: entry.title, path: entry.path } : null,
    reports: { count: open.length, reasons: [...new Set(open.map((r) => r.reason))] },
  };
}

async function views(c: Context<Env>, siteId: string, list: Comment[]): Promise<CommentView[]> {
  const d = deps(c);
  const [entries, reports] = await Promise.all([
    commentEntries(
      c.get("store"),
      siteId,
      list.map((x) => x.nodeId),
    ),
    d.store.listReports(siteId, { open: true, limit: 200 }),
  ]);
  const by = reportsByComment(reports);
  return list.map((x) => view(x, entries.get(x.nodeId), by.get(x.id) ?? []));
}

async function oneComment(c: Context<Env>, siteId: string) {
  const comment = await deps(c).store.get(siteId, param(c, "commentId"));
  if (!comment) throw notFound("comment not found");
  const entry = (await commentEntries(c.get("store"), siteId, [comment.nodeId])).get(
    comment.nodeId,
  );
  return { comment, entry };
}

function queued(d: CommentsDeps, siteId: string, priority: PurgePriority | null) {
  if (priority) d.onQueued?.(siteId, priority);
}

/** Moderation as REST runs it: own checks, audit row in the batch, purge wake-up. */
async function moderate(
  c: Context<Env>,
  siteId: string,
  input: {
    ids: string[];
    action: ModerateAction;
    reasonCode?: ReasonCode | undefined;
    note?: string | undefined;
    expectedRevs: Record<string, number>;
  },
): Promise<{ results: ModerationResult[]; purge: "queued" | "none" }> {
  const d = deps(c);
  const actor = person(c);
  if (!Array.isArray(input.ids) || input.ids.length === 0 || input.ids.length > 50)
    throw badRequest("ids: 1 to 50 comment ids");
  const found = await d.store.getMany(siteId, input.ids);
  const entries = await commentEntries(
    c.get("store"),
    siteId,
    found.map((x) => x.nodeId),
  );
  const own = await ownScope(c, "comments:moderate", entries.values());
  const before = new Map(found.map((x) => [x.id, x.status]));
  const results = await d.store.moderate(siteId, {
    ids: input.ids,
    action: input.action,
    expectedRevs: input.expectedRevs,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    actor,
    ...(own ? { ownNodeIds: own } : {}),
    audit: audit(c, siteId, "comments.moderate", {
      ids: input.ids,
      action: input.action,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    }),
  });
  const done = results.filter((r) => r.ok);
  const publishes = input.action === "approve" || input.action === "restore";
  const takedown = done.some((r) => before.get(r.id) === "approved");
  const priority =
    done.length > 0 && (publishes || takedown) ? (publishes ? "normal" : "takedown") : null;
  queued(d, siteId, priority);
  return { results, purge: priority ? "queued" : "none" };
}

const SETTINGS_KEYS = new Set([
  "enabled",
  "showWhenOff",
  "collections",
  "closeAfterDays",
  "protection",
  "turnstileSiteKey",
  "allowWithoutScript",
  "linkLimit",
  "watchWords",
  "blockedWords",
  "dailyCap",
  "aiLabels",
  "retention",
  "planHint",
]);
/** Settings that change the rendered page (§8.3). */
const RENDERING = [
  "enabled",
  "showWhenOff",
  "collections",
  "closeAfterDays",
  "protection",
  "turnstileSiteKey",
  "allowWithoutScript",
];
const SECRET_NAMES = new Set(["turnstile-secret"]);
const MODERATE_ACTIONS = new Set(["approve", "restore", "hide", "spam", "hold"]);

export const comments: Hono<Env> = new Hono<Env>()
  // ───────────── the queue ─────────────
  .get("/comments", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const q = c.req.query();
    const limit = q.limit === undefined ? 25 : Number(q.limit);
    const page = await d.store.list(site.id, {
      ...(q.status ? { status: q.status as Comment["status"] | "reported" } : {}),
      ...(q.node ? { nodeId: q.node } : {}),
      ...(q.label ? { label: q.label as LabelName } : {}),
      ...(q.since ? { since: q.since } : {}),
      ...(q.cursor ? { cursor: q.cursor } : {}),
      ...(q.order === "oldest" ? { order: "oldest" as const } : {}),
      limit,
    });
    const counts = await d.store.counts(site.id, q.node ? { nodeId: q.node } : {});
    return c.json({
      items: await views(c, site.id, page.comments),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      counts,
    });
  })
  .get("/comments/summary", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const now = c.get("now")();
    const range = c.req.query("range") ?? "7d";
    if (!["today", "7d", "30d"].includes(range)) throw badRequest("range is today, 7d or 30d");
    const since =
      range === "today"
        ? utcDayStart(now)
        : new Date(now.getTime() - (range === "30d" ? 30 : 7) * 86_400_000).toISOString();
    const [counts, stats, settings, today, queue] = await Promise.all([
      d.store.counts(site.id),
      d.store.summary(site.id, since),
      d.store.settings(site.id),
      d.store.storedSince(site.id, utcDayStart(now)),
      d.store.purgeQueue.queued(site.id),
    ]);
    const entries = await commentEntries(
      c.get("store"),
      site.id,
      stats.busiest.map((b) => b.nodeId),
    );
    return c.json({
      range,
      since,
      counts,
      pending: stats.pending,
      busiestThreads: stats.busiest.map((b) => ({
        ...b,
        title: entries.get(b.nodeId)?.title ?? null,
      })),
      labels: stats.labels,
      unansweredQuestions: stats.unansweredQuestions,
      dailyCap: {
        used: today.total,
        cap: settings.dailyCap,
        paused: settings.enabled && today.total >= settings.dailyCap,
      },
      purge: {
        pending: queue.length,
        takedowns: queue.filter((r) => r.priority === "takedown").length,
      },
    });
  })
  .get("/comments/reports", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const open = c.req.query("open");
    const commentId = c.req.query("commentId");
    let items = await d.store.listReports(site.id, {
      ...(open === "false" ? { open: false } : open === "all" ? {} : { open: true }),
      ...(commentId ? { commentId } : {}),
      limit: 200,
    });
    if (!full(c, "comments:moderate")) {
      const ids = [...new Set(items.map((r) => r.commentId))];
      const found = (
        await Promise.all(
          Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) =>
            d.store.getMany(site.id, ids.slice(i * 50, i * 50 + 50)),
          ),
        )
      ).flat();
      const entries = await commentEntries(
        c.get("store"),
        site.id,
        found.map((x) => x.nodeId),
      );
      const own = new Set((await ownScope(c, "comments:moderate", entries.values())) ?? []);
      const nodeOf = new Map(found.map((x) => [x.id, x.nodeId]));
      items = items.filter((r) => own.has(nodeOf.get(r.commentId) ?? ""));
    }
    return c.json({ items });
  })
  .post("/comments/reports/:reportId/resolve", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    const report = await d.store.getReport(site.id, param(c, "reportId"));
    if (!report) throw notFound("report not found");
    const comment = await d.store.get(site.id, report.commentId);
    const entry = comment
      ? (await commentEntries(c.get("store"), site.id, [comment.nodeId])).get(comment.nodeId)
      : undefined;
    if (entry) await assertOwn(c, "comments:moderate", [entry]);
    const resolution = typeof b.resolution === "string" ? b.resolution : "";
    await d.store.resolveReport(site.id, report.id, resolution, actor);
    await record(c, site.id, "comments.report", {
      reportId: report.id,
      commentId: report.commentId,
      resolution,
    });
    return c.json({ ...report, resolvedAt: c.get("now")().toISOString(), resolution });
  })
  .get("/comments/export", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const personal = c.req.query("personal") === "1";
    if (personal && !full(c, "commenters:data"))
      throw apiError(403, "missing_scope", "exporting personal data needs commenters:data", {
        scope: "commenters:data",
      });
    const keys = personal ? keysOf(d) : undefined;
    // One page per request (500 comments, or 100 commenters), so a large site never runs past
    // D1 Free's 50 queries per invocation; `cloudhal-next-cursor` asks for the next page. The
    // header line is on the first page only, so the pages concatenate into one file.
    const cursor = c.req.query("cursor");
    let page: Awaited<ReturnType<typeof exportPage>>;
    try {
      page = await exportPage(d.store, site.id, {
        cursor,
        personal,
        keys,
        now: c.get("now")(),
      });
    } catch (e) {
      if (e instanceof CommentImportError) throw badRequest(e.message);
      throw e;
    }
    await record(c, site.id, "comments.export", {
      personal,
      comments: page.comments,
      commenters: page.commenters,
      ...(cursor ? { continued: true } : {}),
    });
    return new Response(page.lines.length ? `${page.lines.join("\n")}\n` : "", {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="comments-${site.id}.jsonl"`,
        "cache-control": "no-store",
        ...(page.next ? { "cloudhal-next-cursor": page.next } : {}),
      },
    });
  })
  // ───────────── settings ─────────────
  .get("/comments/settings", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    return c.json({
      settings: await d.store.settings(site.id),
      secrets: { "turnstile-secret": await d.store.secretInfo(site.id, "turnstile-secret") },
      canStoreSecrets: Boolean(d.keys),
    });
  })
  .put("/comments/settings", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    if (!Number.isInteger(b.rev)) throw badRequest("rev is required (0 before the first save)");
    const unknown = Object.keys(b).filter((k) => k !== "rev" && !SETTINGS_KEYS.has(k));
    if (unknown.length > 0) throw badRequest(`unknown settings: ${unknown.join(", ")}`);
    const { rev, ...input } = b;
    const { before, after } = await d.store.putSettings(
      site.id,
      input as CommentSettingsInput,
      rev as number,
      actor.id,
    );
    const changed = Object.keys(input).filter(
      (k) =>
        JSON.stringify((before as unknown as Json)[k]) !==
        JSON.stringify((after as unknown as Json)[k]),
    );
    // Settings that change the rendered page purge the affected entries' comment tags (§8.3).
    let purge: "none" | "tags" | "everything" = "none";
    if (changed.some((k) => RENDERING.includes(k))) {
      const collections = new Set([
        ...Object.keys(before.collections),
        ...Object.keys(after.collections),
      ]);
      const entries = (await c.get("store").listContentEntries(site.id)).filter(
        (e) => e.status === "published" && collections.has(e.collection),
      );
      const plan = settingsPurgeTags(entries.map((e) => e.id));
      if (plan.everything) {
        purge = "everything";
        await d.purgeSite?.(site.id);
      } else if (plan.tags.length > 0) {
        purge = "tags";
        await d.store.purgeQueue.enqueue(site.id, plan.tags, "normal");
        queued(d, site.id, "normal");
      }
    }
    await record(c, site.id, "comments.settings", { changed, rev: after.rev, purge });
    return c.json({ settings: after, purge });
  })
  .put("/comments/settings/secrets/:name", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const name = param(c, "name");
    if (!SECRET_NAMES.has(name)) throw notFound("unknown secret");
    const b = await body(c);
    if (typeof b.value !== "string") throw badRequest("value is required");
    await d.store.putSecret(site.id, name, b.value, keysOf(d), actor.id);
    await record(c, site.id, "comments.secret", { name, action: "set" });
    return c.json({ name, ...(await d.store.secretInfo(site.id, name)) });
  })
  .delete("/comments/settings/secrets/:name", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    person(c);
    const name = param(c, "name");
    if (!SECRET_NAMES.has(name)) throw notFound("unknown secret");
    const deleted = await d.store.deleteSecret(site.id, name);
    if (deleted) await record(c, site.id, "comments.secret", { name, action: "delete" });
    return c.json({ name, deleted });
  })
  // ───────────── moderation ─────────────
  .post("/comments/moderate", async (c) => {
    const site = await requireSite(c);
    const b = await body(c);
    if (typeof b.action !== "string" || !MODERATE_ACTIONS.has(b.action))
      throw badRequest("action is approve, restore, hide, spam or hold (delete has its own route)");
    const action = b.action as ModerateAction;
    return c.json(
      await moderate(c, site.id, {
        ids: b.ids as string[],
        action,
        reasonCode: reasonCode(b.reasonCode, action === "hide" || action === "spam"),
        note: note(b.note),
        expectedRevs: revs(b.revs ?? b.expectedRevs),
      }),
    );
  })
  .post("/comments/erase", async (c) => {
    // A guest who left no email (§9.4): erase these comments' author (and text).
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    if (!Array.isArray(b.commentIds) || b.commentIds.length === 0 || b.commentIds.length > 50)
      throw badRequest("commentIds: 1 to 50 comment ids");
    const mode = b.mode === "delete-text" ? "delete-text" : "anonymise";
    const reason = note(b.reason);
    if (!reason) throw badRequest("reason is required");
    const result = await d.store.erase(
      site.id,
      { commentIds: b.commentIds as string[] },
      mode,
      actor,
      {
        note: reason,
        audit: audit(c, site.id, "comments.erase", {
          commentIds: b.commentIds as string[],
          mode,
        }),
      },
    );
    queued(d, site.id, result.nodeIds.length > 0 ? "takedown" : null);
    return c.json(result);
  })
  .post("/comments/purge-site-cache", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    person(c);
    if (!d.purgeSite)
      throw apiError(409, "not_available", "this server has no edge cache to purge");
    await d.purgeSite(site.id);
    await record(c, site.id, "comments.purge-site-cache", {});
    return c.json({ purged: true });
  })
  .get("/comments/:commentId", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const { comment, entry } = await oneComment(c, site.id);
    const [history, reports] = await Promise.all([
      d.store.history(site.id, comment.id),
      d.store.listReports(site.id, { commentId: comment.id, limit: 200 }),
    ]);
    return c.json({
      comment: view(comment, entry, reports),
      history,
      reports,
      thread: await threadView(d, site.id, comment.nodeId, entry, c.get("now")()),
    });
  })
  .patch("/comments/:commentId/labels", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    const { comment, entry } = await oneComment(c, site.id);
    if (entry) await assertOwn(c, "comments:moderate", [entry]);
    const [result] = await d.store.label(site.id, {
      items: [
        {
          commentId: comment.id,
          ...(Array.isArray(b.add) ? { add: b.add as LabelName[] } : {}),
          ...(Array.isArray(b.remove) ? { remove: b.remove as LabelName[] } : {}),
        },
      ],
      actor,
      source: "person",
      ...(Number.isInteger(b.rev) ? { expectedRevs: { [comment.id]: b.rev as number } } : {}),
      audit: audit(c, site.id, "comments.label", {
        commentId: comment.id,
        add: b.add ?? [],
        remove: b.remove ?? [],
      }),
    });
    if (!result?.ok)
      throw apiError(409, result?.error ?? "conflict", "the comment changed; reload and retry");
    return c.json(result);
  })
  .post("/comments/:commentId/replies", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    if (typeof b.text !== "string") throw badRequest("text is required");
    const { comment, entry } = await oneComment(c, site.id);
    if (entry) await assertOwn(c, "comments:reply", [entry]);
    const isAuthor = entry ? (await c.get("ownership").personOf(entry.author)) === actor.id : false;
    const reply = await d.store.reply(site.id, {
      commentId: comment.id,
      text: b.text,
      person: { id: actor.id, name: actor.name ?? "Team" },
      badge: isAuthor ? "author" : "team",
      audit: audit(c, site.id, "comments.reply", {
        commentId: comment.id,
        textLength: b.text.length,
      }),
    });
    queued(d, site.id, "normal");
    return c.json({ comment: view(reply, entry, []) }, 201);
  })
  .patch("/comments/:commentId", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    if (typeof b.text !== "string" || !Number.isInteger(b.rev))
      throw badRequest("text and rev are required");
    const { comment, entry } = await oneComment(c, site.id);
    const edited = await d.store.editReply(site.id, comment.id, b.text, b.rev as number, actor.id);
    if (edited.status === "approved") queued(d, site.id, "normal");
    await record(c, site.id, "comments.reply-edit", { commentId: comment.id });
    return c.json({ comment: view(edited, entry, []) });
  })
  .delete("/comments/:commentId", async (c) => {
    const site = await requireSite(c);
    const b = (await c.req.json().catch(() => ({}))) as Json;
    const rev = b.rev ?? Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("rev is required");
    const id = param(c, "commentId");
    const out = await moderate(c, site.id, {
      ids: [id],
      action: "delete",
      reasonCode: reasonCode(b.reasonCode ?? c.req.query("reasonCode"), true),
      note: note(b.note),
      expectedRevs: { [id]: rev as number },
    });
    const [r] = out.results;
    if (!r?.ok) {
      if (r?.error === "not_found") throw notFound("comment not found");
      throw apiError(409, r?.error ?? "conflict", "the comment changed; reload and retry");
    }
    return c.json(out);
  })
  // ───────────── threads ─────────────
  .get("/comment-threads/:nodeId", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const nodeId = param(c, "nodeId");
    const entry = (await commentEntries(c.get("store"), site.id, [nodeId])).get(nodeId);
    if (!entry) throw notFound("article not found");
    return c.json({
      thread: await threadView(d, site.id, nodeId, entry, c.get("now")()),
      counts: await d.store.counts(site.id, { nodeId }),
    });
  })
  .put("/comment-threads/:nodeId", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    const nodeId = param(c, "nodeId");
    const entry = (await commentEntries(c.get("store"), site.id, [nodeId])).get(nodeId);
    if (!entry) throw notFound("article not found");
    await assertOwn(c, "comments:moderate", [entry]);
    if (!Number.isInteger(b.rev)) throw badRequest("rev is required (0 before the first change)");
    const mode = b.mode as "default" | "open" | "closed" | "hidden";
    const priority = mode === "hidden" ? "takedown" : "normal";
    await d.store.putThread(
      site.id,
      nodeId,
      {
        mode,
        ...(b.closesAt !== undefined ? { closesAt: b.closesAt as string | null } : {}),
      },
      b.rev as number,
      actor.id,
      {
        purge: priority,
        audit: audit(c, site.id, "comments.thread", {
          nodeId,
          mode,
          ...(b.closesAt !== undefined ? { closesAt: b.closesAt } : {}),
        }),
      },
    );
    queued(d, site.id, priority);
    return c.json({ thread: await threadView(d, site.id, nodeId, entry, c.get("now")()) });
  })
  // ───────────── commenters (people with commenters:data) ─────────────
  // A lookup is a POST with a JSON body so an email address never sits in a URL, where request
  // logs keep it (threat-model review of 2026-10-12, item 8). There is no GET variant.
  .post("/commenters/lookup", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    person(c);
    const b = await body(c);
    for (const k of Object.keys(b))
      if (k !== "email" && k !== "commentId") throw badRequest(`unknown field "${k}"`);
    const email = b.email;
    const commentId = b.commentId;
    if (email !== undefined && typeof email !== "string") throw badRequest("email is a string");
    if (commentId !== undefined && typeof commentId !== "string")
      throw badRequest("commentId is a string");
    if (email !== undefined && commentId !== undefined)
      throw badRequest("give email or commentId, not both");
    let id: string | null = null;
    if (email) {
      const keys = keysOf(d);
      id = await d.store.findCommenter(site.id, {
        emailHmac: await emailHmac(keys, normalizeEmail(email) ?? ""),
      });
    } else if (commentId) id = await d.store.findCommenter(site.id, { commentId });
    else throw badRequest("email or commentId is required");
    if (!id) return c.json({ commenter: null });
    return c.json({ commenter: await d.store.commenter(site.id, id, keysOf(d)) });
  })
  .get("/commenters/:commenterId", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const who = await d.store.commenter(site.id, param(c, "commenterId"), keysOf(d));
    if (!who) throw notFound("commenter not found");
    const list = await d.store.getMany(site.id, who.commentIds.slice(-50));
    return c.json({ commenter: who, comments: await views(c, site.id, list) });
  })
  .post("/commenters/:commenterId/export", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const who = await d.store.commenter(site.id, param(c, "commenterId"), keysOf(d));
    if (!who) throw notFound("commenter not found");
    // one read, however many comments they wrote (D1 Free: 50 queries per invocation)
    const all = await d.store.commenterComments(site.id, who.id);
    await record(c, site.id, "comments.commenter-export", {
      commenterId: who.id,
      comments: all.length,
    });
    c.header("content-disposition", `attachment; filename="commenter-${who.id}.json"`);
    c.header("cache-control", "no-store");
    return c.json({
      cloudhal: "commenter",
      version: 1,
      siteId: site.id,
      exportedAt: c.get("now")().toISOString(),
      commenter: who,
      comments: all,
    });
  })
  .post("/commenters/:commenterId/erase", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    const mode = b.mode === "delete-text" ? "delete-text" : "anonymise";
    const reason = note(b.reason);
    if (!reason) throw badRequest("reason is required");
    const commenterId = param(c, "commenterId");
    const result = await d.store.erase(site.id, { commenterId }, mode, actor, {
      note: reason,
      audit: audit(c, site.id, "comments.erase", { commenterId, mode }),
    });
    queued(d, site.id, result.nodeIds.length > 0 ? "takedown" : null);
    return c.json(result);
  })
  // ───────────── bans (people, comments:moderate) ─────────────
  .get("/comment-bans", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    return c.json({ items: await d.store.listBans(site.id) });
  })
  .post("/comment-bans", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    const actor = person(c);
    const b = await body(c);
    if (typeof b.commentId !== "string") throw badRequest("commentId is required");
    const subjects = (Array.isArray(b.subjects) ? b.subjects : ["email", "ip"]) as BanSubject[];
    if (subjects.some((s) => s !== "email" && s !== "ip"))
      throw badRequest("subjects are email and/or ip");
    const code = reasonCode(b.reasonCode, true) as ReasonCode;
    const bans = await d.store.ban(site.id, {
      commentId: b.commentId,
      subjects,
      until: typeof b.until === "string" ? b.until : null,
      reasonCode: code,
      ...(note(b.note) ? { note: note(b.note) as string } : {}),
      by: actor,
    });
    let hidden = 0;
    let more = false;
    if (b.hidePast === true) {
      // Also hide their approved comments: every comment of the commenter (by email), or this
      // one. Set-based and bounded (≤ 1,000 a request, about 20 queries), so a prolific
      // commenter never runs a request past D1 Free's 50 queries; `more` asks the client to
      // send the same request again (the ban is an upsert, so repeating it changes nothing else).
      const r = await d.store.hideApprovedOf(site.id, b.commentId, {
        actor,
        reasonCode: code,
        audit: audit(c, site.id, "comments.moderate", {
          action: "hide",
          reasonCode: code,
          via: "ban",
          commentId: b.commentId,
        }),
      });
      hidden = r.hidden;
      more = r.more;
      queued(d, site.id, r.hidden > 0 ? "takedown" : null);
    }
    await record(c, site.id, "comments.ban", {
      commentId: b.commentId,
      subjects: bans.map((x) => x.subject),
      until: typeof b.until === "string" ? b.until : null,
      reasonCode: code,
      hidden,
      ...(more ? { more } : {}),
    });
    return c.json({ bans, hidden, ...(more ? { more } : {}) }, 201);
  })
  .delete("/comment-bans/:banId", async (c) => {
    const d = deps(c);
    const site = await requireSite(c);
    person(c);
    const banId = param(c, "banId");
    if (!(await d.store.liftBan(site.id, banId))) throw notFound("ban not found");
    await record(c, site.id, "comments.unban", { banId });
    return c.json({ lifted: true });
  });
