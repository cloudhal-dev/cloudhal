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
