import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { renderEntryPreview, renderPagePreview, renderSectionHtml } from "../src/preview.ts";

describe("preview HTML", () => {
  it("renders every section kind with the same hooks as the Astro components", async () => {
    const store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    const site = await seedStarterSite(store, { name: "Preview <Site>", slug: "preview" });
    const [home] = await store.listPages(site.id);
    const entries = { posts: await store.listContentEntries(site.id, "posts") };
    const doc = renderPagePreview(site, home as NonNullable<typeof home>, entries);
    expect(doc.html).toContain('data-kind="hero"');
    expect(doc.html).toContain('data-kind="contentList"');
    expect(doc.html).toContain('href="/posts/hello-world"');
    expect(doc.html).toContain("Preview &lt;Site&gt;");
    expect(doc.path).toBe("/");
    const entry = entries.posts[0] as NonNullable<(typeof entries.posts)[0]>;
    expect(renderEntryPreview(site, entry).html).toContain("<h1>Hello, world</h1>");
    expect(
      renderSectionHtml({
        id: "sec_x000000001",
        kind: "image",
        image: { src: "/a.png", alt: 'q"uote' },
        caption: "c",
      }),
    ).toContain('alt="q&quot;uote"');
  });
});

describe("markdown safety (agent-written content)", async () => {
  const { renderMarkdown, renderEntryArticle, safeHref } = await import("../src/markdown.ts");

  it("escapes raw HTML and drops dangerous URLs", () => {
    const html = renderMarkdown(
      [
        "<script>alert(1)</script>",
        "",
        'Inline <img src=x onerror="alert(2)"> and <iframe src="https://evil"></iframe>',
        "",
        "[click](javascript:alert(3)) [data](data:text/html,hi) [ok](https://example.com) [rel](/about)",
        "",
        "![pic](javascript:alert(4)) ![fine](/img/a.png)",
      ].join("\n"),
    );
    expect(html).not.toMatch(/<script|<iframe|<img src=x|onerror="/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('<a href="https://example.com">ok</a>');
    expect(html).toContain('<a href="/about">rel</a>');
    expect(html).toContain('<img src="/img/a.png" alt="fine" loading="lazy">');
    expect(safeHref("  JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("//evil.example")).toBeUndefined();
    expect(safeHref("#top")).toBe("#top");
  });

  it("gives articles a header and drops a leading H1 that repeats the title", () => {
    const base = {
      id: "entry_abc123",
      title: "Hello <world>",
      summary: "Short & sweet",
      createdAt: "2026-10-08T00:00:00Z",
      publishedAt: "2026-10-08T12:00:00Z",
    };
    const dup = renderEntryArticle({
      ...base,
      body: { format: "markdown", value: "# Hello <world>\n\nBody." },
    });
    expect(dup.match(/<h1>/g)).toHaveLength(1);
    expect(dup).toContain("<h1>Hello &lt;world&gt;</h1>");
    expect(dup).toContain('<p class="ch-summary">Short &amp; sweet</p>');
    expect(dup).toContain('<time datetime="2026-10-08T12:00:00Z">October 8, 2026</time>');
    const other = renderEntryArticle({
      ...base,
      body: { format: "markdown", value: "# Different\n\nBody." },
    });
    expect(other.match(/<h1>/g)).toHaveLength(2);
  });
});
