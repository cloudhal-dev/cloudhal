/** RFC-0021 §1: design_lint and the rules an agent reads. */
import { describe, expect, it } from "vitest";
import { DESIGN_SOFT_LENGTH, designLint, effectiveDesign } from "../src/design.ts";

const ctx = { components: ["Band", "Heading", "faq"], settings: ["brand", "link"] };

describe("design rules", () => {
  it("warns about components and settings the site does not have, never refusing", () => {
    expect(designLint("## Brand\nCalm.\n\nUse `Band`, `faq` and {color.brand}.", ctx)).toEqual([]);
    expect(
      designLint("## Brand\nx\nUse `band`, `Carousel` and {color.accent}; `npm run` is code.", ctx),
    ).toEqual([
      "Not in this site's catalog: Carousel",
      "These refer to design settings the theme does not have: {color.accent} (it has brand, link)",
    ]);
    expect(designLint("`Bandd`", ctx)[0]).toBe("Not in this site's catalog: Bandd");
    expect(designLint("`HEADING`", ctx)[0]).toBe(
      "Not in this site's catalog: HEADING (did you mean Heading?)",
    );
    const long = `## Brand\n${"x".repeat(DESIGN_SOFT_LENGTH)}`;
    expect(designLint(long, ctx)).toEqual([
      "Over 8,000 characters: agents read this on every build, so keep it short.",
    ]);
  });

  it("puts the theme's rules first and says the site's win", () => {
    expect(effectiveDesign(undefined, undefined)).toBe("");
    expect(effectiveDesign("Theme rules", " ")).toBe("# The theme's design rules\n\nTheme rules");
    expect(effectiveDesign("T", "S")).toBe(
      "# The theme's design rules\n\nT\n\n# This site's design rules (they win where they differ from the theme's)\n\nS",
    );
  });
});
