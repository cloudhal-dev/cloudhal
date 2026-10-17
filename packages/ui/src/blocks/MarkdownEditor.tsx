import { Button, cn, InputArea, Switch, Tabs } from "@cloudflare/kumo";
import { ArrowsIn, ArrowsOut } from "@phosphor-icons/react";
import { EditorContent } from "@tiptap/react";
import { lazy, Suspense, useRef, useState } from "react";
import { DirectiveContext } from "./editor/directives.tsx";
import { FormatToolbar } from "./editor/FormatToolbar.tsx";
import { OutlineButton } from "./editor/Outline.tsx";
import { SelectionMenu, selectionBlocks } from "./editor/SelectionMenu.tsx";
import { SlashMenu } from "./editor/SlashMenu.tsx";
import type { SlashState } from "./editor/slash.ts";
import { readSpotlight, writeSpotlight } from "./editor/spotlight.ts";
import type { MarkdownEditorMode, MarkdownEditorProps } from "./editor/types.ts";
import { useFocusMode } from "./editor/useFocusMode.ts";
import { useMarkdownTiptap } from "./editor/useMarkdownTiptap.ts";

export { type OutlineEntry, outlineOf } from "./editor/Outline.tsx";
export { looksLikeMarkdown, pasteMarkdown } from "./editor/paste.ts";
export { selectionBlocks } from "./editor/SelectionMenu.tsx";
export type {
  AiSelection,
  MarkdownEditorLabels,
  MarkdownEditorMode,
  MarkdownEditorProps,
  PickedImage,
} from "./editor/types.ts";

// CodeMirror loads with the first switch to Markdown mode, not with the rich editor.
const SourceEditor = lazy(() =>
  import("./editor/SourceEditor.tsx").then((m) => ({ default: m.SourceEditor })),
);

/**
 * The markdown body editor (RFC-0014 phase 1): rich editing on Tiptap (MIT), a Markdown mode for
 * the source, and markdown as the only thing that is ever stored.
 *
 * - **Minimal diff:** blocks nobody touched are saved with their original bytes; only edited or
 *   new blocks are written anew (`editor/markdown-blocks.ts`).
 * - **Nothing silently dropped:** a block the editor would change the meaning of (raw HTML, link
 *   definitions, syntax it does not model) is shown read-only as a source block and saved as is;
 *   Markdown mode edits it.
 * - The schema follows what the site renders (`marked` with GFM): headings, lists, task lists,
 *   tables, code, quotes, links (the site's link rules plus `asset:`), images.
 * - `/` opens a menu of blocks, a selection gets a small formatting toolbar, pasted markdown
 *   arrives as blocks, and Markdown mode is CodeMirror (loaded on first use).
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
  labels,
  placeholder,
  resolveSrc,
  defaultMode = "rich",
  size = "base",
  readOnly = false,
  className,
  onPickImage,
  locale = "en",
  onAskAi,
  blocks,
  focusActions,
  previewSource,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<MarkdownEditorMode>(defaultMode);
  const [spotlight, setSpotlight] = useState(readSpotlight);
  const rootRef = useRef<HTMLDivElement>(null);
  // The text a source block asked to open in Markdown mode (selected there once).
  const [sourceFocus, setSourceFocus] = useState<string | undefined>();
  const [slash, setSlash] = useState<SlashState | null>(null);
  const { editor, editorRef, codec, insertImage, askRef } = useMarkdownTiptap({
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
  });
  const canFocus = labels.focus !== undefined;
  const { focused, focusButton, toggleFocus } = useFocusMode({
    rootRef,
    editorRef,
    canFocus,
    slash,
  });

  return (
    <div
      ref={rootRef}
      className={cn(
        "ch-md-editor grid min-w-0 gap-2",
        focused &&
          "fixed inset-0 z-50 content-start overflow-y-auto bg-kumo-base px-4 pt-3 pb-16 sm:px-8",
        className,
      )}
      data-mode={mode}
      data-focused={focused ? "" : undefined}
      data-spotlight={focused && spotlight ? "" : undefined}
      {...(focused ? { role: "dialog", "aria-modal": true, "aria-label": label } : {})}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2",
          focused &&
            "sticky top-0 z-10 mx-auto w-full max-w-3xl border-b border-kumo-line bg-kumo-base py-2",
        )}
      >
        {mode === "rich" && editor ? (
          <FormatToolbar
            editor={editor}
            labels={labels}
            disabled={readOnly}
            onImage={onPickImage ? () => void insertImage(editor) : undefined}
          />
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {focused && focusActions}
          {focused && labels.spotlight && mode === "rich" && (
            <Switch
              size="sm"
              label={labels.spotlight}
              checked={spotlight}
              onCheckedChange={(on) => {
                setSpotlight(on);
                writeSpotlight(on);
              }}
            />
          )}
          {mode === "rich" && editor && <OutlineButton editor={editor} labels={labels} />}
          <Tabs
            variant="segmented"
            size="sm"
            value={mode}
            onValueChange={(v) => {
              setSourceFocus(undefined);
              setMode(v as MarkdownEditorMode);
            }}
            tabs={[
              { value: "rich", label: labels.rich },
              { value: "markdown", label: labels.markdown },
            ]}
          />
          {canFocus && (
            <Button
              ref={focusButton}
              variant={focused ? "secondary" : "ghost"}
              size="sm"
              icon={focused ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
              aria-pressed={focused}
              title={labels.focusShortcut}
              onClick={toggleFocus}
              data-testid="editor-focus"
            >
              {focused ? (labels.focusExit ?? labels.focus) : labels.focus}
            </Button>
          )}
        </div>
      </div>
      {/* The rich editor stays mounted in Markdown mode, so its undo history survives a switch. */}
      <div
        hidden={mode !== "rich"}
        className={cn(
          "min-w-0 rounded-lg bg-kumo-control ring ring-kumo-line focus-within:ring-kumo-focus",
          focused && "mx-auto w-full max-w-3xl bg-kumo-base text-base ring-0 focus-within:ring-0",
        )}
      >
        <DirectiveContext.Provider
          value={
            blocks
              ? {
                  ...blocks,
                  locale,
                  onEditSource: (markdown: string) => {
                    setSourceFocus(markdown);
                    setMode("markdown");
                  },
                }
              : undefined
          }
        >
          <EditorContent editor={editor} />
        </DirectiveContext.Provider>
        {editor && mode === "rich" && !readOnly && (
          <SelectionMenu
            editor={editor}
            labels={labels}
            {...(onAskAi && labels.askAi
              ? {
                  onAskAi: () => {
                    const selection = selectionBlocks(editor, codec);
                    if (selection) askRef.current?.(selection);
                  },
                }
              : {})}
          />
        )}
      </div>
      {mode === "markdown" && (
        <Suspense
          fallback={
            <InputArea
              aria-label={label}
              value={value}
              onValueChange={(v) => onChange(v)}
              autoResize
              minRows={size === "sm" ? 6 : 12}
              maxRows={40}
              readOnly={readOnly}
              className="w-full font-mono"
            />
          }
        >
          <SourceEditor
            value={value}
            onChange={onChange}
            label={label}
            readOnly={readOnly}
            minRows={size === "sm" ? 6 : 12}
            selectOnMount={sourceFocus}
            {...(placeholder ? { placeholder } : {})}
          />
        </Suspense>
      )}
      {slash && mode === "rich" && <SlashMenu state={slash} labels={labels} />}
    </div>
  );
}
