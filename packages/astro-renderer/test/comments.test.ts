/**
 * Reader comments in the renderer (RFC-0007 rollout step 4): the section's HTML (escaped plain
 * text, `https:`-only links with `rel="ugc nofollow noopener noreferrer"`, two levels, the plain
 * form with its honeypot, the notes, closed/hidden/off/preview states — invariant C7), the page
 * loader on the Node runtime (cache tag, `?comments=<n>`, Turnstile CSP), and `SiteComments`
 * answering the endpoints on SQLite (published entries only, same origin, the honeypot, replays,
 * Turnstile's `siteverify` hostname/action checks, comments off without a key).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type Comment,
  deriveCommentKeys,
  ipHmac,
  issueChallenge,
  newCommentsId,
  type PreparedSubmission,
  type RenderPage,
  randomSalt,
  solveChallenge,
} from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SiteComments, usableCommentsKey } from "../src/comments.ts";
import { commentStrings, commentsHtml } from "../src/comments-html.ts";
import { localCommentsKey } from "../src/comments-node.ts";
import {
  type CommentsView,
  commentsJsonLd,
  commentsPageParam,
  loadComments,
} from "../src/comments-view.ts";
import { SITE_CSP, turnstileCsp } from "../src/csp.ts";
import { SnapshotSource } from "../src/source.ts";

const KEY = "renderer-comments-test-key-not-a-secret-00";
const editor = { kind: "human" as const, id: "user_editor01", name: "Ayşe" };
const RLO = String.fromCodePoint(0x202e);

function comment(o: Partial<Comment> & { id: string }): Comment {
  return {
    schemaVersion: 1,
    siteId: "site_render01",
    nodeId: "entry_render01",
    source: "native",
    author: { kind: "guest", name: "Mehmet" },
    body: { format: "text", text: "Hello" },
    status: "approved",
    labels: [],
    createdAt: "2026-10-12T10:00:00.000Z",
    rev: 1,
    ...o,
  } as Comment;
}

function view(o: Partial<CommentsView> = {}): CommentsView {
  return {
    nodeId: "entry_render01",
    state: "open",
    path: "/posts/ferries",
    locale: "en",
    protection: "pow",
    turnstileSiteKey: null,
    allowWithoutScript: true,
    script: "/_cloudhal/c.0123abcd.js",
    notFound: false,
    page: { items: [], total: 0, page: 1, pageCount: 1 },
    ...o,
  };
}

describe("the comments section's HTML (C7)", () => {
  const top = comment({
    id: "cmt_top0000001",
    author: { kind: "guest", name: `<img src=x onerror=alert(1)> Eve${"&"}` },
    body: {
      format: "text",
      text: `See https://example.org/a?b=1&c=2 and javascript:alert(1) and http://plain.example\n\n<script>alert(1)</script>`,
    },
  });
  const staff = comment({
    id: "cmt_staff00001",
    parentId: "cmt_top0000001",
    author: { kind: "staff", personId: "user_editor01", name: "Ayşe", badge: "author" },
    body: { format: "text", text: "Thanks!" },
    createdAt: "2026-10-12T11:00:00.000Z",
  });
  const nested = comment({
    id: "cmt_nested0001",
    parentId: "cmt_top0000001",
    inReplyToId: "cmt_staff00001",
    author: { kind: "erased" },
    body: { format: "text", text: `Spoof ${RLO}gnp.exe` },
    createdAt: "2026-10-12T12:00:00.000Z",
  });
  const page: RenderPage = {
    items: [
      { comment: top, replies: [staff, nested] },
      {
        removed: { id: "cmt_gone000001", createdAt: "2026-10-12T09:00:00.000Z" },
        replies: [comment({ id: "cmt_orphan0001", parentId: "cmt_gone000001" })],
      },
    ],
    total: 4,
    page: 1,
    pageCount: 2,
  };

  it("escapes names and text, links only https: URLs, and keeps two levels", () => {
    const html = commentsHtml(view({ page }));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; Eve&amp;");
    expect(html).toContain(
      '<a href="https://example.org/a?b=1&amp;c=2" rel="ugc nofollow noopener noreferrer">',
    );
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="http://plain.example');
    // two visible levels: replies (including a reply to a reply) sit under the top comment
    expect(html).toMatch(
      /<li id="comment-cmt_top0000001" class="cloudhal-comment" data-thread>.*<ol class="cloudhal-comment-replies"><li id="comment-cmt_staff00001"/,
    );
    expect(html).toContain('<span class="cloudhal-comment-badge">Author</span>');
    expect(html).toContain(
      '<a class="cloudhal-comment-context" href="#comment-cmt_staff00001">in reply to Ayşe</a>',
    );
    expect(html).toContain(">Anonymous</strong>");
    expect(html).toContain('<time datetime="2026-10-12T10:00:00.000Z">October 12, 2026</time>');
    expect(html).toContain("This comment was removed.");
    expect(html).toContain('<h2 id="comments-title">4 comments</h2>');
    expect(html).toContain('href="/posts/ferries?comments=2#comments" data-more');
    // no third-party resource; the only script is the first-party module
    expect(html).not.toMatch(/(?:src|href)="https?:\/\/(?!example\.org)/);
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it("renders the plain form on open threads: honeypot, hidden proof fields, notes, module", () => {
    const html = commentsHtml(view({ page }));
    expect(html).toContain(
      '<form id="comment-form" class="cloudhal-comment-form" method="post" action="/__cloudhal/comments" data-kind="comment"',
    );
    expect(html).toContain('<input type="hidden" name="nodeId" value="entry_render01">');
    expect(html).toContain('<input type="hidden" name="parentId" value="">');
    expect(html).toContain(
      '<div class="cloudhal-comment-hp" aria-hidden="true"><label for="comment-website">',
    );
    expect(html).toContain('name="website" tabindex="-1" autocomplete="off"');
    expect(html).toContain('<input type="hidden" name="challenge" value="">');
    expect(html).toContain('name="name" required maxlength="80"');
    expect(html).toContain('name="body" required minlength="2" maxlength="5000"');
    for (const id of [
      "pending",
      "invalid",
      "closed",
      "script-required",
      "slow-down",
      "try-again",
      "paused",
      "reported",
    ])
      expect(html).toContain(`id="comment-${id}"`);
    expect(html).toContain(":where(.cloudhal-comment-note:target){display:block}");
    expect(html).toContain('<script type="module" src="/_cloudhal/c.0123abcd.js"></script>');
    // Reply buttons wait for the module; every comment has a report form
    expect(html).toContain('data-reply="cmt_top0000001" data-name="&lt;img');
    expect(html).toMatch(/data-reply="cmt_top0000001"[^>]* hidden>/);
    expect(html.match(/action="\/__cloudhal\/comments\/report"/g)).toHaveLength(4);
    expect(html).toContain('data-protection="pow"');
  });

  it("closed threads keep comments and say so; hidden and off render nothing; previews a placeholder", () => {
    const closed = commentsHtml(view({ page, state: "closed" }));
    expect(closed).toContain("Comments are closed.");
    expect(closed).not.toContain("comment-form");
    expect(closed).not.toContain("<script");
    expect(closed).not.toContain("data-reply=");
    expect(closed).toContain("cmt_top0000001");
    expect(commentsHtml(view({ page, state: "hidden" }))).toBe("");
    expect(commentsHtml(view({ page, state: "off" }))).toBe("");
    expect(commentsHtml(undefined)).toBe("");
    const preview = commentsHtml(view({ state: "preview" }));
    expect(preview).toContain("Comments appear on the published page.");
    expect(preview).not.toContain("<form");
  });

  it("speaks Turkish for Turkish entries and notes the JavaScript requirement when set", () => {
    const html = commentsHtml(view({ locale: "tr", allowWithoutScript: false }));
    expect(html).toContain("Yorumlar");
    expect(html).toContain("Yorumu gönder");
    expect(html).toContain("<noscript>");
    expect(commentStrings("tr-TR").reply).toBe("Yanıtla");
    expect(commentStrings("de").reply).toBe("Reply");
  });

  it("carries the Turnstile site key only when the site uses Turnstile", () => {
    const html = commentsHtml(view({ protection: "turnstile", turnstileSiteKey: "0x4AAAA-key" }));
    expect(html).toContain('data-protection="turnstile" data-sitekey="0x4AAAA-key"');
    expect(commentsHtml(view())).not.toContain("data-sitekey");
  });

  it("gives the article's JSON-LD the comment count and the first comments", () => {
    const ld = commentsJsonLd(view({ page }), "https://news.example");
    expect(ld?.commentCount).toBe(4);
    expect(ld?.comment).toHaveLength(4);
    expect(ld?.comment?.[0]).toMatchObject({
      "@type": "Comment",
      url: "https://news.example/posts/ferries#comment-cmt_top0000001",
    });
    expect(commentsJsonLd(view({ page, state: "hidden" }), "https://x")).toBeUndefined();
  });

  it("widens the CSP for Turnstile only by its origin", () => {
    const csp = turnstileCsp();
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com;");
    expect(
      csp
        .replace(" https://challenges.cloudflare.com", "")
        .replace("frame-src https://challenges.cloudflare.com; ", ""),
    ).toBe(SITE_CSP);
  });
});

// ───────────────────────────── the page loader (Node runtime) ─────────────────────────────

describe("loadComments on the Node runtime", () => {
  let dir: string;
  let comments: SqlCommentStore;
  let close: () => Promise<void>;
  const siteId = "site_loader01";
  const published = "2026-10-01T00:00:00.000Z";
  const now = new Date("2026-10-12T12:00:00.000Z");
  const entry = {
    id: "entry_loader01",
    siteId,
    collection: "posts",
    slug: "ferries",
    locale: "en",
    status: "published",
    publishedAt: published,
  } as ContentEntry;
  const config = () => ({
    dataDir: dir,
    siteId,
    commentsScript: "/_cloudhal/c.0123abcd.js",
  });
  const astro = (search = "", mode = "published") => {
    const headers = new Headers({ "cache-tag": `cloudhal-site-${siteId}` });
    if (mode) headers.set("x-cloudhal-mode", mode);
    const url = new URL(`https://news.example/posts/ferries${search}`);
    return { request: new Request(url), url, response: { headers } };
  };

  async function approved(text: string, parentId?: string): Promise<string> {
    const id = newCommentsId("cmt");
    const input: PreparedSubmission = {
      id,
      nodeId: entry.id,
      ...(parentId ? { parentId } : {}),
      name: "Reader",
      text,
      status: "pending",
      labels: [],
      ipHmac: null,
      challengeId: null,
      proof: "pow",
      createdAt: new Date().toISOString(),
    };
    await comments.submit(siteId, input);
    const [r] = await comments.moderate(siteId, {
      ids: [id],
      action: "approve",
      actor: editor,
      expectedRevs: { [id]: 1 },
    });
    expect(r?.ok).toBe(true);
    return id;
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-comments-loader-"));
    const local = await openLocalStore(dir);
    comments = new SqlCommentStore(local.sql);
    close = () => local.close();
  });

  afterAll(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  it("is off without the built module or with comments.available false", async () => {
    expect(await loadComments({ dataDir: dir, siteId }, astro(), entry, { now })).toBeUndefined();
    expect(
      await loadComments({ ...config(), comments: { available: false } }, astro(), entry, { now }),
    ).toBeUndefined();
  });

  it("tags the response, and renders nothing while the site has comments off", async () => {
    const a = astro();
    const v = await loadComments(config(), a, entry, { now });
    expect(a.response.headers.get("cache-tag")).toBe(
      `cloudhal-site-${siteId},cloudhal-comments-${entry.id}`,
    );
    expect(v?.state).toBe("off");
    expect(commentsHtml(v)).toBe("");
  });

  it("shows a placeholder in previews and for drafts, reading nothing", async () => {
    expect((await loadComments(config(), astro("", "preview"), entry, { now }))?.state).toBe(
      "preview",
    );
    const draft = { ...entry, status: "draft" } as ContentEntry;
    expect((await loadComments(config(), astro("", ""), draft, { now }))?.state).toBe("preview");
  });

  it("reads one page of approved comments of an open thread and 404s pages that do not exist", async () => {
    await comments.putSettings(
      siteId,
      { enabled: true, collections: { posts: { enabled: true } } },
      0,
      editor.id,
    );
    const first = await approved("First!");
    await approved("A reply", first);
    const v = await loadComments(config(), astro(), entry, { now });
    expect(v?.state).toBe("open");
    expect(v?.page?.total).toBe(2);
    expect(v?.notFound).toBe(false);
    expect(commentsHtml(v)).toContain("First!");
    expect((await loadComments(config(), astro("?comments=2"), entry, { now }))?.notFound).toBe(
      true,
    );
    expect((await loadComments(config(), astro("?comments=x"), entry, { now }))?.notFound).toBe(
      true,
    );
    expect(commentsPageParam(new URL("https://x/?comments=007"))).toBeUndefined();
    // 90 days after first publication the thread is closed (the default close)
    const later = new Date("2027-01-15T00:00:00.000Z");
    expect((await loadComments(config(), astro(), entry, { now: later }))?.state).toBe("closed");
  });

  it("sets the page's own CSP only for an open Turnstile form", async () => {
    await comments.putSettings(
      siteId,
      { protection: "turnstile", turnstileSiteKey: "0x4AAAA-key" },
      1,
      editor.id,
    );
    const open = astro();
    await loadComments(config(), open, entry, { now });
    expect(open.response.headers.get("content-security-policy")).toBe(turnstileCsp());
    const closed = astro();
    await loadComments(config(), closed, entry, { now: new Date("2027-02-01T00:00:00Z") });
    expect(closed.response.headers.get("content-security-policy")).toBeNull();
  });

  it("keeps a local comments key in the data directory unless the environment has one", async () => {
    const key = await localCommentsKey(dir, {});
    expect(usableCommentsKey(key)).toBe(true);
    expect(await localCommentsKey(dir, {})).toBe(key);
    expect((await readFile(path.join(dir, "comments.key"), "utf8")).trim()).toBe(key);
    expect(await localCommentsKey(dir, { CLOUDHAL_COMMENTS_KEY: KEY })).toBe(KEY);
  });
});

// ───────────────────────────── the endpoints (SiteComments on SQLite) ─────────────────────────────

describe("SiteComments endpoints on SQLite", () => {
  const HOST = "news.example";
  let sql: SqlDriver;
  let graph: SiteGraphStore;
  let site: Site;
  let hello: ContentEntry;
  let draft: ContentEntry;
  let comments: SqlCommentStore;
  let clock: Date;
  let siteverify: { body?: FormData; answer: Record<string, unknown> };

  const make = (o: Partial<ConstructorParameters<typeof SiteComments>[0]> = {}) =>
    new SiteComments({
      siteId: site.id,
      secret: KEY,
      available: true,
      store: async () => comments,
      site: () => graph.getSite(site.id),
      snapshot: (id) => SnapshotSource.open(graph, id),
      hosts: [HOST],
      now: () => clock,
      fetch: (async (_url: string, init: { body: FormData }) => {
        siteverify.body = init.body;
        return Response.json(siteverify.answer);
      }) as unknown as typeof fetch,
      ...o,
    });

  const post = (
    body: Record<string, string>,
    o: { form?: boolean; headers?: Record<string, string>; path?: string } = {},
  ) =>
    new Request(`https://${HOST}${o.path ?? "/__cloudhal/comments"}`, {
      method: "POST",
      headers: {
        "content-type": o.form ? "application/x-www-form-urlencoded" : "application/json",
        host: HOST,
        "sec-fetch-site": "same-origin",
        ...o.headers,
      },
      body: o.form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    });

  const solved = async (target = hello.id) => {
    const keys = await deriveCommentKeys(KEY);
    const c = await issueChallenge(keys.pow, {
      siteId: site.id,
      target,
      kind: "comment",
      bits: 4,
      now: new Date(clock.getTime() - 5000),
    });
    return { challenge: c.challenge, solution: await solveChallenge(c.challenge) };
  };

  const stored = async () =>
    (await comments.list(site.id, { status: "pending", limit: 50 })).comments;

  beforeEach(async () => {
    sql = await BetterSqlite3Driver.open(":memory:");
    graph = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await graph.init();
    site = await seedStarterSite(graph, { name: "News", slug: "news" });
    const snap = await graph.createSnapshot(site.id, { actor: editor, reason: "publish" });
    await graph.publish((await graph.getSite(site.id)) as Site, snap.id);
    hello = (await graph.listContentEntries(site.id)).find(
      (e) => e.slug === "hello-world",
    ) as ContentEntry;
    draft = await graph.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "secret-draft",
      locale: "en",
      status: "draft",
      title: "Secret draft",
      summary: "Not yet.",
      body: { format: "markdown", value: "Draft." },
      fields: {},
      tags: [],
      author: editor,
    } as never);
    comments = new SqlCommentStore(sql);
    await comments.putSettings(
      site.id,
      { enabled: true, collections: { posts: { enabled: true } } },
      0,
      editor.id,
    );
    clock = new Date(Date.parse(hello.publishedAt as string) + 86_400_000);
    siteverify = { answer: {} };
  });

  it("answers 404 for every endpoint without a usable key (comments off, no crash)", async () => {
    for (const secret of [undefined, "too-short"]) {
      const c = make({ secret });
      expect(c.available).toBe(false);
      const res = (await c.handle(
        post({ nodeId: hello.id, name: "A", body: "Hello" }),
      )) as Response;
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(await make().handle(new Request(`https://${HOST}/posts/hello-world`))).toBeUndefined();
  });

  it("issues challenges only for published entries with open threads, no-store", async () => {
    const c = make();
    const ok = (await c.handle(
      new Request(`https://${HOST}/__cloudhal/comments/challenge?node=${hello.id}&for=comment`),
      { clientAddress: "198.51.100.1" },
    )) as Response;
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(await ok.json()).toMatchObject({ bits: 18 });
    const forDraft = (await c.handle(
      new Request(`https://${HOST}/__cloudhal/comments/challenge?node=${draft.id}&for=comment`),
    )) as Response;
    expect(forDraft.status).toBe(404);
  });

  it("stores a JavaScript-less form post as pending and redirects to the cached article", async () => {
    const res = (await make().handle(
      post({ nodeId: hello.id, name: "Reader", body: "A thoughtful comment." }, { form: true }),
      { clientAddress: "198.51.100.2" },
    )) as Response;
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/posts/hello-world#comment-pending");
    const [c] = await stored();
    expect(c).toMatchObject({ nodeId: hello.id, status: "pending" });
    expect(c?.body?.text).toBe("A thoughtful comment.");
  });

  it("stores nothing for cross-site posts, the honeypot, a replayed challenge or a draft", async () => {
    const c = make();
    const proof = await solved();
    const cross = (await c.handle(
      post(
        { nodeId: hello.id, name: "A", body: "Cross-site", ...proof },
        { headers: { "sec-fetch-site": "cross-site" } },
      ),
    )) as Response;
    expect(cross.status).toBe(403);
    const honeypot = (await c.handle(
      post({ nodeId: hello.id, name: "Bot", body: "Buy now", website: "https://spam", ...proof }),
    )) as Response;
    expect(honeypot.status).toBe(200);
    expect(await honeypot.json()).toEqual({ status: "pending" });
    const first = (await c.handle(
      post({ nodeId: hello.id, name: "A", body: "First use", ...proof }),
      { clientAddress: "198.51.100.3" },
    )) as Response;
    expect(first.status).toBe(200);
    const replay = (await c.handle(
      post({ nodeId: hello.id, name: "A", body: "Second use", ...proof }),
      { clientAddress: "198.51.100.4" },
    )) as Response;
    expect(replay.status).toBe(200);
    const forDraft = (await c.handle(
      post({ nodeId: draft.id, name: "A", body: "On a draft", ...(await solved(draft.id)) }),
    )) as Response;
    expect(forDraft.status).toBe(404);
    expect((await stored()).map((s) => s.body?.text)).toEqual(["First use"]);
  });

  it("checks Turnstile with siteverify: the site's hostname and the action, fail closed", async () => {
    await comments.putSettings(
      site.id,
      { protection: "turnstile", turnstileSiteKey: "0x4AAAA-key" },
      1,
      editor.id,
    );
    const keys = await deriveCommentKeys(KEY);
    const c = make();
    // no secret stored yet: siteverify cannot be called → 503 try_again
    const noSecret = (await c.handle(
      post({ nodeId: hello.id, name: "A", body: "Hello there", turnstileToken: "tok-1" }),
    )) as Response;
    expect(noSecret.status).toBe(503);
    await comments.putSecret(site.id, "turnstile-secret", "owner-widget-secret", keys, editor.id);
    siteverify.answer = { success: true, hostname: "evil.example", action: "comment" };
    const wrongHost = (await c.handle(
      post({ nodeId: hello.id, name: "A", body: "Hello there", turnstileToken: "tok-2" }),
    )) as Response;
    expect(wrongHost.status).toBe(403);
    expect(siteverify.body?.get("secret")).toBe("owner-widget-secret");
    expect(siteverify.body?.get("response")).toBe("tok-2");
    siteverify.answer = { success: true, hostname: HOST, action: "report" };
    expect(
      (
        (await c.handle(
          post({ nodeId: hello.id, name: "A", body: "Hello there", turnstileToken: "tok-3" }),
        )) as Response
      ).status,
    ).toBe(403);
    siteverify.answer = { success: true, hostname: HOST, action: "comment" };
    const ok = (await c.handle(
      post({ nodeId: hello.id, name: "A", body: "Hello there", turnstileToken: "tok-4" }),
      { clientAddress: "198.51.100.9" },
    )) as Response;
    expect(ok.status).toBe(200);
    const [s] = await stored();
    expect(s?.body?.text).toBe("Hello there");
    expect(siteverify.body?.get("remoteip")).toBe("198.51.100.9");
  });

  it("uses the client network for IP hashes, never a forwarded header", async () => {
    const c = make();
    await c.handle(
      post(
        { nodeId: hello.id, name: "A", body: "Who am I?", ...(await solved()) },
        { headers: { "x-forwarded-for": "203.0.113.99", "cf-connecting-ip": "203.0.113.98" } },
      ),
      { clientAddress: "198.51.100.77" },
    );
    const row = await sql.get<{ ip_hmac: string }>("SELECT ip_hmac FROM comments LIMIT 1");
    const salt = await comments.readSalt(clock.toISOString().slice(0, 7));
    expect(salt).toBeDefined();
    expect(row?.ip_hmac).toBe(await ipHmac(salt as string, site.id, "198.51.100.77"));
    expect(row?.ip_hmac).not.toBe(await ipHmac(salt as string, site.id, "203.0.113.98"));
    expect(randomSalt()).toMatch(/^[0-9a-f]{64}$/);
  });
});
