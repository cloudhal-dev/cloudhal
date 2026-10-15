/**
 * Markdown ↔ editor document for `MarkdownEditor` (RFC-0014 phase 1). Loading builds the document
 * block by block: a block the editor would change the meaning of (task-list syntax it lacks, raw
 * HTML, link definitions, anything `isLossy` flags) becomes a `sourceBlock` that carries its exact
 * markdown, so nothing is ever silently dropped. Saving writes back only the blocks that changed.
 *
 * Body directives (RFC-0015) load as `directiveLeaf` / `directiveContainer` nodes; a container's
 * inner text loads block by block the same way, and keeps the bytes of its untouched blocks.
 */
import { parseDirective, writeDirective } from "@cloudhal/core-ts/directives";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { isLossy, mergeBlocks, type SplitMarkdown, splitMarkdown } from "./markdown-blocks.ts";

/** Block types the editor never models: kept verbatim as source blocks. */
const SOURCE_ONLY = new Set(["html", "def"]);
/**
 * A ```surface fence (RFC-0020 §5): generative UI whose info string carries its id and catalog.
 * A code block would keep only the first word of that string, so the fence stays verbatim.
 */
const SURFACE_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*surface(?:\s|$)/;

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

  const block = (node: JSONContent): string => {
    if (node.type === "directiveContainer") {
      const base = node.attrs?.base as LoadedMarkdown["base"] | null | undefined;
      const children = (node.content ?? []).map(block);
      const inner = base
        ? mergeBlocks(base.split, base.normalized, children)
        : children.filter((c) => c !== "").join("\n\n");
      return writeDirective(
        String(node.attrs?.name ?? ""),
        (node.attrs?.props ?? {}) as Record<string, unknown>,
        inner,
      );
    }
    return manager.serialize({ type: "doc", content: [node] }).trimEnd();
  };

  const loadUnits = (
    markdown: string,
  ): { content: JSONContent[]; base: LoadedMarkdown["base"] } => {
    const split = splitMarkdown(markdown);
    const content: JSONContent[] = [];
    const normalized: string[] = [];
    for (const unit of split.units) {
      const source = unit.raw.trimEnd();
      const sourceNode: JSONContent = { type: "sourceBlock", attrs: { markdown: source } };
      const directive = unit.type.startsWith("directive:") ? parseDirective(source) : undefined;
      if (directive) {
        const attrs = { name: directive.name, props: { ...directive.attrs } };
        let node: JSONContent;
        if (directive.content === undefined) node = { type: "directiveLeaf", attrs };
        else {
          const inner = loadUnits(directive.content);
          node = {
            type: "directiveContainer",
            attrs: { ...attrs, base: inner.base },
            content: inner.content.length ? inner.content : [{ type: "paragraph" }],
          };
        }
        content.push(node);
        normalized.push(block(node));
        continue;
      }
      if (SOURCE_ONLY.has(unit.type) || (unit.type === "code" && SURFACE_FENCE.test(source))) {
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
    return { content, base: { split, normalized } };
  };

  return {
    block,
    load(markdown) {
      const { content, base } = loadUnits(markdown);
      return {
        doc: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] },
        base,
      };
    },
    save(doc, base) {
      const current = (doc.content ?? []).map(block);
      return mergeBlocks(base.split, base.normalized, current);
    },
  };
}
