/** The `/` menu: built-in blocks and the theme's body blocks (RFC-0015), filtered as the writer types. */
import { cn, Text } from "@cloudflare/kumo";
import { localized } from "@cloudhal/core-ts/blocks";
import {
  CodeBlock,
  Image as ImageIcon,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Quotes,
  Table,
  TextHThree,
  TextHTwo,
  TextT,
} from "@phosphor-icons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { blockIcon } from "../blockIcon.ts";
import type { EditorBlocks } from "./directives.tsx";
import type { SlashItem, SlashState } from "./slash.ts";
import type { MarkdownEditorLabels } from "./types.ts";

/** The blocks `/` offers, in the editor's words. */
export function slashItems(
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
export function blockSlashItems(
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

export const SLASH_ICONS: Record<string, ReactNode> = {
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
export function SlashMenu({ state, labels }: { state: SlashState; labels: MarkdownEditorLabels }) {
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
      // i18n-ignore: Floating UI places the menu in physical left/top coordinates
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
