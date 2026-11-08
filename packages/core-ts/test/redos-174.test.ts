/**
 * #174: every linear rewrite answers like the regex it replaced (seeded random strings over the
 * characters that matter, plus hand-picked cases), and stays fast on input that made the regex
 * backtrack (100k characters or more).
 */
import type { Redirect } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { cssUrlValues, stripCssComments, svgPixels } from "../src/media/css-scan.ts";
import { checkSvg } from "../src/media/svg.ts";
import {
  ancestorPaths,
  joinTarget,
  matchRedirect,
  normalisePath,
  REDIRECT_FROM_MAX_LENGTH,
} from "../src/redirects.ts";
import { DIRECTIVE_LINE, searchText } from "../src/search-rows.ts";
import { linkTexts, stripFences, stripTags } from "../src/search-text-scan.ts";

/** Deterministic strings: every run of the suite checks the same inputs. */
function strings(alphabet: readonly string[], count: number, maxLength: number, seed = 174) {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
  const out: string[] = [];
  for (let n = 0; n < count; n++) {
    let v = "";
    const len = next() % (maxLength + 1);
    for (let i = 0; i < len; i++) v += alphabet[next() % alphabet.length];
    out.push(v);
  }
  return out;
}

/**
 * Runs `f` and fails when it takes longer than 1.5 s, the bound of the repo's ReDoS tests (#168):
 * linear code answers in milliseconds, the replaced regexes took seconds on these inputs.
 */
function fast<T>(f: () => T): T {
  const start = performance.now();
  const value = f();
  expect(performance.now() - start).toBeLessThan(1500);
  return value;
}

const N = 200_000;

describe("redirect paths (#174 item 2)", () => {
  const oldNormalise = (path: string) => {
    const p = path.split(/[?#]/, 1)[0] ?? "/";
    return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p || "/";
  };
  const oldAncestors = (path: string) => {
    const out: string[] = [];
    let p = path;
    while (p.length > 1) {
      p = p.slice(0, p.lastIndexOf("/")) || "/";
      out.push(p);
    }
    return out;
  };
  /** What a redirect `from` can be (the contract's pattern). */
  const FROM = /^\/(?:[^\s?#/\\]+(?:\/[^\s?#/\\]+)*)?$/;
  /** The contract's `maxLength` counts code points (ajv), not UTF-16 units. */
  const validFrom = (a: string) => FROM.test(a) && [...a].length <= REDIRECT_FROM_MAX_LENGTH;
  const usable = (list: string[]) => list.filter(validFrom);

  it("normalisePath and joinTarget answer as before", () => {
    for (const p of strings(["/", "a", "?", "#", "b"], 3000, 12))
      expect(normalisePath(p), p).toBe(oldNormalise(p));
    for (const to of strings(["/", "x", "?", "#"], 500, 8))
      for (const rest of ["", "/r", "/r/s"])
        expect(joinTarget(to, rest)).toBe(
          (() => {
            if (!rest) return to;
            const i = to.search(/[?#]/);
            const head = i < 0 ? to : to.slice(0, i);
            return `${head.replace(/\/+$/, "")}${rest}${i < 0 ? "" : to.slice(i)}`;
          })(),
        );
  });

  it("ancestorPaths keeps every ancestor a redirect could match", () => {
    for (const raw of strings(["/", "a", "b"], 3000, 12)) {
      const p = `/${raw}`;
      expect(ancestorPaths(p), p).toEqual(oldAncestors(p).filter(validFrom));
      expect(
        ancestorPaths(p).every((a) => FROM.test(a)),
        p,
      ).toBe(true);
    }
    const redirects = ["/a", "/a/b", "/"].map(
      (from) =>
        ({ from, to: `/new${from}`, match: "prefix", locale: undefined }) as unknown as Redirect,
    );
    expect(matchRedirect(redirects, "/a//x")?.redirect.from).toBe("/a");
    expect(matchRedirect(redirects, "/a/b//c")?.redirect.from).toBe("/a/b");
    expect(matchRedirect(redirects, "//x")?.redirect.from).toBe("/");
  });

  it("counts a from's length in code points, and never cuts inside a `//`", () => {
    // 600 astral characters: 601 code points (a valid `from`), 1201 UTF-16 units.
    const from = `/${"😀".repeat(600)}`;
    const redirect = { from, to: "/new", match: "prefix" } as unknown as Redirect;
    expect(matchRedirect([redirect], `${from}/x`)?.location).toBe("/new/x");
    // Long enough for the cut (more than 2 × 1024 units): the walk still starts at `from`.
    const tail = `/${"x".repeat(1000)}`;
    expect(matchRedirect([redirect], `${from}${tail}`)?.location).toBe(`/new${tail}`);
    // A `//` right at the cut: the first ancestor stops before it, never ending in "/".
    for (const p of [
      `/${"a".repeat(1022)}//b`,
      `/${"a".repeat(2046)}//b`,
      `/${"a".repeat(2047)}//b`,
    ]) {
      const list = ancestorPaths(p);
      expect(list[0], `${p.length}`).toBe(p.slice(0, p.indexOf("//")));
      expect(list.every((a) => a === "/" || !a.endsWith("/"))).toBe(true);
      expect(usable(list)).toEqual(usable(oldAncestors(p)));
    }
  });

  it("stays linear on long runs of slashes", () => {
    fast(() => expect(normalisePath(`/a${"/".repeat(N)}b/`)).toBe(`/a${"/".repeat(N)}b`));
    fast(() => expect(joinTarget(`/t${"/".repeat(N)}`, "/r")).toBe("/t/r"));
    fast(() => expect(ancestorPaths(`/a${"/".repeat(N)}b`)).toEqual(["/a", "/"]));
    // Many short segments: only ancestors within a `from`'s length are listed, so the output
    // stays bounded (it used to be one ancestor per segment, quadratic in total size).
    const long = "/a".repeat(N / 2);
    const ancestors = fast(() => ancestorPaths(long));
    expect(ancestors[0]).toBe("/a".repeat(REDIRECT_FROM_MAX_LENGTH));
    expect(usable(ancestors)).toEqual(usable(oldAncestors(long.slice(0, 5000))));
    const units = 2 * REDIRECT_FROM_MAX_LENGTH;
    expect(ancestors.reduce((n, a) => n + a.length, 0)).toBeLessThanOrEqual(
      units * (units / 2 + 1),
    );
    // Long fuzzed paths (some astral) keep every ancestor a `from` could be.
    for (const raw of strings(["/", "a", "bb", "😀"], 300, 1600)) {
      const p = `/${raw}`;
      expect(usable(ancestorPaths(p))).toEqual(usable(oldAncestors(p)));
    }
  });
});

describe("SVG CSS (#174 item 4)", () => {
  const OLD_URL = /url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
  const oldLength = (value: string) => {
    const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
    return m ? Number(m[1]) : undefined;
  };

  it("answers as the regexes did", () => {
    for (const css of strings(["/", "*", "a", " ", "\n"], 3000, 14))
      expect(stripCssComments(css), css).toBe(css.replace(/\/\*[\s\S]*?\*\//g, ""));
    const urlParts = ["url", "URL", "(", ")", "'", '"', " ", "#a", "x", "\t"];
    for (const css of strings(urlParts, 5000, 9))
      expect(cssUrlValues(css), css).toEqual([...css.matchAll(OLD_URL)].map((m) => m[2]));
    for (const v of strings(["1", ".", "p", "x", " ", "\t"], 3000, 8))
      expect(svgPixels(v), JSON.stringify(v)).toBe(oldLength(v));
    expect(svgPixels(undefined)).toBeUndefined();
    expect(svgPixels("")).toBeUndefined();
  });

  it("stays linear on unclosed comments, url( runs and long lengths", () => {
    fast(() => stripCssComments("/* ".repeat((2 * N) / 3)));
    fast(() => cssUrlValues(`url(${" ".repeat(N)}`));
    fast(() => cssUrlValues("url(".repeat(N / 4)));
    fast(() => cssUrlValues(`url('${"a".repeat(N)}`));
    fast(() => svgPixels(`${"1".repeat(N)}x`));
    fast(() => svgPixels(`1${" ".repeat(N)}x`));
    // The old `url(` check took minutes on 20k spaces; a whole document with them is quick now
    // (attribute values are read from a 64 KiB window, so the document case stays below it).
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="fill: url(${" ".repeat(20_000)}"/>`;
    expect(fast(() => checkSvg(svg)).ok).toBe(true);
  });
});

describe("search text (#174 item 4)", () => {
  const OLD_FENCE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;

  it("answers as the regexes did", () => {
    const fenceParts = ["`", "`", "`", "~", "~", "a", " ", "\t", "\n", "\n", "\r"];
    for (const t of strings(fenceParts, 8000, 24))
      expect(stripFences(t), JSON.stringify(t)).toBe(t.replace(OLD_FENCE, " "));
    for (const t of [
      "```\ncode\n```",
      "````\ncode\n```\nafter",
      "~~~ js\na\n~~~  \nb",
      "```\r\ncode\r\n```\r\n",
      "```\nnever closed",
      "text\n```a\n```\n```\n",
    ])
      expect(stripFences(t), JSON.stringify(t)).toBe(t.replace(OLD_FENCE, " "));
    const linkParts = ["!", "[", "]", "(", ")", "a", "\n"];
    for (const t of strings(linkParts, 5000, 14)) {
      expect(linkTexts(t, true), t).toBe(t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"));
      expect(linkTexts(t, false), t).toBe(t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
    }
    for (const t of strings(["<", ">", "a", "\n"], 3000, 12))
      expect(stripTags(t), t).toBe(t.replace(/<[^>]*>/g, " "));
    // The directive pattern now keeps its braces on one line; without "\r" or U+2028/2029 in
    // the body (markdown from Studio and agents is "\n"-only) it matches as before.
    const OLD_DIRECTIVE = /^:{2,}[a-z][\w-]*(\{[^\n]*\})?[ \t]*$/gim;
    for (const t of strings([":", ":", "a", "{", "}", " ", "\n", "x", '"', "="], 4000, 14))
      expect(t.replace(DIRECTIVE_LINE, "<$1>"), JSON.stringify(t)).toBe(
        t.replace(OLD_DIRECTIVE, "<$1>"),
      );
  });

  it("stays linear on openers without closers", () => {
    fast(() => stripFences("```a\n".repeat(N / 5)));
    // Line ends without "\n": every opener used to search to the end for one.
    fast(() => stripFences("```a\r".repeat(N / 5)));
    fast(() => stripFences("```a\u2028".repeat(N / 5)));
    fast(() => stripFences(`${"```a\r".repeat(N / 5)}\n`));
    fast(() => stripFences("```a\u2029".repeat(N / 5)));
    fast(() => stripFences("```a\r\n".repeat(N / 6)));
    // Directive lines with CR endings: `[^\n]*` used to run across every following line.
    fast(() => searchText({ format: "markdown", value: "::a{}x\r".repeat(N / 7) }));
    fast(() => searchText({ format: "markdown", value: "::a{}x\u2028".repeat(N / 7) }));
    fast(() => searchText({ format: "markdown", value: "::a{}x\u2029".repeat(N / 7) }));
    fast(() => linkTexts("![a".repeat(N / 3), true));
    fast(() => linkTexts("[a](".repeat(N / 4), false));
    fast(() => linkTexts("[a]x".repeat(N / 4), false));
    fast(() => stripTags("<a".repeat(N / 2)));
    fast(() => searchText({ format: "markdown", value: `${"```a\n[x](<".repeat(N / 10)}` }));
  });
});
