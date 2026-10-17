/** The editor's toolbar: undo/redo, block types, lists, inline formats, insertions, the mode switch. */
import { cn, Toolbar } from "@cloudflare/kumo";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Code,
  CodeBlock,
  Image as ImageIcon,
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
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";
import { LinkButton } from "./LinkButton.tsx";
import type { MarkdownEditorLabels } from "./types.ts";

export interface ToolbarItem {
  key: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

/** What the toolbar shows as on or off. */
const selectToolbarState = ({ editor: e }: { editor: Editor }) => ({
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
});

type ToolbarState = ReturnType<typeof selectToolbarState>;

/** The toolbar's buttons in groups: inline formats, headings, blocks and insertions, history. */
function toolbarGroups(
  editor: Editor,
  {
    state,
    labels,
    onImage,
  }: { state: ToolbarState; labels: MarkdownEditorLabels; onImage: (() => void) | undefined },
): ToolbarItem[][] {
  const chain = () => editor.chain().focus();
  return [
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
}

export function FormatToolbar({
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
  const state = useEditorState({ editor, selector: selectToolbarState });
  const groups = toolbarGroups(editor, { state, labels, onImage });
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

export function ToolbarButton({ item }: { item: ToolbarItem }) {
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
