/** RFC-0019 §2: corrections as an article shows them — the list, the "Updated" date and JSON-LD. */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { articleCorrections } from "../src/kit.ts";
import { renderInlineMarkdown } from "../src/markdown.ts";
import { entryHead } from "../src/seo.ts";

const ts = "2026-10-15T09:00:00.000Z";
const site = {
  schemaVersion: 1,
  id: "site_correct01",
  projectId: "proj_correct01",
  name: "Newsroom",
  slug: "newsroom",
  defaultLocale: "en",
  locales: ["en"],
  domains: [],
  pageIds: [],
  theme: { name: "blog" },
  rev: 1,
  createdAt: ts,
  updatedAt: ts,
} as unknown as Site;
const entry = {
  schemaVersion: 1,
  id: "entry_story0001",
  siteId: site.id,
  collection: "posts",
  slug: "story",
  locale: "en",
  status: "published",
  title: "A story",
  body: { format: "markdown", value: "Body" },
  fields: {},
  tags: [],
  author: { kind: "human", id: "user_writer0001", name: "Ayşe" },
  publishedAt: ts,
  rev: 3,
  createdAt: ts,
  updatedAt: "2026-10-20T12:00:00.000Z",
  corrections: [
    {
      id: "crx_first0001",
      kind: "correction",
      at: "2026-10-16T08:00:00.000Z",
      note: "The dome was finished in **537**, not 532.",
    },
    {
      id: "crx_second001",
      kind: "update",
      at: "2026-10-18T10:00:00.000Z",
      note: "See [the ministry's statement](https://example.gov/statement).",
    },
  ],
} as unknown as ContentEntry;

describe("corrections", () => {
  it("lists them newest first with the latest as the update time", () => {
    const c = articleCorrections(entry);
    expect(c.latest).toBe("2026-10-18T10:00:00.000Z");
    expect(c.items.map((i) => [i.kind, i.html])).toEqual([
      ["update", 'See <a href="https://example.gov/statement">the ministry&#39;s statement</a>.'],
      ["correction", "The dome was finished in <strong>537</strong>, not 532."],
    ]);
    expect(articleCorrections({ ...entry, corrections: undefined } as never)).toEqual({
      items: [],
    });
  });

  it("renders notes as safe inline markdown: no markup, scripts, images or unsafe links", () => {
    const html = renderInlineMarkdown(
      "<script>alert(1)</script> [x](javascript:alert(1)) ![pixel](https://evil.example/p.gif)\n\n# Not a heading",
    );
    expect(html).not.toMatch(/<script|<img|<h1|javascript:|<p>/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("pixel");
  });

  it("puts them in JSON-LD and makes the latest the article's dateModified", () => {
    const meta = entryHead(site, entry, "https://news.example");
    const article = (meta.jsonLd as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(article.dateModified).toBe("2026-10-18T10:00:00.000Z");
    expect(article.correction).toEqual([
      {
        "@type": "CorrectionComment",
        text: "See the ministry's statement.",
        datePublished: "2026-10-18T10:00:00.000Z",
      },
      {
        "@type": "CorrectionComment",
        text: "The dome was finished in 537, not 532.",
        datePublished: "2026-10-16T08:00:00.000Z",
      },
    ]);
    const plain = entryHead(
      site,
      { ...entry, corrections: undefined } as never,
      "https://news.example",
    );
    const none = (plain.jsonLd as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(none.dateModified).toBe(entry.updatedAt);
    expect(none.correction).toBeUndefined();
  });
});
