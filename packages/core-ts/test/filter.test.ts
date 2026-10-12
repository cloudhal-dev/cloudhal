import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FILTER_LIMITS,
  type FilterError,
  type FilterVocabulary,
  matches,
  parseFilter,
  resolveFilter,
  toSql,
} from "../src/filter.ts";

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as FilterError;
  }
  throw new Error("expected a FilterError");
};

describe("parseFilter", () => {
  it("parses clauses, negation, primary, collection, lists, ids and >*", () => {
    expect(parseFilter("category:news+tag:ai")).toEqual({
      source: "category:news+tag:ai",
      clauses: [
        {
          negate: false,
          field: { kind: "taxonomy", key: "category", primary: false },
          values: [{ value: "news", isId: false, descendants: false }],
        },
        {
          negate: false,
          field: { kind: "taxonomy", key: "tag", primary: false },
          values: [{ value: "ai", isId: false, descendants: false }],
        },
      ],
    });
    const ast = parseFilter("tag:[ai,llm]+-tag:sponsored+primary:category:news>*+collection:posts");
    expect(ast.clauses.map((c) => [c.negate, c.field, c.values.map((v) => v.value)])).toEqual([
      [false, { kind: "taxonomy", key: "tag", primary: false }, ["ai", "llm"]],
      [true, { kind: "taxonomy", key: "tag", primary: false }, ["sponsored"]],
      [false, { kind: "taxonomy", key: "category", primary: true }, ["news"]],
      [false, { kind: "collection" }, ["posts"]],
    ]);
    expect(ast.clauses[2]?.values[0]?.descendants).toBe(true);
    expect(parseFilter("tag:term_01HZX8K3Q9LL").clauses[0]?.values[0]).toEqual({
      value: "term_01HZX8K3Q9LL",
      isId: true,
      descendants: false,
    });
  });

  it("rejects malformed input with codes, and says how to send '+'", () => {
    for (const bad of [
      "",
      "news",
      "tag:",
      ":ai",
      "tag:[ai",
      "tag:ai]",
      "tag:a,b",
      "tag:Has Space",
      "tag:[ai,]",
      "tag:AI",
      "collection:posts>*",
    ])
      expect(err(() => parseFilter(bad)).code, bad).toBe("syntax");
    expect(err(() => parseFilter("category:news tag:ai")).message).toMatch(/%2B/);
    expect(err(() => parseFilter("status:published")).code).toBe("unknown_field");
    expect(err(() => parseFilter("primary:locale:en")).code).toBe("unknown_field");
    expect(err(() => parseFilter(`tag:${"a".repeat(FILTER_LIMITS.maxLength)}`)).code).toBe(
      "too_long",
    );
    expect(
      err(() => parseFilter(Array.from({ length: 9 }, (_, i) => `tag:t${i}`).join("+"))).code,
    ).toBe("too_many_clauses");
    expect(
      err(() => parseFilter(`tag:[${Array.from({ length: 21 }, (_, i) => `t${i}`).join(",")}]`))
        .code,
    ).toBe("too_many_values");
    expect(
      parseFilter(Array.from({ length: 8 }, (_, i) => `tag:t${i}`).join("+")).clauses,
    ).toHaveLength(8);
  });
});

const vocab: FilterVocabulary = {
  taxonomies: [
    { id: "tax_000category", key: "category", hierarchical: true },
    { id: "tax_000000tag00", key: "tag", hierarchical: false },
  ],
  terms: [
    {
      id: "term_0000news",
      taxonomyId: "tax_000category",
      slug: "news",
      status: "active",
      labels: { en: { name: "News" } },
    },
    {
      id: "term_00world",
      taxonomyId: "tax_000category",
      slug: "world",
      status: "active",
      parentId: "term_0000news",
      labels: { en: { name: "World" } },
    },
    {
      id: "term_0europe",
      taxonomyId: "tax_000category",
      slug: "europe",
      status: "active",
      parentId: "term_00world",
      labels: { en: { name: "Europe" } },
    },
    {
      id: "term_000tech",
      taxonomyId: "tax_000category",
      slug: "tech",
      status: "active",
      labels: { en: { name: "Tech" } },
    },
    {
      id: "term_00000ai",
      taxonomyId: "tax_000000tag00",
      slug: "ai",
      status: "active",
      slugHistory: ["artificial-intelligence"],
      labels: { en: { name: "AI" } },
    },
    {
      id: "term_0000llm",
      taxonomyId: "tax_000000tag00",
      slug: "llm",
      status: "active",
      slugHistory: ["llms"],
      labels: { en: { name: "LLM" } },
    },
    {
      id: "term_000spon",
      taxonomyId: "tax_000000tag00",
      slug: "sponsored",
      status: "proposed",
      labels: { en: { name: "Sponsored" } },
    },
    {
      id: "term_00llms0",
      taxonomyId: "tax_000000tag00",
      slug: "llms",
      status: "retired",
      mergedInto: "term_0000llm",
      labels: { en: { name: "LLMs" } },
    } as FilterVocabulary["terms"][number],
  ],
};

describe("resolveFilter", () => {
  it("resolves slugs (current, then history), ids, and expands >* over descendants", () => {
    const f = resolveFilter(
      parseFilter("category:news>*+tag:[artificial-intelligence,llms]"),
      vocab,
    );
    expect(f.clauses).toEqual([
      {
        negate: false,
        kind: "taxonomy",
        key: "category",
        primary: false,
        ids: ["term_0000news", "term_00world", "term_0europe"],
      },
      {
        negate: false,
        kind: "taxonomy",
        key: "tag",
        primary: false,
        ids: ["term_00000ai", "term_0000llm"],
      },
    ]);
    expect(resolveFilter(parseFilter("tag:term_000spon"), vocab).clauses[0]).toMatchObject({
      ids: ["term_000spon"],
    });
  });

  it("errors on unknown terms (with suggestions), unknown taxonomies, >* on flat taxonomies and large expansions", () => {
    const e = err(() => resolveFilter(parseFilter("tag:[ai,lmm]"), vocab));
    expect(e.code).toBe("unknown_term");
    expect(e.unknown[0]?.value).toBe("tag:lmm");
    expect(e.unknown[0]?.suggestions.map((s) => s.slug)).toContain("llm");
    expect(err(() => resolveFilter(parseFilter("series:x"), vocab)).code).toBe("unknown_taxonomy");
    expect(err(() => resolveFilter(parseFilter("tag:ai>*"), vocab)).code).toBe("not_hierarchical");
    const wide: FilterVocabulary = {
      taxonomies: vocab.taxonomies,
      terms: [
        {
          id: "term_000root0",
          taxonomyId: "tax_000category",
          slug: "root",
          status: "active",
          labels: { en: { name: "Root" } },
        },
        ...Array.from({ length: FILTER_LIMITS.maxExpansion }, (_, i) => ({
          id: `term_c${String(i).padStart(6, "0")}`,
          taxonomyId: "tax_000category",
          slug: `c${i}`,
          status: "active" as const,
          parentId: "term_000root0",
          labels: { en: { name: `C${i}` } },
        })),
      ],
    };
    expect(err(() => resolveFilter(parseFilter("category:root>*"), wide)).code).toBe(
      "expansion_too_large",
    );
  });

  it("can treat unknown terms as matching nothing (renderers reading a published snapshot)", () => {
    const f = resolveFilter(parseFilter("tag:gone+-tag:also-gone"), vocab, {
      unknown: "match-nothing",
    });
    expect(f.unknown).toEqual(["tag:gone", "tag:also-gone"]);
    expect(matches(f, { collection: "posts", terms: { tag: { ids: ["term_00000ai"] } } })).toBe(
      false,
    );
  });
});

describe("matches and toSql agree", () => {
  const entries = [
    {
      id: "e1",
      collection: "posts",
      terms: {
        category: { ids: ["term_0000news"], primary: "term_0000news" },
        tag: { ids: ["term_00000ai"] },
      },
    },
    {
      id: "e2",
      collection: "posts",
      terms: {
        category: { ids: ["term_0europe", "term_000tech"], primary: "term_000tech" },
        tag: { ids: ["term_0000llm", "term_000spon"] },
      },
    },
    { id: "e3", collection: "notes", terms: { category: { ids: ["term_000tech"] } } },
    { id: "e4", collection: "posts" },
  ];
  let db: BetterSqlite3Driver;
  beforeAll(async () => {
    db = await BetterSqlite3Driver.open(":memory:");
    await db.exec("CREATE TABLE n (id TEXT, body TEXT)");
    for (const e of entries) await db.run("INSERT INTO n VALUES (?, ?)", [e.id, JSON.stringify(e)]);
  });

  for (const expr of [
    "category:news",
    "category:news>*",
    "category:world>*+tag:llm",
    "tag:[ai,llm]+-tag:sponsored",
    "primary:category:tech",
    "-primary:category:tech",
    "collection:notes",
    "collection:[posts,notes]+-category:tech",
    "-tag:ai",
    "tag:term_000spon",
  ]) {
    it(expr, async () => {
      const f = resolveFilter(parseFilter(expr), vocab);
      const inMemory = entries.filter((e) => matches(f, e)).map((e) => e.id);
      const q = toSql(f, { column: "body" });
      const viaSql = (
        await db.all<{ id: string }>(`SELECT id FROM n WHERE ${q.sql} ORDER BY id`, q.params)
      ).map((r) => r.id);
      expect(viaSql).toEqual(inMemory);
      expect(q.params.length).toBeLessThanOrEqual(2 * f.clauses.length);
    });
  }

  it("binds parameters only and refuses odd column names", () => {
    const f = resolveFilter(parseFilter("tag:ai"), vocab);
    expect(toSql(f).sql).not.toContain("term_00000ai");
    expect(() => toSql(f, { column: "body; DROP TABLE n" })).toThrow(/invalid column/);
  });
});
