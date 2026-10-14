/**
 * RFC-0015 phase 6b: body directives in the markdown editor. They load as framed blocks, save
 * byte for byte when untouched, keep the bytes of untouched blocks inside a container, are edited
 * through the form generated from their type, and are offered in the `/` menu.
 */
import { BUILT_IN_BLOCK_TYPES } from "@cloudhal/core-ts/blocks";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkdownCodec } from "../src/blocks/editor/codec.ts";
import { editorExtensions } from "../src/blocks/editor/extensions.tsx";
import { type EditorBlocks, MarkdownEditor, type MarkdownEditorLabels } from "../src/editor.ts";

const BODY = [
  "Intro.",
  "",
  ':::callout{tone="warning"  title="Before you start"}',
  "* star list",
  "* second",
  "",
  "Back up __first__.",
  ":::",
  "",
  '::button{label="Start" href="/start"}',
  "",
  '::pricing-table{plan="pro"}',
  "",
].join("\n");

describe("codec: directives", () => {
  const codec = createMarkdownCodec(editorExtensions());

  it("loads leaves and containers as nodes and saves an untouched body byte for byte", () => {
    const loaded = codec.load(BODY);
    expect(loaded.doc.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "directiveContainer",
      "directiveLeaf",
      "directiveLeaf",
    ]);
    const callout = loaded.doc.content?.[1] as JSONContent;
    expect(callout.attrs).toMatchObject({
      name: "callout",
      props: { tone: "warning", title: "Before you start" },
    });
    expect(callout.content?.map((n) => n.type)).toEqual(["bulletList", "paragraph"]);
    expect(codec.save(loaded.doc, loaded.base)).toBe(BODY);
  });

  it("keeps untouched blocks inside a container when one of them changes", () => {
    const loaded = codec.load(BODY);
    const doc = structuredClone(loaded.doc);
    const callout = doc.content?.[1] as JSONContent;
    (callout.content as JSONContent[])[1] = {
      type: "paragraph",
      content: [{ type: "text", text: "Back up everything." }],
    };
    const saved = codec.save(doc, loaded.base);
    // The container is rewritten (its attributes normalised); its list keeps its `*` bullets.
    expect(saved).toContain(
      ':::callout{tone="warning" title="Before you start"}\n* star list\n* second\n\nBack up everything.\n:::',
    );
    expect(saved).toContain('::pricing-table{plan="pro"}');
  });

  it("writes new props as attributes", () => {
    const loaded = codec.load('::button{label="Go" href="/"}\n');
    const doc = structuredClone(loaded.doc);
    (doc.content?.[0] as JSONContent).attrs = {
      name: "button",
      props: { label: 'Say "hi"', href: "/hi", variant: "secondary" },
    };
    expect(codec.save(doc, loaded.base)).toBe(
      '::button{label="Say \\"hi\\"" href="/hi" variant="secondary"}\n',
    );
  });
});

const labels = {
  rich: "Rich text",
  markdown: "Markdown",
  toolbar: "Formatting",
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Inline code",
  heading2: "Heading",
  heading3: "Subheading",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  taskList: "Checklist",
  quote: "Quote",
  codeBlock: "Code block",
  table: "Table",
  rule: "Divider",
  link: "Link",
  undo: "Undo",
  redo: "Redo",
  linkTitle: "Link",
  linkUrl: "Address",
  linkApply: "Apply",
  linkRemove: "Remove link",
  linkInvalid: "Use a safe address",
  image: "Image",
  paragraph: "Text",
  insertMenu: "Insert block",
  noMatches: "No matches",
  selectionToolbar: "Selection",
  sourceBadge: "Markdown",
  sourceHint: "Kept as written.",
  editSource: "Edit as Markdown",
  outline: "Outline",
  outlineEmpty: "No headings yet",
  outlineSkipped: "Skips a level",
  outlineExtraH1: "Title is H1",
} satisfies MarkdownEditorLabels;

const blocks: EditorBlocks = {
  types: BUILT_IN_BLOCK_TYPES.filter((t) => t.where.includes("body")),
  labels: {
    properties: "Properties",
    unknown: "Unknown block · {type}",
    unknownHint: "Kept as written; not shown on the site.",
    invalid: "Check properties",
    addItem: "Add item",
    removeItem: "Remove item",
    moveUp: "Move up",
    moveDown: "Move down",
    item: "Item {n}",
  },
};

function Harness({ initial, onChange }: { initial: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      label="Body"
      labels={labels}
      blocks={blocks}
    />
  );
}

const tiptap = () =>
  (screen.getByRole("textbox", { name: "Body" }) as HTMLElement & { editor: Editor }).editor;

describe("MarkdownEditor: blocks", () => {
  afterEach(cleanup);

  it("frames known and unknown blocks and edits props through the generated form", async () => {
    const onChange = vi.fn();
    render(<Harness initial={BODY} onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Body" });
    await waitFor(() => expect(box.querySelectorAll("[data-directive]")).toHaveLength(3));
    expect(screen.getByRole("group", { name: "Callout" })).toHaveTextContent("Before you start");
    expect(
      screen.getByRole("group", { name: "Unknown block · pricing-table" }),
    ).toBeInTheDocument();
    // The callout's inner text is part of the editable document.
    expect(
      within(screen.getByRole("group", { name: "Callout" })).getByText("second"),
    ).toBeInTheDocument();

    const button = screen.getByRole("group", { name: "Button" });
    fireEvent.click(within(button).getByRole("button", { name: "Properties" }));
    const label = await screen.findByLabelText("Label");
    fireEvent.change(label, { target: { value: "Begin" } });
    expect(onChange.mock.lastCall?.[0]).toContain('::button{label="Begin" href="/start"}');
    // Everything else keeps its bytes.
    expect(onChange.mock.lastCall?.[0]).toContain(
      ':::callout{tone="warning"  title="Before you start"}',
    );
  });

  it("inserts a block from the slash menu with its example", async () => {
    const onChange = vi.fn();
    render(<Harness initial={"First\n"} onChange={onChange} />);
    const editor = tiptap();
    editor.commands.focus("end");
    editor.commands.insertContent(" /callo");
    const menu = await screen.findByRole("listbox", { name: "Insert block" });
    expect(
      within(menu)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Callout"]);
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });
    await waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toBe(
        'First\n\n:::callout{tone="info" title="Good to know"}\nWrite the note here.\n:::\n',
      ),
    );
  });
});
