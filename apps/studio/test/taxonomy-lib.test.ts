import { describe, expect, it } from "vitest";
import { normaliseFrom, servedPaths, validateRedirect } from "../src/lib/redirects.ts";
import {
  cleanTerm,
  facetFilter,
  indexStatus,
  missingPrimaries,
  needsTagsMigration,
  parentCandidates,
  tagSuggestions,
  termTree,
  validateSlug,
  validateTerm,
  withAssignment,
} from "../src/lib/taxonomy.ts";
import {
  CATEGORY,
  entry,
  ITEMS,
  JS,
  LLM,
  LLMS,
  LOCAL,
  NEWS,
  OLD,
  redirect,
  TAG,
  TECH,
} from "./taxonomy-fixtures.ts";

const tags = [JS, LLM, LLMS, OLD];

describe("taxonomy lib", () => {
  it("orders a tree depth-first and keeps orphans at the root", () => {
    const rows = termTree(ITEMS.filter((i) => i.term.taxonomyId === CATEGORY.id));
    expect(rows.map((r) => [r.item.term.slug, r.depth])).toEqual([
      ["news", 0],
      ["local", 1],
      ["technology", 0],
    ]);
    expect(termTree([{ term: LOCAL }]).map((r) => r.depth)).toEqual([0]);
  });

  it("never offers a term itself or below it as a parent", () => {
    const ids = parentCandidates([NEWS, LOCAL, TECH], NEWS).map((t) => t.id);
    expect(ids).toEqual([TECH.id]);
  });

  it("reads indexing like the renderer: indexed, thin, empty, not public", () => {
    expect(indexStatus(NEWS, CATEGORY, 3, "en").kind).toBe("indexed");
    expect(indexStatus(NEWS, CATEGORY, 1, "en")).toEqual({ kind: "thin", published: 1, min: 3 });
    expect(indexStatus(NEWS, CATEGORY, 0, "en").kind).toBe("empty");
    expect(indexStatus(LLMS, TAG, 5, "en")).toEqual({ kind: "none", reason: "proposed" });
  });

  it("validates slugs against live slugs and histories", () => {
    expect(validateSlug("llm", tags)).toBe("taken");
    expect(validateSlug("old", tags)).toBeUndefined(); // merged: the target's history holds it
    expect(validateSlug("Bad Slug", tags)).toBe("invalid");
    expect(validateSlug("js", [{ ...JS, slugHistory: ["js"] }])).toBe("reserved");
  });

  it("mirrors invariant 12 and the limits in the term editor", () => {
    const errors = validateTerm(
      {
        ...JS,
        labels: { en: { name: "", altNames: ["LLM", "js", "J.S."] } },
        position: -1,
      },
      { defaultLocale: "en", terms: tags },
    );
    expect(errors.locales.en?.name).toBe("required");
    expect(errors.locales.en?.altNames?.map((a) => a.code)).toEqual([
      "collision",
      // "J.S." folds to "js", which the list already has
      "duplicate",
    ]);
    expect(errors.position).toBe("invalid");
  });

  it("cleans a term: no empty labels, synonyms, SEO or descriptions", () => {
    const cleaned = cleanTerm(
      {
        ...JS,
        labels: {
          en: { name: " JavaScript ", altNames: [" JS ", ""] as [string, ...string[]], seo: { title: " " } },
          tr: { name: "" },
        },
      },
      "en",
    );
    expect(cleaned.labels).toEqual({ en: { name: "JavaScript", altNames: ["JS"] } });
  });

  it("suggests tags: synonyms match, exact or plural matches never offer create", () => {
    const js = tagSuggestions(tags, "js", { locale: "en" });
    expect(js[0]).toMatchObject({ kind: "term", term: { id: JS.id } });
    expect(js.some((s) => s.kind === "create")).toBe(false);
    const plural = tagSuggestions([JS, LLM], "llms", { locale: "en" });
    expect(plural.some((s) => s.kind === "create")).toBe(false);
    const fresh = tagSuggestions(tags, "Rust lang", { locale: "en" });
    expect(fresh.at(-1)).toMatchObject({ kind: "create", name: "Rust lang", slug: "rust-lang" });
    const near = tagSuggestions([LLM], "llmz", { locale: "en" }).at(-1);
    expect(near).toMatchObject({ kind: "create", similar: [{ id: LLM.id }] });
  });

  it("keeps assignments canonical and finds missing primaries", () => {
    const e = withAssignment(entry(), "category", { ids: [NEWS.id] }, { autoPrimary: true });
    expect(e.terms).toEqual({ category: { ids: [NEWS.id], primary: NEWS.id } });
    expect(withAssignment(e, "category", { ids: [] }).terms).toBeUndefined();
    expect(missingPrimaries(entry(), [CATEGORY, TAG], "review").map((t) => t.key)).toEqual([
      "category",
    ]);
    expect(missingPrimaries(entry(), [CATEGORY], "draft")).toEqual([]);
  });

  it("builds the facet filter and knows when to offer the migration", () => {
    expect(
      facetFilter({
        category: { key: "category", slug: "news", hierarchical: true },
        tag: { key: "tag", slug: "ai" },
      }),
    ).toBe("category:news>*+tag:ai");
    expect(facetFilter({})).toBeUndefined();
    expect(needsTagsMigration([], [])).toBe(true);
    expect(needsTagsMigration([CATEGORY], [{ tags: ["x"] }])).toBe(true);
    expect(needsTagsMigration([CATEGORY], [{ tags: [] }])).toBe(false);
    expect(needsTagsMigration(undefined, [])).toBe(false);
  });

  it("validates manual redirects like the store", () => {
    const served = servedPaths({
      pages: [{ path: "/about" }],
      entries: [entry({ status: "published" })],
      defaultLocale: "en",
      taxonomies: [TAG],
      terms: tags,
    });
    expect([...served].sort()).toEqual([
      "/about",
      "/posts/hello-world",
      "/tag/javascript",
      "/tag/llm",
    ]);
    const ctx = { redirects: [redirect({ from: "/a", to: "/b", match: "exact" })], served };
    expect(validateRedirect({ from: "/about", to: "/x" }, ctx).from).toBe("served");
    expect(validateRedirect({ from: "/a", to: "/x" }, ctx).from).toBe("taken");
    expect(validateRedirect({ from: "/b", to: "/a" }, ctx).to).toBe("loop");
    expect(validateRedirect({ from: "/c", to: "//evil.example" }, ctx).to).toBe("invalid");
    expect(validateRedirect({ from: "/c", to: "/c?x=1" }, ctx).to).toBe("self");
    expect(validateRedirect({ from: "/c", to: "https://ok.example/x" }, ctx)).toEqual({});
    expect(normaliseFrom("https://example.com/old/page/")).toBe("/old/page");
    expect(normaliseFrom("old")).toBe("/old");
  });
});
