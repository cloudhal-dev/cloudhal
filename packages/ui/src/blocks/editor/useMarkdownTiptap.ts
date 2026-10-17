/**
 * The rich editor: its markdown codec and extensions (source blocks, slash menu, previews), the
 * Tiptap editor, and the sync with `value` (a value from outside is loaded again; the editor's own
 * edits are emitted once).
 */
import { cn } from "@cloudflare/kumo";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createMarkdownCodec, type LoadedMarkdown } from "./codec.ts";
import { editorExtensions } from "./extensions.tsx";
import { pasteMarkdown } from "./paste.ts";
import { blockSlashItems, slashItems } from "./SlashMenu.tsx";
import type { SlashState } from "./slash.ts";
import type { MarkdownEditorMode, MarkdownEditorProps } from "./types.ts";

type TiptapProps = Pick<
  MarkdownEditorProps,
  | "value"
  | "onChange"
  | "label"
  | "labels"
  | "placeholder"
  | "resolveSrc"
  | "onPickImage"
  | "onAskAi"
  | "blocks"
  | "previewSource"
> & {
  size: NonNullable<MarkdownEditorProps["size"]>;
  readOnly: boolean;
  locale: string;
  setMode: (mode: MarkdownEditorMode) => void;
  setSourceFocus: (markdown: string | undefined) => void;
  setSlash: (state: SlashState | null) => void;
};

/** The editable area's attributes: a labelled multi-line textbox, taller in the full size. */
function editorAttributes(
  label: string,
  size: NonNullable<MarkdownEditorProps["size"]>,
): Record<string, string> {
  return {
    "aria-label": label,
    "aria-multiline": "true",
    role: "textbox",
    class: cn(
      "ch-md-content min-w-0 px-3 py-2 outline-none",
      size === "sm" ? "min-h-32" : "min-h-64",
    ),
  };
}

export function useMarkdownTiptap(props: TiptapProps) {
  const {
    value,
    onChange,
    label,
    labels,
    placeholder,
    resolveSrc,
    size,
    readOnly,
    onPickImage,
    locale,
    onAskAi,
    blocks,
    previewSource,
    setMode,
    setSourceFocus,
    setSlash,
  } = props;
  const resolveRef = useRef(resolveSrc);
  resolveRef.current = resolveSrc;
  const pickRef = useRef(onPickImage);
  pickRef.current = onPickImage;
  const askRef = useRef(onAskAi);
  askRef.current = onAskAi;
  const previewRef = useRef(previewSource);
  previewRef.current = previewSource;
  const hasPreview = previewSource !== undefined;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const editorRef = useRef<Editor | null>(null);

  const insertImage = useCallback(async (e: Editor) => {
    const picked = await pickRef.current?.();
    if (!picked?.src) {
      e.commands.focus();
      return;
    }
    e.chain()
      .focus()
      .setImage({ src: picked.src, alt: picked.alt ?? "" })
      .run();
  }, []);

  // The codec reads and writes markdown with the same schema, without the editing-only parts.
  const codec = useMemo(
    () => createMarkdownCodec(editorExtensions({ ...(placeholder ? { placeholder } : {}) })),
    [placeholder],
  );
  const extensions = useMemo(
    () =>
      editorExtensions({
        ...(placeholder ? { placeholder } : {}),
        sourceBlock: {
          badge: labels.sourceBadge,
          hint: labels.sourceHint,
          edit: labels.editSource,
          ...(labels.surfacePreview ? { preview: labels.surfacePreview } : {}),
          ...(labels.showCode ? { showCode: labels.showCode } : {}),
          ...(labels.hideCode ? { hideCode: labels.hideCode } : {}),
        },
        ...(hasPreview
          ? {
              previewSource: (md: string) => previewRef.current?.(md) ?? Promise.resolve(undefined),
            }
          : {}),
        onEditSource: (markdown) => {
          setSourceFocus(markdown);
          setMode("markdown");
        },
        resolveSrc: (src) => (resolveRef.current ? resolveRef.current(src) : src),
        spotlight: labels.focus !== undefined,
        slash: {
          items: () => [
            ...slashItems(labelsRef.current, pickRef.current ? insertImage : undefined),
            ...blockSlashItems(blocksRef.current, locale, (md) => codec.load(md).doc.content ?? []),
          ],
          onState: setSlash,
          locale,
        },
      }),
    [
      placeholder,
      labels.sourceBadge,
      labels.sourceHint,
      labels.editSource,
      labels.surfacePreview,
      labels.showCode,
      labels.hideCode,
      hasPreview,
      labels.focus,
      insertImage,
      locale,
      codec,
      setSourceFocus,
      setSlash,
      setMode,
    ],
  );
  // What the editor was loaded from, and the last markdown it emitted: a `value` that differs from
  // both came from outside (Markdown mode, a reload) and is loaded again.
  const loaded = useRef<LoadedMarkdown>(codec.load(value));
  const emitted = useRef(value);

  const editor = useEditor(
    {
      extensions,
      content: loaded.current.doc,
      editable: !readOnly,
      immediatelyRender: true,
      editorProps: {
        attributes: editorAttributes(label, size),
        handlePaste: (_view, event) => {
          const e = editorRef.current;
          return e ? pasteMarkdown(e, codec, event) : false;
        },
      },
      onUpdate: ({ editor: e }) => {
        const next = codec.save(e.getJSON() as JSONContent, loaded.current.base);
        if (next === emitted.current) return; // e.g. a selection-only transaction
        emitted.current = next;
        onChange(next);
      },
    },
    [extensions],
  );
  editorRef.current = editor;

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    loaded.current = codec.load(value);
    emitted.current = value;
    editor.commands.setContent(loaded.current.doc, { emitUpdate: false });
  }, [editor, codec, value]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return { editor, editorRef, codec, insertImage, askRef };
}
