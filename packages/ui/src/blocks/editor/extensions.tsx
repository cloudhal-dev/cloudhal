/**
 * The editor's schema (RFC-0014 phase 1): CommonMark + GFM as the site renders it (`marked` with
 * GFM in `@cloudhal/astro-renderer`), plus `sourceBlock` for anything the editor must not rewrite
 * and the body directive nodes (RFC-0015).
 * Every extension is MIT (ADR: no paid Tiptap add-ons).
 */
import { Badge, Button, Text } from "@cloudflare/kumo";
import { PencilSimple } from "@phosphor-icons/react";
import { type AnyExtension, Node } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { InsetPanel } from "../InsetPanel.tsx";
import { DirectiveContainer, DirectiveLeaf } from "./directives.tsx";
import { SlashCommand, type SlashOptions } from "./slash.ts";

/** Link targets the site keeps (the renderer's `safeHref`, plus `asset:` media links). */
export function allowedHref(url: string): boolean {
  const value = url.replace(/[\t\n\r]/g, "").trim();
  if (/^(https?:|mailto:|tel:|asset:)/i.test(value)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[/\\]{2}/.test(value);
}

export interface SourceBlockLabels {
  /** Badge on a block kept exactly as written, e.g. "Markdown". */
  badge: string;
  /** Why it is not editable here, e.g. "Kept as written — edit it in Markdown mode." */
  hint: string;
  /** The button that opens it in Markdown mode, e.g. "Edit as Markdown". */
  edit?: string;
}

interface SourceBlockOptions {
  labels: SourceBlockLabels;
  /** Opens Markdown mode with this block's text selected. */
  onEdit?: ((markdown: string) => void) | undefined;
}

function SourceBlockView({ node, extension, editor }: ReactNodeViewProps) {
  const { labels, onEdit } = extension.options as SourceBlockOptions;
  const markdown = String(node.attrs.markdown ?? "");
  return (
    <NodeViewWrapper data-source-block="" contentEditable={false}>
      <InsetPanel variant="recessed" label={labels.badge}>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{labels.badge}</Badge>
            <Text variant="secondary" size="sm">
              {labels.hint}
            </Text>
            {onEdit && labels.edit && editor.isEditable && (
              <Button
                variant="ghost"
                size="xs"
                icon={<PencilSimple />}
                className="ms-auto"
                onClick={() => onEdit(markdown)}
              >
                {labels.edit}
              </Button>
            )}
          </div>
          <code className="block whitespace-pre-wrap break-words font-mono text-[0.9em] text-kumo-default">
            {markdown}
          </code>
        </div>
      </InsetPanel>
    </NodeViewWrapper>
  );
}

/**
 * A block kept exactly as written: raw HTML, link definitions, or markdown the editor would
 * change the meaning of. It renders read-only and serializes to its own bytes.
 */
export const SourceBlock = Node.create<SourceBlockOptions>({
  name: "sourceBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { labels: { badge: "Markdown", hint: "Kept as written." } };
  },
  addAttributes() {
    return { markdown: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-source-block]" }];
  },
  renderHTML({ node }) {
    return ["div", { "data-source-block": "" }, ["pre", {}, String(node.attrs.markdown ?? "")]];
  },
  renderMarkdown(node) {
    return String(node.attrs?.markdown ?? "");
  },
  addNodeView() {
    return ReactNodeViewRenderer(SourceBlockView);
  },
});

/** Images show through `resolveSrc` (`asset:` → the media URL); markdown keeps the stored `src`. */
export const AssetImage = Image.extend<
  ImageOptions & { resolveSrc: (src: string) => string | undefined }
>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), resolveSrc: (src: string) => src };
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement("img");
      const update = (attrs: Record<string, unknown>) => {
        const src = this.options.resolveSrc(String(attrs.src ?? ""));
        if (src) img.src = src;
        else img.removeAttribute("src");
        img.alt = String(attrs.alt ?? "");
        if (attrs.title) img.title = String(attrs.title);
        img.className = "max-w-full rounded-md";
      };
      update(node.attrs);
      return {
        dom: img,
        update: (next) => {
          if (next.type !== node.type) return false;
          update(next.attrs);
          return true;
        },
      };
    };
  },
});

export interface EditorExtensionOptions {
  placeholder?: string;
  sourceBlock?: SourceBlockLabels;
  onEditSource?: (markdown: string) => void;
  resolveSrc?: (src: string) => string | undefined;
  /** The slash menu (editing only; the codec leaves it out). */
  slash?: SlashOptions;
}

/** The schema shared by the editor and its markdown codec. */
export function editorExtensions(options: EditorExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      // Markdown has no underline; the renderer would show it as literal `<u>`.
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ["asset"],
        isAllowedUri: (url) => allowedHref(url),
        shouldAutoLink: (url) => allowedHref(url),
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    AssetImage.configure({
      inline: false,
      allowBase64: true,
      ...(options.resolveSrc ? { resolveSrc: options.resolveSrc } : {}),
    }),
    SourceBlock.configure({
      ...(options.sourceBlock ? { labels: options.sourceBlock } : {}),
      onEdit: options.onEditSource,
    }),
    // Body directives (RFC-0015); their views read `DirectiveContext`.
    DirectiveLeaf,
    DirectiveContainer,
    Placeholder.configure({ placeholder: options.placeholder ?? "" }),
    ...(options.slash ? [SlashCommand.configure(options.slash)] : []),
  ];
}
