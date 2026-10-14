/** RFC-0015: block types, the props schema subset and its interpreter, the registry. */
import { describe, expect, it } from "vitest";
import {
  type BlockType,
  BlockTypeError,
  BUILT_IN_BLOCK_TYPES,
  checkPropsSchema,
  createBlockRegistry,
  defineBlockTypes,
  isBlockUrl,
  localized,
  sectionSchema,
  validateProps,
} from "../src/blocks.ts";

const pricing: BlockType = {
  name: "pricing-table",
  title: { en: "Pricing table", tr: "Fiyat tablosu" },
  where: ["section"],
  props: {
    type: "object",
    additionalProperties: false,
    required: ["plans"],
    properties: {
      heading: { type: "string", maxLength: 120 },
      plans: {
        type: "array",
        maxItems: 4,
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "price"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 40 },
            price: { type: "number", minimum: 0 },
            featured: { type: "boolean" },
          },
        },
      },
    },
  },
  example: { props: { plans: [{ name: "Free", price: 0 }] } },
};

describe("props schema subset", () => {
  it("accepts the subset and names what is outside it", () => {
    expect(checkPropsSchema(pricing.props)).toEqual([]);
    const issues = checkPropsSchema({
      type: "object",
      additionalProperties: true,
      properties: {
        when: { type: "string", format: "date-time" },
        repeat: { type: "string", pattern: "(a)\\1" },
        look: { type: "string", pattern: "(?=x)" },
        list: { type: "array", items: { type: "array", maxItems: 2, items: { type: "string" } } },
        deep: {
          type: "object",
          additionalProperties: false,
          properties: { inner: { type: "object", additionalProperties: false, properties: {} } },
        },
        anyOf: { anyOf: [] },
        Bad_Name: { type: "string" },
      },
    }).map((i) => i.path);
    expect(issues).toEqual(
      expect.arrayContaining([
        "/additionalProperties",
        "/properties/when/format",
        "/properties/repeat/pattern",
        "/properties/look/pattern",
        "/properties/list/maxItems",
        "/properties/list/items",
        "/properties/deep/properties/inner",
        "/properties/anyOf",
        "/properties/Bad_Name",
      ]),
    );
  });

  it("validates values with paths a form can point at", () => {
    expect(
      validateProps(pricing.props, { plans: [{ name: "Pro", price: 9, featured: true }] }),
    ).toEqual([]);
    expect(
      validateProps(pricing.props, {
        heading: 7,
        plans: [{ name: "", price: -1 }, { price: "x" }],
        extra: true,
      }),
    ).toEqual([
      { path: "extra", message: "not a prop of this block" },
      { path: "heading", message: "text" },
      { path: "plans/0/name", message: "required" },
      { path: "plans/0/price", message: "at least 0" },
      { path: "plans/1/name", message: "required" },
      { path: "plans/1/price", message: "a number" },
    ]);
    expect(validateProps(pricing.props, {})).toEqual([{ path: "plans", message: "required" }]);
  });

  it("checks links, assets and colors", () => {
    for (const ok of [
      "https://example.com",
      "/about",
      "#top",
      "mailto:a@b.co",
      "asset:asset_abc123",
    ])
      expect(isBlockUrl(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.test", "data:text/html,x", "https://a b", ""])
      expect(isBlockUrl(bad)).toBe(false);
    const button = BUILT_IN_BLOCK_TYPES.find((t) => t.name === "button") as BlockType;
    expect(validateProps(button.props, { label: "Go", href: "javascript:alert(1)" })).toEqual([
      { path: "href", message: "a safe link" },
    ]);
  });
});

describe("block types and the registry", () => {
  it("ships four valid built-ins, with embeds limited to YouTube and Vimeo", () => {
    expect(BUILT_IN_BLOCK_TYPES.map((t) => t.name)).toEqual(["callout", "button", "embed", "faq"]);
    const embed = BUILT_IN_BLOCK_TYPES.find((t) => t.name === "embed") as BlockType;
    expect(
      validateProps(embed.props, { url: "https://youtu.be/aqz-KE-bpKQ", title: "Bunny" }),
    ).toEqual([]);
    expect(validateProps(embed.props, { url: "https://evil.test/watch?v=x", title: "No" })).toEqual(
      [{ path: "url", message: "not in the expected form" }],
    );
  });

  it("gives containers a markdown `content` prop in sections", () => {
    const callout = BUILT_IN_BLOCK_TYPES.find((t) => t.name === "callout") as BlockType;
    expect(sectionSchema(callout).properties.content).toMatchObject({ format: "markdown" });
    const registry = createBlockRegistry();
    expect(
      registry.checkSection("callout", { tone: "warning", content: "Back up **first**." }),
    ).toEqual([]);
    expect(registry.checkSection("callout", { tone: "loud" })).toEqual([
      { path: "tone", message: "one of info, success, warning, danger" },
    ]);
    expect(registry.checkSection("pricing-table", {})).toBeUndefined(); // not registered: kept
  });

  it("keeps one global namespace: no built-in names, no duplicates, scalars only in bodies", () => {
    const registry = createBlockRegistry([pricing]);
    expect(registry.get("pricing-table")?.title).toEqual(pricing.title);
    expect(registry.list("body").map((t) => t.name)).toEqual(["callout", "button", "embed"]);
    expect(() => createBlockRegistry([{ ...pricing, name: "callout" }])).toThrow(BlockTypeError);
    expect(() => defineBlockTypes([pricing, pricing])).toThrow(/defined twice/);
    expect(() => defineBlockTypes([{ ...pricing, name: "Pricing" }])).toThrow(/name/);
    expect(() => defineBlockTypes([{ ...pricing, where: ["section", "body"] }])).toThrow(
      /scalar props only/,
    );
    expect(() => defineBlockTypes([{ ...pricing, example: { props: { plans: [] } } }])).toThrow(
      /example\/plans: at least 1 item/,
    );
  });

  it("reads localized titles with a fallback", () => {
    expect(localized({ en: "Callout", tr: "Bilgi kutusu" }, "tr-TR")).toBe("Bilgi kutusu");
    expect(localized({ en: "Callout" }, "de")).toBe("Callout");
    expect(localized("Plain", "tr")).toBe("Plain");
  });
});

describe("store: component sections (RFC-0015 §7)", () => {
  it("validates known types on write, keeps unknown ones", async () => {
    const { MemoryBlobStore } = await import("@cloudhal/storage");
    const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
    const { SiteGraphStore, seedStarterSite, InvariantError } = await import("../src/index.ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "Blocks", slug: "blocks" });
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    const component = (type: string, props: Record<string, unknown>) =>
      ({ id: "sec_block000001", kind: "component", type, props }) as const;
    const saved = await store.updatePage({
      ...home,
      sections: [...home.sections, component("callout", { tone: "success", content: "Done." })],
    });
    expect(saved.sections.at(-1)).toMatchObject({ kind: "component", type: "callout" });
    const bad = store.updatePage({
      ...saved,
      sections: [...home.sections, component("button", { label: "Go", href: "javascript:x" })],
    });
    await expect(bad).rejects.toBeInstanceOf(InvariantError);
    await expect(bad).rejects.toMatchObject({
      code: "invalid_props",
      details: { type: "button", issues: [{ path: "href", message: "a safe link" }] },
    });
    // A type this deployment does not know is kept as written.
    const kept = await store.updatePage({
      ...saved,
      sections: [...home.sections, component("pricing-table", { plans: [] })],
    });
    expect(kept.sections.at(-1)).toMatchObject({ type: "pricing-table" });
  });
});
