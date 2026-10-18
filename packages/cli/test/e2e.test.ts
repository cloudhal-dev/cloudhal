import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, init, readProjectConfig, snapshot } from "../src/index.ts";
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

    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const home = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/");
    await local.store.updatePage({
      ...(home as NonNullable<typeof home>),
      title: "Changed after publish",
    });
    await local.close();

    const r = await build({ projectDir });
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
    expect(post).toMatch(/<link rel="canonical" href="[^"]+\/posts\/hello-world">/);
    expect(post).toContain('<meta property="og:type" content="article">');
    expect(post).toContain('"@type":"BlogPosting"');
    const rss = await readFile(path.join(r.outDir, "rss.xml"), "utf8");
    expect(rss).toContain("<title>Hello, world</title>");
    expect(rss).not.toContain("Changed after publish");
    expect(await readFile(path.join(r.outDir, "sitemap.xml"), "utf8")).toContain(
      "/posts/hello-world</loc>",
    );
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
    site = await local.store.updateSite({ ...site, locales: [site.defaultLocale, "es"] });
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
});
