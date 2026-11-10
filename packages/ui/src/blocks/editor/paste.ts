/** Pasting markdown: plain text that looks like markdown is parsed into blocks. */
import type { Editor } from "@tiptap/core";
import type { MarkdownCodec } from "./codec.ts";

/**
 * Pasted text that reads as markdown (and no richer HTML came with it) arrives as blocks, through
 * the same codec as loading: what the editor cannot model becomes a source block.
 */
export function pasteMarkdown(
  editor: Editor,
  codec: MarkdownCodec,
  event: ClipboardEvent,
): boolean {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (!text || editor.isActive("codeBlock") || !looksLikeMarkdown(text)) return false;
  // Rendered pages (GitHub, docs) paste better from their HTML; editors (VS Code) send styled
  // spans only, so their text is the source.
  if (html && /<(h[1-6]|ul|ol|li|table|blockquote|pre|strong|em|b|i|a|img)[\s>]/i.test(html))
    return false;
  const nodes = codec.load(text).doc.content ?? [];
  const only = nodes.length === 1 ? nodes[0] : undefined;
  // One paragraph goes inline at the caret instead of splitting the block.
  const content = only?.type === "paragraph" ? (only.content ?? []) : nodes;
  if (!content.length) return false;
  editor.chain().focus().insertContent(content).run();
  return true;
}

/** Block syntax or inline markers that plain text rarely has. */
export function looksLikeMarkdown(text: string): boolean {
  return (
    /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|.*\|\s*$|- \[[ xX]\]\s)/m.test(text) ||
    /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|~~[^~\n]+~~/.test(text) ||
    hasInlineLink(text)
  );
}

const isSpace = (c: string) => /\s/.test(c);

/**
 * Whether `text` has a `[label](target)` on one line: what `/\[[^\]\n]+\]\([^)\s]+\)/` tested, in
 * one pass. That regex rescanned from every `[` (and every `](`) to the end of a long line
 * (CodeQL js/polynomial-redos, alert 32). Each `](` is checked once: a `[` after the previous `]`
 * or line break with something before the `]`, then a target without spaces up to a `)`. A scan
 * over a target is shared by every `](` inside it, since they all stop where it stopped.
 */
export function hasInlineLink(text: string): boolean {
  let stop = -1;
  for (let at = text.indexOf("](", 0); at !== -1; at = text.indexOf("](", at + 1)) {
    // The label: back to the previous `]` or line break; a `[` at least one character before.
    let label = false;
    for (let k = at - 1; k >= 0 && text[k] !== "]" && text[k] !== "\n"; k--)
      if (text[k] === "[" && k < at - 1) {
        label = true;
        break;
      }
    // The target: up to the first `)` or whitespace.
    const from = at + 2;
    if (stop < from) {
      stop = from;
      while (stop < text.length && text[stop] !== ")" && !isSpace(text[stop] as string)) stop++;
    }
    if (label && text[stop] === ")" && stop > from) return true;
  }
  return false;
}
