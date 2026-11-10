/**
 * `htmlText` returns plain text, `<` included: `&lt;script&gt;` in markdown is the text
 * `<script>` (CodeQL alert 41). Safety is each sink's job. This file feeds that text through every
 * sink its callers reach and parses the output the way a browser does (parse5): no element and no
 * comment may come out of it, only text or an attribute value.
 *
 * Callers → sinks: `markdownText` → archive `description` → `<meta name=description>`,
 * `og:description`, `twitter:description` (Astro attributes) and JSON-LD (`jsonLdText`), and the
 * archive feed's RSS `<description>` (`xml()`); `inlineMarkdownText` → correction notes in JSON-LD;
 * `tableOfContents` → TOC labels (Astro text, `{item.text}`); Studio's archive preview
 * (`renderArchivePreview`) → its `<meta name=description>` (`esc()`). Search snippets and `llms.txt` do
 * not go through `htmlText`; the snippet's own sink (`snippetHtml`, inserted as HTML) is checked
 * here too, and `llms.txt` is Markdown served as `text/plain`.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { MARK_CLOSE, MARK_OPEN, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { addAttribute, escapeHTML } from "astro/runtime/server/index.js";
import { type DefaultTreeAdapterMap, parse, parseFragment } from "parse5";
import { describe, expect, it } from "vitest";
import { archiveFeedXml } from "../src/feeds.ts";
import { tableOfContents } from "../src/kit.ts";
import { markdownText, renderMarkdown } from "../src/markdown.ts";
import { renderArchivePreview } from "../src/preview.ts";
import { snippetHtml } from "../src/search.ts";
import { archiveHead, entryHead, jsonLdText } from "../src/seo.ts";

type Node = DefaultTreeAdapterMap["node"];

const ATTACK =
  "&lt;script&gt;alert(1)&lt;/script&gt; &lt;!-- c --&gt; &lt;img src=x onerror=alert(2)&gt; &quot;&gt;&lt;svg onload=alert(3)&gt;";
const DECODED =
  '<script>alert(1)</script> <!-- c --> <img src=x onerror=alert(2)> "><svg onload=alert(3)>';
const ORIGIN = "https://haber.example";

/** Every element and comment under `node` (its own tag included when it is one). */
function markup(node: Node, out: string[] = []): string[] {
  if (node.nodeName === "#comment") out.push("#comment");
  else if ("tagName" in node) out.push(node.tagName);
  for (const child of "childNodes" in node ? node.childNodes : []) markup(child as Node, out);
  if ("content" in node && node.content) markup(node.content as Node, out);
  return out;
}

/** The first `tag` element under `node`, depth first. */
function firstElement(node: Node, tag: string): DefaultTreeAdapterMap["element"] | undefined {
  if ("tagName" in node && node.tagName === tag) return node;
  for (const child of "childNodes" in node ? node.childNodes : []) {
    const found = firstElement(child as Node, tag);
    if (found) return found;
  }
  return undefined;
}

/** The elements and comments an HTML fragment parses to. */
const fragmentMarkup = (html: string) => markup(parseFragment(html) as unknown as Node);

/** The elements and comments inside `<head>` when `html` is all the head holds. */
function headMarkup(html: string): string[] {
  const doc = parse(`<!doctype html><html><head>${html}</head><body></body></html>`);
  const head = doc.childNodes
    .flatMap((n) => ("childNodes" in n ? n.childNodes : []))
    .find((n) => n.nodeName === "head") as Node;
  return markup(head).slice(1);
}

const site = {
  id: "site_aaaaaaaaaaaa",
  name: "Haber",
  slug: "haber",
  defaultLocale: "en",
  locales: ["en"],
  domains: [],
} as unknown as Site;

const archive = {
  locale: "en",
  page: 1,
  path: "/category/news",
  root: "/category/news",
  shown: {
    name: "News",
    slug: "news",
    href: "/category/news",
    taxonomy: { key: "category", labels: { en: { plural: "Categories" } } },
  },
  trail: [],
  total: 0,
  perPage: 10,
  term: { labels: { en: { name: "News", description: `Intro ${ATTACK}` } } },
  taxonomy: { key: "category" },
  entries: [],
} as never;

describe("htmlText's sinks with decoded markup in the text (alert 41)", () => {
  const head = archiveHead(site, archive, ORIGIN);

  it("the description is the decoded text, verbatim", () => {
    expect(markdownText(`Intro ${ATTACK}`)).toBe(`Intro ${DECODED}`);
    expect(head.description).toBe(`Intro ${DECODED}`);
  });

  it("meta description, og: and twitter: tags: an attribute value, never markup", () => {
    // What SeoHead.astro writes for `meta.description`, `meta.openGraph` and `meta.twitter`.
    const tags = [
      `<meta name="description"${addAttribute(head.description, "content")}>`,
      ...head.openGraph.map(
        ([p, c]) => `<meta${addAttribute(p, "property")}${addAttribute(c, "content")}>`,
      ),
      ...head.twitter.map(
        ([n, c]) => `<meta${addAttribute(n, "name")}${addAttribute(c, "content")}>`,
      ),
    ];
    expect(head.openGraph).toContainEqual(["og:description", `Intro ${DECODED}`]);
    for (const tag of tags) expect(headMarkup(tag), tag).toEqual(["meta"]);
    const meta = firstElement(parse(`<head>${tags[0]}</head>`) as unknown as Node, "meta");
    expect(meta?.attrs.find((a) => a.name === "content")?.value).toBe(`Intro ${DECODED}`);
  });

  it("JSON-LD: no </script>, <!-- or < at all inside the script element", () => {
    expect(head.jsonLd.length).toBeGreaterThan(0);
    for (const doc of head.jsonLd) {
      const text = jsonLdText(doc);
      expect(text).not.toMatch(/[<>]/);
      const html = `<script type="application/ld+json">${text}</script>`;
      expect(headMarkup(html)).toEqual(["script"]);
      expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(doc)));
    }
    expect(JSON.stringify(head.jsonLd)).toContain(JSON.stringify(DECODED).slice(1, -1));
  });

  it("correction notes (inlineMarkdownText) in the article's JSON-LD", () => {
    const entry = {
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
      author: { kind: "human", id: "user_writer0001", name: "A" },
      publishedAt: "2026-10-15T10:00:00.000Z",
      createdAt: "2026-10-15T10:00:00.000Z",
      updatedAt: "2026-10-15T10:00:00.000Z",
      corrections: [
        { id: "crx_first0001", kind: "correction", at: "2026-10-16T08:00:00.000Z", note: ATTACK },
      ],
    } as unknown as ContentEntry;
    const meta = entryHead(site, entry, ORIGIN);
    const article = meta.jsonLd[0] as { correction: { text: string }[] };
    expect(article.correction[0]?.text).toBe(DECODED);
    for (const doc of meta.jsonLd)
      expect(headMarkup(`<script type="application/ld+json">${jsonLdText(doc)}</script>`)).toEqual([
        "script",
      ]);
  });

  it("the archive's RSS <description>: escaped text", () => {
    const xml = archiveFeedXml({ site, origin: ORIGIN, archive });
    const description = xml.match(/<channel>[\s\S]*?<description>([^<]*)<\/description>/)?.[1];
    // `xml()` escapes the decoded text back to what the markdown said
    expect(description).toBe(`Intro ${ATTACK}`);
    expect(xml).not.toMatch(/<script|<img|<svg|<!-- c/);
  });

  it("table-of-contents labels: Astro text, escaped", () => {
    const toc = tableOfContents(renderMarkdown(`## One ${ATTACK}\n\ntext\n\n## Two\n\n## Three`));
    expect(toc[0]?.text).toBe(`One ${DECODED}`);
    // What Article.astro writes: `<a href={`#${item.id}`}>{item.text}</a>`
    const html = `<a${addAttribute(`#${toc[0]?.id}`, "href")}>${escapeHTML(toc[0]?.text ?? "")}</a>`;
    expect(fragmentMarkup(html)).toEqual(["a"]);
  });

  it("search snippets (not htmlText, but inserted as HTML): only the <mark>s are markup", () => {
    const html = snippetHtml(`a ${MARK_OPEN}${DECODED}${MARK_CLOSE} b`);
    expect(fragmentMarkup(html)).toEqual(["mark"]);
  });

  it("Studio's archive preview: the description meta through esc(), the intro as rendered markdown", async () => {
    const store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    const seeded = await seedStarterSite(store, { name: "Archive", slug: "archive" });
    const terms = await store.listTerms(seeded.id);
    const news = terms.find((t) => t.slug === "news") as (typeof terms)[0];
    const locale = seeded.defaultLocale;
    const intro = `Intro ${ATTACK}`;
    const doc = renderArchivePreview(seeded, {
      taxonomies: await store.listTaxonomies(seeded.id),
      terms: terms.map((t) =>
        t.id === news.id
          ? {
              ...t,
              labels: {
                ...t.labels,
                [locale]: { ...(t.labels[locale] as object), name: "News", description: intro },
              },
            }
          : t,
      ),
      termId: news.id,
      entries: await store.listContentEntries(seeded.id, {}),
    });
    const tree = parse(doc.html) as unknown as Node;
    const meta = firstElement(tree, "meta");
    expect(meta).toBeDefined();
    const description = [tree]
      .flatMap(function all(n: Node): Node[] {
        return [n, ...("childNodes" in n ? n.childNodes.flatMap((c) => all(c as Node)) : [])];
      })
      .find(
        (n) =>
          "tagName" in n &&
          n.tagName === "meta" &&
          n.attrs.some((a) => a.name === "name" && a.value === "description"),
      ) as DefaultTreeAdapterMap["element"] | undefined;
    expect(description?.attrs.find((a) => a.name === "content")?.value).toBe(`Intro ${DECODED}`);
    const found = markup(tree);
    for (const tag of ["script", "img", "svg", "#comment"]) expect(found, tag).not.toContain(tag);
  });
});
