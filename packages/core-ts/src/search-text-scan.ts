/**
 * Linear scanners for `searchText` (#174). Each returns what the regex replace it stands for
 * returned, without rescanning to the end of the body for every opener whose closer is missing.
 * The regexes were quadratic on such input, and article bodies come from agents and editors:
 *
 * - `/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm` → `" "` (`stripFences`);
 * - `/!\[([^\]]*)\]\([^)]*\)/g` → `"$1"` and `/\[([^\]]*)\]\([^)]*\)/g` → `"$1"` (`linkTexts`);
 * - `/<[^>]*>/g` → `" "` (`stripTags`).
 */

/** The line terminators `^` and `$` see under the `m` flag. */
const isLineEnd = (ch: string | undefined) =>
  ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029";

/** The first value in sorted `list` that is at least `min`, or undefined. */
function firstAtLeast(list: readonly number[], min: number): number | undefined {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as number) < min) lo = mid + 1;
    else hi = mid;
  }
  return list[lo];
}

/**
 * Fenced blocks replaced by one space. An opening line starts with three or more backticks (or
 * tildes); the block ends at the nearest later line that is exactly that fence, optionally
 * followed by spaces or tabs. Like the regex, a longer opening fence falls back to shorter ones
 * (```` ```` ```` may close at ```` ``` ````), longest first.
 */
export function stripFences(text: string): string {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (isLineEnd(text[i])) starts.push(i + 1);
  // Closing lines by fence (character and length): each line closes exactly one kind.
  const closers = new Map<string, number[]>();
  const fenceAt = (s: number) => {
    const c = text[s];
    if (c !== "`" && c !== "~") return undefined;
    let q = s;
    while (text[q] === c) q++;
    return q - s >= 3 ? { c, length: q - s } : undefined;
  };
  for (const s of starts) {
    const f = fenceAt(s);
    if (!f) continue;
    let e = s + f.length;
    while (text[e] === " " || text[e] === "\t") e++;
    if (e < text.length && !isLineEnd(text[e])) continue;
    const key = f.c + f.length;
    const list = closers.get(key);
    if (list) list.push(s);
    else closers.set(key, [s]);
  }
  let out = "";
  let from = 0;
  // The opening line ends at the next "\n" (not at "\r" or U+2028, which also start lines):
  // openers come in order, so the answer is kept until an opener passes it.
  let nl: number | undefined;
  for (const s of starts) {
    if (s < from) continue;
    const f = fenceAt(s);
    if (!f) continue;
    if (nl === undefined || nl < s) nl = text.indexOf("\n", s);
    if (nl < 0) break; // no "\n" left: no later opener has a body either
    for (let m = f.length; m >= 3; m--) {
      const t = firstAtLeast(closers.get(f.c + m) ?? [], nl + 1);
      if (t === undefined) continue;
      let e = t + m;
      while (text[e] === " " || text[e] === "\t") e++;
      out += `${text.slice(from, s)} `;
      from = e;
      break;
    }
  }
  return from === 0 ? text : out + text.slice(from);
}

/**
 * Markdown links (`[text](url)`) or, with `image`, images (`![alt](url)`) replaced by their text:
 * the bracket text runs to the first `]`, which must be followed by `(`, and the target to the
 * first `)` after it.
 */
export function linkTexts(text: string, image: boolean): string {
  const open = image ? "![" : "[";
  let out = "";
  let from = 0;
  let search = 0;
  for (;;) {
    const j = text.indexOf(open, search);
    if (j < 0) break;
    const k = text.indexOf("]", j + open.length);
    if (k < 0) break; // no `]` left: no later link can close either
    if (text[k + 1] !== "(") {
      // Every opener before this `]` reaches the same `]`, so it fails the same way.
      search = k + 1;
      continue;
    }
    const end = text.indexOf(")", k + 2);
    if (end < 0) break; // no `)` left: no later link can end either
    out += text.slice(from, j) + text.slice(j + open.length, k);
    from = end + 1;
    search = from;
  }
  return from === 0 ? text : out + text.slice(from);
}

/** Every `<…>` (up to the first `>`) replaced by one space. */
export function stripTags(text: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const j = text.indexOf("<", from);
    if (j < 0) break;
    const k = text.indexOf(">", j + 1);
    if (k < 0) break; // no `>` left: no later tag can close either
    out += `${text.slice(from, j)} `;
    from = k + 1;
  }
  return from === 0 ? text : out + text.slice(from);
}
