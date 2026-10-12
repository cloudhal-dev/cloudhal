import { describe, expect, it } from "vitest";
import { type ReportEntry, type ReportTerm, taxonomyReport } from "../src/taxonomy-report.ts";

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

const tag = { key: "tag", hierarchical: false, required: false, minEntriesToIndex: 3 };
const category = { key: "category", hierarchical: true, required: false, minEntriesToIndex: 3 };
const entry = (id: string, terms?: ReportEntry["terms"], collection = "posts"): ReportEntry => ({
  id,
  collection,
  ...(terms ? { terms } : {}),
});

describe("taxonomyReport", () => {
  it("finds single-use, unused, near-duplicate and proposed tags with a merge suggestion", () => {
    const report = taxonomyReport({
      taxonomy: tag,
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
        term("term_ai", "a-i", "A-I", { status: "proposed" }),
        term("term_ai2", "ai-tag", "AI", { status: "proposed" }),
        term("term_ui", "ui", "UI"),
        term("term_old", "old", "Old", { status: "retired" }),
      ],
      usage: new Map([
        ["term_llm", { total: 4, published: 2 }],
        ["term_javascript", { total: 1, published: 1 }],
        ["term_kubernetes", { total: 1, published: 0 }],
        ["term_kubernetis", { total: 3, published: 3 }],
        ["term_ui", { total: 2, published: 2 }],
      ]),
    });
    expect(report.terms).toBe(9);
    expect(report.singleUse).toEqual(["term_javascript", "term_kubernetes"]);
    // proposed terms are the backlog, not "unused"
    expect(report.unused).toEqual([]);
    expect(report.proposed).toHaveLength(4);
    const pairs = report.nearDuplicates.map((d) => [d.source, d.target, d.reason]);
    expect(pairs).toContainEqual(["term_llms", "term_llm", "plural"]);
    expect(pairs).toContainEqual(["term_js", "term_javascript", "synonym"]);
    // The misspelling is the more used one: the suggestion keeps it and merges the other.
    expect(pairs).toContainEqual(["term_kubernetes", "term_kubernetis", "similar"]);
    // hyphens do not count ("a-i" = "ai"); short different words do not match ("ai" / "ui")
    expect(pairs).toContainEqual(["term_ai2", "term_ai", "similar"]);
    expect(pairs.filter((p) => p.includes("term_ui"))).toEqual([]);
    // an indexed archive (3 published) without an intro text
    expect(report.noIntro).toEqual(["term_kubernetis"]);
  });

  it("reports unused flat terms and intro texts in the default locale", () => {
    const report = taxonomyReport({
      taxonomy: tag,
      locale: "tr",
      terms: [
        term("term_a", "alpha", "Alpha", {
          labels: { tr: { name: "Alfa", description: "Giriş" } },
        }),
        term("term_b", "beta", "Beta", { labels: { en: { name: "Beta", description: "Intro" } } }),
        term("term_c", "gamma", "Gamma", { visibility: "internal" }),
      ],
      usage: { term_a: { total: 5, published: 5 }, term_b: { total: 5, published: 5 } },
    });
    expect(report.unused).toEqual(["term_c"]);
    // the intro must be in the site's default locale; internal terms have no archive
    expect(report.noIntro).toEqual(["term_b"]);
  });

  it("reports empty and oversized categories in a hierarchy, counting sub-categories", () => {
    const entries = [
      ...Array.from({ length: 30 }, (_, i) =>
        entry(`e_s${i}`, { category: { ids: ["term_sport"], primary: "term_sport" } }),
      ),
      entry("e_l1", { category: { ids: ["term_local"], primary: "term_local" } }),
      entry("e_none"),
      entry("e_page", undefined, "pages"),
    ];
    const report = taxonomyReport({
      taxonomy: { ...category, collections: ["posts"] },
      entries,
      terms: [
        term("term_news", "news", "News"),
        term("term_local", "local", "Local", { parentId: "term_news" }),
        term("term_sport", "sport", "Sport"),
        term("term_empty", "empty", "Empty"),
        term("term_drafts", "drafts", "Drafts"),
      ],
      usage: {
        term_local: { total: 2, published: 2 },
        term_sport: { total: 30, published: 30 },
        // only drafts: the archive still answers 404
        term_drafts: { total: 4, published: 0 },
      },
    });
    expect(report.emptyCategories).toEqual(["term_drafts", "term_empty"]);
    expect(report.oversizedCategories).toEqual(["term_sport"]);
    expect(report.unused).toEqual([]);
    expect(report.filed).toBe(31);
    // not required: articles without any category are "unfiled" (the page collection is not)
    expect(report.unfiled).toEqual(["e_none"]);
    expect(report.missingPrimary).toEqual([]);
    const required = taxonomyReport({
      taxonomy: { ...category, required: true },
      entries: [entry("e_x", { category: { ids: ["term_news"] } }), entry("e_y")],
      terms: [term("term_news", "news", "News")],
      usage: {},
    });
    expect(required.missingPrimary).toEqual(["e_x", "e_y"]);
    expect(required.unfiled).toEqual([]);
  });

  it("does not pair categories under different parents", () => {
    const report = taxonomyReport({
      taxonomy: category,
      terms: [
        term("term_tr", "turkey", "Turkey"),
        term("term_us", "usa", "USA"),
        term("term_tr_pol", "politics", "Politics", { parentId: "term_tr" }),
        term("term_us_pol", "us-politics", "Politics", { parentId: "term_us" }),
      ],
      usage: {},
    });
    expect(report.nearDuplicates).toEqual([]);
  });
});
