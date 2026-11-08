/**
 * The two line shapes of SKILL.md frontmatter, matched in one linear pass each (#174). They give
 * the groups `/^\s+([^:]+):\s*(.*)$/` and `/^([A-Za-z][\w-]*):\s*(.*)$/` gave, including where
 * those regexes backtracked: the first one's `\s+` and `[^:]+` both take whitespace, which made a
 * line of spaces quadratic, and each `\s*` overlapped `(.*)` before a lone `\r`.
 */

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
/** What `.` does not match without the `s` flag. */
const LINE_END = /[\n\r\u2028\u2029]/;

/** After the `:` at `colon`: whitespace skipped; undefined when the rest holds a line end. */
function valueAfter(raw: string, colon: number): string | undefined {
  let i = colon + 1;
  while (isSpace(raw[i])) i++;
  const rest = raw.slice(i);
  return LINE_END.test(rest) ? undefined : rest;
}

/** An indented `key: value` line (a nested map entry): `[key, value]`, or undefined. */
export function nestedLine(raw: string): [string, string] | undefined {
  let lead = 0;
  while (isSpace(raw[lead])) lead++;
  if (lead === 0) return undefined;
  const colon = raw.indexOf(":");
  if (colon < 0) return undefined;
  // The key needs a character: when the indent runs up to the `:`, its last space is the key.
  const start = lead < colon ? lead : lead >= 2 ? lead - 1 : -1;
  if (start < 0) return undefined;
  const value = valueAfter(raw, colon);
  return value === undefined ? undefined : [raw.slice(start, colon), value];
}

/** A top-level `key: value` line, the key a letter then letters, digits, `_` or `-`. */
export function topLine(raw: string): [string, string] | undefined {
  if (!/^[A-Za-z]/.test(raw)) return undefined;
  let j = 1;
  while (j < raw.length && /[\w-]/.test(raw[j] as string)) j++;
  if (raw[j] !== ":") return undefined;
  const value = valueAfter(raw, j);
  return value === undefined ? undefined : [raw.slice(0, j), value];
}
