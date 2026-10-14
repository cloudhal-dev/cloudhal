import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor, type MarkdownEditorLabels } from "../src/editor.ts";

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
  sourceBadge: "Markdown",
  sourceHint: "Kept exactly as written.",
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

describe("MarkdownEditor", () => {
  afterEach(cleanup);

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

  it("switches to Markdown mode and back, loading what was typed there", async () => {
    render(<Harness initial={"Hello\n"} />);
    fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
    const source = screen.getByRole("textbox", { name: "Body" });
    expect(source).toHaveValue("Hello\n");
    fireEvent.change(source, { target: { value: "## Changed\n" } });
    fireEvent.click(screen.getByRole("tab", { name: "Rich text" }));
    await waitFor(() => expect(editable().querySelector("h2")?.textContent).toBe("Changed"));
  });

  it("is read-only when asked", () => {
    render(<MarkdownEditor value="Hi" onChange={() => {}} label="Body" labels={labels} readOnly />);
    expect(editable()).toHaveAttribute("contenteditable", "false");
  });
});
