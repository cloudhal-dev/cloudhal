import { describe, expect, it } from "vitest";
import { type ReportTerm, taxonomyReport } from "../src/taxonomy-report.ts";

const term = (
  id: string,
  slug: string,
  name: string,
  extra: Partial<ReportTerm> = {},
): ReportTerm => ({
  id,
  slug,
  status: "active",
  visibility: "public",
  labels: { en: { name } },
  createdAt: `2026-10-0${id.length % 9}T00:00:00Z`,
  ...extra,
});

describe("taxonomyReport", () => {
  it("finds single-use, unused, near-duplicate and proposed tags with a merge suggestion", () => {
    const report = taxonomyReport({
      hierarchical: false,
      locale: "en",
      terms: [
        term("term_llm", "llm", "LLM"),
        term("term_llms", "llms", "LLMs", { status: "proposed" }),
        term("term_javascript", "javascript", "JavaScript", {
          labels: { en: { name: "JavaScript", altNames: ["JS"] } },
        }),
        term("term_js", "js", "JS", { status: "proposed" }),
        term("term_kubernetes", "kubernetes", "Kubernetes"),
        term("term_kubernetis", "kubernetis", "Kubernetis"),
        term("term_old", "old", "Old", { status: "retired" }),
      ],
      usage: new Map([
        ["term_llm", { total: 4, published: 2 }],
        ["term_javascript", { total: 1, published: 1 }],
        ["term_kubernetes", { total: 1, published: 0 }],
        ["term_kubernetis", { total: 3, published: 3 }],
      ]),
    });
    expect(report.terms).toBe(6);
    expect(report.singleUse).toEqual(["term_javascript", "term_kubernetes"]);
    expect(report.unused).toEqual(["term_js", "term_llms"]);
    expect(report.proposed).toHaveLength(2);
    const pairs = report.nearDuplicates.map((d) => [d.source, d.target, d.reason]);
    expect(pairs).toContainEqual(["term_llms", "term_llm", "plural"]);
    expect(pairs).toContainEqual(["term_js", "term_javascript", "synonym"]);
    // The misspelling is the more used one: the suggestion keeps it and merges the other.
    expect(pairs).toContainEqual(["term_kubernetes", "term_kubernetis", "similar"]);
  });

  it("reports empty and oversized categories in a hierarchy, counting sub-categories", () => {
    const report = taxonomyReport({
      hierarchical: true,
      entries: 40,
      terms: [
        term("term_news", "news", "News"),
        term("term_local", "local", "Local", { parentId: "term_news" }),
        term("term_sport", "sport", "Sport"),
        term("term_empty", "empty", "Empty"),
      ],
      usage: { term_local: { total: 2, published: 2 }, term_sport: { total: 30, published: 30 } },
    });
    expect(report.emptyCategories).toEqual(["term_empty"]);
    expect(report.oversizedCategories).toEqual(["term_sport"]);
  });
});
