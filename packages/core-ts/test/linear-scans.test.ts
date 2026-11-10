/**
 * core-ts's linear scanners (AGENTS.md rule 13, CodeQL alerts 20, 23, 24, 30, 35, 36): each gives
 * the regex it replaced's answers on ordinary input and stays fast on 100k adversarial ones.
 */
import { describe, expect, it } from "vitest";
import { normalizeHostname } from "../src/domains.ts";
import { escapeMarkdown, markdownToPlain } from "../src/fields/conversions.ts";
import { isSvgText, sniff } from "../src/media/sniff.ts";
import { bodySurfaces, closesFence, fenceOpen } from "../src/surfaces/body.ts";

const N = 100_000;
function fast<T>(f: () => T): T {
  const start = performance.now();
  const out = f();
  expect(performance.now() - start).toBeLessThan(1500);
  return out;
}

describe("isSvgText (alerts 24, 35, 36)", () => {
  const old = (text: string) =>
    /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
      text.replace(/^﻿/, ""),
    );
  it("answers as the regex did on real headers", () => {
    for (const t of [
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      "﻿<svg>",
      '  <?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 1 1">',
      '<?xml version="1.0"?><!-- made with x --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg\n>',
      "<!-- a --> <!-- b -->\n<SVG width='1'>",
      "<!DOCTYPE svg><!-- c --><svg>",
      "<!DOCTYPE html><svg>",
      "<!DOCTYPEsvg><svg>",
      "<?xml?><svg>",
      "<?xml><svg>",
      "<?xml version='1.0'><svg>",
      "<svgx>",
      "<svg",
      "<html><svg>",
      "<!-- unclosed <svg>",
      "plain text",
      "",
      "<!---->",
      "<!----><svg/>",
      "<svg/>",
    ])
      expect(isSvgText(t), JSON.stringify(t)).toBe(old(t));
  });
  it("ends a comment at its first --> (the one intended difference: never more svg)", () => {
    const t = "<!-- a --> x --> <svg>";
    expect(old(t)).toBe(true);
    expect(isSvgText(t)).toBe(false);
  });
  it("is linear on the exponential inputs", () => {
    expect(fast(() => isSvgText(`<!--${"--><!--".repeat(N / 7)}`))).toBe(false);
    expect(fast(() => isSvgText(`<!--${"<!---->".repeat(N / 7)}`))).toBe(false);
    expect(fast(() => isSvgText(`${"<!---->".repeat(N / 7)}<svg>`))).toBe(true);
    const bytes = new TextEncoder().encode(`<!--${"--><!--".repeat(N / 7)}`);
    expect(fast(() => sniff(bytes)).kind).toBe("refused");
  });
});

describe("fenceOpen (alert 30)", () => {
  const old = (line: string) => {
    const m = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/.exec(line);
    return m ? [m[1], m[2], m[3]] : undefined;
  };
  it("matches what the regex matched", () => {
    for (const line of [
      "```",
      '```surface {"id":"p"}',
      "   ~~~~ surface  x",
      "    ```four spaces",
      "``",
      "~~~\tjs title",
      "```js`no",
      "````` a b c ",
      "``` x",
      "```a\rb",
      "text ```",
      "",
      "~~~~~~",
    ])
      expect(fenceOpen(line), JSON.stringify(line)).toEqual(old(line));
  });
  it("is linear on a fence with many tabs and a lone \\r", () => {
    expect(fast(() => fenceOpen(`\`\`\`${"\t".repeat(N)}\r`))).toBeUndefined();
    expect(fast(() => fenceOpen(`\`\`\`${"\t".repeat(N)}x`))?.[1]).toBe("x");
    const body = `\`\`\`surface${"\t".repeat(N)}\rx\n`;
    expect(fast(() => bodySurfaces(body))).toEqual([]);
  });
});

describe("markdownToPlain and escapeMarkdown (alert 23)", () => {
  const oldPlain = (markdown: string, multiline: boolean) => {
    const lines: string[] = [];
    for (const raw of markdown.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("```") || line.startsWith("~~~") || line.startsWith("::")) continue;
      const words = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|__|~~|\*|_|`)/g, "")
        .replace(/\\([!-/:-@[-`{-~])/g, "$1")
        .trim();
      if (words) lines.push(words);
    }
    return lines.join(multiline ? "\n" : " ");
  };
  const oldEscape = (text: string) =>
    text
      .replace(/[\\`*_[\]<>|~&]/g, "\\$&")
      .replace(/^(\s*)([#>+=-])/gm, "$1\\$2")
      .replace(/^(\s*\d+)([.)])/gm, "$1\\$2")
      .replace(/:(?=:)/g, "\\:");
  const samples = [
    "# Title\n\nSome **bold** and [a link](https://x.test) and ![alt](/i.png).",
    "- item [one](a) [two](b)\n1. first\n> quote",
    "[no target] and [x] (y) and [a](b and ![c](d",
    "[[nested](x)](y) ![![i](a)](b) []() ![]()",
    "a [b](c(d)e) f",
    "```\ncode\n```\n::embed{x}\nafter \\*escaped\\*",
    "",
    "  \n\n  - lead\n\t# hash\n  12. num\n= setext\n+ plus\n3) paren\n\n\n-",
    "1.5 is a number\n100) items\na::b::c\n",
    "line\r\n# crlf\r\n  > quoted - sep",
  ];
  it("gives the regex versions' answers", () => {
    for (const md of samples) {
      expect(markdownToPlain(md, true), JSON.stringify(md)).toBe(oldPlain(md, true));
      expect(markdownToPlain(md, false)).toBe(oldPlain(md, false));
      expect(escapeMarkdown(md), JSON.stringify(md)).toBe(oldEscape(md));
    }
  });
  it("is linear on many openers and blank lines", () => {
    expect(fast(() => markdownToPlain("![".repeat(N / 2), false))).toBe("![".repeat(N / 2));
    expect(fast(() => markdownToPlain(`![](${"![](".repeat(N / 4)}`, false))).toBe(
      `![](${"![](".repeat(N / 4)}`,
    );
    const brackets = `[\\](${"[!](".repeat(N / 4)}`;
    expect(markdownToPlain(brackets.slice(0, 4000), false)).toBe(
      oldPlain(brackets.slice(0, 4000), false),
    );
    expect(fast(() => markdownToPlain(brackets, false))).toBe(`[](${"[!](".repeat(N / 4)}`);
    expect(fast(() => escapeMarkdown(`${"\n".repeat(N)}x`))).toBe(`${"\n".repeat(N)}x`);
    expect(fast(() => escapeMarkdown(`${" \n".repeat(N / 2)}-`))).toBe(`${" \n".repeat(N / 2)}\\-`);
  });
});

describe("normalizeHostname (alert 20)", () => {
  const old = (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/\.$/, "");
  it("gives the regex version's answers", () => {
    for (const input of [
      "https://News.Example.com/",
      "news.example.com.",
      "example.com/a/b?c#d",
      "example.com?x",
      "example.com#frag",
      "  HTTP://A.B  ",
      "a/b\nc/d",
      "a/b\rc",
      "plain",
      "",
    ])
      expect(normalizeHostname(input), JSON.stringify(input)).toBe(old(input));
  });
  it("is linear on many # before a line break", () => {
    expect(fast(() => normalizeHostname(`${"#".repeat(N)}\nx`))).toBe(`${"#".repeat(N)}\nx`);
    expect(fast(() => normalizeHostname(`a${"/".repeat(N)}`))).toBe("a");
  });
});

describe("random inputs over the characters that matter", () => {
  let s = 2026;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
  const random = (tokens: readonly string[], max: number) => {
    let t = "";
    for (let i = next() % max; i > 0; i--) t += tokens[next() % tokens.length];
    return t;
  };
  const oldFence = (line: string) => {
    const m = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/.exec(line);
    return m ? [m[1], m[2], m[3]] : undefined;
  };
  const oldEscape = (text: string) =>
    text
      .replace(/[\\`*_[\]<>|~&]/g, "\\$&")
      .replace(/^(\s*)([#>+=-])/gm, "$1\\$2")
      .replace(/^(\s*\d+)([.)])/gm, "$1\\$2")
      .replace(/:(?=:)/g, "\\:");
  const oldLinks = (line: string) =>
    line.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const oldHost = (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/\.$/, "");

  it("agree with the regexes they replaced", () => {
    for (let n = 0; n < 20_000; n++) {
      const line = random(["`", "``", "~", " ", "\t", "a", "\r", " ", "``"], 12);
      expect(fenceOpen(line), JSON.stringify(line)).toEqual(oldFence(line));
      for (const fence of ["```", "````", "~~~"]) {
        const closer = new RegExp(
          `^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`,
        );
        expect(closesFence(line, fence), JSON.stringify([line, fence])).toBe(closer.test(line));
      }
      const text = random(["\n", " ", "#", "1", ".", ")", "-", "a", "\r", ":", " "], 14);
      expect(escapeMarkdown(text), JSON.stringify(text)).toBe(oldEscape(text));
      const md = random(["!", "[", "]", "(", ")", "a", " ", "*"], 14);
      expect(markdownToPlain(md, false), JSON.stringify(md)).toBe(
        oldLinks(md)
          .replace(/(\*\*|__|~~|\*|_|`)/g, "")
          .trim(),
      );
      const host = random(["/", "?", "#", "\n", "a", ".", "\r", "A", ":"], 12);
      expect(normalizeHostname(host), JSON.stringify(host)).toBe(oldHost(host));
    }
  });
});
