// The primitives' renderer table (docs/engineering/code-structure.md §5) covers the catalog.
import { PRIMITIVES } from "@cloudhal/core-ts/surfaces";
import { describe, expect, it } from "vitest";
import { PRIMITIVE_HTML, primitiveHtml } from "../src/surfaces/primitives/index.ts";

describe("PRIMITIVE_HTML", () => {
  it("has one renderer for each primitive of the catalog, and no other", () => {
    expect(Object.keys(PRIMITIVE_HTML).sort()).toEqual(PRIMITIVES.map((p) => p.name).sort());
  });

  it("draws nothing for a name it does not know, inherited ones included", () => {
    for (const component of ["Hologram", "toString", "constructor", "__proto__"])
      expect(primitiveHtml({ id: "a", component, props: {}, children: [] }, "ch-s")).toBe("");
  });
});
