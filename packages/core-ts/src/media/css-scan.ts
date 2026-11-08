/**
 * Linear scanners for the SVG checks (#174). They return what the regexes they replace returned,
 * without the backtracking: `/\/\*[\s\S]*?\*\//g` rescanned to the end for every unclosed `/*`,
 * and `/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi` was about cubic on `url(` followed by spaces
 * (its two `\s*` and the value class overlap). Uploaded SVGs reach both.
 */

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

/** `css` with every `/* … *\/` comment removed, as `css.replace(/\/\*[\s\S]*?\*\//g, "")`. */
export function stripCssComments(css: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const open = css.indexOf("/*", from);
    if (open < 0) break;
    const close = css.indexOf("*/", open + 2);
    // No closer after this opener means none after any later one either.
    if (close < 0) break;
    out += css.slice(from, open);
    from = close + 2;
  }
  return from === 0 ? css : out + css.slice(from);
}

/**
 * The values of `url(…)` references, as group 2 of
 * `css.matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi)`: quoted, the text between the quotes;
 * unquoted, everything after the opening spaces up to `)`.
 */
export function cssUrlValues(css: string): string[] {
  const out: string[] = [];
  // The first `'`, `"` or `)` at or after a position; positions only grow, so the cache holds.
  let special = -1;
  const nextSpecial = (from: number) => {
    if (special >= from) return special;
    special = css.length;
    for (let i = from; i < css.length; i++) {
      const ch = css[i];
      if (ch === "'" || ch === '"' || ch === ")") {
        special = i;
        break;
      }
    }
    return special;
  };
  let end = 0;
  for (const m of css.matchAll(/url/gi)) {
    const at = m.index ?? 0;
    if (at < end) continue;
    let i = at + 3;
    while (isSpace(css[i])) i++;
    if (css[i] !== "(") continue;
    i++;
    while (isSpace(css[i])) i++;
    const q = css[i];
    if (q === "'" || q === '"') {
      const close = nextSpecial(i + 1);
      if (css[close] !== q) continue;
      let j = close + 1;
      while (isSpace(css[j])) j++;
      if (css[j] !== ")") continue;
      out.push(css.slice(i + 1, close));
      end = j + 1;
    } else {
      const close = nextSpecial(i);
      if (css[close] !== ")") continue;
      out.push(css.slice(i, close));
      end = close + 1;
    }
  }
  return out;
}

/**
 * An SVG length as `/^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/` read it: a number (`12`, `1.5`, `.5`),
 * optionally followed by `px`, with whitespace around; undefined otherwise.
 */
export function svgPixels(value: string | undefined): number | undefined {
  if (!value) return undefined;
  let v = value.trim();
  if (v.endsWith("px")) v = v.slice(0, -2).trimEnd();
  return /^(?:[0-9]+|[0-9]*\.[0-9]+)$/.test(v) ? Number(v) : undefined;
}
