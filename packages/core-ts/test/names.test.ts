import { describe, expect, it } from "vitest";
import {
  editDistance,
  foldName,
  humanizeSlug,
  pluralForms,
  type ResolvableTerm,
  resolveTerm,
  slugify,
} from "../src/names.ts";

const term = (
  id: string,
  slug: string,
  labels: ResolvableTerm["labels"],
  extra: Partial<ResolvableTerm> = {},
): ResolvableTerm => ({ id, slug, status: "active", labels, ...extra });

const vocabulary: ResolvableTerm[] = [
  term(
    "term_000000ai",
    "artificial-intelligence",
    {
      en: { name: "Artificial intelligence", altNames: ["AI", "A.I."] },
      tr: { name: "Yapay zekâ", altNames: ["YZ"] },
    },
    { slugHistory: ["ai-old"] },
  ),
  term("term_000000js", "javascript", { en: { name: "JavaScript", altNames: ["JS"] } }),
  term("term_00000llm", "llm", { en: { name: "LLMs" } }),
  term("term_00000ist", "istanbul", { tr: { name: "İstanbul" } }),
  term("term_00kitap0", "kitap", { tr: { name: "Kitap" } }),
  term("term_00retire", "old-news", { en: { name: "Old news" } }, { status: "retired" }),
  term("term_0000dup1", "apple", { en: { name: "Apple" } }),
  term("term_0000dup2", "apple-inc", { en: { name: "Apple Inc", altNames: ["Apple Computer"] } }),
];

describe("foldName", () => {
  it("folds case, Turkish dotted/dotless i, diacritics and punctuation", () => {
    expect(foldName("A.I.")).toBe("ai");
    expect(foldName("Yapay Zekâ")).toBe("yapay-zeka");
    expect(foldName("İSTANBUL")).toBe("istanbul");
    expect(foldName("ıspanak")).toBe("ispanak");
    expect(foldName("Çağrı Şükrü Öz")).toBe("cagri-sukru-oz");
    expect(foldName("  Machine   Learning! ")).toBe("machine-learning");
    expect(foldName("Ｆｕｌｌｗｉｄｔｈ")).toBe("fullwidth");
    expect(foldName("Straße")).toBe("strasse");
    expect(foldName("rock'n'roll")).toBe("rocknroll");
    expect(foldName("machine-learning")).toBe("machine-learning");
  });

  it("slugify, humanizeSlug, pluralForms and editDistance", () => {
    expect(slugify("Yapay Zekâ & Robotlar")).toBe("yapay-zeka-robotlar");
    expect(humanizeSlug("machine-learning")).toBe("Machine learning");
    expect(pluralForms("stories")).toContain("story");
    expect(pluralForms("boxes")).toContain("box");
    expect(pluralForms("llms")).toContain("llm");
    expect(pluralForms("kitaplar")).toContain("kitap");
    expect(pluralForms("evler")).toContain("ev");
    expect(pluralForms("class")).toEqual(["class"]);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abc", "abcdef", 1)).toBe(2);
  });
});

describe("resolveTerm (RFC-0002 §6.3 order)", () => {
  const r = (input: string) => resolveTerm(vocabulary, input, { locale: "en" });

  it("resolves by id, slug, slug history, name, alternative name and plural folding", () => {
    expect(r("term_000000js")).toMatchObject({ matched: true, termId: "term_000000js", via: "id" });
    expect(r("javascript")).toMatchObject({ matched: true, via: "slug" });
    expect(r("Machine Learning")).toMatchObject({ matched: false });
    expect(r("ai-old")).toMatchObject({
      matched: true,
      termId: "term_000000ai",
      via: "slugHistory",
    });
    expect(r("artificial intelligence")).toMatchObject({ termId: "term_000000ai", via: "slug" });
    expect(r("Yapay zeka")).toMatchObject({ termId: "term_000000ai", via: "name" });
    expect(r("A.I.")).toMatchObject({ termId: "term_000000ai", via: "altName" });
    expect(r("JS")).toMatchObject({ termId: "term_000000js", via: "altName" });
    expect(r("ISTANBUL")).toMatchObject({ termId: "term_00000ist" });
    expect(r("LLM")).toMatchObject({ termId: "term_00000llm", via: "slug" });
    expect(r("llms")).toMatchObject({ termId: "term_00000llm", via: "name" });
    expect(r("Kitaplar")).toMatchObject({ termId: "term_00kitap0", via: "plural" });
  });

  it("prefers the earliest step: an exact slug beats another term's synonym", () => {
    expect(r("apple")).toMatchObject({ matched: true, termId: "term_0000dup1", via: "slug" });
    expect(r("Apple Computer")).toMatchObject({ termId: "term_0000dup2", via: "altName" });
  });

  it("never matches retired terms, and reports ambiguity and suggestions instead of guessing", () => {
    expect(r("old-news")).toMatchObject({ matched: false, reason: "none" });
    const ambiguous = resolveTerm(
      [
        term("term_0000aaa1", "ml", { en: { name: "Machine learning" } }),
        term("term_0000aaa2", "machine-learning-2", { en: { name: "Machine Learning" } }),
      ],
      "machine learning",
    );
    expect(ambiguous).toMatchObject({ matched: false, reason: "ambiguous" });
    if (!ambiguous.matched) expect(ambiguous.candidates).toHaveLength(2);
    const miss = r("javascrpt");
    expect(miss.matched).toBe(false);
    if (!miss.matched) {
      expect(miss.suggestions[0]?.slug).toBe("javascript");
      expect(miss.suggestions.length).toBeLessThanOrEqual(5);
    }
  });
});
