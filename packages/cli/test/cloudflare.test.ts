/**
 * Sprint 6: the Site Worker on real workerd (wrangler's test harness) against local D1 + R2.
 * Publishing and rollback are pointer flips seen by the next request; drafts stay invisible
 * except behind a signed preview link; the purge endpoint is authenticated. RFC-0002: archives,
 * term feeds and redirects answer with real status codes, responses carry per-node cache tags, and
 * a publish purges only the tags of what changed (checked against a model of the edge cache, since
 * local workerd has none).
 * RFC-0003: menus render per request, follow publishes, and hide items whose page is gone.
 */
import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { purgeSiteCache } from "@cloudhal/cloudflare/purge";
import type { Site } from "@cloudhal/core-contracts";
import { copySite, mintPreviewToken, type PublishChange, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { makePng } from "@cloudhal/core-ts/media/fixtures";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import { siteConfigPath, siteWorkerConfig, writeWranglerConfig } from "../src/cloudflare/config.ts";
import { init, readProjectConfig, snapshot } from "../src/index.ts";
import {
  applyMenuFixture,
  DEFAULT_FOOTER,
  derivedHeader,
  footerOf,
  headerOf,
} from "./menu-fixture.ts";
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
  let target: { sql: D1Driver; blobs: R2BlobStore };

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
    target = { sql: new D1Driver(env.DB), blobs: new R2BlobStore(env.BLOBS) };
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
    // the site feed lists every collection: the site's list tag next to the site tag
    expect(rss.headers.get("cache-tag")).toBe(`cloudhal-site-${siteId},cloudhal-list-${siteId}`);
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
    // Links people follow keep the token; `<link>`s (stylesheets, the favicon) are static assets.
    const links = [...html.matchAll(/<a\b[^>]*\shref="(\/[^"]*)"/g)].map((m) => m[1] as string);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links)
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

  it("answers /search and /search.json from the D1 index, never cached, rate-limited per client (RFC-0019 §3, RFC-0029 §5)", async () => {
    const snap = await remote.createSnapshot(siteId, {
      actor: human,
      reason: "publish",
      label: "search",
    });
    await remote.publish((await remote.getSite(siteId)) as NonNullable<Site>, snap.id);
    expect(await remote.searchStatus(siteId)).toMatchObject({ snapshotId: snap.id });
    const client = { headers: { "cf-connecting-ip": "203.0.113.9" } };
    const res = await get("/search?q=hello", client);
    const html = await res.text();
    expect(res.status, html.slice(0, 300)).toBe(200);
    expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(html).toContain('<a href="/posts/hello-world">');
    expect(html).toContain("<mark>");
    expect(html).toContain('<meta name="robots" content="noindex,follow"');
    // RFC-0029 §5: the modal's JSON, from the same index, never cached
    const json = await get("/search.json?q=hello", client);
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(json.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    const body = (await json.json()) as { hits: unknown[] };
    expect(body.hits).toContainEqual(
      expect.objectContaining({ href: "/posts/hello-world", kind: "article" }),
    );
    // a token bucket: a burst of about 30 pages, then 429 (the bucket refills at a token a second,
    // so a slow run gets a few more before it empties)
    let limited: Awaited<ReturnType<typeof get>> | undefined;
    for (let i = 0; i < 45 && !limited; i++) {
      const r = await get("/search?q=hello", client);
      if (r.status === 429) limited = r;
      else await r.arrayBuffer();
    }
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0);
    // the endpoint's own 429 is JSON (it costs one token, so it may get one more answer first)
    let limitedJson: Awaited<ReturnType<typeof get>> | undefined;
    for (let i = 0; i < 5 && !limitedJson; i++) {
      const r = await get("/search.json?q=hello", client);
      if (r.status === 429) limitedJson = r;
      else await r.arrayBuffer();
    }
    expect(await limitedJson?.json()).toEqual({ error: "rate_limited" });
    // another client is not affected
    expect(
      (await get("/search?q=hello", { headers: { "cf-connecting-ip": "198.51.100.4" } })).status,
    ).toBe(200);
  });

  it("renders menus per request, hides an item whose page was deleted, and falls back to the derived header (RFC-0003)", async () => {
    const publishNow = async (label: string) => {
      const snap = await remote.createSnapshot(siteId, { actor: human, reason: "publish", label });
      const site = await remote.getSite(siteId);
      await remote.publish(site as NonNullable<typeof site>, snap.id);
      await purge(PURGE_TOKEN);
      return snap;
    };
    const fx = await applyMenuFixture(remote, siteId);
    const snap = await publishNow("menus");
    const res = await get("/about");
    const html = await res.text();
    expect(res.status, html.slice(0, 300)).toBe(200);
    expect(res.headers.get("x-cloudhal-snapshot")).toBe(snap.id);
    const header = headerOf(html);
    expect(header).toContain(
      '<a href="/about" aria-current="page" class="text-zinc-900">Who we are</a>',
    );
    expect(header).toContain('<a href="/team" class="hover:text-zinc-900">Team</a>');
    // a group in the bar is a popover under its button (RFC-0025 25b)
    expect(header).toContain('popovertarget="ch-sub-2">Topics');
    expect(header).toContain('rel="noopener noreferrer" target="_blank">GitHub</a>');
    expect(footerOf(html)).toContain(">Status</a>");
    // pages that render a menu carry its node tag and the tags of the terms it shows
    const tags = res.headers.get("cache-tag")?.split(",") ?? [];
    expect(tags[0]).toBe(`cloudhal-site-${siteId}`);
    expect(tags).toContain(`cloudhal-node-${fx.primary.id}`);
    expect(tags).toContain(`cloudhal-node-${fx.footer.id}`);
    expect(tags).toContain(`cloudhal-term-${fx.newsTermId}`);

    // the page goes, the menu stays untouched, and the next publish renders without the item
    const site = await remote.getSite(siteId);
    await remote.deletePage(site as NonNullable<typeof site>, fx.team);
    expect((await remote.getMenu(fx.primary.id))?.rev).toBe(0);
    await publishNow("team deleted");
    const after = await (await get("/about")).text();
    expect(headerOf(after)).not.toContain('href="/team"');
    expect(headerOf(after)).toContain(">Who we are</a>");
    expect((await get("/team")).status).toBe(404);

    // no menus: the derived header and footer again
    await remote.deleteMenu(
      (await remote.getMenu(fx.primary.id)) as NonNullable<typeof fx.primary>,
    );
    await remote.deleteMenu(fx.footer);
    await publishNow("menus deleted");
    const derived = await (await get("/about")).text();
    const about = (await remote.listPages(siteId)).find((p) => p.path === "/about");
    expect(headerOf(derived)).toBe(
      derivedHeader(
        "Edge Site",
        [
          { href: "/about", label: about?.title ?? "About", current: true },
          { href: "/category/news", label: "News" },
        ],
        { search: true },
      ),
    );
    expect(footerOf(derived)).toBe(DEFAULT_FOOTER);
  });

  it("purges only what a publish changed: the edited article and its lists, not the site", async () => {
    // A model of Cloudflare's edge cache in front of the Worker: 200s with a Cache-Tag are kept
    // until a purge names one of their tags (case-insensitively) or purges everything.
    const edge = new Map<string, { tags: string[]; html: string }>();
    const fromEdge = async (p: string) => {
      const hit = edge.get(p);
      if (hit) return { ...hit, hit: true };
      const res = await get(p, { redirect: "manual" });
      const html = await res.text();
      const tags = (res.headers.get("cache-tag") ?? "").split(",").filter(Boolean);
      if (res.status === 200 && res.headers.get("cloudflare-cdn-cache-control") !== "no-store")
        edge.set(p, { tags, html });
      return { tags, html, hit: false };
    };
    const sent: { tags?: string[] }[] = [];
    const results: Awaited<ReturnType<typeof purgeSiteCache>>[] = [];
    const admin: SiteGraphStore = new SiteGraphStore({
      ...target,
      // what the admin Worker does after a publish (createAdminWorker → purgeSiteCache)
      onPublished: async (_site, change: PublishChange) => {
        const result = await purgeSiteCache({
          fetch: async (url, init) => {
            const res = await get(new URL(url).pathname, init as never);
            const body = (await res.clone().json()) as { tags?: string[] };
            sent.push(body);
            // the site Worker echoes what it purged; apply it to the edge model
            if (res.ok && body.tags) {
              const purged = new Set(body.tags.map((t) => t.toLowerCase()));
              for (const [p, v] of edge)
                if (v.tags.some((t) => purged.has(t.toLowerCase()))) edge.delete(p);
            } else if (res.ok) edge.clear();
            return res as unknown as Response;
          },
          token: PURGE_TOKEN,
          store: admin,
          change,
        });
        results.push(result);
      },
    });
    const publish = async (label: string) => {
      const snap = await admin.createSnapshot(siteId, { actor: human, reason: "publish", label });
      await admin.publish((await admin.getSite(siteId)) as Site, snap.id);
      return snap;
    };
    // whatever earlier tests left unpublished goes live first, then the cache is warmed
    await publish("baseline");
    edge.clear();
    const hello = (await admin.listContentEntries(siteId)).find(
      (e) => e.slug === "hello-world",
    ) as NonNullable<Awaited<ReturnType<typeof admin.getContentEntry>>>;
    const news = (await admin.getTermBySlug(siteId, "category", "news"))?.id as string;
    const affected = [
      "/posts/hello-world",
      "/category/news",
      "/category/news/page/2",
      "/category/news/rss.xml",
      "/tag/cloudhal",
      "/", // lists the newest posts
      "/rss.xml",
      "/sitemap.xml",
    ];
    const untouched = ["/about", "/posts/issue-03", "/posts/issue-04", "/tag/weekly-digest"];
    for (const p of [...affected, ...untouched]) {
      const first = await fromEdge(p);
      expect(edge.has(p), `${p} should be cacheable`).toBe(true);
      expect(first.hit).toBe(false);
    }
    expect((await fromEdge("/about")).hit).toBe(true);
    // other articles do not link to this one (it is not among their related posts)
    expect((await fromEdge("/posts/issue-03")).tags).not.toContain(`cloudhal-node-${hello.id}`);

    // An editor changes one article's title and publishes.
    await admin.updateContentEntry({ ...hello, title: "Hello, edge" });
    await publish("edit hello");
    const result = results.at(-1);
    expect(result?.mode).toBe("tags");
    expect(result?.tags).toEqual(
      expect.arrayContaining([
        `cloudhal-node-${hello.id}`,
        `cloudhal-list-${news}`,
        `cloudhal-list-${siteId}`,
      ]),
    );
    expect(result?.tags).not.toContain(`cloudhal-site-${siteId}`);
    expect(sent.at(-1)?.tags).toEqual(result?.tags);

    // That article and the archives and lists it appears on are gone from the edge…
    for (const p of affected) expect(edge.has(p), `${p} should have been purged`).toBe(false);
    // …the rest of the site stays cached.
    for (const p of untouched) expect(edge.has(p), `${p} should still be cached`).toBe(true);
    const post = await fromEdge("/posts/hello-world");
    expect(post.hit).toBe(false);
    expect(post.html).toContain("Hello, edge");
    expect((await fromEdge("/category/news")).html).toContain("Hello, edge");
    expect((await fromEdge("/about")).hit).toBe(true);

    // A structural change (a page) purges the site tag: every cached response goes.
    const about = (await admin.listPages(siteId)).find((p) => p.path === "/about");
    await admin.updatePage({ ...(about as NonNullable<typeof about>), title: "About the edge" });
    await publish("edit about");
    expect(results.at(-1)).toMatchObject({ mode: "tags", tags: [`cloudhal-site-${siteId}`] });
    expect(edge.size).toBe(0);
  });

  it("serves media immutably with checksums, renders covers by assetId, and keeps media cached across page publishes (RFC-0004)", async () => {
    const raw = (p: string, init?: Parameters<typeof harness.fetch>[1]) =>
      get(p, { redirect: "manual", ...init });
    const purgeTags = (tags: string[]) =>
      get("/__cloudhal/purge", {
        method: "POST",
        headers: { authorization: `Bearer ${PURGE_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ tags }),
      });
    // An agent's upload (the store path upload_asset runs), used as the hello-world cover.
    const image = makePng({ width: 1600, height: 900 });
    const { asset } = await remote.ingestAsset({
      siteId,
      bytes: image,
      filename: "Harbour at night.png",
      uploadedBy: { kind: "agent", id: "agent_cftest00001", name: "bot" },
      source: { kind: "upload" },
      fields: { alt: { en: "The harbour at night" } },
    });
    const hello = (await remote.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
    if (!hello) throw new Error("no hello-world");
    await remote.updateContentEntry({
      ...hello,
      coverImage: { assetId: asset.id, alt: "" } as NonNullable<typeof hello.coverImage>,
    });
    const snap = await remote.createSnapshot(siteId, { actor: human, reason: "publish" });
    const before = (await remote.getSite(siteId)) as NonNullable<
      Awaited<ReturnType<typeof remote.getSite>>
    >;
    await remote.publish(before, snap.id);
    // What the admin Worker purges after this publish: the article that changed, never the new
    // image's URL (an added asset has nothing cached) and never media through the site tag.
    const plan = await remote.planCachePurge({
      from: before.publishedSnapshotId as string,
      to: snap.id,
    });
    expect(plan.mode).toBe("tags");
    const tags = plan.mode === "tags" ? [...plan.tags] : [];
    expect(tags).toContain(`cloudhal-node-${hello.id}`);
    expect(tags).not.toContain(`cloudhal-asset-${asset.id}`);
    expect((await purgeTags(tags)).status).toBe(200);

    const prefix = asset.sha256.slice(0, 16);
    const path = `/media/${prefix}/harbour-at-night.png`;
    const res = await raw(path);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(image);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=31536000");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("etag")).toBe(`"${asset.sha256}"`);
    expect(res.headers.get("repr-digest")).toBe(
      `sha-256=:${Buffer.from(asset.sha256, "hex").toString("base64")}:`,
    );
    // Media carry their own tags, never the site tag that every publish purges.
    expect(res.headers.get("cache-tag")).toBe(
      `cloudhal-media-${siteId},cloudhal-asset-${asset.id}`,
    );
    const sum = await raw(`${path}.sha256`);
    expect(await sum.text()).toBe(`${asset.sha256}  harbour-at-night.png\n`);
    const part = await raw(path, { headers: { range: "bytes=0-7" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-7/${image.byteLength}`);
    expect(Array.from(new Uint8Array(await part.arrayBuffer()))).toEqual(
      Array.from(image.slice(0, 8)),
    );
    expect((await raw(path, { headers: { "if-none-match": `"${asset.sha256}"` } })).status).toBe(
      304,
    );
    const renamed = await raw(`/media/${prefix}/old-name.png`);
    expect(renamed.status).toBe(301);
    expect(renamed.headers.get("location")).toBe(path);
    expect((await raw("/media/0000000000000000/nothing.png")).status).toBe(404);

    // The article renders its cover from the asset, and social cards use the absolute media URL.
    const html = await (await raw("/posts/hello-world")).text();
    expect(html).toContain(
      `<figure class="ch-cover"><img src="${path}" alt="The harbour at night" width="1600" height="900" loading="eager" decoding="async" fetchpriority="high"></figure>`,
    );
    // (the harness hands the Worker an http:// URL; production origins are https)
    expect(html).toMatch(
      new RegExp(`<meta property="og:image" content="https?://edge\\.example${path}">`),
    );
    expect(html).toContain('<meta property="og:image:width" content="1600">');

    // A draft upload is not public; behind a preview link it is, privately, and links keep the token.
    const draft = await remote.ingestAsset({
      siteId,
      bytes: makePng({ width: 32, height: 32 }),
      filename: "draft.png",
      uploadedBy: human,
      source: { kind: "upload" },
      fields: { decorative: true },
    });
    const draftPath = `/media/${draft.asset.sha256.slice(0, 16)}/draft.png`;
    expect((await raw(draftPath)).status).toBe(404);
    const token = await mintPreviewToken(PREVIEW_SECRET, { site: siteId, target: "live" });
    const previewed = await raw(`${draftPath}?cloudhal-preview=${token}`);
    expect(previewed.status).toBe(200);
    expect(previewed.headers.get("cache-control")).toBe("private, no-store");
    expect(previewed.headers.get("cache-tag")).toBeNull();
    const about = (await remote.listPages(siteId)).find((p) => p.path === "/about");
    await remote.updatePage({
      ...(about as NonNullable<typeof about>),
      sections: [
        ...(about?.sections ?? []),
        {
          id: "sec_about0draftimg",
          kind: "image",
          image: { assetId: draft.asset.id, alt: "" } as never,
        },
      ],
    });
    const previewHtml = await (await raw(`/about?cloudhal-preview=${token}`)).text();
    expect(previewHtml).toContain(
      `src="${draftPath}?cloudhal-preview=${encodeURIComponent(token)}"`,
    );

    // Publishing pages again purges the site tag only; the media URL is untouched (a purge by
    // asset tag is accepted for the media that do change).
    expect(
      (await purgeTags([`cloudhal-site-${siteId}`, `cloudhal-asset-${asset.id}`])).status,
    ).toBe(200);
    // A takedown answers 410 from every snapshot.
    await remote.purgeBlob(siteId, asset.sha256, human, { text: "test takedown", legal: false });
    const gone = await raw(path);
    expect(gone.status).toBe(410);
    expect(gone.headers.get("cache-control")).toBe("no-store");
  });

  it("loads video players on click, and allows their frames only on pages that show one (RFC-0015 §4)", async () => {
    const hello = (await remote.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
    if (!hello) throw new Error("no hello-world post");
    await remote.updateContentEntry({
      ...hello,
      body: {
        format: "markdown",
        value: `${hello.body.value.trimEnd()}\n\n::embed{url="https://youtu.be/aqz-KE-bpKQ" title="Bunny"}\n`,
      },
    });
    const snap = await remote.createSnapshot(siteId, {
      actor: human,
      reason: "publish",
      label: "video",
    });
    await remote.publish(
      (await remote.getSite(siteId)) as NonNullable<Awaited<ReturnType<typeof remote.getSite>>>,
      snap.id,
    );
    await purge(PURGE_TOKEN);
    const post = await get("/posts/hello-world");
    const html = await post.text();
    expect(html).toContain('data-embed-src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"');
    expect(html).not.toContain("<iframe");
    const csp = post.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com https://player.vimeo.com;");
    expect(csp).toContain("script-src 'self';");
    expect(post.headers.get("x-cloudhal-embeds")).toBeNull();
    expect((await get("/about")).headers.get("content-security-policy")).not.toContain("frame-src");
    // the player module is a first-party static asset
    const script = await get("/_cloudhal/embed.1.js");
    expect(script.status).toBe(200);
    expect(await script.text()).toContain("ch-embed__frame");
  });
});
