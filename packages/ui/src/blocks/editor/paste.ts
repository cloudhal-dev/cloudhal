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
    /\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|~~[^~\n]+~~/.test(text)
  );
}
