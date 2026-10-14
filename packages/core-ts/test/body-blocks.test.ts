/** RFC-0014 §2 and §5: splitting bodies into blocks, and what changed between two bodies. */
import { describe, expect, it } from "vitest";
import { bodyDiff, splitMarkdown, wordDiff } from "../src/body-blocks.ts";

describe("splitMarkdown", () => {
  it("joins back into the exact source", () => {
    for (const md of [
      "",
      "One",
      "\n\n# Title\n\nText\n\n\n\n- a\n- b\n\n```js\nx\n```\n",
      "| a | b |\n|---|---|\n| 1 | 2 |\n\n<div>html</div>\n\n[ref]: https://x.test\n",
    ]) {
      const split = splitMarkdown(md);
      expect(split.prefix + split.units.map((u) => u.text).join("")).toBe(md);
    }
    expect(splitMarkdown("# T\n\nP\n").units.map((u) => u.type)).toEqual(["heading", "paragraph"]);
  });
});

describe("wordDiff", () => {
  it("marks words added and removed, keeping the spacing", () => {
    const changes = wordDiff("The quick brown fox", "The slow brown fox jumps");
    expect(changes).toEqual([
      { kind: "same", text: "The " },
      { kind: "removed", text: "quick " },
      { kind: "added", text: "slow " },
      // Kept words carry the newer text's spacing.
      { kind: "same", text: "brown fox " },
      { kind: "added", text: "jumps" },
    ]);
    const joined = (kind: "removed" | "added") =>
      changes
        .filter((c) => c.kind === "same" || c.kind === kind)
        .map((c) => c.text)
        .join("");
    expect(joined("added")).toBe("The slow brown fox jumps");
  });
});

describe("bodyDiff", () => {
  it("finds nothing between equal bodies", () => {
    const d = bodyDiff("# T\n\nText\n", "# T\n\nText\n");
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(d.blocks.map((b) => b.kind)).toEqual(["same", "same"]);
  });

  it("tells edited blocks from new and removed ones", () => {
    const before =
      "# Title\n\nFirst paragraph stays.\n\nSecond paragraph has a typo herre.\n\nGone.\n";
    const after =
      "# Title\n\nFirst paragraph stays.\n\nSecond paragraph has a typo here.\n\n## New section\n";
    const d = bodyDiff(before, after);
    expect(d.blocks.map((b) => b.kind)).toEqual(["same", "same", "changed", "removed", "added"]);
    const changed = d.blocks[2];
    if (changed?.kind !== "changed") throw new Error("expected a changed block");
    expect(changed.words.filter((w) => w.kind !== "same")).toEqual([
      { kind: "removed", text: "herre." },
      { kind: "added", text: "here." },
    ]);
    expect(d.counts).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(d.words).toEqual({ added: 4, removed: 2 });
  });

  it("keeps a moved block as removed and added, the rest unchanged", () => {
    const d = bodyDiff("A one.\n\nB two.\n\nC three.\n", "B two.\n\nC three.\n\nA one.\n");
    expect(d.blocks.map((b) => b.kind)).toEqual(["removed", "same", "same", "added"]);
  });

  it("ignores blank-line differences between blocks", () => {
    const d = bodyDiff("A\n\nB\n", "A\n\n\n\nB");
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });
});
