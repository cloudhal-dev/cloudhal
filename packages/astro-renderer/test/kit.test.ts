import { describe, expect, it } from "vitest";
import { articleOutline, readingMinutes, tableOfContents } from "../src/kit.ts";
import { headingSlug, renderMarkdown } from "../src/markdown.ts";

describe("heading ids (RFC-0018 §3)", () => {
  it("gives h2–h6 a slug of their text and leaves h1 alone", () => {
    const html = renderMarkdown("# Title\n\n## First part\n\n### A *detail*\n\ntext");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain('<h2 id="first-part">First part</h2>');
    expect(html).toContain('<h3 id="a-detail">A <em>detail</em></h3>');
  });

  it("keeps ids unique in a document and starts over in the next one", () => {
    const md = "## Notes\n\n## Notes\n\n## Notes";
    const html = renderMarkdown(md);
    expect(html).toContain('id="notes"');
    expect(html).toContain('id="notes-2"');
    expect(html).toContain('id="notes-3"');
    expect(renderMarkdown("## Notes")).toContain('id="notes"');
  });

  it("transliterates Turkish and accented letters", () => {
    expect(headingSlug("Şehir Işıkları ve Göç")).toBe("sehir-isiklari-ve-goc");
    expect(headingSlug("Café façade — Straße")).toBe("cafe-facade-strasse");
  });

  it("never takes an id Cloudhal's own markup uses, nor starts with a digit", () => {
    expect(headingSlug("Comments")).toBe("h-comments");
    expect(headingSlug("Cloudhal setup")).toBe("h-cloudhal-setup");
    expect(headingSlug("2026 in review")).toBe("h-2026-in-review");
    expect(headingSlug("日本語")).toBe("section");
  });

  it("never lets markup in a heading reach its id", () => {
    const html = renderMarkdown('## <img src=x onerror="a()"> "quoted"');
    expect(html).toMatch(/<h2 id="[a-z0-9-]+">/);
    expect(html).not.toContain('onerror="a()"');
  });
});

describe("article outline", () => {
  it("lists h2 and h3 with the ids the body carries", () => {
    const body = {
      format: "markdown" as const,
      value: "## One\n\n### One a\n\n#### Deep\n\n## Two",
    };
    const { toc } = articleOutline({ body });
    expect(toc).toEqual([
      { id: "one", text: "One", depth: 2 },
      { id: "one-a", text: "One a", depth: 3 },
      { id: "two", text: "Two", depth: 2 },
    ]);
    for (const item of toc) expect(renderMarkdown(body.value)).toContain(`id="${item.id}"`);
  });

  it("has no table of contents for sanitized HTML bodies", () => {
    expect(
      articleOutline({ body: { format: "html", value: "<h2>Title</h2><p>x</p>" } }).toc,
    ).toEqual([]);
  });

  it("estimates reading time from words and images, at least one minute", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(readingMinutes(`<p>${words(10)}</p>`)).toBe(1);
    expect(readingMinutes(`<p>${words(2300)}</p>`)).toBe(10);
    expect(readingMinutes(`<p>${words(2300)}</p>`, 460)).toBe(5);
    // 12 + 11 + 10 + 9 + 8 = 50 s of images on top of 4 minutes of words
    expect(readingMinutes(`<p>${words(920)}</p>${"<img src=a>".repeat(5)}`)).toBe(5);
  });

  it("finds headings in rendered HTML", () => {
    expect(tableOfContents('<h2 id="a">A &amp; B</h2><h4 id="c">C</h4>')).toEqual([
      { id: "a", text: "A & B", depth: 2 },
    ]);
  });
});
