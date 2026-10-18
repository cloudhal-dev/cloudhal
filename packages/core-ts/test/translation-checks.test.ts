/** RFC-0033 §6: the deterministic checks of a machine translation. */
import type { ContentEntry, Glossary, Page } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { checkNames, checkTranslation } from "../src/translation-checks.ts";

const page = (sections: Page["sections"], title = "Launch"): Page =>
  ({ id: "page_01HZX8K3QAAA", locale: "en", title, sections }) as Page;
const entry = (value: string, title: string): ContentEntry =>
  ({
    id: "entry_01HZX8K3QAAA",
    locale: "en",
    title,
    body: { format: "markdown", value },
  }) as ContentEntry;
const glossary = {
  entries: [
    { term: "Cloudhal", doNotTranslate: true },
    { term: "byline", translations: { ar: { text: "سطر الكاتب" } } },
  ],
} as unknown as Glossary;

describe("translation checks", () => {
  it("passes a faithful translation, numbers in another script included", () => {
    const checks = checkTranslation({
      source: entry(
        "Cloudhal has 1,250 readers. Every story has a byline. See [more](/about).",
        "Readers",
      ),
      draft: entry("لدى Cloudhal ١٬٢٥٠ قارئ. لكل قصة سطر الكاتب. انظر [المزيد](/about).", "القراء"),
      locale: "ar",
      glossary,
    });
    expect(checkNames(checks)).toEqual(["links", "numbers", "glossary", "length"]);
  });

  it("names what is missing: links, numbers, glossary terms, and a layout that moved", () => {
    const checks = checkTranslation({
      source: page([
        { id: "sec_a", kind: "hero", heading: "Cloudhal in 3 steps" },
        { id: "sec_b", kind: "richText", format: "markdown", body: "[Guide](/guide)" },
      ] as Page["sections"]),
      draft: page(
        [
          { id: "sec_b", kind: "richText", format: "markdown", body: "Guía" },
          { id: "sec_a", kind: "hero", heading: "Nube en pocos pasos" },
        ] as Page["sections"],
        "Lanzamiento",
      ),
      locale: "es",
      glossary,
    });
    expect(checkNames(checks)).toEqual(["!structure", "!links", "!numbers", "!glossary", "length"]);
    expect(checks.find((c) => c.name === "links")?.detail).toContain("/guide");
    expect(checks.find((c) => c.name === "glossary")?.detail).toContain(
      '"Cloudhal" stays as written',
    );
  });

  it("lets an independent layout differ, and flags a draft of a very different length", () => {
    const source = page([
      { id: "sec_a", kind: "hero", heading: "A long heading about launching things well" },
    ] as Page["sections"]);
    const draft = {
      ...page([{ id: "sec_x", kind: "hero", heading: "Hi" }] as Page["sections"], "L"),
      translation: { group: "page_01HZX8K3QAAA", method: "machine", layout: "independent" },
    } as Page;
    expect(checkNames(checkTranslation({ source, draft, locale: "es" }))).toEqual([
      "links",
      "numbers",
      "glossary",
      "!length",
    ]);
  });
});
