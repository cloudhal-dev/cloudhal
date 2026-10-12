/**
 * RFC-0007 rollout step 4 on real workerd (wrangler's test harness): reader comments on the Site
 * Worker. The edge cache is modelled in front of the Worker (as in `cloudflare.test.ts`): 200s with
 * a Cache-Tag stay until a purge names one of their tags.
 *
 * The whole loop: a reader submits (a real challenge from the endpoint, solved, posted as JSON) →
 * the comment waits as `pending` and the cached page does not change → a person approves it
 * through the store (what Studio/REST will do, steps 5–6) → the purge queue's tag goes through the
 * site Worker's own `/__cloudhal/purge` → the article shows the comment. And the acceptance
 * checks of §Compatibility: a JavaScript-less post arrives as pending; a cross-site post, a filled
 * honeypot, a replayed challenge and a draft entry's id store nothing; a closed thread refuses.
 */
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  type CommentKeys,
  deriveCommentKeys,
  issueChallenge,
  planPurge,
  solveChallenge,
} from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { ContentEntry } from "@cloudhal/core-contracts";
import { copySite, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import { siteConfigPath, siteWorkerConfig, writeWranglerConfig } from "../src/cloudflare/config.ts";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const PREVIEW_SECRET = "comments-test-preview-secret-32-bytes!!";
const PURGE_TOKEN = "comments-test-purge-token";
const COMMENTS_KEY = "comments-test-deployment-key-not-a-secret-0";
const HOST = "edge.example";
const human = { kind: "human" as const, id: "user_cfcomment01", name: "Halil" };

describe("Site Worker reader comments on workerd (RFC-0007 step 4)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let harness: ReturnType<typeof createTestHarness>;
  let remote: SiteGraphStore;
  let sql: D1Driver;
  let comments: SqlCommentStore;
  let keys: CommentKeys;
  let hello: ContentEntry;
  let draft: ContentEntry;
  let ip = 10;
  /** A fresh client address per submission (the isolate allows 3 a minute per client). */
  const nextIp = () => `198.51.100.${ip++}`;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-cf-comments-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Talking Site" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await snapshot({ projectDir, label: "local v1", publish: true });
    const base = siteWorkerConfig({
      name: "comments-test",
      siteId,
      databaseId: "00000000-0000-0000-0000-0000000c0de7",
    });
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      { ...base, vars: { ...base.vars, CLOUDHAL_SITE_HOSTS: HOST } },
      "test",
    );
    const config = await buildSiteWorker(projectDir);
    harness = createTestHarness({
      root: projectDir,
      workers: [
        {
          configPath: config,
          // What `cloudhal deploy` will provide (rollout step 10): the comments key secret.
          secrets: {
            CLOUDHAL_PREVIEW_SECRET: PREVIEW_SECRET,
            CLOUDHAL_PURGE_TOKEN: PURGE_TOKEN,
            CLOUDHAL_COMMENTS_KEY: COMMENTS_KEY,
          },
        },
      ],
    });
    await harness.listen();
    const env = (await harness.getWorker().getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    sql = new D1Driver(env.DB);
    const target = { sql, blobs: new R2BlobStore(env.BLOBS) };
    await migrate(sql, migrations);
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await copySite(local, target, siteId);
    await local.close();
    remote = new SiteGraphStore(target);
    comments = new SqlCommentStore(sql);
    keys = await deriveCommentKeys(COMMENTS_KEY);
    hello = (await remote.listContentEntries(siteId)).find(
      (e) => e.slug === "hello-world",
    ) as ContentEntry;
    draft = await remote.createContentEntry({
      siteId,
      collection: "posts",
      slug: "unpublished-scoop",
      locale: "en",
      status: "draft",
      title: "Scoop",
      summary: "Not yet.",
      body: { format: "markdown", value: "Draft." },
      fields: {},
      tags: [],
      author: human,
    } as never);
  });

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const get = (p: string, init?: Parameters<typeof harness.fetch>[1]) =>
    harness.getWorker().fetch(`https://${HOST}${p}`, init) as unknown as Promise<Response>;
  /** Static assets answer before the Worker runs (through the server, not the Worker handle). */
  const asset = (p: string) => harness.fetch(`https://${HOST}${p}`) as unknown as Promise<Response>;

  /** Cloudflare's edge cache in front of the Worker. */
  const edge = new Map<string, { tags: string[]; html: string }>();
  const fromEdge = async (p: string) => {
    const hit = edge.get(p);
    if (hit) return { ...hit, hit: true };
    const res = await get(p);
    const html = await res.text();
    const tags = (res.headers.get("cache-tag") ?? "").split(",").filter(Boolean);
    if (res.status === 200 && res.headers.get("cloudflare-cdn-cache-control") !== "no-store")
      edge.set(p, { tags, html });
    return { tags, html, hit: false };
  };
  const purge = async (tags?: string[]) => {
    const res = await get("/__cloudhal/purge", {
      method: "POST",
      headers: {
        authorization: `Bearer ${PURGE_TOKEN}`,
        ...(tags ? { "content-type": "application/json" } : {}),
      },
      ...(tags ? { body: JSON.stringify({ tags }) } : {}),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    if (!tags) edge.clear();
    else for (const [p, v] of edge) if (v.tags.some((t) => tags.includes(t))) edge.delete(p);
    return res;
  };
  /** What step 5's flusher will do: plan the queue against the budget and purge through SITE. */
  const flush = async (at = new Date(Date.now() + 25_000)) => {
    const plan = planPurge({
      rows: await comments.purgeQueue.queued(siteId),
      recent: await comments.purgeQueue.recent(at),
      now: at,
    });
    for (const request of plan.requests) {
      await purge([...request.tags]);
      await comments.purgeQueue.sent(siteId, request.tags, at);
    }
    return plan.requests.flatMap((r) => r.tags);
  };

  const post = (
    body: Record<string, string>,
    o: { form?: boolean; headers?: Record<string, string>; path?: string } = {},
  ) =>
    get(o.path ?? "/__cloudhal/comments", {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": o.form ? "application/x-www-form-urlencoded" : "application/json",
        "sec-fetch-site": "same-origin",
        "cf-connecting-ip": nextIp(),
        ...o.headers,
      },
      body: o.form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    });
  /** A solved challenge minted with the deployment key, issued 10 s ago (cheap: 4 bits). */
  const minted = async (target = hello.id, kind: "comment" | "report" = "comment") => {
    const c = await issueChallenge(keys.pow, {
      siteId,
      target,
      kind,
      bits: 4,
      now: new Date(Date.now() - 10_000),
    });
    return { challenge: c.challenge, solution: await solveChallenge(c.challenge) };
  };
  const count = async (where = "1 = 1") =>
    Number(
      (await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM comments WHERE ${where}`))?.n ?? 0,
    );
  const commentsTag = () => `cloudhal-comments-${hello.id}`;

  it("tags entry pages but shows and accepts nothing while the site has comments off", async () => {
    const res = await get("/posts/hello-world");
    const html = await res.text();
    expect(res.status, html.slice(0, 300)).toBe(200);
    expect(res.headers.get("cache-tag")?.split(",")).toContain(commentsTag());
    expect(html).not.toContain("data-cloudhal-comments");
    expect(html).not.toContain("/_cloudhal/c.");
    // pages that are not entries carry no comments tag
    expect((await get("/about")).headers.get("cache-tag")).not.toContain("cloudhal-comments-");
    const challenge = await get(`/__cloudhal/comments/challenge?node=${hello.id}&for=comment`);
    expect(challenge.status).toBe(404);
    expect(challenge.headers.get("cache-control")).toBe("no-store");
    expect((await post({ nodeId: hello.id, name: "A", body: "Too early" })).status).toBe(404);
    expect(await count()).toBe(0);
  });

  it("renders the form and the module on open threads; the module and worker are static assets", async () => {
    await comments.putSettings(
      siteId,
      { enabled: true, collections: { posts: { enabled: true } } },
      0,
      human.id,
    );
    await purge(); // a settings change purges (step 5 will enqueue the collection's tags)
    const res = await get("/posts/hello-world");
    const html = await res.text();
    expect(html).toContain('data-cloudhal-comments data-state="open"');
    expect(html).toContain('action="/__cloudhal/comments"');
    expect(html).toContain(`<input type="hidden" name="nodeId" value="${hello.id}">`);
    // the CSP is unchanged: first-party scripts only
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain("challenges.cloudflare.com");
    const module = html.match(
      /<script type="module" src="(\/_cloudhal\/c\.[0-9a-f]{8}\.js)">/,
    )?.[1];
    expect(module).toBeDefined();
    const code = await (await asset(module as string)).text();
    expect(gzipSync(code).byteLength).toBeLessThanOrEqual(4096);
    const worker = code.match(/\/_cloudhal\/cw\.[0-9a-f]{8}\.js/)?.[0];
    const solver = await asset(worker as string);
    expect(solver.status).toBe(200);
    expect(solver.headers.get("content-type")).toContain("javascript");
    expect(gzipSync(await solver.text()).byteLength).toBeLessThanOrEqual(1024);
  });

  it("submit → pending → approve → purge → the comment is on the cached page", async () => {
    const before = await fromEdge("/posts/hello-world");
    expect(before.tags).toContain(commentsTag());
    // a real challenge from the endpoint, never cached, solved as the worker would
    const address = nextIp();
    const issued = await get(`/__cloudhal/comments/challenge?node=${hello.id}&for=comment`, {
      headers: { "cf-connecting-ip": address },
    });
    expect(issued.status).toBe(200);
    expect(issued.headers.get("cache-control")).toBe("no-store");
    const at = Date.now();
    const { challenge, bits } = (await issued.json()) as { challenge: string; bits: number };
    expect(bits).toBe(18);
    const solution = await solveChallenge(challenge);
    // the server drops solutions sooner than 3 s after issue
    await new Promise((r) => setTimeout(r, Math.max(0, at + 3200 - Date.now())));
    const res = await post(
      {
        nodeId: hello.id,
        name: "Mehmet",
        email: "mehmet@example.org",
        body: "Great read — see https://example.org/ferries and <b>this</b>.",
        challenge,
        solution,
      },
      { headers: { "cf-connecting-ip": address } },
    );
    expect(res.status, await res.clone().text()).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "pending" });
    const [pending] = (await comments.list(siteId, { status: "pending", limit: 10 })).comments;
    expect(pending).toMatchObject({ nodeId: hello.id, status: "pending" });
    // the cached page does not change for a pending comment
    expect((await fromEdge("/posts/hello-world")).hit).toBe(true);
    // the address itself is never stored; the email only encrypted
    const row = await sql.get<Record<string, unknown>>("SELECT * FROM comments WHERE id = ?", [
      pending?.id as string,
    ]);
    expect(JSON.stringify(row)).not.toContain(address);
    expect(JSON.stringify(await sql.all("SELECT * FROM commenter_emails"))).not.toContain(
      "mehmet@",
    );

    // a person approves it (Studio/REST, steps 5–6): the tag joins the purge queue
    const [result] = await comments.moderate(siteId, {
      ids: [pending?.id as string],
      action: "approve",
      actor: human,
      expectedRevs: { [pending?.id as string]: pending?.rev as number },
    });
    expect(result).toMatchObject({ ok: true, status: "approved" });
    expect((await comments.purgeQueue.queued(siteId)).map((r) => r.tag)).toEqual([commentsTag()]);
    expect(await flush()).toEqual([commentsTag()]);
    expect(await comments.purgeQueue.queued(siteId)).toEqual([]);

    const after = await fromEdge("/posts/hello-world");
    expect(after.hit).toBe(false);
    expect(after.html).toContain(`id="comment-${pending?.id}"`);
    expect(after.html).toContain(">Mehmet</strong>");
    expect(after.html).toContain(
      '<a href="https://example.org/ferries" rel="ugc nofollow noopener noreferrer">',
    );
    expect(after.html).toContain("&lt;b&gt;this&lt;/b&gt;");
    expect(after.html).not.toContain("mehmet@example.org");
    expect(after.html).toContain('"commentCount":1');
    // other pages stayed cached: only the article's comments tag was purged
    expect(after.tags).toContain(commentsTag());
  });

  it("stores a JavaScript-less form post as pending and redirects to the cached article", async () => {
    const before = await count();
    const res = await post(
      { nodeId: hello.id, name: "No Script", body: "Posted without JavaScript." },
      { form: true },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/posts/hello-world#comment-pending");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await count()).toBe(before + 1);
    expect(await count("proof = 'none'")).toBe(1);
  });

  it("stores nothing for a cross-site post, a filled honeypot, a replayed challenge or a draft", async () => {
    const before = await count();
    // another site's page posting (the browser says cross-site; or only a foreign Origin)
    const cross = await post(
      { nodeId: hello.id, name: "A", body: "Forged", ...(await minted()) },
      { headers: { "sec-fetch-site": "cross-site" } },
    );
    expect(cross.status).toBe(403);
    const foreign = await get("/__cloudhal/comments", {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.example",
        "cf-connecting-ip": nextIp(),
      },
      body: new URLSearchParams({ nodeId: hello.id, name: "A", body: "Forged" }).toString(),
    });
    expect(foreign.status).toBe(403);
    // the honeypot: answered exactly like a stored comment
    const bot = await post({
      nodeId: hello.id,
      name: "Bot",
      body: "Cheap watches",
      website: "https://spam.example",
      ...(await minted()),
    });
    expect(bot.status).toBe(200);
    expect(await bot.json()).toEqual({ status: "pending" });
    const botForm = await post(
      { nodeId: hello.id, name: "Bot", body: "Cheap watches", website: "x" },
      { form: true },
    );
    expect(botForm.headers.get("location")).toBe("/posts/hello-world#comment-pending");
    // a solved challenge is single use
    const proof = await minted();
    expect((await post({ nodeId: hello.id, name: "A", body: "First use", ...proof })).status).toBe(
      200,
    );
    const replay = await post({ nodeId: hello.id, name: "B", body: "Second use", ...proof });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ status: "pending" });
    // a draft's id: not a published entry
    const onDraft = await post({
      nodeId: draft.id,
      name: "A",
      body: "On a draft",
      ...(await minted(draft.id)),
    });
    expect(onDraft.status).toBe(404);
    expect((await get(`/__cloudhal/comments/challenge?node=${draft.id}&for=comment`)).status).toBe(
      404,
    );
    expect(await count()).toBe(before + 1);
    expect(await count("body = 'Second use' OR body = 'Forged' OR body = 'Cheap watches'")).toBe(0);
  });

  it("takes reports of approved comments without changing them", async () => {
    const [approved] = (await comments.list(siteId, { status: "approved", limit: 10 })).comments;
    const res = await post(
      {
        commentId: approved?.id as string,
        reason: "spam",
        details: "Looks like an ad.",
        ...(await minted(approved?.id as string, "report")),
      },
      { path: "/__cloudhal/comments/report" },
    );
    expect(res.status, await res.clone().text()).toBe(200);
    const reports = await sql.all<{ comment_id: string; reason: string }>(
      "SELECT comment_id, reason FROM comment_reports",
    );
    expect(reports).toEqual([{ comment_id: approved?.id, reason: "spam" }]);
    expect((await comments.get(siteId, approved?.id as string))?.status).toBe("approved");
    // a JavaScript-less report lands on the reported note
    const form = await post(
      { commentId: approved?.id as string, reason: "other" },
      { form: true, path: "/__cloudhal/comments/report" },
    );
    expect(form.headers.get("location")).toBe("/posts/hello-world#comment-reported");
  });

  it("a closed thread refuses new comments and the page says so after the purge", async () => {
    await comments.putThread(siteId, hello.id, { mode: "closed" }, 0, human.id);
    await flush(); // closing enqueues the thread's tag
    const before = await count();
    const json = await post({
      nodeId: hello.id,
      name: "Late",
      body: "Too late",
      ...(await minted()),
    });
    expect(json.status).toBe(403);
    expect(await json.json()).toEqual({ error: "closed" });
    const form = await post({ nodeId: hello.id, name: "Late", body: "Too late" }, { form: true });
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe("/posts/hello-world#comment-closed");
    expect(await count()).toBe(before);
    const page = await fromEdge("/posts/hello-world");
    expect(page.hit).toBe(false);
    expect(page.html).toContain("Comments are closed.");
    expect(page.html).toContain(">Mehmet</strong>");
    expect(page.html).not.toContain('action="/__cloudhal/comments"');
    expect(page.html).not.toContain("/_cloudhal/c.");
    expect((await get(`/__cloudhal/comments/challenge?node=${hello.id}&for=comment`)).status).toBe(
      404,
    );
  });

  it("widens the CSP for Turnstile only on pages with an open form", async () => {
    const thread = await comments.thread(siteId, hello.id);
    await comments.putThread(
      siteId,
      hello.id,
      { mode: "default" },
      thread?.rev as number,
      human.id,
    );
    const settings = await comments.settings(siteId);
    await comments.putSettings(
      siteId,
      { protection: "turnstile", turnstileSiteKey: "0x4AAAAAAAtest" },
      settings.rev,
      human.id,
    );
    await purge();
    const article = await get("/posts/hello-world");
    const html = await article.text();
    expect(html).toContain('data-protection="turnstile" data-sitekey="0x4AAAAAAAtest"');
    const csp = article.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com;");
    expect(csp).toContain("form-action 'self'");
    const about = await get("/about");
    expect(about.headers.get("content-security-policy")).not.toContain("challenges.cloudflare.com");
    // without a stored Turnstile secret, a Turnstile post fails closed (siteverify is never asked)
    const res = await post({
      nodeId: hello.id,
      name: "A",
      body: "Hello there",
      turnstileToken: "t",
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "try_again" });
  });
});
