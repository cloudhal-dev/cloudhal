import { Button, cn, Input, InputArea, Popover, Tabs, Toolbar } from "@cloudflare/kumo";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Code,
  CodeBlock,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Quotes,
  Table,
  TextB,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
} from "@phosphor-icons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createMarkdownCodec, type LoadedMarkdown } from "./editor/codec.ts";
import { allowedHref, editorExtensions } from "./editor/extensions.tsx";

/** Every word the editor shows; Studio passes them through `useT()`. */
export interface MarkdownEditorLabels {
  /** Mode switch. */
  rich: string;
  markdown: string;
  /** Accessible name of the formatting toolbar. */
  toolbar: string;
  bold: string;
  italic: string;
  strike: string;
  code: string;
  heading2: string;
  heading3: string;
  bulletList: string;
  orderedList: string;
  taskList: string;
  quote: string;
  codeBlock: string;
  table: string;
  rule: string;
  link: string;
  undo: string;
  redo: string;
  /** Link popover. */
  linkTitle: string;
  linkUrl: string;
  linkApply: string;
  linkRemove: string;
  linkInvalid: string;
  /** Blocks kept exactly as written. */
  sourceBadge: string;
  sourceHint: string;
}

export type MarkdownEditorMode = "rich" | "markdown";

export interface MarkdownEditorProps {
  /** The markdown body. */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the editing area (e.g. "Body"). */
  label: string;
  labels: MarkdownEditorLabels;
  placeholder?: string;
  /** Shows `asset:` images (returns the media URL; `undefined` hides the image). */
  resolveSrc?: (src: string) => string | undefined;
  /** Starting mode (default `rich`). */
  defaultMode?: MarkdownEditorMode;
  /** Minimum height of the editing area. */
  size?: "sm" | "base";
  readOnly?: boolean;
  className?: string;
}

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
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<MarkdownEditorMode>(defaultMode);
  const resolveRef = useRef(resolveSrc);
  resolveRef.current = resolveSrc;
  const extensions = useMemo(
    () =>
      editorExtensions({
        ...(placeholder ? { placeholder } : {}),
        sourceBlock: { badge: labels.sourceBadge, hint: labels.sourceHint },
        resolveSrc: (src) => (resolveRef.current ? resolveRef.current(src) : src),
      }),
    [placeholder, labels.sourceBadge, labels.sourceHint],
  );
  const codec = useMemo(() => createMarkdownCodec(extensions), [extensions]);
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
        attributes: {
          "aria-label": label,
          "aria-multiline": "true",
          role: "textbox",
          class: cn(
            "ch-md-content min-w-0 px-3 py-2 outline-none",
            size === "sm" ? "min-h-32" : "min-h-64",
          ),
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

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    loaded.current = codec.load(value);
    emitted.current = value;
    editor.commands.setContent(loaded.current.doc, { emitUpdate: false });
  }, [editor, codec, value]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className={cn("ch-md-editor grid min-w-0 gap-2", className)} data-mode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "rich" && editor ? (
          <FormatToolbar editor={editor} labels={labels} disabled={readOnly} />
        ) : (
          <span />
        )}
        <Tabs
          variant="segmented"
          size="sm"
          value={mode}
          onValueChange={(v) => setMode(v as MarkdownEditorMode)}
          tabs={[
            { value: "rich", label: labels.rich },
            { value: "markdown", label: labels.markdown },
          ]}
        />
      </div>
      {/* The rich editor stays mounted in Markdown mode, so its undo history survives a switch. */}
      <div
        hidden={mode !== "rich"}
        className="min-w-0 rounded-lg bg-kumo-control ring ring-kumo-line focus-within:ring-kumo-focus"
      >
        <EditorContent editor={editor} />
      </div>
      {mode === "markdown" && (
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
      )}
    </div>
  );
}

interface ToolbarItem {
  key: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

function FormatToolbar({
  editor,
  labels,
  disabled,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
  disabled: boolean;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      taskList: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const groups: ToolbarItem[][] = [
    [
      {
        key: "bold",
        label: labels.bold,
        icon: <TextB />,
        active: state.bold,
        run: () => chain().toggleBold().run(),
      },
      {
        key: "italic",
        label: labels.italic,
        icon: <TextItalic />,
        active: state.italic,
        run: () => chain().toggleItalic().run(),
      },
      {
        key: "strike",
        label: labels.strike,
        icon: <TextStrikethrough />,
        active: state.strike,
        run: () => chain().toggleStrike().run(),
      },
      {
        key: "code",
        label: labels.code,
        icon: <Code />,
        active: state.code,
        run: () => chain().toggleCode().run(),
      },
    ],
    [
      {
        key: "h2",
        label: labels.heading2,
        icon: <TextHTwo />,
        active: state.h2,
        run: () => chain().toggleHeading({ level: 2 }).run(),
      },
      {
        key: "h3",
        label: labels.heading3,
        icon: <TextHThree />,
        active: state.h3,
        run: () => chain().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        key: "bulletList",
        label: labels.bulletList,
        icon: <ListBullets />,
        active: state.bulletList,
        run: () => chain().toggleBulletList().run(),
      },
      {
        key: "orderedList",
        label: labels.orderedList,
        icon: <ListNumbers />,
        active: state.orderedList,
        run: () => chain().toggleOrderedList().run(),
      },
      {
        key: "taskList",
        label: labels.taskList,
        icon: <ListChecks />,
        active: state.taskList,
        run: () => chain().toggleTaskList().run(),
      },
      {
        key: "quote",
        label: labels.quote,
        icon: <Quotes />,
        active: state.quote,
        run: () => chain().toggleBlockquote().run(),
      },
      {
        key: "codeBlock",
        label: labels.codeBlock,
        icon: <CodeBlock />,
        active: state.codeBlock,
        run: () => chain().toggleCodeBlock().run(),
      },
      {
        key: "table",
        label: labels.table,
        icon: <Table />,
        run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        key: "rule",
        label: labels.rule,
        icon: <Minus />,
        run: () => chain().setHorizontalRule().run(),
      },
    ],
    [
      {
        key: "undo",
        label: labels.undo,
        icon: <ArrowCounterClockwise />,
        disabled: !state.canUndo,
        run: () => chain().undo().run(),
      },
      {
        key: "redo",
        label: labels.redo,
        icon: <ArrowClockwise />,
        disabled: !state.canRedo,
        run: () => chain().redo().run(),
      },
    ],
  ];
  return (
    <Toolbar
      size="sm"
      aria-label={labels.toolbar}
      disabled={disabled}
      className="max-w-full flex-wrap"
    >
      {groups.map((group, i) => (
        <span key={group[0]?.key} className={cn("flex", i > 0 && "border-kumo-hairline border-l")}>
          {group.map((item) => (
            <Toolbar.Button
              key={item.key}
              icon={item.icon}
              aria-label={item.label}
              title={item.label}
              aria-pressed={item.active === undefined ? undefined : item.active}
              disabled={item.disabled}
              data-format={item.key}
              className={cn(item.active && "bg-kumo-tint")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={item.run}
            />
          ))}
          {i === 0 && <LinkButton editor={editor} labels={labels} active={state.link} />}
        </span>
      ))}
    </Toolbar>
  );
}

function LinkButton({
  editor,
  labels,
  active,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [invalid, setInvalid] = useState(false);
  const openWith = (next: boolean) => {
    if (next) {
      setHref(String(editor.getAttributes("link").href ?? ""));
      setInvalid(false);
    }
    setOpen(next);
  };
  const apply = () => {
    const url = href.trim();
    if (!url || !allowedHref(url)) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setOpen(false);
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={openWith}>
      <Popover.Trigger
        render={
          <Toolbar.Button
            icon={<LinkSimple />}
            aria-label={labels.link}
            title={labels.link}
            aria-pressed={active}
            data-format="link"
            className={cn(active && "bg-kumo-tint")}
            onMouseDown={(e) => e.preventDefault()}
          />
        }
      />
      <Popover.Content align="start" positionMethod="fixed" className="grid w-80 gap-3">
        <Popover.Title>{labels.linkTitle}</Popover.Title>
        <Input
          label={labels.linkUrl}
          value={href}
          onValueChange={(v) => {
            setHref(v);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          error={invalid ? labels.linkInvalid : undefined}
          className="w-full font-mono"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          {active && (
            <Button variant="secondary" size="sm" onClick={remove}>
              {labels.linkRemove}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={apply}>
            {labels.linkApply}
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
}
