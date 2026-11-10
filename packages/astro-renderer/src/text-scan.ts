/**
 * Linear scanners for text the renderer reads from markdown and from the HTML it rendered
 * (AGENTS.md rule 13). Each replaces a regex CodeQL reported as polynomial backtracking
 * (js/polynomial-redos) and gives the same answers on ordinary input; `test/text-scan.test.ts`
 * checks each against the regex it replaced and against a 100k-character adversarial input.
 */

const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * `html` with every tag (`<` up to the next `>`) replaced by `gap`: what
 * `.replace(/<[^>]*>/g, gap)` did, without rescanning to the end from every `<` when no `>`
 * follows. As there, a `<` with no `>` after it stays.
 */
export function stripTags(html: string, gap: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const open = html.indexOf("<", at);
    if (open === -1) break;
    const close = html.indexOf(">", open + 1);
    if (close === -1) break;
    out += html.slice(at, open) + gap;
    at = close + 1;
  }
  return at === 0 ? html : out + html.slice(at);
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

/**
 * Text of HTML this module's callers rendered (meta and feed descriptions, JSON-LD,
 * table-of-contents labels, heading ids, reading time): tags dropped, entities decoded once,
 * whitespace collapsed.
 *
 * **Plain text, not HTML.** Decoding is the point (`Array&lt;string&gt;` reads `Array<string>`),
 * so the result can hold `<script>` when the source said `&lt;script&gt;`. Every sink escapes it
 * for its context, and `test/html-text-sinks.test.ts` checks each one with that input: Astro
 * attributes and text (meta, og, twitter, the table of contents), `jsonLdText` (JSON-LD:
 * `<`, `>` and `&` as `\u003c`…, so no `</script>` or `<!--`), the feeds' `xml()` (RSS). A new
 * caller must put the result through an escaping sink too, never `set:html`.
 *
 * Entities are decoded in one pass, so `&amp;lt;` is the text `&lt;`, and `&amp;#60;` the text
 * `&#60;` (the regex chain before decoded those twice).
 */
export function htmlText(html: string): string {
  return stripTags(html, " ")
    .replace(/&(amp|lt|gt|quot|#39|#(\d{1,7}));/g, (m, name: string, code: string | undefined) => {
      if (code === undefined) return NAMED[name] ?? m;
      const n = Number(code);
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** `\s` runs and the last `\n` inside them, for `leadingHeading`. */
function skipSpace(text: string, from: number): { end: number; lastNl: number } {
  let i = from;
  let lastNl = -1;
  for (; isSpace(text[i]); i++) if (text[i] === "\n") lastNl = i;
  return { end: i, lastNl };
}

/**
 * Where `\s*#*\s*(?:\r?\n|$)` from `at` ends (the old regex's tail, with its backtracking worked
 * out): at the end of the text when only whitespace and `#`s are left; else after the last `\n`
 * of the whitespace after the `#`s; else after the last `\n` of the whitespace before them; -1
 * when none of those exist.
 */
function headingTailEnd(text: string, at: number): number {
  const before = skipSpace(text, at);
  if (before.end === text.length) return text.length;
  let hashes = before.end;
  while (text[hashes] === "#") hashes++;
  const after = skipSpace(text, hashes);
  if (after.end === text.length) return text.length;
  if (after.lastNl !== -1) return after.lastNl + 1;
  return before.lastNl !== -1 ? before.lastNl + 1 : -1;
}

/**
 * The opening ATX heading of a markdown body (`# Title`, closing `#`s allowed): its text, and how
 * much of the body it takes (the blank lines and `#`-only lines after it too). Exactly what
 * `/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/` matched (text trimmed), in one pass: that regex was cubic
 * on a heading line of spaces (CodeQL js/polynomial-redos, alert 17).
 */
export function leadingHeading(markdown: string): { text: string; length: number } | undefined {
  let p = 0;
  while (isSpace(markdown[p])) p++;
  if (markdown[p] !== "#") return undefined;
  p++;
  // `\s+`: at least one, and it may cross line breaks.
  const r = skipSpace(markdown, p).end;
  if (r === p) return undefined;
  if (r < markdown.length) {
    // `(.+?)` from `r` up to the line's end: the shortest text whose rest of line is `\s*#*\s*`.
    let lineEnd = r;
    while (lineEnd < markdown.length && !LINE_BREAK.test(markdown[lineEnd] as string)) lineEnd++;
    // The tail must cover the rest of the line (it holds no `\n` there), so the text ends where
    // the line's last `\s*#*\s*` starts. Past the line the tail runs on through whitespace (a
    // `\u2028` or a lone `\r` is whitespace, not a `\n`), so where the `#`s fall can differ: a
    // text ending before the line's closing `#`s, or one keeping them and ending before the
    // trailing whitespace. The earlier one that works is the regex's (lazy) answer.
    let trailing = lineEnd;
    while (trailing > r && isSpace(markdown[trailing - 1])) trailing--;
    let closing = trailing;
    while (closing > r && markdown[closing - 1] === "#") closing--;
    while (closing > r && isSpace(markdown[closing - 1])) closing--;
    for (const e of new Set([Math.max(closing, r + 1), Math.max(trailing, r + 1)])) {
      const end = headingTailEnd(markdown, e);
      if (end !== -1) return { text: markdown.slice(r, e).trim(), length: end };
    }
  }
  // No text from `r` works (or the whitespace runs to the end): the regex backs `\s+` off,
  // keeping at least one, until `(.+?)` can take one whitespace character that is not a line
  // break and the tail after it ends: at the end of the text, or after a `\n` before `r`.
  const run = skipSpace(markdown, p);
  const tailEnd = r === markdown.length ? r : run.lastNl;
  for (let q = tailEnd - 1; q > p; q--)
    if (!LINE_BREAK.test(markdown[q] as string))
      return { text: "", length: r === markdown.length ? r : run.lastNl + 1 };
  return undefined;
}

/** A heading `renderMarkdown` wrote: `<h2 id="…">…</h2>` or `<h3 …>`. */
export interface HeadingMatch {
  depth: 2 | 3;
  id: string;
  inner: string;
}

/**
 * The `<h2 id="…">…</h2>` and `<h3 id="…">…</h3>` of rendered HTML, in order: what
 * `/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g` found, without rescanning to the end from every
 * opening tag when its closing tag is missing.
 */
export function renderedHeadings(html: string): HeadingMatch[] {
  const out: HeadingMatch[] = [];
  // Where the next `</h2>` / `</h3>` is (-1: none after the last search), so each is searched once.
  const closer = { 2: -2, 3: -2 } as Record<2 | 3, number>;
  let at = 0;
  for (;;) {
    const open = html.indexOf("<h", at);
    if (open === -1) return out;
    at = open + 1;
    const digit = html[open + 2];
    if (digit !== "2" && digit !== "3") continue;
    if (!html.startsWith(' id="', open + 3)) continue;
    const idStart = open + 8;
    const idEnd = html.indexOf('"', idStart);
    if (idEnd <= idStart || html[idEnd + 1] !== ">") continue;
    const depth = digit === "2" ? 2 : 3;
    const innerStart = idEnd + 2;
    if (closer[depth] !== -1 && closer[depth] < innerStart)
      closer[depth] = html.indexOf(`</h${depth}>`, innerStart);
    const end = closer[depth];
    if (end === -1) continue;
    out.push({ depth, id: html.slice(idStart, idEnd), inner: html.slice(innerStart, end) });
    at = end + 5;
  }
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /\w/.test(c);

/**
 * Whether a line of `markdown`, after leading whitespace and `>` quote markers, starts with an
 * `::embed` directive: what `/(^|\n)\s*(?:>\s*)*::embed\b/` tested, in one pass. That regex
 * retried its whitespace run from every line start of a run of blank lines.
 */
export function hasEmbedLine(markdown: string): boolean {
  let at = 0;
  for (;;) {
    let i = at;
    while (i < markdown.length && (markdown[i] === ">" || isSpace(markdown[i]))) i++;
    if (markdown.startsWith("::embed", i) && !isWordChar(markdown[i + 7])) return true;
    // Line starts inside the skipped run lead to the same place; the next one after it may not.
    const nl = markdown.indexOf("\n", i);
    if (nl === -1) return false;
    at = nl + 1;
  }
}
