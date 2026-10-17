import { EditorView } from "@codemirror/view";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarkdownCodec,
  editorExtensions,
  filterSlashItems,
  looksLikeMarkdown,
  MarkdownEditor,
  type MarkdownEditorLabels,
  pasteMarkdown,
  type SlashItem,
  selectionBlocks,
} from "../src/editor.ts";

const labels: MarkdownEditorLabels = {
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
  table: "Insert table",
  rule: "Divider",
  link: "Link",
  undo: "Undo",
  redo: "Redo",
  linkTitle: "Link",
  linkUrl: "Address",
  linkApply: "Apply",
  linkRemove: "Remove link",
  linkInvalid: "Not allowed",
  image: "Image",
  paragraph: "Text",
  insertMenu: "Insert block",
  noMatches: "No matches",
  selectionToolbar: "Selection formatting",
  sourceBadge: "Markdown",
  sourceHint: "Kept exactly as written.",
  editSource: "Edit as Markdown",
  outline: "Outline",
  outlineEmpty: "No headings yet",
  outlineSkipped: "Skips a level",
  outlineExtraH1: "Title is H1",
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
      resolveSrc={(src) => (src.startsWith("asset:") ? `/content/${src.slice(6)}` : src)}
    />
  );
}

const editable = () => screen.getByRole("textbox", { name: "Body" });
/** The Tiptap editor behind the rich editing area (Tiptap keeps it on its DOM node). */
const tiptap = () => (editable() as HTMLElement & { editor: Editor }).editor;

describe("MarkdownEditor", () => {
  afterEach(cleanup);

  it("opens a focus mode that covers the page, keeps the host's actions, and leaves on Esc", async () => {
    const focusLabels = {
      ...labels,
      focus: "Focus",
      focusExit: "Leave focus",
      spotlight: "Spotlight",
      focusShortcut: "Ctrl+Shift+\\",
    };
    render(
      <div>
        <nav data-testid="outside">
          <button type="button">Sidebar</button>
        </nav>
        <main>
          <MarkdownEditor
            value={"One\n\nTwo\n"}
            onChange={() => {}}
            label="Body"
            labels={focusLabels}
            focusActions={<button type="button">Save now</button>}
          />
        </main>
      </div>,
    );
    expect(screen.queryByText("Save now")).toBeNull();
    const button = screen.getByRole("button", { name: "Focus" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    const layer = await screen.findByRole("dialog", { name: "Body" });
    expect(layer).toHaveAttribute("data-focused");
    expect(screen.getByTestId("outside")).toHaveAttribute("inert");
    expect(screen.getByText("Save now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.documentElement.style.overflow).toBe("hidden");
    // The spotlight is a remembered preference.
    fireEvent.click(screen.getByRole("switch", { name: "Spotlight" }));
    expect(layer).toHaveAttribute("data-spotlight");
    expect(localStorage.getItem("cloudhal.editor.spotlight")).toBe("1");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("outside")).not.toHaveAttribute("inert");
    expect(document.documentElement.style.overflow).toBe("");
    // The shortcut opens it again from inside the editor.
    editable().focus();
    fireEvent.keyDown(document, { key: "\\", code: "Backslash", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Body" })).toBeInTheDocument();
    localStorage.removeItem("cloudhal.editor.spotlight");
  });

  it("draws a ```surface source block with the host's preview, its code behind a toggle", async () => {
    const md =
      '```surface {"id":"calc","catalog":"blog@1"}\n{"id":"root","component":"Text","props":{"text":"Hi"}}\n```\n';
    const previewSource = vi.fn(async () => "<!doctype html><p>drawn</p>");
    render(
      <MarkdownEditor
        value={md}
        onChange={() => {}}
        label="Body"
        labels={{
          ...labels,
          surfacePreview: "Preview",
          showCode: "Show code",
          hideCode: "Hide code",
        }}
        previewSource={previewSource}
      />,
    );
    const frame = await screen.findByTitle("Preview");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain("drawn");
    expect(previewSource).toHaveBeenCalledWith(md.trimEnd());
    expect(editable().querySelector("[data-source-block] code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show code" }));
    expect(editable().querySelector("[data-source-block] code")?.textContent).toContain('"calc"');
  });

  it("offers no focus mode without its words", () => {
    render(<Harness initial={"Hi\n"} />);
    expect(screen.queryByRole("button", { name: "Focus" })).toBeNull();
  });

  it("shows the body richly, with source blocks for what it keeps as written", async () => {
    render(
      <Harness
        initial={"# Title\n\nSome **bold** text.\n\n<div>raw</div>\n\n![a](asset:asset_abc123)\n"}
      />,
    );
    const box = editable();
    expect(box.querySelector("h1")?.textContent).toBe("Title");
    expect(box.querySelector("strong")?.textContent).toBe("bold");
    // React node views mount after the editor's first paint.
    await waitFor(() =>
      expect(box.querySelector("[data-source-block]")?.textContent ?? "").toContain(
        "<div>raw</div>",
      ),
    );
    expect(box.querySelector("img")?.getAttribute("src")).toBe("/content/asset_abc123");
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("formats from the toolbar and saves markdown, rewriting only the edited block", async () => {
    const onChange = vi.fn();
    render(<Harness initial={"First *kept*\n\n  second\n"} onChange={onChange} />);
    // The cursor starts in the first paragraph; the second keeps its bytes.
    fireEvent.click(screen.getByRole("button", { name: "Heading" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall?.[0]).toBe("## First *kept*\n\n  second\n");
    expect(screen.getByRole("button", { name: "Heading" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to Markdown mode (CodeMirror) and back, loading what was typed there", async () => {
    render(<Harness initial={"Hello\n"} />);
    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    const source = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-source-editor] .cm-editor");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(source.querySelector(".cm-content")?.textContent).toContain("Hello");
    const view = EditorView.findFromDOM(source) as EditorView;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "## Changed\n" } });
    fireEvent.click(screen.getByRole("tab", { name: "Rich text" }));
    await waitFor(() => expect(editable().querySelector("h2")?.textContent).toBe("Changed"));
  });

  it("opens a source block in Markdown mode with its text selected", async () => {
    render(<Harness initial={"Intro\n\n<div>raw</div>\n"} />);
    const edit = await screen.findByRole("button", { name: "Edit as Markdown" });
    fireEvent.click(edit);
    const source = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-source-editor] .cm-editor");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const view = EditorView.findFromDOM(source) as EditorView;
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("<div>raw</div>");
  });

  it("inserts a block from the slash menu", async () => {
    const onChange = vi.fn();
    render(<Harness initial={"First\n"} onChange={onChange} />);
    const editor = tiptap();
    editor.commands.focus("end");
    editor.commands.insertContent(" /chec");
    const menu = await screen.findByRole("listbox", { name: "Insert block" });
    expect(
      within(menu)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Checklist"]);
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Insert block" })).not.toBeInTheDocument(),
    );
    expect(editor.isActive("taskList")).toBe(true);
    expect(onChange.mock.lastCall?.[0]).toBe("- [ ] First\n");
  });

  it("inserts an image picked by the host", async () => {
    const onChange = vi.fn();
    const pick = vi.fn(async () => ({ src: "asset:asset_abc123" }));
    render(
      <MarkdownEditor
        value={"Text\n"}
        onChange={onChange}
        label="Body"
        labels={labels}
        onPickImage={pick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(pick).toHaveBeenCalledOnce();
    expect(onChange.mock.lastCall?.[0]).toContain("![](asset:asset_abc123)");
  });

  it("shows a formatting toolbar over selected text", async () => {
    render(<Harness initial={"Select me\n"} />);
    const editor = tiptap();
    editor.commands.focus();
    editor.commands.setTextSelection({ from: 1, to: 7 });
    expect(
      await screen.findByRole("toolbar", { name: "Selection formatting" }),
    ).toBeInTheDocument();
  });

  it("lists the headings in an outline, flags level problems and jumps to one", async () => {
    render(<Harness initial={"# Top\n\nIntro\n\n## Section\n\n#### Deep\n"} />);
    const button = screen.getByRole("button", { name: /Outline/ });
    expect(button.textContent).toContain("2"); // two problems
    fireEvent.click(button);
    const nav = await screen.findByRole("navigation", { name: "Outline" });
    const items = within(nav).getAllByRole("button");
    expect(items.map((b) => b.textContent)).toEqual([
      "TopTitle is H1",
      "Section",
      "DeepSkips a level",
    ]);
    fireEvent.click(items[1] as HTMLElement);
    const editor = tiptap();
    await waitFor(() => expect(editor.state.selection.$from.parent.textContent).toBe("Section"));
  });

  it("is read-only when asked", () => {
    render(<MarkdownEditor value="Hi" onChange={() => {}} label="Body" labels={labels} readOnly />);
    expect(editable()).toHaveAttribute("contenteditable", "false");
  });
});

describe("editor helpers", () => {
  const item = (key: string, label: string, keywords: string[] = []): SlashItem => ({
    key,
    label,
    keywords,
    run: () => {},
  });

  it("finds slash items by label, key or keyword, in Turkish too", () => {
    const items = [
      item("heading2", "Başlık", ["heading", "h2"]),
      item("image", "Görsel", ["image", "picture"]),
      item("quote", "Alıntı", ["quote"]),
    ];
    expect(filterSlashItems(items, "").map((i) => i.key)).toEqual(["heading2", "image", "quote"]);
    expect(filterSlashItems(items, "gör", "tr").map((i) => i.key)).toEqual(["image"]);
    // Turkish case rules: "ALI" is "alı" (Alıntı), "ALİ" is "ali".
    expect(filterSlashItems(items, "ALI", "tr").map((i) => i.key)).toEqual(["quote"]);
    expect(filterSlashItems(items, "ALİ", "tr").map((i) => i.key)).toEqual([]);
    expect(filterSlashItems(items, "h2").map((i) => i.key)).toEqual(["heading2"]);
    expect(filterSlashItems(items, "zzz")).toEqual([]);
  });

  it("tells markdown from plain text", () => {
    expect(looksLikeMarkdown("# Title")).toBe(true);
    expect(looksLikeMarkdown("- one\n- two")).toBe(true);
    expect(looksLikeMarkdown("see [docs](https://x.test)")).toBe(true);
    expect(looksLikeMarkdown("a **strong** word")).toBe(true);
    expect(looksLikeMarkdown("Just a sentence, nothing more.")).toBe(false);
    expect(looksLikeMarkdown("2 * 3 = 6")).toBe(false);
  });

  it("hands the selected blocks to AI and replaces them, unless they changed meanwhile", async () => {
    const { Editor: TiptapEditor } = await import("@tiptap/core");
    const extensions = editorExtensions();
    const codec = createMarkdownCodec(extensions);
    const loaded = codec.load("# Title\n\nFirst **bold**.\n\nSecond.\n\nThird.\n");
    const editor = new TiptapEditor({ extensions, content: loaded.doc });
    const save = () => codec.save(editor.getJSON(), loaded.base);
    // From inside "First" to inside "Second": both whole paragraphs.
    const firstStart = (editor.state.doc.child(0).nodeSize as number) + 3;
    const secondInside =
      editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 3;
    editor.commands.setTextSelection({ from: firstStart, to: secondInside });
    const picked = selectionBlocks(editor, codec);
    expect(picked?.markdown).toBe("First **bold**.\n\nSecond.");
    expect(picked?.replace("One *merged* paragraph.")).toBe(true);
    expect(save()).toBe("# Title\n\nOne *merged* paragraph.\n\nThird.\n");

    // A late answer for blocks someone edited since is refused.
    editor.commands.setTextSelection({ from: 3, to: 5 });
    const stale = selectionBlocks(editor, codec);
    expect(stale?.markdown).toBe("# Title");
    editor.commands.insertContentAt(3, "X");
    expect(stale?.replace("# Other")).toBe(false);
    expect(save()).toContain("# TiXtle");
    editor.commands.setTextSelection(1);
    expect(selectionBlocks(editor, codec)).toBeUndefined();
  });

  it("pastes markdown as blocks, and leaves rich HTML to the editor", async () => {
    const { Editor: TiptapEditor } = await import("@tiptap/core");
    const extensions = editorExtensions();
    const codec = createMarkdownCodec(extensions);
    const editor = new TiptapEditor({ extensions, content: "<p></p>" });
    const paste = (data: Record<string, string>) =>
      pasteMarkdown(editor, codec, {
        clipboardData: { getData: (type: string) => data[type] ?? "" },
      } as unknown as ClipboardEvent);
    expect(paste({ "text/plain": "## Title\n\n- a\n- b" })).toBe(true);
    expect(editor.getJSON().content?.map((n) => n.type)).toEqual(
      expect.arrayContaining(["heading", "bulletList"]),
    );
    // VS Code sends styled spans: the text is the source.
    expect(
      paste({
        "text/plain": "**bold**",
        "text/html": "<div><span style='x'>**bold**</span></div>",
      }),
    ).toBe(true);
    // A rendered page's HTML is richer than its text.
    expect(paste({ "text/plain": "# T", "text/html": "<h1>T</h1>" })).toBe(false);
    expect(paste({ "text/plain": "plain words" })).toBe(false);
    editor.destroy();
  });
});
