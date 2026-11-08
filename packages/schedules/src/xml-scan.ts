/**
 * Linear scanners for the feed check (#174). Each returns what the regex it replaces returned,
 * without rescanning to the end of the document for every opener whose closer is missing:
 * `/<!\[CDATA\[([\s\S]*?)\]\]>/g`, `<name(?:\s[^>]*)?>([\s\S]*?)</name\s*>` and
 * `/<(?:enclosure|media:content)\b[^>]*?\burl\s*=\s*(["'])(.*?)\1/g` were quadratic on such input.
 */

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
const isWord = (ch: string | undefined) => ch !== undefined && /\w/.test(ch);
/** What `.` does not match without the `s` flag. */
const isLineEnd = (ch: string) => ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029";

const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";

/** `raw` split into text outside CDATA sections and their contents, in order. */
export function cdataParts(raw: string): { text: string; cdata?: string }[] {
  const out: { text: string; cdata?: string }[] = [];
  let from = 0;
  for (;;) {
    const open = raw.indexOf(CDATA_OPEN, from);
    if (open < 0) break;
    const close = raw.indexOf(CDATA_CLOSE, open + CDATA_OPEN.length);
    // No closer after this opener means none after any later one either.
    if (close < 0) break;
    out.push({ text: raw.slice(from, open), cdata: raw.slice(open + CDATA_OPEN.length, close) });
    from = close + CDATA_CLOSE.length;
  }
  out.push({ text: raw.slice(from) });
  return out;
}

/**
 * The contents of every `<name>…</name>` element (an opening tag `<name>` or `<name …>`, the
 * nearest `</name>` closer, whitespace allowed before its `>`), as group 1 of the global regex.
 * `limit` stops after that many (1 for the first, as a non-global `exec` finds it).
 */
export function elementContents(text: string, name: string, limit = Infinity): string[] {
  const out: string[] = [];
  const open = `<${name}`;
  const close = `</${name}`;
  // Searches start at growing positions, so each "first … at or after" answer can be kept.
  let gt: number | undefined; // -1: no `>` left
  const nextGt = (from: number) => {
    if (gt === undefined || (gt >= 0 && gt < from)) gt = text.indexOf(">", from);
    return gt;
  };
  let closer: { at: number; end: number } | undefined | null;
  const nextCloser = (from: number): { at: number; end: number } | undefined => {
    if (closer === null) return undefined;
    if (closer && closer.at >= from) return closer;
    for (let c = text.indexOf(close, from); c >= 0; c = text.indexOf(close, c + 1)) {
      let j = c + close.length;
      while (isSpace(text[j])) j++;
      if (text[j] === ">") {
        closer = { at: c, end: j + 1 };
        return closer;
      }
    }
    closer = null;
    return undefined;
  };
  for (let at = text.indexOf(open); at >= 0 && out.length < limit; ) {
    const after = at + open.length;
    let start: number | undefined;
    if (text[after] === ">") start = after + 1;
    else if (isSpace(text[after])) {
      const g = nextGt(after + 1);
      if (g < 0) break; // no `>` left: no later opening tag can end either
      start = g + 1;
    }
    if (start === undefined) {
      at = text.indexOf(open, at + 1);
      continue;
    }
    const c = nextCloser(start);
    if (!c) break; // no closer left: no later element can end either
    out.push(text.slice(start, c.at));
    at = text.indexOf(open, c.end);
  }
  return out;
}

const MEDIA_TAGS = ["<enclosure", "<media:content"] as const;

/**
 * The next `<enclosure` or `<media:content` tag at or after a position, followed by a non-word
 * character (the regex's `\b`). Positions only grow, so each name's next tag is kept between calls.
 */
function mediaTagFinder(text: string) {
  const next = new Map<string, number>(); // -1: none left
  const find = (tag: string, from: number) => {
    const known = next.get(tag);
    if (known !== undefined && (known < 0 || known >= from)) return known;
    let at = text.indexOf(tag, from);
    while (at >= 0 && isWord(text[at + tag.length])) at = text.indexOf(tag, at + 1);
    next.set(tag, at);
    return at;
  };
  return (from: number): { at: number; nameEnd: number } | undefined => {
    let best: { at: number; nameEnd: number } | undefined;
    for (const tag of MEDIA_TAGS) {
      const at = find(tag, from);
      if (at >= 0 && (!best || at < best.at)) best = { at, nameEnd: at + tag.length };
    }
    return best;
  };
}

/** At `p`: `url`, optional spaces, `=`, optional spaces, a quote; the value and where it ends. */
function urlAttribute(text: string, p: number): { value: string; end: number } | undefined {
  if (isWord(text[p - 1]) || !text.startsWith("url", p)) return undefined;
  let i = p + 3;
  while (isSpace(text[i])) i++;
  if (text[i] !== "=") return undefined;
  i++;
  while (isSpace(text[i])) i++;
  const q = text[i];
  if (q !== '"' && q !== "'") return undefined;
  for (let j = i + 1; j < text.length; j++) {
    const ch = text[j] as string;
    if (ch === q) return { value: text.slice(i + 1, j), end: j + 1 };
    if (isLineEnd(ch)) return undefined;
  }
  return undefined;
}

/**
 * The `url="…"` values of `<enclosure>` and `<media:content>` tags, as group 2 of the regex: the
 * first `url` attribute inside the tag (before its `>`) whose quoted value closes on its line.
 */
export function mediaUrlValues(text: string): string[] {
  const out: string[] = [];
  const nextTag = mediaTagFinder(text);
  let from = 0;
  for (let tag = nextTag(from); tag; tag = nextTag(from)) {
    const gt = text.indexOf(">", tag.nameEnd);
    const stop = gt < 0 ? text.length : gt;
    let found: { value: string; end: number } | undefined;
    for (
      let p = text.indexOf("url", tag.nameEnd);
      p >= 0 && p < stop;
      p = text.indexOf("url", p + 1)
    ) {
      found = urlAttribute(text, p);
      if (found) break;
    }
    if (found) {
      out.push(found.value);
      from = found.end;
      continue;
    }
    // Every later tag that starts before this `>` sees the same candidates, which all failed.
    if (gt < 0) break;
    from = gt + 1;
  }
  return out;
}
