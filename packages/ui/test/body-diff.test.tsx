import { bodyDiff } from "@cloudhal/core-ts/body-blocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BodyDiff, type BodyDiffLabels } from "../src/index.ts";

const labels: BodyDiffLabels = {
  added: "Added",
  removed: "Removed",
  changed: "Edited",
  unchanged: (n) => `${n} unchanged blocks`,
  wordsAdded: (n) => `+${n} words`,
  wordsRemoved: (n) => `−${n} words`,
  same: "No changes",
};

describe("BodyDiff", () => {
  it("marks added, removed and edited blocks, and folds unchanged ones", () => {
    const before =
      "# T\n\nKeep one.\n\nKeep two.\n\nA typo herre.\n\nOld paragraph removed entirely.\n";
    const after = "# T\n\nKeep one.\n\nKeep two.\n\nA typo here.\n\nFresh words appear.\n";
    const { container } = render(<BodyDiff diff={bodyDiff(before, after)} labels={labels} />);
    expect(screen.getByText("+4 words")).toBeInTheDocument();
    expect(screen.getByText("−5 words")).toBeInTheDocument();
    const edited = container.querySelector('[data-change="changed"]');
    expect(edited?.querySelector("del")?.textContent).toBe("Removed: herre.");
    expect(edited?.querySelector("ins")?.textContent).toBe("Added: here.");
    expect(container.querySelector('del[data-change="removed"]')?.textContent).toContain(
      "Old paragraph removed entirely.",
    );
    expect(container.querySelector('ins[data-change="added"]')?.textContent).toContain(
      "Fresh words appear.",
    );
    fireEvent.click(screen.getByRole("button", { name: "3 unchanged blocks" }));
    expect(container.querySelector('[data-change="same"]')?.textContent).toContain("Keep two.");
  });

  it("says when nothing changed", () => {
    render(<BodyDiff diff={bodyDiff("Same\n", "Same\n")} labels={labels} />);
    expect(screen.getByText("No changes")).toBeInTheDocument();
  });
});
