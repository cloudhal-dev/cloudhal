/**
 * Linear scanners behind `escapeMarkdown` and `markdownToPlain` (AGENTS.md rule 13). Each gives
 * the same answers as the regex it replaced; those backtracked quadratically on field values
 * with many `![` or `](` (CodeQL js/polynomial-redos, alert 23) or many blank lines.
 */

const isBreak = (c: string | undefined): boolean =>
  c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029";
const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);

/** The start of the line after the first line break at or after `from` (`-1`: none). */
function nextLineStart(text: string, from: number): number {
  for (let k = from; k < text.length; k++) if (isBreak(text[k])) return k + 1;
  return -1;
}

/**
 * A `\` inserted where `find` says, once per line start: what
 * `.replace(/^(\s*)…/gm, "$1\\…")` did. As in that regex, `\s*` runs across blank lines, and a
 * line start inside a run already tried leads to the same place, so it is not tried again.
 * `find(text, at)` gets the first non-space position and returns where the `\` goes, or -1.
 */
export function escapeAtLineStarts(
  text: string,
  find: (text: string, at: number) => number,
): string {
  let out = "";
  let copied = 0;
  for (let start = 0; start !== -1; ) {
    let at = start;
    while (isSpace(text[at])) at++;
    const insert = find(text, at);
    let next = at;
    if (insert !== -1) {
      out += `${text.slice(copied, insert)}\\`;
      copied = insert;
      next = insert + 1;
    }
    start = nextLineStart(text, next);
  }
  return copied === 0 && out === "" ? text : out + text.slice(copied);
}

/**
 * `line` with each `[text](target)` (or `![alt](src)` for `"!["`) replaced by its text: what
 * `.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")` did, without rescanning to the end from every
 * opener when no `]` or `)` follows.
 */
export function unlink(line: string, opener: "[" | "!["): string {
  let out = "";
  let copied = 0;
  let at = 0;
  for (;;) {
    const open = line.indexOf(opener, at);
    if (open === -1) break;
    const textStart = open + opener.length;
    const close = line.indexOf("]", textStart);
    if (close === -1) break;
    // Every opener before this `]` stops at it too, and fails the same way.
    if (line[close + 1] !== "(") {
      at = close + 1;
      continue;
    }
    const end = line.indexOf(")", close + 2);
    if (end === -1) break;
    out += line.slice(copied, open) + line.slice(textStart, close);
    copied = at = end + 1;
  }
  return copied === 0 ? line : out + line.slice(copied);
}
