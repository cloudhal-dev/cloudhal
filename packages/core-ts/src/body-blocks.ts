/**
 * Markdown bodies as blocks (RFC-0014 §2) and what changed between two of them (§5).
 *
 * - `splitMarkdown` is the normative splitter: top-level blocks from `marked`'s lexer with GFM.
 *   Joining every block's `text` (its `raw` plus the blank lines after it) after the prefix gives
 *   back the source exactly. `@cloudhal/ui/editor` and the store use this one function.
 * - `bodyDiff` aligns two bodies block by block (longest common subsequence of their trimmed
 *   sources), pairs what was removed and added between two kept blocks into "changed" blocks when
 *   they still share most of their words, and diffs those word by word.
 *
 * Body directives (RFC-0015, `directives.ts`) are one block each, whatever they wrap; their type
 * is `directive:<name>`.
 *
 * Worker-safe: `marked` only, no Node APIs.
 */
import { Marked, type TokenizerAndRendererExtension, type Tokens } from "marked";
import { type Directive, directiveStart, matchDirective } from "./directives.ts";

/** One top-level block of a markdown body. */
export interface MarkdownUnit {
  /**
   * `marked`'s token type (`paragraph`, `heading`, `list`, `table`, `code`, `html`, `def`, …), or
   * `directive:<name>` for a body directive.
   */
  type: string;
  /** The block's own source. */
  raw: string;
  /** `raw` plus the blank lines that follow it: what joining blocks back together uses. */
  text: string;
}

export interface SplitMarkdown {
  /** Blank lines before the first block. */
  prefix: string;
  units: MarkdownUnit[];
}

/** A body directive as `marked` sees it; a container's inner markdown is lexed into `tokens`. */
export interface DirectiveToken extends Tokens.Generic {
  type: "directive";
  raw: string;
  directive: Directive;
  tokens: Tokens.Generic[];
}

/**
 * Teaches a `marked` instance body directives (block level). The splitter, the store and the
 * site renderer share it, so a directive is one block everywhere; renderers add a `renderer`.
 */
export const directiveExtension: TokenizerAndRendererExtension = {
  name: "directive",
  level: "block",
  start: (src) => directiveStart(src),
  tokenizer(src) {
    const m = matchDirective(src);
    if (!m) return undefined;
    const token: DirectiveToken = {
      type: "directive",
      raw: m.raw,
      directive: m.directive,
      tokens: m.directive.content ? this.lexer.blockTokens(m.directive.content, []) : [],
    };
    return token;
  },
  childTokens: ["tokens"],
};

const marked = new Marked({ gfm: true, async: false });
marked.use({ extensions: [directiveExtension] });

/** Top-level blocks of a markdown body; `prefix + units.map(u => u.text).join("")` is the source. */
export function splitMarkdown(markdown: string): SplitMarkdown {
  let prefix = "";
  const units: MarkdownUnit[] = [];
  for (const token of marked.lexer(markdown)) {
    const last = units.at(-1);
    if (token.type === "space") {
      if (last) last.text += token.raw;
      else prefix += token.raw;
      continue;
    }
    const type =
      token.type === "directive"
        ? `directive:${(token as DirectiveToken).directive.name}`
        : token.type;
    units.push({ type, raw: token.raw, text: token.raw });
  }
  return { prefix, units };
}

/** Longest common subsequence of two lists, as index pairs in order. */
export function lcsPairs<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  const rows = a.length;
  const cols = b.length;
  const table: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--) {
    const row = table[i] as Uint32Array;
    const below = table[i + 1] as Uint32Array;
    for (let j = cols - 1; j >= 0; j--)
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number);
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (
      ((table[i + 1] as Uint32Array)[j] as number) >= ((table[i] as Uint32Array)[j + 1] as number)
    )
      i++;
    else j++;
  }
  return pairs;
}

/** A run of words (with their spacing) that is the same, added or removed. */
export interface WordChange {
  kind: "same" | "added" | "removed";
  text: string;
}

/** One block of the comparison, in the order of the newer body. */
export type BlockChange =
  | { kind: "same"; markdown: string }
  | { kind: "added"; markdown: string }
  | { kind: "removed"; markdown: string }
  | { kind: "changed"; before: string; after: string; words: WordChange[] };

export interface BodyDiff {
  blocks: BlockChange[];
  /** Blocks added, removed and changed (a changed block counts once). */
  counts: { added: number; removed: number; changed: number };
  /** Words added and removed, inside changed blocks and in whole blocks. */
  words: { added: number; removed: number };
}

/** Words and the whitespace after them, so joining the tokens gives back the text. */
function tokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Above this many tokens on a side, a changed block is shown whole instead of word by word. */
const WORD_DIFF_LIMIT = 3000;

/** Word-level changes from `before` to `after`, consecutive runs merged. */
export function wordDiff(before: string, after: string): WordChange[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length > WORD_DIFF_LIMIT || b.length > WORD_DIFF_LIMIT)
    return [
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : []),
    ];
  // Compare words without their trailing spacing, so a re-wrapped line is not a change.
  const key = (t: string) => t.trimEnd();
  const pairs = lcsPairs(a.map(key), b.map(key));
  const out: WordChange[] = [];
  const push = (kind: WordChange["kind"], text: string) => {
    if (!text) return;
    const last = out.at(-1);
    if (last?.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    push("removed", a.slice(i, pi).join(""));
    push("added", b.slice(j, pj).join(""));
    if (pi < a.length) push("same", b[pj] as string);
    i = pi + 1;
    j = pj + 1;
  }
  return out;
}

/** Share of words two blocks have in common (0–1), to tell an edit from a replacement. */
export function similarity(a: string, b: string): number {
  const wa = a.toLowerCase().split(/\s+/).filter(Boolean);
  const wb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  const bag = new Map<string, number>();
  for (const w of wa) bag.set(w, (bag.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of wb) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      shared++;
      bag.set(w, n - 1);
    }
  }
  return (2 * shared) / (wa.length + wb.length);
}

/** Below this, a removed and an added block are a replacement, not an edit. */
export const EDIT_SIMILARITY = 0.35;

/** What changed from one markdown body to another, block by block. */
export function bodyDiff(before: string, after: string): BodyDiff {
  const a = splitMarkdown(before).units.map((u) => u.raw.trimEnd());
  const b = splitMarkdown(after).units.map((u) => u.raw.trimEnd());
  const blocks: BlockChange[] = [];
  const counts = { added: 0, removed: 0, changed: 0 };
  const words = { added: 0, removed: 0 };

  /** Between two kept blocks: pair removed with added in order while they look like edits. */
  const gap = (removed: string[], added: string[]) => {
    let r = 0;
    let d = 0;
    while (r < removed.length || d < added.length) {
      const x = removed[r];
      const y = added[d];
      if (x !== undefined && y !== undefined && similarity(x, y) >= EDIT_SIMILARITY) {
        const w = wordDiff(x, y);
        blocks.push({ kind: "changed", before: x, after: y, words: w });
        counts.changed++;
        for (const c of w)
          if (c.kind === "added") words.added += wordCount(c.text);
          else if (c.kind === "removed") words.removed += wordCount(c.text);
        r++;
        d++;
      } else if (x !== undefined && (y === undefined || removed.length - r >= added.length - d)) {
        blocks.push({ kind: "removed", markdown: x });
        counts.removed++;
        words.removed += wordCount(x);
        r++;
      } else if (y !== undefined) {
        blocks.push({ kind: "added", markdown: y });
        counts.added++;
        words.added += wordCount(y);
        d++;
      }
    }
  };

  let i = 0;
  let j = 0;
  for (const [pi, pj] of lcsPairs(a, b)) {
    gap(a.slice(i, pi), b.slice(j, pj));
    blocks.push({ kind: "same", markdown: b[pj] as string });
    i = pi + 1;
    j = pj + 1;
  }
  gap(a.slice(i), b.slice(j));
  return { blocks, counts, words };
}

/** Every body directive in `markdown`, nested ones (in containers, quotes, lists) included. */
export function bodyDirectives(markdown: string): Directive[] {
  const found: Directive[] = [];
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === "directive") found.push((token as DirectiveToken).directive);
  });
  return found;
}
