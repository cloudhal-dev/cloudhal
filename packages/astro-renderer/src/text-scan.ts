/**
 * Linear scanners for text the renderer reads from markdown and from the HTML it rendered
 * (AGENTS.md rule 13). Each replaces a regex CodeQL reported as polynomial backtracking
 * (js/polynomial-redos) and gives the same answers on ordinary input; `test/text-scan.test.ts`
 * checks each against the regex it replaced and against a 100k-character adversarial input.
 */

const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);
const LINE_BREAK = /[\n\r\u2028\u2029]/;
/** Whitespace that is not a line break. */
const isInlineSpace = (c: string | undefined): boolean =>
  isSpace(c) && !LINE_BREAK.test(c as string);

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
 * `<` before one of these opens markup in HTML (a start or end tag, a comment, a declaration, a
 * processing instruction); before anything else it is text.
 */
const MARKUP_START = /<(?=[A-Za-z/!?])/g;

/**
 * Text of HTML this module's callers rendered (meta descriptions, feed descriptions, JSON-LD,
 * table-of-contents labels, heading ids, reading time): tags dropped, entities decoded once,
 * whitespace collapsed.
 *
 * Safe by construction (CodeQL js/incomplete-multi-character-sanitization): the result never holds
 * markup. Decoding `&lt;script&gt;` would otherwise produce `<script>` after the tags were
 * stripped, so a `<` that would open markup (a letter, `/`, `!` or `?` after it) becomes U+FF1C
 * FULLWIDTH LESS-THAN SIGN, which reads the same and is never markup; `a < b` and `x<5` stay as
 * they are. Every caller's sink escapes as well (Astro attributes, `jsonLdText`, the feeds' `xml`),
 * so this is the second line, not the only one. Entities are decoded in one pass, so `&amp;lt;`
 * is the text `&lt;`, not `<`.
 */
export function htmlText(html: string): string {
  return stripTags(html, " ")
    .replace(/&(amp|lt|gt|quot|#39|#(\d{1,7}));/g, (m, name: string, code: string | undefined) => {
      if (code === undefined) return NAMED[name] ?? m;
      const n = Number(code);
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(MARKUP_START, "\uFF1C")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The opening ATX heading of a markdown body (`# Title`, closing `#`s allowed) when it is the
 * first non-blank line: its text, and how much of the body it and the blank lines after it take.
 * What `/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/` matched on ordinary bodies, linearly (that regex was
 * cubic on a heading line of spaces). One difference, on purpose: the space after `#` must be on
 * the same line, as in CommonMark, so `#` alone on a line followed by text is not a heading.
 */
export function leadingHeading(markdown: string): { text: string; length: number } | undefined {
  let i = 0;
  while (isSpace(markdown[i])) i++;
  if (markdown[i] !== "#") return undefined;
  i++;
  const afterHash = i;
  while (isInlineSpace(markdown[i])) i++;
  if (i === afterHash) return undefined;
  const nl = markdown.indexOf("\n", i);
  const lineEnd = nl === -1 ? markdown.length : nl;
  // The heading's text: the line without trailing spaces, closing `#`s and the spaces before them.
  let end = lineEnd;
  while (end > i && isSpace(markdown[end - 1])) end--;
  while (end > i && markdown[end - 1] === "#") end--;
  while (end > i && isSpace(markdown[end - 1])) end--;
  const text = markdown.slice(i, end);
  if (text === "" || LINE_BREAK.test(text)) return undefined;
  if (nl === -1) return { text, length: markdown.length };
  // The blank lines after it go too: up to the last line break of the whitespace that follows,
  // or to the end when only whitespace follows.
  let length = nl + 1;
  let j = length;
  while (isSpace(markdown[j])) {
    if (markdown[j] === "\n") length = j + 1;
    j++;
  }
  return { text, length: j === markdown.length ? j : length };
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
