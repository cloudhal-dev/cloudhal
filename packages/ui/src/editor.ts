/**
 * @cloudhal/ui/editor — the markdown body editor (RFC-0014 phase 1). A separate entry so screens
 * that never edit a body don't load Tiptap and ProseMirror; Studio imports it lazily.
 */

export { createMarkdownCodec, type MarkdownCodec } from "./blocks/editor/codec.ts";
export { allowedHref, editorExtensions } from "./blocks/editor/extensions.tsx";
export { isLossy, mergeBlocks, splitMarkdown } from "./blocks/editor/markdown-blocks.ts";
export {
  MarkdownEditor,
  type MarkdownEditorLabels,
  type MarkdownEditorMode,
  type MarkdownEditorProps,
} from "./blocks/MarkdownEditor.tsx";
