/**
 * A body ```surface fence may use every primitive and built-in block, and a theme block only when
 * its type allows `body`: a section-only theme block (`where: ["section"]`) has no component in an
 * article and drew "unknown component" there, so writes refuse it and the catalog says so.
 */
import { describe, expect, it } from "vitest";
import { createBlockRegistry, defineBlockTypes } from "../src/blocks.ts";
import { checkBodyFences } from "../src/store/validation.ts";
import { catalogPrompt, checkBodySurfaces, createCatalog } from "../src/surfaces.ts";

const block = (name: string, where: ("section" | "body")[]) => ({
  name,
  title: name,
  where,
  props: {
    type: "object" as const,
    additionalProperties: false as const,
    properties: { title: { type: "string" as const, maxLength: 80 } },
  },
  example: { props: { title: "x" } },
});
const blocks = createBlockRegistry(
  defineBlockTypes([block("link-cards", ["section"]), block("testimonial", ["section", "body"])]),
);
const catalog = createCatalog({ name: "lens", blocks });

const body = (component: string) =>
  [
    "Intro.",
    "",
    '```surface {"id":"more","catalog":"lens@1"}',
    '{"id":"root","component":"Stack","children":["b"]}',
    `{"id":"b","component":"${component}","props":{"title":"Read on"}}`,
    "```",
  ].join("\n");

describe("blocks in article body surfaces", () => {
  it("refuses a section-only theme block and names it", () => {
    expect(
      checkBodySurfaces(body("link-cards"), catalog).map((i) => `${i.path} ${i.message}`),
    ).toEqual([
      "/surface/more/components/1/component link-cards is a section block of the theme, not allowed in article bodies; put it in a page section",
    ]);
    expect(() => checkBodyFences(blocks, body("link-cards"), "entry ent_1")).toThrow(
      expect.objectContaining({ code: "invalid_surface" }),
    );
  });

  it("keeps primitives, built-in blocks, body-allowed theme blocks and unknown names", () => {
    for (const ok of ["testimonial", "faq", "Text", "not-registered"])
      expect(
        checkBodySurfaces(body(ok), catalog).filter((i) => i.path.endsWith("/component")),
        ok,
      ).toEqual([]);
  });

  it("get_catalog's prompt lists what bodies may use and what they may not", () => {
    const prompt = catalogPrompt(catalog);
    const line = prompt
      .split("\n")
      .find((l) => l.startsWith("Every primitive may be used in a body"));
    expect(line).toContain("testimonial");
    expect(line).toMatch(/refused in bodies: link-cards\.$/);
    expect(catalogPrompt(createCatalog())).toContain(
      "Every component below may be used in a body surface.",
    );
  });
});
