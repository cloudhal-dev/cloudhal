/** The markdown editor's public types: labels, props, the AI selection, picked images. */
import type { ReactNode } from "react";
import type { EditorBlocks } from "./directives.tsx";

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
