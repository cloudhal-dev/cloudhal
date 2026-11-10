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
      "<h2>Using <code>Array&lt;string&gt;</code> with &lt;dialog&gt;</h2>",
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;!-- c --&gt; when x&lt;y</p>",
      "",
    ])
      expect(htmlText(html)).toBe(oldHtmlText(html));
  });

  it("keeps the decoded text verbatim, `<` included (the sinks escape it)", () => {
    expect(htmlText("<h2>Using <code>Array&lt;string&gt;</code> with &lt;dialog&gt;</h2>")).toBe(
      "Using Array<string> with <dialog>",
    );
    expect(htmlText("<p>when x&lt;y</p>")).toBe("when x<y");
    expect(htmlText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<script>alert(1)</script>",
    );
    // decoded once: `&amp;lt;` is the text `&lt;`, `&amp;#60;` the text `&#60;`
    expect(htmlText("&amp;lt;b&amp;gt; &amp;#60;i")).toBe("&lt;b&gt; &#60;i");
    expect(oldHtmlText("&amp;#60;i")).toBe("<i");
  });

  it("is linear on adversarial HTML", () => {
    expect(fast(() => htmlText("<".repeat(N)))).toBe("<".repeat(N));
    expect(fast(() => htmlText("&lt;a".repeat(N / 5))).length).toBe((N / 5) * 2);
    expect(fast(() => htmlText(`a${" \t\n".repeat(N / 3)}b`))).toBe("a b");
  });
});

describe("markdown and inline markdown as text", () => {
  it("decode entities after rendering, as before (the sinks: test/html-text-sinks.test.ts)", () => {
    expect(markdownText("Intro &lt;b&gt; and **bold**")).toBe("Intro <b> and bold");
    expect(inlineMarkdownText("**537**, &lt;script&gt;")).toBe("537, <script>");
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

  it("takes the #-only lines and blank lines after the heading, as the regex did", () => {
    for (const md of ["# Title\n#\nBody", "# Title\n\n##\n\nBody", "#\nTitle\nBody", "#  ", "# "])
      expect(leadingHeading(md), JSON.stringify(md)).toEqual(oldH1(md));
    expect(leadingHeading("# Title\n#\nBody")).toEqual({ text: "Title", length: 10 });
  });

  it("is linear on a heading line of spaces", () => {
    fast(() => leadingHeading(`# ${"  ".repeat(N / 2)}x\rx`));
    expect(fast(() => leadingHeading(`# a${" ".repeat(N)}`))).toEqual({ text: "a", length: N + 3 });
    expect(fast(() => leadingHeading(`${"\n".repeat(N)}#`))).toBeUndefined();
    expect(fast(() => leadingHeading(`#${"\u2028".repeat(N)}`))).toBeUndefined();
    fast(() => leadingHeading(`# x${"#\u2028".repeat(N / 2)}y`));
    fast(() => leadingHeading(`# x${" ".repeat(N)}#${"\u2028".repeat(N)}\n`));
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
      const h1 = random(["#", " ", "\n", "\r", "x", "\t", "\u2028"], 14);
      expect(leadingHeading(h1), JSON.stringify(h1)).toEqual(oldH1(h1));
      const h = random(
        ['<h2 id="a">', '<h3 id="b">', "</h2>", "</h3>", "x", '"', ">", "<h2 id=", '<h3 id="'],
        10,
      );
      expect(renderedHeadings(h), JSON.stringify(h)).toEqual(oldHeadings(h));
    }
  });
});
