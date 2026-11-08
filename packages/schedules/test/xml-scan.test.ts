/**
 * #174: the feed check's linear scanners answer like the regexes they replaced (seeded random
 * strings plus hand-picked cases) and stay fast on 100k characters of openers without closers.
 */
import { describe, expect, it } from "vitest";
import { urlPath, xmlText } from "../src/feed-check.ts";
import { cdataParts, elementContents, mediaUrlValues } from "../src/xml-scan.ts";

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

/** Fails when `f` takes longer than 1.5 s, the bound of the repo's ReDoS tests (#168). */
function fast<T>(f: () => T): T {
  const start = performance.now();
  const value = f();
  expect(performance.now() - start).toBeLessThan(1500);
  return value;
}

// 200k characters, more where the old regex's cost grew slowly: each case took the replaced
// regex seconds.
const N = 200_000;
const OLD_CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
const OLD_MEDIA = /<(?:enclosure|media:content)\b[^>]*?\burl\s*=\s*(["'])(.*?)\1/g;
const oldBlocks = (text: string, n: string) =>
  [...text.matchAll(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}\\s*>`, "g"))].map(
    (m) => m[1],
  );

describe("feed-check scanners (#174 item 4)", () => {
  it("cdataParts splits as the CDATA regex did", () => {
    for (const raw of strings(["<![CDATA[", "]]>", "a", "]", "<"], 3000, 8)) {
      const parts: { text: string; cdata?: string }[] = [];
      let last = 0;
      for (const m of raw.matchAll(OLD_CDATA)) {
        parts.push({ text: raw.slice(last, m.index), cdata: m[1] as string });
        last = (m.index ?? 0) + m[0].length;
      }
      parts.push({ text: raw.slice(last) });
      expect(cdataParts(raw), raw).toEqual(parts);
    }
    expect(xmlText("a &amp; <![CDATA[<b>&amp;</b>]]> c")).toBe("a & <b>&amp;</b> c");
  });

  it("elementContents finds the blocks the element regex found", () => {
    const parts = ["<item", "</item", ">", " ", "\n", "a", "s", "<"];
    for (const text of strings(parts, 6000, 10)) {
      expect(elementContents(text, "item"), text).toEqual(oldBlocks(text, "item"));
      expect(elementContents(text, "item", 1), text).toEqual(oldBlocks(text, "item").slice(0, 1));
    }
    expect(elementContents("<item a='1'>x</item >y<item>z</item>", "item")).toEqual(["x", "z"]);
  });

  it("mediaUrlValues finds the url attributes the media regex found", () => {
    const parts = ["<enclosure", "<media:content", "url", "=", '"', "'", " ", ">", "\n", "a", "x"];
    for (const text of strings(parts, 8000, 9))
      expect(mediaUrlValues(text), text).toEqual([...text.matchAll(OLD_MEDIA)].map((m) => m[2]));
    expect(mediaUrlValues('<enclosure length="1" url="https://x/a.mp3"/>')).toEqual([
      "https://x/a.mp3",
    ]);
    // A feed with several tags of both kinds: `type=` before and after `url=`, the word `url`
    // in text between tags, and `data-url`. The regex has a word boundary between "-" and "url",
    // so it took `data-url` for the url attribute; the scanner keeps that (results unchanged).
    const feed = [
      "<item><title>The url of the day</title>",
      '<enclosure type="audio/mpeg" url="https://x/1.mp3" length="9"/>',
      "<media:content url='https://x/2.jpg' type=\"image/jpeg\"/>",
      "<description>see url = here</description>",
      '<enclosure data-url="https://x/no" type="a" url = "https://x/3.mp3"/>',
      '<media:content data-url="https://x/no"/><enclosure url="https://x/4.mp3">',
      "</item>",
    ].join("\n");
    expect(mediaUrlValues(feed)).toEqual([
      "https://x/1.mp3",
      "https://x/2.jpg",
      "https://x/no",
      "https://x/no",
      "https://x/4.mp3",
    ]);
    expect(mediaUrlValues(feed)).toEqual([...feed.matchAll(OLD_MEDIA)].map((m) => m[2]));
  });

  it("urlPath trims trailing slashes as before", () => {
    const old = (url: string) => {
      const p = new URL(url.trim(), "https://site.invalid").pathname;
      return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p || "/";
    };
    for (const raw of strings(["/", "a", "b"], 2000, 10)) {
      const url = `https://x/${raw}`;
      expect(urlPath(url), url).toBe(old(url));
    }
  });

  it("stays linear on openers without closers", () => {
    fast(() => cdataParts("<![CDATA[ ".repeat((5 * N) / 10)));
    fast(() => elementContents("<item>".repeat((2 * N) / 6), "item"));
    fast(() => elementContents("<item ".repeat(N / 6), "item"));
    fast(() => elementContents(`<item>${"</item ".repeat(N / 7)}`, "item"));
    fast(() => mediaUrlValues("<enclosure url= ".repeat((2 * N) / 16)));
    fast(() => mediaUrlValues(`<enclosure${' url="'.repeat(N / 6)}`));
    fast(() => mediaUrlValues('<enclosure url="a">'.repeat(N / 19)));
    // Per-tag searches for `>` and `url` used to run to the end of the feed for every tag.
    fast(() => mediaUrlValues('<enclosure url="a" '.repeat((2 * N) / 19)));
    fast(() => mediaUrlValues("<enclosure>".repeat((2 * N) / 11)));
    fast(() =>
      mediaUrlValues(`${'<enclosure url="a" '.repeat(N / 38)}<![CDATA[${"x".repeat(N / 2)}]]>>`),
    );
    expect(mediaUrlValues('<enclosure url="a" '.repeat(3))).toEqual(["a", "a", "a"]);
    fast(() => expect(urlPath(`https://x/a${"/".repeat(N)}b/`)).toBe(`/a${"/".repeat(N)}b`));
  });
});
