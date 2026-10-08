/**
 * Sprint 6: the Site Worker on real workerd (wrangler's test harness) against local D1 + R2.
 * Publishing and rollback are pointer flips seen by the next request; drafts stay invisible
 * except behind a signed preview link; the purge endpoint is authenticated. RFC-0002: archives,
 * term feeds and redirects answer with real status codes, and responses carry per-node cache tags.
 */
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copySite, mintPreviewToken, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import { siteConfigPath, siteWorkerConfig, writeWranglerConfig } from "../src/cloudflare/config.ts";
import { init, readProjectConfig, snapshot } from "../src/index.ts";
import { applyTaxonomyFixture } from "./taxonomy-fixture.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const PREVIEW_SECRET = "site-worker-test-preview-secret-32-bytes!";
const PURGE_TOKEN = "site-worker-test-purge-token";
const human = { kind: "human" as const, id: "user_cftest00001", name: "Halil" };

describe("Site Worker on workerd", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let harness: ReturnType<typeof createTestHarness>;
  let remote: SiteGraphStore;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-cf-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Edge Site" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await snapshot({ projectDir, label: "local v1", publish: true });
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      siteWorkerConfig({
        name: "edge-test",
        siteId,
        databaseId: "00000000-0000-0000-0000-00000000c0de",
      }),
      "test",
    );
    const config = await buildSiteWorker(projectDir);

    harness = createTestHarness({
      root: projectDir,
      workers: [
        {
          configPath: config,
          secrets: { CLOUDHAL_PREVIEW_SECRET: PREVIEW_SECRET, CLOUDHAL_PURGE_TOKEN: PURGE_TOKEN },
        },
      ],
    });
    await harness.listen();
    const env = (await harness.getWorker().getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    const target = { sql: new D1Driver(env.DB), blobs: new R2BlobStore(env.BLOBS) };
    await migrate(target.sql, migrations);
    // `cloudhal push`: the local project (graph + snapshots + blobs) lands in D1/R2.
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await copySite(local, target, siteId);
    await local.close();
    remote = new SiteGraphStore(target);
  });

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const get = (p: string, init?: Parameters<typeof harness.fetch>[1]) =>
    harness.fetch(`https://edge.example${p}`, init);

  it("serves the published snapshot with edge-cache headers", async () => {
    const res = await get("/");
    const html = await res.text();
    expect(res.status, html.slice(0, 500)).toBe(200);
    expect(html).toMatch(/<h1[^>]*>Edge Site<\/h1>/);
    expect(res.headers.get("x-cloudhal-mode")).toBe("published");
    // the site tag first (what publish purges), then one per rendered node (RFC-0002 §7)
    const tags = res.headers.get("cache-tag")?.split(",") ?? [];
    expect(tags[0]).toBe(`cloudhal-site-${siteId}`);
    const home = (await remote.listPages(siteId)).find((p) => p.path === "/");
    expect(tags).toContain(`cloudhal-node-${home?.id}`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    // agent-written content cannot bring scripts: CSP on every HTML response, no inline scripts
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // no inline JavaScript; JSON-LD is a data block (not executed, not subject to script-src)
    expect(html).not.toMatch(/<script(?![^>]*\b(?:src=|type="application\/ld\+json"))[^>]*>/);
    expect(html).toContain('<script type="application/ld+json">');
    expect((await get("/posts/hello-world")).status).toBe(200);
    // feeds and sitemap are served (and edge-cached) like pages
    const rss = await get("/rss.xml");
    expect(rss.status).toBe(200);
    expect(rss.headers.get("content-type")).toContain("application/rss+xml");
    expect(rss.headers.get("cache-tag")).toBe(`cloudhal-site-${siteId}`);
    expect(await rss.text()).toContain("/posts/hello-world</link>");
    const sitemap = await get("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(await sitemap.text()).toContain("/posts/hello-world</loc>");
    expect(await (await get("/robots.txt")).text()).toContain("/sitemap.xml");
    const missing = await get("/nope");
    expect(missing.status).toBe(404);
    // a page that does not exist yet must not stay cached past the publish that creates it
    expect(missing.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  const purge = (token?: string) =>
    get("/__cloudhal/purge", {
      method: "POST",
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });
  const aboutTitle = async (p = "/about") =>
    // "About · Edge Site" → "About"
    (await (await get(p)).text()).match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/ · .*$/, "");

  it("keeps drafts invisible, flips on publish and back on rollback", async () => {
    const v1 = (await remote.getSite(siteId))?.publishedSnapshotId as string;
    const about = (await remote.listPages(siteId)).find((p) => p.path === "/about");
    await remote.updatePage({ ...(about as NonNullable<typeof about>), title: "About (v2)" });
    expect(await aboutTitle()).toBe("About");

    const v2 = await remote.createSnapshot(siteId, {
      actor: human,
      reason: "publish",
      label: "v2",
    });
    await remote.publish(
      (await remote.getSite(siteId)) as NonNullable<Awaited<ReturnType<typeof remote.getSite>>>,
      v2.id,
    );
    expect((await purge(PURGE_TOKEN)).status).toBe(200);
    const after = await get("/about");
    expect(after.headers.get("x-cloudhal-snapshot")).toBe(v2.id);
    expect(await aboutTitle()).toBe("About (v2)");

    await remote.rollback(
      (await remote.getSite(siteId)) as NonNullable<Awaited<ReturnType<typeof remote.getSite>>>,
      v1,
      human,
    );
    await purge(PURGE_TOKEN);
    expect(await aboutTitle()).toBe("About");
    expect((await get("/")).headers.get("x-cloudhal-snapshot")).toBe(v1);
  });

  it("shows drafts behind a signed link and keeps the token on internal links", async () => {
    const about = (await remote.listPages(siteId)).find((p) => p.path === "/about");
    await remote.updatePage({ ...(about as NonNullable<typeof about>), title: "About (draft)" });
    const token = await mintPreviewToken(PREVIEW_SECRET, { site: siteId, target: "live" });
    const res = await get(`/about?cloudhal-preview=${token}`);
    const html = await res.text();
    expect(html).toContain("<title>About (draft) · ");
    expect(res.headers.get("x-cloudhal-mode")).toBe("preview");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-cloudhal-preview-token")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1] as string);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links.filter((h) => !h.startsWith("/_astro/")))
      expect(href).toContain(`cloudhal-preview=${encodeURIComponent(token)}`);
    // without the token: the published version
    expect(await aboutTitle()).toBe("About");
    // a forged token falls back to published and is not cacheable
    const forged = await get(`/about?cloudhal-preview=${token.slice(0, -4)}AAAA`);
    expect(forged.headers.get("x-cloudhal-mode")).toBe("published");
    expect(forged.headers.get("x-cloudhal-preview-error")).toMatch(/signature/);
  });

  it("only lets the admin purge", async () => {
    expect((await purge()).status).toBe(401);
    expect((await purge("wrong")).status).toBe(401);
    expect((await get("/__cloudhal/purge")).status).toBe(405);
    const ok = (await (await purge(PURGE_TOKEN)).json()) as { tag: string };
    expect(ok.tag).toBe(`cloudhal-site-${siteId}`);
    // per-tag purge: only Cloudhal's own tags are accepted
    const byTag = (tags: unknown) =>
      get("/__cloudhal/purge", {
        method: "POST",
        headers: { authorization: `Bearer ${PURGE_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ tags }),
      });
    expect((await byTag(["other-zone-tag"])).status).toBe(400);
    const tagged = (await (await byTag(["cloudhal-term-term_abc123"])).json()) as {
      tags: string[];
    };
    expect(tagged.tags).toEqual(["cloudhal-term-term_abc123"]);
  });

  it("serves archives, term feeds and the sitemap; answers 301/404/410 per RFC-0002", async () => {
    const fx = await applyTaxonomyFixture(remote, siteId);
    const snap = await remote.createSnapshot(siteId, {
      actor: human,
      reason: "publish",
      label: "taxonomy",
    });
    await remote.publish(
      (await remote.getSite(siteId)) as NonNullable<Awaited<ReturnType<typeof remote.getSite>>>,
      snap.id,
    );
    await purge(PURGE_TOKEN);
    const raw = (p: string) => get(p, { redirect: "manual" });

    // an indexable archive with per-term and per-node cache tags
    const news = await raw("/category/news");
    const html = await news.text();
    expect(news.status, html.slice(0, 300)).toBe(200);
    expect(news.headers.get("x-cloudhal-snapshot")).toBe(snap.id);
    expect(html).toContain("<h1>News</h1>");
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('<a href="/category/news/page/2" rel="next">');
    const tags = news.headers.get("cache-tag")?.split(",") ?? [];
    expect(tags).toContain(`cloudhal-site-${siteId}`);
    expect(tags).toContain(`cloudhal-term-${fx.news.id}`);
    expect(tags).toContain(`cloudhal-node-${fx.renamedEntry.id}`);
    expect((await raw("/category/news/page/2/")).status).toBe(200);
    expect((await raw("/category/news/page/9")).status).toBe(404);
    const first = await raw("/category/news/page/1");
    expect(first.status).toBe(301);
    expect(first.headers.get("location")).toBe("/category/news");

    // a thin archive is served with noindex; proposed → 404; retired without redirect → 410
    const thin = await raw("/tag/cloudhal");
    expect(thin.status).toBe(200);
    expect(await thin.text()).toContain('<meta name="robots" content="noindex,follow">');
    const proposed = await raw("/tag/proposed-idea");
    expect(proposed.status).toBe(404);
    expect(proposed.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    const gone = await raw("/tag/old-topic");
    expect(gone.status).toBe(410);
    expect(gone.headers.get("cache-control")).toBe("no-store");

    // slug change and term rename: real 301s, prefix matches carry pagination and the feed along,
    // the query string is kept
    const moved = await raw("/posts/issue-05?utm_source=x");
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("/posts/issue-05-renamed?utm_source=x");
    expect((await raw("/posts/issue-05-renamed")).status).toBe(200);
    const renamed = await raw("/tag/weekly");
    expect(renamed.status).toBe(301);
    expect(renamed.headers.get("location")).toBe("/tag/weekly-digest");
    const paged = await raw("/tag/weekly/page/2/");
    expect(paged.status).toBe(301);
    expect(paged.headers.get("location")).toBe("/tag/weekly-digest/page/2");
    const oldFeed = await raw("/tag/weekly/rss.xml");
    expect(oldFeed.status).toBe(301);
    expect(oldFeed.headers.get("location")).toBe("/tag/weekly-digest/rss.xml");
    expect((await raw("/tag/old-topic/rss.xml")).status).toBe(410);

    // the per-term feed
    const feed = await raw("/tag/weekly-digest/rss.xml");
    expect(feed.status).toBe(200);
    expect(feed.headers.get("content-type")).toContain("application/rss+xml");
    expect(feed.headers.get("cache-tag")).toContain(`cloudhal-term-${fx.weekly.id}`);
    const xml = await feed.text();
    expect(xml).toContain("<title>Weekly · Edge Site</title>");
    expect(xml).toContain("<title>Issue 21</title>");
    expect((await raw("/tag/proposed-idea/rss.xml")).status).toBe(404);

    // sitemap: indexable archives, not the thin one
    const sitemap = await (await raw("/sitemap.xml")).text();
    expect(sitemap).toContain("/category/news</loc>");
    expect(sitemap).toContain("/tag/weekly-digest</loc>");
    expect(sitemap).not.toContain("/tag/cloudhal</loc>");

    // an entry page: its node tag and the tags of the terms it shows
    const post = await raw("/posts/hello-world");
    expect(post.status).toBe(200);
    const postTags = post.headers.get("cache-tag")?.split(",") ?? [];
    const hello = (await remote.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
    expect(postTags).toContain(`cloudhal-node-${hello?.id}`);
    expect(postTags).toContain(`cloudhal-term-${fx.cloudhal.id}`);
    expect(await post.text()).toContain(
      '<a class="ch-chip" href="/category/news" rel="tag">News</a>',
    );
  });
});
