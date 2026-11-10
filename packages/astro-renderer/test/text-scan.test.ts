/**
 * The renderer's linear scanners (AGENTS.md rule 13, CodeQL alerts 12, 13, 16, 17 and 41): each
 * gives the regex it replaced's answers on ordinary input and stays fast on 100k adversarial ones.
 */
import { describe, expect, it } from "vitest";
import { usesEmbeds } from "../src/embed-client.ts";
import { tableOfContents } from "../src/kit.ts";
import { inlineMarkdownText, markdownText, renderMarkdown } from "../src/markdown.ts";
import {
  hasEmbedLine,
  htmlText,
  leadingHeading,
  renderedHeadings,
  stripTags,
} from "../src/text-scan.ts";

const N = 100_000;
/** Runs `f` and fails when it takes longer than a linear scan of 100k characters ever should. */
function fast<T>(f: () => T): T {
  const start = performance.now();
  const out = f();
  expect(performance.now() - start).toBeLessThan(1500);
  return out;
}

// The regex versions, as they were.
const oldStrip = (html: string, gap: string) => html.replace(/<[^>]*>/g, gap);
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
const oldHtmlText = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,7});/g, (m, n: string) =>
      Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m,
    )
    .replace(/\s+/g, " ")
    .trim();
const oldH1 = (md: string) => {
  const m = md.match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/);
  return m ? { text: (m[1] as string).trim(), length: m[0].length } : undefined;
};
const oldHeadings = (html: string) =>
  [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)].map((m) => ({
    depth: Number(m[1]),
    id: m[2],
    inner: m[3],
  }));
const oldEmbed = (md: string) => /(^|\n)\s*(?:>\s*)*::embed\b/.test(md);

describe("stripTags", () => {
  it("drops tags as /<[^>]*>/g did", () => {
    for (const html of [
      "",
      "plain",
      "<p>a <strong>b</strong></p>",
      "a < b > c",
      "<a<b>c",
      "x < y",
      "<unclosed",
      "<p>one</p><p>two",
      "<<>>",
      '<img alt="a>b">',
    ])
      for (const gap of [" ", ""]) expect(stripTags(html, gap)).toBe(oldStrip(html, gap));
  });

  it("is linear on a long run of < without >", () => {
    expect(fast(() => stripTags("<".repeat(N), " "))).toBe("<".repeat(N));
    expect(fast(() => stripTags(`${"<a".repeat(N / 2)}>`, ""))).toBe("");
  });
});

describe("htmlText", () => {
  it("gives the regex version's text on ordinary HTML", () => {
    for (const html of [
      "<p>Hello <em>world</em></p>\n<p>Two &amp; three</p>",
      "<p>&quot;Quoted&quot; and it&#39;s &#8217;fine&#8217;</p>",
      '<h2 id="x">A &lt; B &gt; C</h2>',
      "<p>x &lt; 5 and 3 &gt; 2</p>",
      "  spaced\n\t out  ",
      "&#1114112; stays",
      "",
    ])
      expect(htmlText(html)).toBe(oldHtmlText(html));
  });

  it("never returns markup, whatever the entities decode to (alert 41)", () => {
    const cases = [
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
      "<p>&lt;img src=x onerror=alert(1)&gt;</p>",
      "<p>&lt;!-- c --&gt; &lt;?php &lt;/p&gt;</p>",
      "<p>&#60;script&#62;</p>",
      "<p>&lt;<b>script</b>&gt;</p>",
    ];
    for (const html of cases) {
      const text = htmlText(html);
      expect(text).not.toMatch(/<[A-Za-z/!?]/);
    }
    expect(htmlText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "\uFF1Cscript>alert(1)\uFF1C/script>",
    );
    // decoded once: `&amp;lt;` is the text `&lt;`, `&amp;#60;` the text `&#60;`
    expect(htmlText("&amp;lt;b&amp;gt; &amp;#60;i")).toBe("&lt;b&gt; &#60;i");
  });

  it("is linear on adversarial HTML", () => {
    expect(fast(() => htmlText("<".repeat(N)))).toBe("<".repeat(N));
    expect(fast(() => htmlText("&lt;a".repeat(N / 5))).length).toBe((N / 5) * 2);
    expect(fast(() => htmlText(`a${" \t\n".repeat(N / 3)}b`))).toBe("a b");
  });
});

describe("markdown text reaching meta descriptions", () => {
  it("keeps encoded and raw script tags out of the description, the attribute and JSON-LD", async () => {
    const { archiveHead, jsonLdText } = await import("../src/seo.ts");
    const { addAttribute } = await import("astro/runtime/server/index.js");
    const markdown = "Intro &lt;script&gt;alert(1)&lt;/script&gt; and <script>alert(2)</script>";
    const text = markdownText(markdown);
    expect(text).toBe(
      "Intro \uFF1Cscript>alert(1)\uFF1C/script> and \uFF1Cscript>alert(2)\uFF1C/script>",
    );
    const head = archiveHead(
      { id: "site_aaaaaaaaaaaa", name: "Haber", defaultLocale: "en" } as never,
      {
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
        term: { labels: { en: { name: "News", description: markdown } } },
        taxonomy: { key: "category" },
        entries: [],
      } as never,
      "https://haber.example",
    );
    expect(head.description).toBe(text);
    // What SeoHead.astro writes: `<meta name="description" content={meta.description} />`
    const meta = `<meta name="description"${String(addAttribute(head.description, "content"))}>`;
    expect(meta).not.toMatch(/<script|<\/script/i);
    expect(meta).toBe(`<meta name="description" content="${text}">`);
    for (const doc of head.jsonLd) expect(jsonLdText(doc)).not.toMatch(/<|>/);
  });

  it("inline text (correction notes) goes the same way", () => {
    expect(inlineMarkdownText("**537**, &lt;script&gt;")).toBe("537, \uFF1Cscript>");
  });
});

describe("leadingHeading", () => {
  it("matches the regex version on ordinary bodies", () => {
    for (const md of [
      "# Title\n\nBody",
      "# Title",
      "# Title\n",
      "  # Title ##\r\nBody",
      "\n\n# Title\nBody",
      "# Title\n  \n\t\nBody",
      "# Title\n\n\n",
      "# Title #\nBody",
      "# C#\nBody",
      "#   Spaced   title   \nBody",
      "# Other\nBody",
      "#Title\nBody",
      "Body\n# Title",
      "## Title\nBody",
      "",
    ])
      expect(leadingHeading(md), JSON.stringify(md)).toEqual(oldH1(md));
  });

  it("needs the space after # on the same line (the one intended difference)", () => {
    expect(oldH1("#\nTitle\nBody")?.text).toBe("Title");
    expect(leadingHeading("#\nTitle\nBody")).toBeUndefined();
  });

  it("is linear on a heading line of spaces", () => {
    fast(() => leadingHeading(`# ${"  ".repeat(N / 2)}x\rx`));
    expect(fast(() => leadingHeading(`# a${" ".repeat(N)}`))).toEqual({ text: "a", length: N + 3 });
    expect(fast(() => leadingHeading(`${"\n".repeat(N)}#`))).toBeUndefined();
  });
});

describe("renderedHeadings and the table of contents", () => {
  it("finds what the regex found", () => {
    const html = renderMarkdown(
      "# Top\n\n## One\n\ntext\n\n### One *a*\n\n## Two `code`\n\n#### Deep\n\n## One",
    );
    for (const h of [
      html,
      '<h2 id="a">A</h2><h3 id="b">B <h2 id="c">C</h2></h3>',
      '<h2 id="a">open <h2 id="b">B</h2>',
      '<h2 id="">empty</h2><h2 id="x" class="y">attrs</h2><h3 id="z">Z</h2></h3>',
      '<h2 id="a">no closer',
      "",
    ])
      expect(renderedHeadings(h)).toEqual(oldHeadings(h));
    expect(tableOfContents(html).map((t) => t.text)).toEqual(["One", "One a", "Two code", "One"]);
  });

  it("is linear on many headings without a closer", () => {
    expect(fast(() => renderedHeadings('<h2 id="!">a'.repeat(N / 12)))).toEqual([]);
    expect(fast(() => renderedHeadings(`${'<h3 id="x">'.repeat(N / 11)}</h2>`))).toEqual([]);
  });
});

describe("hasEmbedLine", () => {
  it("answers as the regex did", () => {
    for (const md of [
      "::embed{url=x}",
      "text\n::embed{url=x}",
      "  > > ::embed{url=x}",
      ">\n::embed",
      "\n\n  ::embed",
      "::embedded",
      "::embed_x",
      "text ::embed",
      "a\r\n::embed",
      "\t>::embed-",
      "",
      "nothing here",
    ])
      expect(hasEmbedLine(md), JSON.stringify(md)).toBe(oldEmbed(md));
    expect(usesEmbeds({ markdown: "> ::embed{url=x}" })).toBe(true);
  });

  it("is linear on long runs of blank and quote lines", () => {
    expect(fast(() => hasEmbedLine(`${"\n".repeat(N)}x`))).toBe(false);
    expect(fast(() => hasEmbedLine(`${">\n".repeat(N / 2)}x`))).toBe(false);
    expect(fast(() => hasEmbedLine(`${"> ".repeat(N / 2)}::embed`))).toBe(true);
  });
});

describe("random inputs over the characters that matter", () => {
  let s = 41;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
  const random = (tokens: readonly string[], max: number) => {
    let t = "";
    for (let i = next() % max; i > 0; i--) t += tokens[next() % tokens.length];
    return t;
  };
  it("agree with the regexes they replaced", () => {
    for (let n = 0; n < 20_000; n++) {
      const html = random(["<", ">", "a", " ", "/", "\n"], 14);
      expect(stripTags(html, " "), JSON.stringify(html)).toBe(oldStrip(html, " "));
      const md = random(["\n", " ", ">", "::embed", "x", "\r", "\t", "_"], 10);
      expect(hasEmbedLine(md), JSON.stringify(md)).toBe(oldEmbed(md));
      const h = random(
        ['<h2 id="a">', '<h3 id="b">', "</h2>", "</h3>", "x", '"', ">", "<h2 id=", '<h3 id="'],
        10,
      );
      expect(renderedHeadings(h), JSON.stringify(h)).toEqual(oldHeadings(h));
    }
  });
});
