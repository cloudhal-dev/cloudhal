/** The menu over selected text (inline formats, the link, AI on the selection) and the blocks a selection covers. */
import { Toolbar } from "@cloudflare/kumo";
import { Code, Sparkle, TextB, TextItalic, TextStrikethrough } from "@phosphor-icons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useRef } from "react";
import type { MarkdownCodec } from "./codec.ts";
import { ToolbarButton, type ToolbarItem } from "./FormatToolbar.tsx";
import { LinkButton } from "./LinkButton.tsx";
import type { AiSelection, MarkdownEditorLabels } from "./types.ts";

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

export function SelectionMenu({
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
