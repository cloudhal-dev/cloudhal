/** RFC-0033 §4a: a linked translation rebuilt on its original's layout. */
import type { Page } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { linkedLayout } from "../src/translation-layout.ts";

const page = (sections: unknown[]) => ({ sections }) as unknown as Page;

describe("linkedLayout", () => {
  it("keeps translated sections, brings new ones untranslated, drops removed ones, follows the order", () => {
    const original = page([
      { id: "b", kind: "hero", heading: "B" },
      { id: "c", kind: "hero", heading: "C (new)" },
      { id: "a", kind: "richText", heading: "A changed kind" },
    ]);
    const translation = page([
      { id: "a", kind: "hero", heading: "A es" },
      { id: "b", kind: "hero", heading: "B es" },
      { id: "d", kind: "hero", heading: "D es (gone)" },
    ]);
    const out = linkedLayout(original, translation);
    expect(out.sections.map((s) => [s.id, (s as { heading?: string }).heading])).toEqual([
      ["b", "B es"],
      ["c", "C (new)"],
      ["a", "A changed kind"],
    ]);
    expect([out.untranslated, out.removed, out.changed]).toEqual([["c", "a"], ["d"], true]);
    expect(linkedLayout(translation, translation).changed).toBe(false);
  });
});
