/** The body's headings as an outline: what is wrong with their levels, and a popover to jump to one. */
import { Badge, Button, Popover, Text } from "@cloudflare/kumo";
import { ListDashes } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";
import type { MarkdownEditorLabels } from "./types.ts";

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
export function OutlineButton({
  editor,
  labels,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
}) {
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
