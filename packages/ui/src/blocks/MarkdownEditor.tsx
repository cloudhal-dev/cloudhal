import {
  Badge,
  Button,
  cn,
  Input,
  InputArea,
  Popover,
  Switch,
  Tabs,
  Text,
  Toolbar,
} from "@cloudflare/kumo";
import { localized } from "@cloudhal/core-ts/blocks";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsIn,
  ArrowsOut,
  Code,
  CodeBlock,
  Image as ImageIcon,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListDashes,
  ListNumbers,
  Minus,
  Quotes,
  Sparkle,
  Table,
  TextB,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
} from "@phosphor-icons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { blockIcon } from "./blockIcon.ts";
import { createMarkdownCodec, type LoadedMarkdown, type MarkdownCodec } from "./editor/codec.ts";
import { DirectiveContext, type EditorBlocks } from "./editor/directives.tsx";
import { allowedHref, editorExtensions } from "./editor/extensions.tsx";
import type { SlashItem, SlashState } from "./editor/slash.ts";

// CodeMirror loads with the first switch to Markdown mode, not with the rich editor.
const SourceEditor = lazy(() =>
  import("./editor/SourceEditor.tsx").then((m) => ({ default: m.SourceEditor })),
);

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
  /** Toolbar and slash menu: insert an image from the media library. */
  image: string;
  /** Slash menu: a plain paragraph. */
  paragraph: string;
  /** Slash menu's accessible name, e.g. "Insert block". */
  insertMenu: string;
  /** Slash menu with nothing matching what was typed. */
  noMatches: string;
  /** Accessible name of the toolbar that follows a selection. */
  selectionToolbar: string;
  /** Blocks kept exactly as written. */
  sourceBadge: string;
  sourceHint: string;
  /** Source block's button that opens it in Markdown mode. */
  editSource: string;
  /** A drawn ```surface (with `previewSource`): the preview's name, and its code toggles. */
  surfacePreview?: string;
  showCode?: string;
  hideCode?: string;
  /** The headings popover: its button and title, e.g. "Outline". */
  outline: string;
  /** No headings in the body yet. */
  outlineEmpty: string;
  /** A heading more than one level below the one before it (H2 → H4). */
  outlineSkipped: string;
  /** An H1 in the body: the title is already the page's H1. */
  outlineExtraH1: string;
  /** The selection toolbar's AI button (shown only with `onAskAi`), e.g. "Ask AI". */
  askAi?: string;
  /**
   * Focus mode (shown only with these): the button that opens it ("Focus"), the one that leaves
   * ("Leave focus mode"), the spotlight switch ("Spotlight"), and the shortcut as the person's
   * keyboard writes it ("Ctrl+Shift+\\").
   */
  focus?: string;
  focusExit?: string;
  spotlight?: string;
  focusShortcut?: string;
}

/**
 * The blocks a selection touches, for the host's AI commands (RFC-0016): their markdown, and a way
 * to put new markdown in their place.
 */
export interface AiSelection {
  /** The whole top-level blocks the selection touches, as markdown. */
  markdown: string;
  /**
   * Replaces those blocks with `markdown` (one undo step). False, and nothing changed, when the
   * blocks were edited since they were read.
   */
  replace: (markdown: string) => boolean;
}

/** An image chosen in the host's media picker. */
export interface PickedImage {
  /** Stored as is: `asset:<id>` for library media, or an address. */
  src: string;
  /** Empty lets the site use the library's alt text for `asset:` images. */
  alt?: string;
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
  /** Opens the host's media picker; resolves with the image, or `undefined` when cancelled. */
  onPickImage?: () => Promise<PickedImage | undefined>;
  /** UI language, for matching slash-menu words (Turkish İ/ı). */
  locale?: string;
  /**
   * In-editor AI (RFC-0016): the selection toolbar gets `labels.askAi`, which hands the selected
   * blocks to the host. The host shows the result and calls `replace` if the person accepts it.
   */
  onAskAi?: (selection: AiSelection) => void;
  /**
   * Typed blocks (RFC-0015): the body block types, offered in the `/` menu and edited through
   * their generated forms. Without it, directives still load and save unchanged.
   */
  blocks?: EditorBlocks;
  /** Shown in focus mode's top bar: the host's save state and Save button, so they stay at hand. */
  focusActions?: ReactNode;
  /**
   * Draws a ```surface source block as the site would: resolves with a whole HTML document (shown
   * in a frame without scripts), or `undefined` to show only its code.
   */
  previewSource?: (markdown: string) => Promise<string | undefined>;
}

const SPOTLIGHT_KEY = "cloudhal.editor.spotlight";
const readSpotlight = () => {
  try {
    return globalThis.localStorage?.getItem(SPOTLIGHT_KEY) === "1";
  } catch {
    return false;
  }
};
const writeSpotlight = (on: boolean) => {
  try {
    globalThis.localStorage?.setItem(SPOTLIGHT_KEY, on ? "1" : "0");
  } catch {
    // private windows and blocked storage: the choice lasts until the page closes
  }
};

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
  // Focus mode: the editor alone on the screen, entered only on request (never on page load).
  const [focused, setFocused] = useState(false);
  const [spotlight, setSpotlight] = useState(readSpotlight);
  const focusButton = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The text a source block asked to open in Markdown mode (selected there once).
  const [sourceFocus, setSourceFocus] = useState<string | undefined>();
  const [slash, setSlash] = useState<SlashState | null>(null);
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
        attributes: {
          "aria-label": label,
          "aria-multiline": "true",
          role: "textbox",
          class: cn(
            "ch-md-content min-w-0 px-3 py-2 outline-none",
            size === "sm" ? "min-h-32" : "min-h-64",
          ),
        },
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

  const leaveFocus = useCallback(() => {
    setFocused(false);
    // Back where the person left from.
    requestAnimationFrame(() => focusButton.current?.focus());
  }, []);
  const toggleFocus = useCallback(() => {
    if (focused) leaveFocus();
    else {
      setFocused(true);
      requestAnimationFrame(() => editorRef.current?.commands.focus());
    }
  }, [focused, leaveFocus]);
  // While focused: the page behind does not scroll, and Esc leaves (unless a menu or popover of
  // the editor took it first).
  useEffect(() => {
    if (!focused) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    // Everything outside the editor is out of reach (Tab, screen readers) while it covers it.
    const quieted: Element[] = [];
    for (
      let el: HTMLElement | null = rootRef.current;
      el && el !== document.body;
      el = el.parentElement
    )
      for (const sib of el.parentElement?.children ?? [])
        if (sib !== el && !sib.hasAttribute("inert") && sib.tagName !== "SCRIPT") {
          sib.setAttribute("inert", "");
          quieted.push(sib);
        }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !slash) leaveFocus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      for (const el of quieted) el.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
    };
  }, [focused, slash, leaveFocus]);
  const canFocus = labels.focus !== undefined;
  // Ctrl/⌘+Shift+\ (WordPress' convention) opens and closes focus mode from inside this editor.
  useEffect(() => {
    if (!canFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Backslash")) return;
      if (!focused && !rootRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      toggleFocus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canFocus, focused, toggleFocus]);

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

/** The blocks `/` offers, in the editor's words. */
function slashItems(
  labels: MarkdownEditorLabels,
  insertImage: ((e: Editor) => Promise<void>) | undefined,
): SlashItem[] {
  const items: (SlashItem & { icon?: ReactNode })[] = [
    {
      key: "paragraph",
      label: labels.paragraph,
      keywords: ["text", "paragraph", "p"],
      run: (e) => e.chain().focus().setParagraph().run(),
    },
    {
      key: "heading2",
      label: labels.heading2,
      keywords: ["heading", "title", "h2"],
      run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      key: "heading3",
      label: labels.heading3,
      keywords: ["subheading", "h3"],
      run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
      key: "bulletList",
      label: labels.bulletList,
      keywords: ["bullet", "list", "ul"],
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: labels.orderedList,
      keywords: ["numbered", "list", "ol"],
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "taskList",
      label: labels.taskList,
      keywords: ["todo", "task", "checklist"],
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
    {
      key: "quote",
      label: labels.quote,
      keywords: ["quote", "blockquote"],
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "codeBlock",
      label: labels.codeBlock,
      keywords: ["code", "pre", "snippet"],
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: "table",
      label: labels.table,
      keywords: ["table", "grid"],
      run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      key: "rule",
      label: labels.rule,
      keywords: ["divider", "rule", "line", "hr"],
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ];
  if (insertImage)
    items.push({
      key: "image",
      label: labels.image,
      keywords: ["image", "picture", "photo", "media"],
      run: (e) => void insertImage(e),
    });
  return items;
}

/** The body block types `/` offers (RFC-0015), inserted with their examples. */
function blockSlashItems(
  blocks: EditorBlocks | undefined,
  locale: string,
  load: (markdown: string) => JSONContent[],
): SlashItem[] {
  if (!blocks) return [];
  return blocks.types
    .filter((t) => t.where.includes("body"))
    .map((t) => {
      const Icon = blockIcon(t);
      const english = localized(t.title, "en");
      const item: SlashItem & { icon: ReactNode } = {
        key: `block:${t.name}`,
        label: localized(t.title, locale),
        keywords: [t.name, english, "block"],
        icon: <Icon />,
        run: (e) => {
          const attrs = { name: t.name, props: { ...t.example.props } };
          const content =
            t.content === "markdown"
              ? {
                  type: "directiveContainer",
                  attrs,
                  content: t.example.markdown ? load(t.example.markdown) : [{ type: "paragraph" }],
                }
              : { type: "directiveLeaf", attrs };
          e.chain().focus().insertContent(content).run();
        },
      };
      return item;
    });
}

const SLASH_ICONS: Record<string, ReactNode> = {
  paragraph: <TextT />,
  heading2: <TextHTwo />,
  heading3: <TextHThree />,
  bulletList: <ListBullets />,
  orderedList: <ListNumbers />,
  taskList: <ListChecks />,
  quote: <Quotes />,
  codeBlock: <CodeBlock />,
  table: <Table />,
  rule: <Minus />,
  image: <ImageIcon />,
};

/**
 * The `/` menu: a listbox under the caret. Keys stay in the editor (arrows, Enter or Tab to
 * insert, Escape to dismiss); the pointer works too.
 */
function SlashMenu({ state, labels }: { state: SlashState; labels: MarkdownEditorLabels }) {
  const list = useRef<HTMLDivElement>(null);
  const mount = useRef(state.mount);
  // Positioned once per opening; Floating UI keeps it under the `/` from then on.
  useEffect(() => {
    if (!list.current) return;
    return mount.current(list.current);
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${state.index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [state.index]);
  return createPortal(
    <div
      ref={list}
      role="listbox"
      aria-label={labels.insertMenu}
      data-slash-menu=""
      className="fixed top-0 left-0 z-50 max-h-72 w-64 overflow-y-auto rounded-lg bg-kumo-elevated p-1 shadow-lg ring ring-kumo-line"
    >
      {state.items.length === 0 ? (
        <div className="px-2 py-1.5">
          <Text variant="secondary" size="sm">
            {labels.noMatches}
          </Text>
        </div>
      ) : (
        state.items.map((item, i) => (
          <div
            key={item.key}
            role="option"
            tabIndex={-1}
            aria-selected={i === state.index}
            data-index={i}
            data-slash-item={item.key}
            className={cn(
              "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-kumo-default",
              i === state.index && "bg-kumo-tint",
            )}
            onMouseEnter={() => state.hover(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => state.choose(item)}
            onKeyDown={() => {}}
          >
            <span className="flex size-4 items-center justify-center text-kumo-subtle">
              {(item as SlashItem & { icon?: ReactNode }).icon ?? SLASH_ICONS[item.key]}
            </span>
            {item.label}
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}

/** One heading of the body, with what is wrong with its level (if anything). */
export interface OutlineEntry {
  level: number;
  text: string;
  /** Document position of the heading node. */
  pos: number;
  problem?: "skipped" | "extraH1";
}

/**
 * The body's headings in order. The page title is the H1, so the body starts at H2: an H1 in the
 * body, or a heading more than one level below the previous one, is flagged.
 */
export function outlineOf(editor: Editor): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  let previous = 1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const level = Number(node.attrs.level) || 1;
    const problem = level === 1 ? "extraH1" : level > previous + 1 ? "skipped" : undefined;
    out.push({ level, text: node.textContent, pos, ...(problem ? { problem } : {}) });
    previous = level;
    return false;
  });
  return out;
}

/** "Outline": the headings in a popover; choosing one moves the caret there. */
function OutlineButton({ editor, labels }: { editor: Editor; labels: MarkdownEditorLabels }) {
  const [open, setOpen] = useState(false);
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => outlineOf(e),
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const problems = headings.filter((h) => h.problem).length;
  const go = (pos: number) => {
    setOpen(false);
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .scrollIntoView()
      .run();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button variant="ghost" size="sm" icon={<ListDashes />} data-outline-button="">
            {labels.outline}
            {problems > 0 && (
              <Badge variant="warning" appearance="dot">
                {problems}
              </Badge>
            )}
          </Button>
        }
      />
      <Popover.Content align="end" positionMethod="fixed" className="grid w-72 gap-2">
        <Popover.Title>{labels.outline}</Popover.Title>
        {headings.length === 0 ? (
          <Text variant="secondary" size="sm">
            {labels.outlineEmpty}
          </Text>
        ) : (
          <nav aria-label={labels.outline} className="grid max-h-80 gap-0.5 overflow-y-auto">
            {headings.map((h) => (
              <Button
                key={h.pos}
                variant="ghost"
                size="sm"
                className="h-auto min-h-7 justify-start py-1 text-start"
                style={{ paddingInlineStart: `${0.5 + Math.max(h.level - 2, 0) * 0.875}rem` }}
                data-outline-level={h.level}
                onClick={() => go(h.pos)}
              >
                <span className="min-w-0 flex-1 truncate">{h.text || "…"}</span>
                {h.problem && (
                  <Badge variant="warning">
                    {h.problem === "extraH1" ? labels.outlineExtraH1 : labels.outlineSkipped}
                  </Badge>
                )}
              </Button>
            ))}
          </nav>
        )}
      </Popover.Content>
    </Popover>
  );
}

/** A toolbar over selected text: the inline formats and the link. */
/**
 * The top-level blocks the selection touches (RFC-0016), as markdown, with `replace`: it refuses
 * when those blocks changed since, so a late AI answer never overwrites newer edits.
 */
export function selectionBlocks(editor: Editor, codec: MarkdownCodec): AiSelection | undefined {
  const { doc, selection } = editor.state;
  if (selection.empty) return undefined;
  const first = doc.resolve(selection.from).index(0);
  const last = doc.resolve(Math.max(selection.from, selection.to - 1)).index(0);
  const nodes: JSONContent[] = [];
  let from = -1;
  let to = -1;
  doc.forEach((node, offset, index) => {
    if (index < first || index > last) return;
    if (from < 0) from = offset;
    to = offset + node.nodeSize;
    nodes.push(node.toJSON() as JSONContent);
  });
  if (!nodes.length) return undefined;
  const original = JSON.stringify(nodes);
  return {
    markdown: nodes.map((n) => codec.block(n)).join("\n\n"),
    replace: (markdown) => {
      const now: JSONContent[] = [];
      editor.state.doc.forEach((node, offset) => {
        if (offset >= from && offset + node.nodeSize <= to) now.push(node.toJSON() as JSONContent);
      });
      if (JSON.stringify(now) !== original) return false;
      const content = (codec.load(markdown).doc.content ?? []).filter(
        (n) => !(n.type === "paragraph" && !n.content?.length),
      );
      if (!content.length) return false;
      return editor.chain().focus().insertContentAt({ from, to }, content).run();
    },
  };
}

function SelectionMenu({
  editor,
  labels,
  onAskAi,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
  onAskAi?: () => void;
}) {
  // While the link popover is open the editor loses focus; the menu stays.
  const linkOpen = useRef(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
    }),
  });
  const chain = () => editor.chain().focus();
  const items: ToolbarItem[] = [
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
  ];
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e, state: s, view }) =>
        linkOpen.current ||
        (view.hasFocus() &&
          e.isEditable &&
          !s.selection.empty &&
          !(s.selection instanceof NodeSelection) &&
          !e.isActive("codeBlock"))
      }
      className="z-40"
    >
      <Toolbar
        size="sm"
        aria-label={labels.selectionToolbar}
        className="rounded-lg bg-kumo-elevated shadow-md ring ring-kumo-line"
        data-selection-toolbar=""
      >
        {items.map((item) => (
          <ToolbarButton key={item.key} item={item} />
        ))}
        <LinkButton
          editor={editor}
          labels={labels}
          active={state.link}
          onOpenChange={(open) => {
            linkOpen.current = open;
          }}
        />
        {onAskAi && labels.askAi && (
          <ToolbarButton
            item={{ key: "ai", label: labels.askAi, icon: <Sparkle />, run: onAskAi }}
          />
        )}
      </Toolbar>
    </BubbleMenu>
  );
}

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
  onImage,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
  disabled: boolean;
  onImage: (() => void) | undefined;
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
      ...(onImage
        ? [{ key: "image", label: labels.image, icon: <ImageIcon />, run: onImage }]
        : []),
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
            <ToolbarButton key={item.key} item={item} />
          ))}
          {i === 0 && <LinkButton editor={editor} labels={labels} active={state.link} />}
        </span>
      ))}
    </Toolbar>
  );
}

function ToolbarButton({ item }: { item: ToolbarItem }) {
  return (
    <Toolbar.Button
      icon={item.icon}
      aria-label={item.label}
      title={item.label}
      aria-pressed={item.active === undefined ? undefined : item.active}
      disabled={item.disabled}
      data-format={item.key}
      className={cn(item.active && "bg-kumo-tint")}
      // Keep the editor's selection: the button never takes focus from it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={item.run}
    />
  );
}

function LinkButton({
  editor,
  labels,
  active,
  onOpenChange,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
  active: boolean;
  onOpenChange?: (open: boolean) => void;
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
    onOpenChange?.(next);
  };
  const apply = () => {
    const url = href.trim();
    if (!url || !allowedHref(url)) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    openWith(false);
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    openWith(false);
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
