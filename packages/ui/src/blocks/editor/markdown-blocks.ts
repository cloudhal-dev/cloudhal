/**
 * Block-level bookkeeping for the markdown editor (RFC-0014 phase 1): the body stays markdown, and
 * the editor only rewrites the blocks a person actually changed.
 *
 * - `splitMarkdown` (from `@cloudhal/core-ts/body-blocks`, the store's splitter) cuts a body into
 *   top-level blocks; joining every block's `text` and the prefix gives back the source exactly.
 * - `isLossy` tells whether a block would change meaning after a trip through the editor: both
 *   versions are rendered with `marked` and compared as HTML.
 * - `mergeBlocks` builds the saved markdown: blocks equal to what the editor would produce for an
 *   original block keep that block's original bytes; only edited or new blocks are written anew.
 */
import {
  lcsPairs as lcs,
  type MarkdownUnit,
  type SplitMarkdown,
  splitMarkdown,
} from "@cloudhal/core-ts/body-blocks";
import { Marked } from "marked";

export type { MarkdownUnit, SplitMarkdown } from "@cloudhal/core-ts/body-blocks";
// One splitter for the editor and the store (RFC-0014 §2).
export { splitMarkdown };

const marked = new Marked({ gfm: true, async: false });

/** Markdown rendered for comparison only: whitespace between and inside tags does not count. */
function htmlOf(markdown: string): string {
  return (marked.parse(markdown) as string).replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

/** Whether `normalized` (a block after a trip through the editor) means something else than `raw`. */
export function isLossy(raw: string, normalized: string): boolean {
  return htmlOf(raw) !== htmlOf(normalized);
}

/**
 * The markdown to save.
 *
 * @param source the body as it was loaded, split
 * @param normalized for each original block, what the editor writes for it untouched (same length
 *   as `source.units`)
 * @param current what the editor writes for each of its top-level blocks now
 */
export function mergeBlocks(
  source: SplitMarkdown,
  normalized: readonly string[],
  current: readonly string[],
): string {
  const blocks = current.map((b) => b.trimEnd()).filter((b) => b !== "");
  const original = normalized.map((b) => b.trimEnd());
  const kept = new Map(lcs(blocks, original));
  let out = "";
  let previous = -2; // index of the original block written last (-2: none, or a new block)
  for (const [i, block] of blocks.entries()) {
    const j = kept.get(i);
    if (j !== undefined) {
      const unit = source.units[j] as MarkdownUnit;
      if (out === "" && j === 0) out = source.prefix + unit.text;
      else if (j === previous + 1) out += unit.text;
      else out = separated(out) + unit.text;
      previous = j;
    } else {
      out = `${separated(out)}${block}\n`;
      previous = -2;
    }
  }
  // A block that was not last before keeps the blank lines it had in the middle: end it with one
  // newline, like a new block. An untouched body ends exactly as it did.
  if (previous !== source.units.length - 1 && out !== "") out = out.replace(/\n*$/, "\n");
  return out;
}

/** `text` ready for another block: nothing, or ending in one blank line. */
function separated(text: string): string {
  if (text === "") return "";
  return `${text.replace(/\n*$/, "")}\n\n`;
}
