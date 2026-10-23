import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, init, readProjectConfig, snapshot, writeProjectConfig } from "../src/index.ts";
import {
  applyMenuFixture,
  DEFAULT_FOOTER,
  derivedHeader,
  footerOf,
  headerOf,
  menuOf,
} from "./menu-fixture.ts";
import { applyTaxonomyFixture } from "./taxonomy-fixture.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");

/** Runs `cloudhal dev` as a real child process (Astro disables its dev middleware under Vitest). */
async function spawnDev(
  projectDir: string,
  port: number,
): Promise<{ child: ChildProcess; url: string }> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, "dev", "--port", String(port)], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`cloudhal dev did not start:\n${output}`)),
      60_000,
    );
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const m = output.match(/cloudhal dev → (http:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1] as string);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudhal dev exited with ${code}:\n${output}`));
    });
  });
  return { child, url };
}

/** Runs `cloudhal build` as a child process; resolves when it exits 0. */
async function spawnBuild(projectDir: string): Promise<void> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, "build"], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (c: Buffer) => (output += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (output += c.toString()));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`cloudhal build exited with ${code}:\n${output.slice(-4000)}`);
}

describe("cloudhal init → dev → snapshot → build", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-e2e-"));
    projectDir = path.join(tmp, "my-site");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("init scaffolds the starter and seeds a site", async () => {
    const r = await init({ dir: projectDir, name: "E2E Site" });
    expect(r.siteId).toMatch(/^site_/);
    const cfg = await readProjectConfig(projectDir);
    expect(cfg.siteId).toBe(r.siteId);
    const pkg = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.name).toBe("e2e-site");
    // outside the monorepo workspace: workspace:* links were rewritten
    expect(pkg.dependencies["@cloudhal/astro-renderer"]).not.toMatch(/^workspace:/);
    await expect(init({ dir: projectDir })).rejects.toThrow(/not empty/);
    // Borrow the starter's installed dependencies so Astro can resolve packages in the temp dir.
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
  });

  it("mcp serves the project's tools and skills over stdio", async () => {
    const { VITEST: _v, NODE_ENV: _n, ...env } = process.env as Record<string, string>;
    const client = new Client({ name: "e2e", version: "1.0.0" }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN, "mcp", "--scopes", "site:read,content:read"],
      cwd: projectDir,
      env,
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("preview_page");
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toContain("skill://safe-edit/SKILL.md");
      const cfg = await readProjectConfig(projectDir);
      const sites = await client.callTool({ name: "list_sites", arguments: {} });
      expect((sites.structuredContent as { sites: { id: string }[] }).sites[0]?.id).toBe(
        cfg.siteId,
      );
      // --scopes limited this client to reading
      const denied = await client.callTool({
        name: "create_page",
        arguments: { siteId: cfg.siteId, path: "/nope", title: "Nope" },
      });
      expect(denied.isError).toBe(true);
      expect((denied.content[0] as { text: string }).text).toMatch(
        /denied: missing scope content:write/,
      );
    } finally {
      await client.close();
    }
  });

  it("dev serves live pages and reflects edits without restart", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    try {
      // Vite may answer the very first requests with a transient error page while it
      // (re)optimises dependencies; a browser would just reload. Retry briefly.
      let html = "";
      for (let i = 0; i < 40; i++) {
        const res = await fetch(server.url as string);
        html = await res.text();
        if (res.status === 200 && html.includes("<h1>")) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(
        html,
        html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 600),
      ).toMatch(/<h1[^>]*>E2E Site<\/h1>/); // dev mode adds data-astro-source-* attributes
      expect(html).toContain('href="/posts/hello-world"');

      const cfg = await readProjectConfig(projectDir);
      const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
      const about = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/about");
      await local.store.updatePage({
        ...(about as NonNullable<typeof about>),
        title: "About (edited live)",
      });
      await local.close();

      const edited = await (await fetch(new URL("/about", server.url))).text();
      expect(edited).toContain("<title>About (edited live) · ");
      expect((await fetch(new URL("/nope", server.url))).status).toBe(404);
      // RFC-0042 §5: a collection's feed, answered by the renderer where the theme's routes 404
      const feed = await fetch(new URL("/posts/rss.xml", server.url));
      expect(feed.status).toBe(200);
      expect(feed.headers.get("content-type")).toContain("application/rss+xml");
      expect(await feed.text()).toContain("/posts/hello-world</link>");
      expect((await fetch(new URL("/nope/rss.xml", server.url))).status).toBe(404);
      // the seeded category's archive is served live too (one post: thin, so noindex)
      const archive = await fetch(new URL("/category/news", server.url));
      expect(archive.status).toBe(200);
      expect(await archive.text()).toContain('<meta name="robots" content="noindex,follow">');

      // A brand-new page needs a new route: the integration watches the data dir and clears
      // Astro's dev route cache. Poll because the file watcher is asynchronous.
      const local2 = await openLocalStore(path.join(projectDir, cfg.dataDir));
      const site = await local2.store.getSite(cfg.siteId);
      await local2.store.createPage(site as NonNullable<typeof site>, {
        siteId: cfg.siteId,
        path: "/fresh",
        title: "Fresh page",
        locale: "en",
        status: "draft",
        sections: [{ id: "sec_fresh0000001", kind: "hero", heading: "Fresh" }],
      });
      await local2.close();
      let status = 404;
      for (let i = 0; i < 40 && status !== 200; i++) {
        await new Promise((r) => setTimeout(r, 250));
        status = (await fetch(new URL("/fresh", server.url))).status;
      }
      expect(status).toBe(200);
    } finally {
      server.child.kill("SIGTERM");
      await new Promise((r) => server.child.once("exit", r));
    }
  });

  it("build renders the published snapshot, not later edits", async () => {
    // Typed blocks in an article body (RFC-0015): a built-in, and the starter's own `testimonial`
    // rendered by its component (src/blocks.ts, theme.ts).
    {
      const cfg = await readProjectConfig(projectDir);
      const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
      const posts = await local.store.listContentEntries(cfg.siteId, "posts");
      const hello = posts.find((e) => e.slug === "hello-world");
      if (!hello) throw new Error("no hello-world post");
      await local.store.updateContentEntry({
        ...hello,
        body: {
          format: "markdown",
          value: `${hello.body.value.trimEnd()}\n\n:::callout{tone="warning"}\nBack up first.\n:::\n\n:::testimonial{author="Ada Lovelace" role="Analyst"}\nThis **changed** how we publish.\n:::\n`,
        },
      });
      await local.close();
    }
    const snap = await snapshot({ projectDir, label: "v1", publish: true });
    expect(snap.summary.added).toBeGreaterThan(0);
    // #51: publishing again with nothing changed makes no new snapshot
    const again = await snapshot({ projectDir, publish: true });
    expect(again).toMatchObject({ id: snap.id, unchanged: true });

    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const home = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/");
    await local.store.updatePage({
      ...(home as NonNullable<typeof home>),
      title: "Changed after publish",
    });
    await local.close();

    // cloudhal.json's domain is the static build's address (no request to take it from)
    const before = await readProjectConfig(projectDir);
    await writeProjectConfig(projectDir, { ...before, domains: { site: "e2e.example.com" } });
    const r = await build({ projectDir }).finally(() => writeProjectConfig(projectDir, before));
    expect(r.snapshotId).toBe(snap.id);
    const index = await readFile(path.join(r.outDir, "index.html"), "utf8");
    expect(index).toContain("<h1>E2E Site</h1>");
    expect(index).not.toContain("Changed after publish");
    const post = await readFile(path.join(r.outDir, "posts", "hello-world", "index.html"), "utf8");
    expect(post).toContain("<title>Hello, world · ");
    expect(post).toContain('class="ch-callout ch-callout--warning"');
    expect(post).toMatch(
      /<div class="ch-block" data-block-type="testimonial"[^>]*><figure class="testimonial"[^>]*><blockquote[^>]*><p>This <strong>changed<\/strong> how we publish\.<\/p>/,
    );
    expect(post).toMatch(/testimonial__author[^>]*>Ada Lovelace</);
    // search and link-preview basics in the static build
    expect(post).toContain(
      '<link rel="canonical" href="https://e2e.example.com/posts/hello-world">',
    );
    expect(post).toContain('<meta property="og:type" content="article">');
    expect(post).toContain('"@type":"BlogPosting"');
    const rss = await readFile(path.join(r.outDir, "rss.xml"), "utf8");
    expect(rss).toContain("<title>Hello, world</title>");
    expect(rss).not.toContain("Changed after publish");
    const sitemap = await readFile(path.join(r.outDir, "sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://e2e.example.com/posts/hello-world</loc>");
    expect(sitemap).not.toContain("localhost");
    expect(await readFile(path.join(r.outDir, "robots.txt"), "utf8")).toContain("Sitemap:");
    // the seed's category and tag are on the post and have (thin) archives
    expect(post).toContain('<a class="ch-chip" href="/category/news" rel="tag">News</a>');
    expect(post).toContain('<a class="ch-chip" href="/tag/cloudhal" rel="tag">Cloudhal</a>');
    expect(await readFile(path.join(r.outDir, "tag", "cloudhal", "index.html"), "utf8")).toContain(
      "<h1>Cloudhal</h1>",
    );
  });

  it("build writes category/tag archives, term feeds, sitemap entries and redirects (RFC-0002)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await applyTaxonomyFixture(local.store, cfg.siteId);
    // a content list filtered by a term (RFC-0002 §5) on the home page
    const home = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    await local.store.updatePage({
      ...home,
      sections: [
        ...home.sections,
        {
          id: "sec_home0weekly",
          kind: "contentList",
          collection: "posts",
          limit: 2,
          sort: "newest",
          filter: "tag:weekly-digest",
        },
      ],
    });
    await local.close();
    await snapshot({ projectDir, label: "taxonomy", publish: true });
    // The real bin, in its own process: Node caches Astro's prerender entry (and with it the
    // `getStaticPaths` results) per process, so a second in-process build would reuse the first's.
    await spawnBuild(projectDir);
    const outDir = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(outDir, ...p), "utf8");

    // an indexable category archive (22 posts ≥ minEntriesToIndex 3), 20 per page
    const news = await read("category", "news", "index.html");
    expect(news).toContain("<h1>News</h1>");
    expect(news).not.toContain('name="robots"');
    expect(news).toMatch(/<link rel="canonical" href="[^"]+\/category\/news">/);
    expect(news).toContain('"@type":"CollectionPage"');
    expect(news).toContain('"@type":"BreadcrumbList"');
    expect(news).toContain('href="/posts/hello-world"');
    expect(news).toContain('<a href="/category/news/page/2" rel="next">');
    expect(news).toMatch(
      /<link rel="alternate" type="application\/rss\+xml" title="News · [^"]+" href="[^"]+\/category\/news\/rss\.xml">/,
    );
    // page 2 is its own canonical, without JSON-LD; page 1 has no duplicate
    const page2 = await read("category", "news", "page", "2", "index.html");
    expect(page2).toMatch(/<link rel="canonical" href="[^"]+\/category\/news\/page\/2">/);
    expect(page2).toContain("<title>News – Page 2 · ");
    expect(page2).not.toContain("application/ld+json");
    expect(page2).toContain('<a href="/category/news" rel="prev">');
    expect(page2).toContain(">Issue 1</a>");
    expect(await read("category", "news", "page", "1", "index.html")).toContain(
      'content="0;url=/category/news"',
    );
    // a thin archive (1 post < 3) is served but not indexed, and left out of the sitemap
    expect(await read("tag", "cloudhal", "index.html")).toContain(
      '<meta name="robots" content="noindex,follow">',
    );
    // proposed (404) and retired (410) terms have no page in a static build
    await expect(read("tag", "proposed-idea", "index.html")).rejects.toThrow(/ENOENT/);
    await expect(read("tag", "old-topic", "index.html")).rejects.toThrow(/ENOENT/);
    // a per-term feed
    const feed = await read("category", "news", "rss.xml");
    expect(feed).toContain("<title>News · ");
    expect(feed).toMatch(/<link>[^<]+\/category\/news<\/link>/);
    expect(feed).toContain("<title>Issue 21</title>");
    expect(feed).toContain("<category>News</category>");
    expect(feed).toContain("<category>Weekly</category>");
    // redirects: meta-refresh pages for the old paths, real ones in _redirects
    expect(await read("tag", "weekly", "index.html")).toContain(
      'content="0;url=/tag/weekly-digest"',
    );
    expect(await read("tag", "weekly", "page", "2", "index.html")).toContain(
      'content="0;url=/tag/weekly-digest/page/2"',
    );
    expect(await read("tag", "weekly-digest", "page", "2", "index.html")).toContain(">Issue 1</a>");
    expect(await read("posts", "issue-05", "index.html")).toContain(
      'content="0;url=/posts/issue-05-renamed"',
    );
    const redirects = await read("_redirects");
    expect(redirects).toContain("/posts/issue-05 /posts/issue-05-renamed 301\n");
    expect(redirects).toContain("/tag/weekly /tag/weekly-digest 301\n");
    expect(redirects).toContain("/tag/weekly/* /tag/weekly-digest/:splat 301\n");
    // sitemap: indexable archives only, with lastmod
    const sitemap = await read("sitemap.xml");
    expect(sitemap).toMatch(/\/category\/news<\/loc><lastmod>\d{4}-/);
    expect(sitemap).toContain("/tag/weekly-digest</loc>");
    expect(sitemap).not.toContain("/tag/cloudhal</loc>");
    expect(sitemap).not.toContain("/page/2</loc>");
    // posts: breadcrumb through the primary category, chips, related posts, header categories
    const post = await read("posts", "issue-03", "index.html");
    expect(post).toMatch(/aria-label="Breadcrumb"[\s\S]*href="\/category\/news">News<\/a>/);
    expect(post).toContain('<a class="ch-chip" href="/tag/weekly-digest" rel="tag">Weekly</a>');
    expect(post).toContain('"articleSection":"News"');
    expect(post).toContain('<meta property="article:tag" content="Weekly">');
    expect(post).toMatch(/Related posts[\s\S]*href="\/posts\/issue-21"/);
    expect(post).toMatch(/aria-label="Main"[\s\S]*href="\/category\/news"/);
    // the filtered list shows the tag's newest posts only
    const index = await read("index.html");
    const start = index.indexOf('data-section-id="sec_home0weekly"');
    const weekly = index.slice(start, index.indexOf("</section>", start));
    expect(start).toBeGreaterThan(0);
    expect(weekly).toMatch(/>Issue 21<\/a>[\s\S]*>Issue 20<\/a>/);
    expect(weekly).not.toContain("Hello, world");
    expect(weekly).not.toContain("Issue 19");
    // the proposed tag is never shown on its post
    expect(await read("posts", "issue-01", "index.html")).not.toContain("proposed-idea");
    // no menu yet: the derived header, byte for byte as before RFC-0003
    const aboutTitle = "About (edited live)"; // retitled by the dev test above
    expect(headerOf(page2)).toBe(
      derivedHeader("E2E Site", [
        { href: "/about", label: aboutTitle },
        { href: "/category/news", label: "News", current: true },
      ]),
    );
    expect(headerOf(await read("about", "index.html"))).toBe(
      derivedHeader("E2E Site", [
        { href: "/about", label: aboutTitle, current: true },
        { href: "/category/news", label: "News" },
      ]),
    );
    expect(footerOf(page2)).toBe(DEFAULT_FOOTER);
  });

  it("build renders the primary and footer menus, hides an item whose page is gone, and falls back to the derived header (RFC-0003)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const dataDir = path.join(projectDir, cfg.dataDir);
    const outDir = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(outDir, ...p), "utf8");
    let local = await openLocalStore(dataDir);
    const fx = await applyMenuFixture(local.store, cfg.siteId);
    await local.close();
    await snapshot({ projectDir, label: "menus", publish: true });
    await spawnBuild(projectDir);

    const about = headerOf(await read("about", "index.html"));
    expect(about).toContain(
      '<a href="/about" aria-current="page" class="text-zinc-900">Who we are</a>',
    );
    expect(about).toContain('<a href="/team" class="hover:text-zinc-900">Team</a>');
    // a group in the bar is a popover under its button (RFC-0025 25b), no script needed
    expect(about).toContain(
      '<button type="button" class="ch-nav-menu__btn hover:text-zinc-900" popovertarget="ch-sub-2">Topics',
    );
    expect(about).toContain(
      '<div popover="auto" id="ch-sub-2" class="ch-nav-menu__pop"><ul><li><a href="/category/news" class="hover:text-zinc-900">News</a></li><li><a href="/" class="hover:text-zinc-900">Blog</a></li></ul></div>',
    );
    // the phone menu repeats the menu, its group as a disclosure, and links to nothing new
    const phone = menuOf(await read("about", "index.html"));
    expect(phone).toContain('<details class="ch-menu"><summary class="ch-menu__open">');
    expect(phone).toContain(
      '<span>Topics</span><svg class="ch-icon ch-nav-menu__caret" data-icon="chevron-down"',
    );
    expect(phone).toContain('<li><a href="/team">Team</a></li>');
    // without the dialog, the menu link's page: the same menus, kept out of search engines
    const menuPage = await read("menu", "index.html");
    expect(menuPage).toContain('class="ch-menu-page"');
    expect(menuPage).toContain('<meta name="robots" content="noindex,follow">');
    expect(menuOf(menuPage)).toContain("Who we are");
    expect(about).toContain(
      '<a href="https://github.com/cloudhal-dev" class="hover:text-zinc-900" rel="noopener noreferrer" target="_blank">GitHub</a>',
    );
    // the derived categories are gone: the menu replaces the header
    expect(about.match(/href="\/category\/news"/g)).toHaveLength(1);
    // context match: a post in News marks the News item (aria-current="true") and opens its trail
    expect(headerOf(await read("posts", "issue-03", "index.html"))).toContain(
      '<button type="button" class="ch-nav-menu__btn text-zinc-900" popovertarget="ch-sub-2">Topics',
    );
    // the home page lists posts, so "Blog" links to it (answer 5)
    expect(headerOf(await read("index.html"))).toContain(
      '<a href="/" aria-current="page" class="text-zinc-900">Blog</a>',
    );
    const footer = footerOf(await read("about", "index.html"));
    expect(footer).toContain(
      '<nav class="flex flex-wrap gap-4" aria-label="Footer"><a href="https://status.example.com" class="hover:text-zinc-700" rel="noopener noreferrer">Status</a></nav>',
    );
    expect(footer).not.toContain("/rss.xml");

    // Deleting the page never writes the menu; its item is simply not rendered any more.
    local = await openLocalStore(dataDir);
    const site = await local.store.getSite(cfg.siteId);
    await local.store.deletePage(site as NonNullable<typeof site>, fx.team);
    expect((await local.store.getMenu(fx.primary.id))?.rev).toBe(0);
    await local.close();
    await snapshot({ projectDir, label: "team page deleted", publish: true });
    await spawnBuild(projectDir);
    const after = headerOf(await read("about", "index.html"));
    expect(after).not.toContain("/team");
    expect(after).toContain(">Who we are</a>");
    await expect(read("team", "index.html")).rejects.toThrow(/ENOENT/);

    // Without menus the site renders today's derived header and footer again.
    local = await openLocalStore(dataDir);
    for (const key of ["primary", "footer"]) {
      const menu = await local.store.getMenuByKey(cfg.siteId, key);
      if (menu) await local.store.deleteMenu(menu);
    }
    await local.close();
    await snapshot({ projectDir, label: "menus deleted", publish: true });
    await spawnBuild(projectDir);
    const page2 = await read("category", "news", "page", "2", "index.html");
    expect(headerOf(page2)).toBe(
      derivedHeader("E2E Site", [
        { href: "/about", label: "About (edited live)" },
        { href: "/category/news", label: "News", current: true },
      ]),
    );
    expect(footerOf(page2)).toBe(DEFAULT_FOOTER);
  });

  it("build writes every locale: prefixed pages, hreflang, the reader's notice, localized links, sitemap and llms.txt (RFC-0033)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const outDir = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(outDir, ...p), "utf8");
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    let site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error("no site");
    site = await local.store.updateSite({
      ...site,
      locales: [site.defaultLocale, "es"],
      // RFC-0033 §4a: the theme's notice in Spanish, from the site's own wording.
      theme: {
        ...site.theme,
        config: {
          ...site.theme.config,
          strings: [{ locale: "es", machineTranslated: "Esta página se tradujo automáticamente." }],
        },
      },
    });
    const about = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/about");
    if (!about) throw new Error("no about page");
    const original = await local.store.updatePage({
      ...about,
      translation: { group: about.id, method: "original" },
    });
    const group = await local.store.translationGroup(site, original.id);
    const hash = group.members.find((m) => m.id === original.id)?.hash as string;
    await local.store.createPage(site, {
      siteId: site.id,
      path: "/acerca",
      title: "Acerca de",
      locale: "es",
      status: "published",
      sections: [{ id: "sec_es0acerca01", kind: "hero", heading: "Quiénes somos" }],
      translation: {
        group: original.id,
        method: "machine",
        source: { id: original.id, locale: original.locale, rev: original.rev, hash },
        provenance: { engine: "workers-ai", at: "2026-10-18T10:00:00Z" },
      },
    });
    await local.close();
    await snapshot({ projectDir, label: "spanish", publish: true });
    await spawnBuild(projectDir);

    const es = await read("es", "acerca", "index.html");
    expect(es).toMatch(/<html lang="es" dir="ltr"/);
    expect(es).toMatch(/<link rel="canonical" href="[^"]+\/es\/acerca">/);
    expect(es).toMatch(/<link rel="alternate" hreflang="en" href="[^"]+\/about">/);
    expect(es).toMatch(/<link rel="alternate" hreflang="x-default" href="[^"]+\/about">/);
    expect(es).toContain("ch-translation-notice");
    expect(es).toContain("Esta página se tradujo automáticamente.");
    expect(es).toContain('"translationOfWork"');
    // the header's link to About leads to the Spanish version
    expect(es).toContain('href="/es/acerca"');
    const en = await read("about", "index.html");
    expect(en).toMatch(/<link rel="alternate" hreflang="es" href="[^"]+\/es\/acerca">/);
    expect(en).not.toContain("ch-translation-notice");
    expect(en).toContain("ch-footer__languages");
    expect(en).toContain(">español</a>");
    const sitemap = await read("sitemap.xml");
    expect(sitemap).toMatch(
      /<xhtml:link rel="alternate" hreflang="es" href="[^"]+\/es\/acerca"\/>/,
    );
    expect(await read("es", "llms.txt")).toContain("Language: es");
    expect(await read("es", "rss.xml")).toContain("<language>es</language>");
  });

  it("dev answers a miss in the request's language: the theme's 404, then the site's own /404 and its translation; search and archives in tr (RFC-0033)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    let site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error("no site");
    site = await local.store.updateSite({
      ...site,
      locales: [site.defaultLocale, "es", "tr"],
      // Spanish is no language the theme ships: English words, the site's own over them.
      theme: {
        ...site.theme,
        config: {
          ...site.theme.config,
          strings: [{ locale: "es", notFoundTitle: "Página no encontrada" }],
        },
      },
    });
    const posts = await local.store.listContentEntries(cfg.siteId, "posts");
    const hello = posts.find((e) => e.slug === "hello-world" && e.locale === "en");
    if (!hello) throw new Error("no hello-world");
    const { id: _id, rev: _rev, createdAt: _c, updatedAt: _u, schemaVersion: _v, ...rest } = hello;
    await local.store.createContentEntry({
      ...rest,
      slug: "merhaba-dunya",
      locale: "tr",
      title: "Merhaba dünya",
    });
    await local.close();

    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    const get = async (p: string) => {
      const res = await fetch(new URL(p, server.url));
      return { status: res.status, html: await res.text() };
    };
    try {
      let tr = await get("/tr/missing");
      for (let i = 0; i < 40 && !tr.html.includes("<h1"); i++) {
        await new Promise((r) => setTimeout(r, 250));
        tr = await get("/tr/missing");
      }
      expect(tr.status).toBe(404);
      expect(tr.html).toMatch(/<html lang="tr" dir="ltr"/);
      expect(tr.html).toContain("Sayfa bulunamadı");
      expect(tr.html).toContain("<title>Sayfa bulunamadı · ");
      expect(tr.html).toContain('<meta name="robots" content="noindex,follow">');
      expect(tr.html).toContain('action="/tr/search"');
      expect(tr.html).toContain("ch-footer__languages");
      expect(tr.html).toContain('<link rel="alternate" type="application/rss+xml"');
      expect(tr.html).toMatch(/type="application\/rss\+xml"[^>]*href="[^"]+\/tr\/rss\.xml"/);
      const en = await get("/missing");
      expect(en.status).toBe(404);
      expect(en.html).toMatch(/<html lang="en" dir="ltr"/);
      expect(en.html).toContain("Page not found");
      const es = await get("/es/missing");
      expect(es.status).toBe(404);
      expect(es.html).toMatch(/<html lang="es" dir="ltr"/);
      expect(es.html).toContain("Página no encontrada");
      expect(es.html).toContain("The page you are looking for");

      const search = await get("/tr/search?q=merhaba");
      expect(search.status).toBe(200);
      expect(search.html).toMatch(/<html lang="tr" dir="ltr"/);
      expect(search.html).toContain("<title>Arama: merhaba · ");
      expect(search.html).toMatch(/<link rel="canonical" href="[^"]+\/tr\/search">/);
      const archive = await get("/tr/category/news");
      expect(archive.status).toBe(200);
      expect(archive.html).toMatch(/<html lang="tr" dir="ltr"/);
      expect(archive.html).toContain("1 yazı");
      expect(archive.html).toContain('href="/tr/posts/merhaba-dunya"');

      // The site authors its 404, in English and (at a path of its own) in Turkish.
      const local2 = await openLocalStore(path.join(projectDir, cfg.dataDir));
      const site2 = await local2.store.getSite(cfg.siteId);
      if (!site2) throw new Error("no site");
      const { page: lost, site: site3 } = await local2.store.createPage(site2, {
        id: "page_01HZX8K4N0FD",
        siteId: cfg.siteId,
        path: "/404",
        title: "Lost?",
        locale: "en",
        status: "published",
        sections: [{ id: "sec_lost00000001", kind: "hero", heading: "Nothing here" }],
        translation: { group: "page_01HZX8K4N0FD", method: "original" },
      });
      const group = await local2.store.translationGroup(site3, lost.id);
      await local2.store.createPage(site3, {
        siteId: cfg.siteId,
        path: "/bulunamadi",
        title: "Kayboldunuz mu?",
        locale: "tr",
        status: "published",
        sections: [{ id: "sec_kayip0000001", kind: "hero", heading: "Burada bir şey yok" }],
        translation: {
          group: lost.id,
          method: "human",
          source: {
            id: lost.id,
            locale: "en",
            rev: lost.rev,
            hash: group.members[0]?.hash as string,
          },
        },
      });
      await local2.close();
      for (let i = 0; i < 40 && !tr.html.includes("Burada bir şey yok"); i++) {
        await new Promise((r) => setTimeout(r, 250));
        tr = await get("/tr/missing");
      }
      expect(tr.status).toBe(404);
      expect(tr.html).toMatch(/<html lang="tr" dir="ltr"/);
      expect(tr.html).toContain("Burada bir şey yok");
      expect(tr.html).not.toContain('<link rel="alternate" hreflang');
      // the not-found page is no header link
      expect(tr.html).not.toContain('href="/tr/bulunamadi"');
      const enOwn = await get("/missing");
      expect(enOwn.status).toBe(404);
      expect(enOwn.html).toContain("Nothing here");
      expect((await get("/404")).status).toBe(404);
      // No Spanish version and no fallback: the theme's own page, in the site's Spanish words.
      expect((await get("/es/missing")).html).toContain("Página no encontrada");
    } finally {
      server.child.kill("SIGTERM");
      await new Promise((r) => server.child.once("exit", r));
    }
  });

  it("build shows typed fields on entries of collections that define them, and nothing else changes (RFC-0041 §9)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const outDir = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(outDir, ...p), "utf8");
    const article = (html: string) => html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? "";
    await snapshot({ projectDir, label: "before-fields", publish: true });
    await spawnBuild(projectDir);
    const before = article(await read("posts", "hello-world", "index.html"));
    expect(before).toContain("Hello, world");

    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    let site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error("no site");
    const label = (en: string, tr: string) => ({ en: { label: en }, tr: { label: tr } });
    // the seed's required category applies to every collection: reuse hello-world's terms
    const hello = (await local.store.listContentEntries(cfg.siteId, "posts")).find(
      (e) => e.slug === "hello-world" && e.locale === "en",
    );
    const terms = hello?.terms ? { terms: hello.terms } : {};
    site = await local.store.updateSite({
      ...site,
      collections: {
        ...site.collections,
        events: {
          labels: { en: { singular: "Event", plural: "Events" } },
          fields: [
            { key: "venue", type: "text", labels: label("Venue", "Mekan"), localized: true },
            { key: "price", type: "number", labels: label("Price", "Fiyat"), localized: false },
            {
              key: "startsAt",
              type: "datetime",
              labels: label("Starts", "Başlangıç"),
              localized: false,
            },
            {
              key: "deadline",
              type: "date",
              labels: label("Deadline", "Son gün"),
              localized: false,
            },
            {
              key: "online",
              type: "boolean",
              labels: label("Online", "Çevrim içi"),
              localized: false,
            },
            { key: "tickets", type: "url", labels: label("Tickets", "Biletler"), localized: true },
            {
              key: "agenda",
              type: "richText",
              labels: label("Agenda", "Program"),
              localized: true,
            },
            { key: "notes", type: "text", labels: label("Notes", "Notlar"), localized: true },
          ],
        },
      },
    });
    const event = await local.store.createContentEntry({
      siteId: cfg.siteId,
      collection: "events",
      slug: "launch",
      locale: "en",
      status: "published",
      title: "Launch party",
      body: { format: "markdown", value: "Join us for the launch of the new site." },
      fields: {
        venue: "<b>Kadıköy</b> Hall",
        price: 1234.5,
        startsAt: { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" },
        deadline: "2026-02-28",
        online: true,
        tickets: "https://example.com/tickets",
        agenda: "<script>alert(1)</script>\n\n- Talks\n- **Lunch**",
      },
      tags: [],
      ...terms,
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
      translation: { group: "entry_01HZX8K4N0EV", method: "original" },
      id: "entry_01HZX8K4N0EV",
    } as never);
    const group = await local.store.translationGroup(site, event.id);
    await local.store.createContentEntry({
      siteId: cfg.siteId,
      collection: "events",
      slug: "launch",
      locale: "tr",
      status: "published",
      title: "Açılış partisi",
      body: { format: "markdown", value: "Yeni sitenin açılışına bekleriz." },
      fields: { venue: "Kadıköy Salonu" },
      tags: [],
      ...terms,
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
      translation: {
        group: event.id,
        method: "human",
        source: {
          id: event.id,
          locale: "en",
          rev: event.rev,
          hash: group.members[0]?.hash as string,
        },
      },
    } as never);
    await local.close();
    await snapshot({ projectDir, label: "fields", publish: true });
    await spawnBuild(projectDir);

    const en = await read("events", "launch", "index.html");
    const list = en.match(/<dl class="ch-fields"[\s\S]*?<\/dl>/)?.[0] ?? "";
    expect(list).toMatch(/^<dl class="ch-fields" aria-label="Details">/);
    expect(list).toContain(
      '<div class="ch-field" data-field="venue" data-type="text"><dt>Venue</dt><dd>&lt;b&gt;Kadıköy&lt;/b&gt; Hall</dd></div>',
    );
    expect(list).toContain("<dt>Price</dt><dd>1,234.5</dd>");
    expect(list).toMatch(
      /<time datetime="2026-11-05T16:30:00Z">November 5, 2026.* 7:30\sPM GMT\+3<\/time>/,
    );
    expect(list).toContain('<time datetime="2026-02-28">February 28, 2026</time>');
    expect(list).toContain("<dt>Online</dt><dd>Yes</dd>");
    expect(list).toContain(
      '<dd><a href="https://example.com/tickets">https://example.com/tickets</a></dd>',
    );
    expect(list).toContain("<strong>Lunch</strong>");
    expect(list).not.toContain('data-field="notes"'); // empty values are skipped
    expect(en).not.toContain("<script>alert(1)");
    // The translation: its own venue, the original's shared values, labels in Turkish.
    const tr = await read("tr", "events", "launch", "index.html");
    expect(tr).toContain('aria-label="Ayrıntılar"');
    expect(tr).toContain("<dt>Mekan</dt><dd>Kadıköy Salonu</dd>");
    expect(tr).toContain("<dt>Fiyat</dt><dd>1.234,5</dd>");
    expect(tr).toContain("<dt>Çevrim içi</dt><dd>Evet</dd>");
    expect(tr).toContain('data-field="tickets" data-type="url" data-from-original');
    // An entry of a collection without definitions renders exactly as before.
    const after = article(await read("posts", "hello-world", "index.html"));
    expect(after).not.toContain("ch-fields");
    expect(after).toBe(before);
  });

  it("build emits a collection's JSON-LD preset, keeps past events' pages out of lists and lists by field (RFC-0042)", async () => {
    const cfg = await readProjectConfig(projectDir);
    const outDir = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(outDir, ...p), "utf8");
    const jsonLd = (html: string) =>
      [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
        (m) => m[1],
      );
    const article = (html: string) => html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? "";
    const postHtml = await read("posts", "hello-world", "index.html");
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    let site = await local.store.getSite(cfg.siteId);
    const events = site?.collections?.events;
    if (!site || !events?.fields) throw new Error("the RFC-0041 test sets up events first");
    const label = { en: { label: "Ends" } };
    site = await local.store.updateSite({
      ...site,
      collections: {
        ...site.collections,
        events: {
          ...events,
          fields: [
            ...events.fields,
            { key: "endsAt", type: "datetime", labels: label, localized: false },
            { key: "city", type: "text", labels: { en: { label: "City" } }, localized: false },
          ],
          listFields: ["startsAt"],
          expiry: { field: "endsAt", action: "unlist" },
          structuredData: {
            type: "Event",
            properties: {
              startDate: { kind: "field", field: "startsAt" },
              endDate: { kind: "field", field: "endsAt" },
              "location.name": { kind: "field", field: "venue" },
              "location.address.addressLocality": { kind: "field", field: "city" },
            },
          },
        },
      },
    });
    const day = 86_400_000;
    const at = (ms: number) => ({ at: new Date(ms).toISOString(), timeZone: "Europe/Istanbul" });
    const now = Date.now();
    const all = await local.store.listContentEntries(cfg.siteId, "events");
    const launch = all.find((e) => e.slug === "launch" && e.locale === "en");
    if (!launch) throw new Error("no launch event");
    await local.store.updateContentEntry({
      ...launch,
      fields: {
        ...launch.fields,
        city: "Istanbul",
        startsAt: at(now + 30 * day),
        endsAt: at(now + 30 * day + 1),
      },
    });
    await local.store.createContentEntry({
      siteId: cfg.siteId,
      collection: "events",
      slug: "retro",
      locale: "en",
      status: "published",
      title: "Retro night",
      body: { format: "markdown", value: "An evening that already happened." },
      fields: { venue: "Moda Stage", startsAt: at(now - 3 * day), endsAt: at(now - 2 * day) },
      tags: [],
      ...(launch.terms ? { terms: launch.terms } : {}),
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
    } as never);
    await local.store.createPage(site, {
      siteId: cfg.siteId,
      path: "/events",
      title: "Events",
      locale: "en",
      status: "published",
      sections: [
        {
          id: "sec_upcomingevt1",
          kind: "contentList",
          collection: "events",
          limit: 10,
          sort: "newest",
          where: [{ field: "startsAt", op: "gte", value: "now" }],
          orderBy: { field: "startsAt", direction: "asc" },
        },
      ],
    } as never);
    await local.close();
    await snapshot({ projectDir, label: "stage 3", publish: true });
    await spawnBuild(projectDir);

    // The preset replaces the BlogPosting; the breadcrumbs stay; values are escaped.
    const event = jsonLd(await read("events", "launch", "index.html"));
    expect(event.map((d) => JSON.parse(d ?? "{}")["@type"])).toEqual(["Event", "BreadcrumbList"]);
    expect(event[0]).toContain("\\u003cb\\u003eKadıköy");
    expect(event[0]).not.toContain("<b>");
    // A past event keeps its page (and its preset, dates in the past) but leaves every list.
    const retro = await read("events", "retro", "index.html");
    expect(retro).toContain("Retro night");
    const listing = await read("events", "index.html");
    expect(listing).toContain('href="/events/launch"');
    expect(listing).not.toContain("/events/retro");
    expect(await read("rss.xml")).not.toContain("Retro night");
    expect(await read("sitemap.xml")).not.toContain("/events/retro");
    expect(await read("sitemap.xml")).toContain("/events/launch");
    // RFC-0042 §5: the collection's own feed (the renderer answers the starter route's 404), per
    // locale, without the past event; the entry and listing pages link it.
    const feed = await read("events", "rss.xml");
    expect(feed).toContain("<title>Launch party</title>");
    expect(feed).toContain("/events/launch</link>");
    expect(feed).not.toContain("Retro night");
    expect(feed).not.toContain("/posts/hello-world");
    const trFeed = await read("tr", "events", "rss.xml");
    expect(trFeed).toContain("<language>tr</language>");
    expect(trFeed).toContain("/tr/events/launch</link>");
    const feedLink =
      /<link rel="alternate" type="application\/rss\+xml" title="[^"]+" href="[^"]+\/events\/rss\.xml">/;
    expect(await read("events", "launch", "index.html")).toMatch(feedLink);
    expect(listing).toMatch(feedLink);
    expect(await read("tr", "events", "launch", "index.html")).toMatch(
      /type="application\/rss\+xml"[^>]*href="[^"]+\/tr\/events\/rss\.xml"/,
    );
    // A collection without the settings renders as before: its article and its JSON-LD.
    const postAfter = await read("posts", "hello-world", "index.html");
    expect(article(postAfter)).toBe(article(postHtml));
    expect(jsonLd(postAfter)).toEqual(jsonLd(postHtml));
  });
});
