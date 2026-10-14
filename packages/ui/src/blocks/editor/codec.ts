/**
 * Markdown ↔ editor document for `MarkdownEditor` (RFC-0014 phase 1). Loading builds the document
 * block by block: a block the editor would change the meaning of (task-list syntax it lacks, raw
 * HTML, link definitions, anything `isLossy` flags) becomes a `sourceBlock` that carries its exact
 * markdown, so nothing is ever silently dropped. Saving writes back only the blocks that changed.
 */
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { isLossy, mergeBlocks, type SplitMarkdown, splitMarkdown } from "./markdown-blocks.ts";

/** Block types the editor never models: kept verbatim as source blocks. */
const SOURCE_ONLY = new Set(["html", "def"]);

/** What `load` returns: the editor document, and what `save` needs to keep untouched blocks. */
export interface LoadedMarkdown {
  doc: JSONContent;
  base: { split: SplitMarkdown; normalized: string[] };
}

export interface MarkdownCodec {
  load(markdown: string): LoadedMarkdown;
  save(doc: JSONContent, base: LoadedMarkdown["base"]): string;
  /** One top-level node as markdown (what `save` compares). */
  block(node: JSONContent): string;
}

export function createMarkdownCodec(extensions: AnyExtension[]): MarkdownCodec {
  const manager = new MarkdownManager({ extensions });
  const block = (node: JSONContent) =>
    manager.serialize({ type: "doc", content: [node] }).trimEnd();

  return {
    block,
    load(markdown) {
      const split = splitMarkdown(markdown);
      const content: JSONContent[] = [];
      const normalized: string[] = [];
      for (const unit of split.units) {
        const source = unit.raw.trimEnd();
        const sourceNode: JSONContent = { type: "sourceBlock", attrs: { markdown: source } };
        if (SOURCE_ONLY.has(unit.type)) {
          content.push(sourceNode);
          normalized.push(source);
          continue;
        }
        const nodes = (manager.parse(unit.raw).content ?? []).filter(
          (n) => !(n.type === "paragraph" && !n.content?.length),
        );
        const node = nodes.length === 1 ? (nodes[0] as JSONContent) : undefined;
        const written = node ? block(node) : "";
        if (!node || isLossy(unit.raw, written)) {
          content.push(sourceNode);
          normalized.push(source);
        } else {
          content.push(node);
          normalized.push(written);
        }
      }
      return {
        doc: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] },
        base: { split, normalized },
      };
    },
    save(doc, base) {
      const current = (doc.content ?? []).map(block);
      return mergeBlocks(base.split, base.normalized, current);
    },
  };
}
