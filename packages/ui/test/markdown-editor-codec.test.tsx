/**
 * RFC-0014 phase 1: the editor keeps markdown canonical. Opening and saving a body that nobody
 * edited writes back the same bytes; editing one block rewrites that block only; anything the
 * editor would change the meaning of stays as a source block.
 */
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createMarkdownCodec } from "../src/blocks/editor/codec.ts";
import { editorExtensions } from "../src/blocks/editor/extensions.tsx";
import { mergeBlocks, splitMarkdown } from "../src/blocks/editor/markdown-blocks.ts";

const SAMPLE = [
  "Intro with __bold__ and *em* and a [link](https://example.com) and [media](asset:ast_123).",
  "",
  "* star list",
  "* second",
  "",
  "1. one",
  "2. two",
  "",
  "- [ ] open task",
  "- [x] done task",
  "",
  "| a | b |",
  "|---|:-:|",
  "| 1 | 2 |",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
  "> quoted",
  "",
  '<div class="x">raw html</div>',
  "",
  "[ref]: https://example.com/ref",
  "",
  "Setext heading",
  "==============",
  "",
  "![alt](asset:ast_img)",
  "",
].join("\n");

const codec = createMarkdownCodec(editorExtensions());

describe("markdown blocks", () => {
  it("split is lossless", () => {
    const split = splitMarkdown(SAMPLE);
    expect(split.prefix + split.units.map((u) => u.text).join("")).toBe(SAMPLE);
    expect(splitMarkdown("\n\nHello").prefix).toBe("\n\n");
  });

  it("an untouched body saves byte for byte", () => {
    for (const md of [SAMPLE, "", "Hello", "Hello\n", "# T\n\ntext\n\n\n\nmore\n"]) {
      const loaded = codec.load(md);
      expect(codec.save(loaded.doc, loaded.base)).toBe(md);
    }
  });

  it("what the editor cannot keep exactly stays as a source block", () => {
    const { doc } = codec.load(SAMPLE);
    const sources = (doc.content ?? [])
      .filter((n) => n.type === "sourceBlock")
      .map((n) => n.attrs?.markdown);
    expect(sources).toContain('<div class="x">raw html</div>');
    expect(sources).toContain("[ref]: https://example.com/ref");
    // everything else is edited richly
    const types = (doc.content ?? []).map((n) => n.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "paragraph",
        "bulletList",
        "orderedList",
        "taskList",
        "table",
        "codeBlock",
        "blockquote",
        "heading",
      ]),
    );
  });

  it("editing one block rewrites that block only", () => {
    const loaded = codec.load(SAMPLE);
    const content = [...(loaded.doc.content ?? [])];
    const quote = content.findIndex((n) => n.type === "blockquote");
    content[quote] = {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "changed" }] }],
    };
    const saved = codec.save({ type: "doc", content }, loaded.base);
    expect(saved).toBe(SAMPLE.replace("> quoted", "> changed"));
  });

  it("inserting, deleting and moving keep the other blocks' bytes", () => {
    const loaded = codec.load("A *x*\n\n* b\n* c\n\nC\n");
    const [a, b, c] = (loaded.doc.content ?? []) as JSONContent[] &
      [JSONContent, JSONContent, JSONContent];
    const added = {
      type: "paragraph",
      content: [{ type: "text", text: "new" }],
    };
    expect(codec.save({ type: "doc", content: [a, added, b, c] }, loaded.base)).toBe(
      "A *x*\n\nnew\n\n* b\n* c\n\nC\n",
    );
    expect(codec.save({ type: "doc", content: [a, c] }, loaded.base)).toBe("A *x*\n\nC\n");
    expect(codec.save({ type: "doc", content: [c, a, b] }, loaded.base)).toBe(
      "C\n\nA *x*\n\n* b\n* c\n",
    );
  });

  it("mergeBlocks writes new content when nothing is kept", () => {
    expect(mergeBlocks(splitMarkdown(""), [], ["# Title", "", "Text"])).toBe("# Title\n\nText\n");
  });
});
