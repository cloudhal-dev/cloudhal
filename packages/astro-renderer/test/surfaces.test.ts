import type { ContentEntry, SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { renderSectionHtml } from "../src/preview.ts";
import { loadSurfaceSources, renderSurface, surfaceTree } from "../src/surfaces.ts";

const surface = (
  components: SurfaceComponent[],
  data?: Record<string, unknown>,
): SurfaceSection => ({
  id: "sec_surface0001",
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
  ...(data ? { data } : {}),
});

describe("renderSurface (RFC-0020)", () => {
  it("draws primitives with bound and computed props, escaped", () => {
    const html = renderSurface(
      surface(
        [
          { id: "root", component: "Stack", props: { gap: "l" }, children: ["h", "t", "b", "s"] },
          { id: "h", component: "Heading", props: { text: { path: "/title" }, level: 1 } },
          { id: "t", component: "Text", props: { text: "Plans **for** <you>", size: "l" } },
          {
            id: "b",
            component: "Button",
            props: { label: "Start", href: "/start", variant: "secondary" },
          },
          {
            id: "s",
            component: "Stat",
            props: {
              value: { call: "formatNumber", args: { value: { path: "/users" } } },
              label: "Users",
            },
          },
        ],
        { title: '<img src=x onerror="a()">', users: 12500 },
      ),
    );
    expect(html).toContain(
      '<section class="ch-surface" data-section-id="sec_surface0001" data-kind="surface" data-catalog="blog@1">',
    );
    expect(html).toContain('<div class="ch-stack" data-gap="l">');
    expect(html).toContain('<h1 class="ch-heading">&lt;img src=x onerror=&quot;a()&quot;&gt;</h1>');
    expect(html).toContain("<strong>for</strong> &lt;you&gt;");
    expect(html).toContain('<a class="ch-button ch-button--secondary" href="/start">Start</a>');
    expect(html).toContain('<span class="ch-stat__value">12,500</span>');
    expect(html).not.toContain('onerror="');
  });

  it("leaves out hidden components, and bound attribute values outside their allowed set", () => {
    const html = renderSurface(
      surface(
        [
          { id: "root", component: "Row", props: { gap: { path: "/gap" } }, children: ["a", "b"] },
          {
            id: "a",
            component: "Badge",
            props: { label: "Yearly" },
            visible: { eq: [{ path: "/billing" }, "yearly"] },
          },
          {
            id: "b",
            component: "Badge",
            props: { label: "Monthly" },
            visible: { eq: [{ path: "/billing" }, "monthly"] },
          },
        ],
        { billing: "monthly", gap: 'huge" onclick="x' },
      ),
    );
    expect(html).toContain('<div class="ch-row">');
    expect(html).toContain("Monthly");
    expect(html).not.toContain("Yearly");
  });

  it("draws tabs and disclosures that work without JavaScript", () => {
    const html = renderSurface(
      surface([
        { id: "root", component: "Stack", children: ["tabs", "faq"] },
        { id: "tabs", component: "Tabs", children: ["m", "y"] },
        { id: "m", component: "TabPanel", props: { label: "Monthly" }, children: ["mt"] },
        { id: "mt", component: "Text", props: { text: "$9" } },
        { id: "y", component: "TabPanel", props: { label: "Yearly" } },
        { id: "faq", component: "Accordion", children: ["q"] },
        { id: "q", component: "Disclosure", props: { summary: "Cancel?" }, children: ["a"] },
        { id: "a", component: "Text", props: { text: "Any time." } },
      ]),
    );
    expect(html).toContain(
      '<input class="ch-tabs__radio" type="radio" name="ch-sec_surface0001-tabs" id="ch-sec_surface0001-tabs-0" checked><label class="ch-tabs__tab" for="ch-sec_surface0001-tabs-0">Monthly</label>',
    );
    expect(html).toContain('<div class="ch-tabs__panel" role="group" aria-label="Yearly"></div>');
    expect(html).toContain('<details class="ch-disclosure"><summary>Cancel?</summary>');
  });

  it("drops unsafe links and unresolved images; built-in blocks keep their markup", () => {
    const html = renderSurface(
      surface(
        [
          { id: "root", component: "Stack", children: ["l", "i", "c"] },
          { id: "l", component: "Link", props: { label: "x", href: { path: "/evil" } } },
          { id: "i", component: "Image", props: { asset: "asset:ast_missing01" } },
          { id: "c", component: "callout", props: { tone: "warning", content: "Careful." } },
        ],
        { evil: "javascript:alert(1)" },
      ),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).toContain('data-block-type="callout"');
    expect(html).toContain("Careful.");
  });

  it("labels unknown components and theme blocks in previews only", () => {
    const s = surface([
      { id: "root", component: "Stack", children: ["x"] },
      { id: "x", component: "hologram" },
    ]);
    expect(renderSurface(s)).toBe(
      '<section class="ch-surface" data-section-id="sec_surface0001" data-kind="surface" data-catalog="blog@1"><div class="ch-stack"></div></section>',
    );
    expect(renderSurface(s, { preview: true })).toContain("hologram: unknown block type");
    expect(renderSectionHtml(s)).toContain("hologram: unknown block type");
  });

  it("draws nothing for a surface whose root has not arrived", () => {
    expect(surfaceTree(surface([{ id: "a", component: "Divider" }])).root).toBeUndefined();
    expect(renderSurface(surface([{ id: "a", component: "Divider" }]))).toBe("");
  });
});

describe("entry sources", () => {
  const entry = (slug: string, title: string, publishedAt: string) =>
    ({
      id: `ent_${slug}0000`,
      collection: "posts",
      slug,
      title,
      publishedAt,
      createdAt: publishedAt,
      status: "published",
    }) as ContentEntry;
  const posts = [
    entry("a", "Alpha", "2026-10-01"),
    entry("b", "Beta", "2026-10-03"),
    entry("c", "Gamma", "2026-10-02"),
  ];

  it("loads each source from the page's source, sorted and trimmed, and binds it", async () => {
    const s = surface([{ id: "root", component: "List", props: { items: { path: "/titles" } } }], {
      latest: { $source: "entries", query: { collection: "posts", sort: "newest", limit: 2 } },
      news: {
        $source: "entries",
        query: { collection: "posts", filter: "category:news", limit: 5 },
      },
    });
    const asked: string[] = [];
    const sources = await loadSurfaceSources(
      {
        entries: async () => posts,
        entriesByFilter: async (f) => {
          asked.push(f);
          throw new Error("unknown term");
        },
      },
      [s],
    );
    expect(sources[s.id]?.latest?.map((e) => e.title)).toEqual(["Beta", "Gamma"]);
    expect(sources[s.id]?.latest?.[0]?.href).toBe("/posts/b");
    expect(sources[s.id]?.news).toEqual([]);
    expect(asked).toEqual(["collection:posts+category:news"]);
    const tree = surfaceTree(s, { sources: sources[s.id] });
    expect((tree.data.latest as unknown[]).length).toBe(2);
  });
});

describe("surfaces in markdown bodies (RFC-0020 §5)", () => {
  const md = [
    "Before",
    "",
    '```surface {"id":"box","catalog":"blog@1"}',
    '{"data":{"word":"Hello <b>"}}',
    '{"id":"root","component":"Stack","children":["t"]}',
    '{"id":"t","component":"Text","props":{"text":{"path":"/word"}}}',
    "```",
    "",
    "```js",
    "const x = 1;",
    "```",
  ].join("\n");

  it("renders a fence as a surface and leaves other fences as code", async () => {
    const { renderMarkdown } = await import("../src/markdown.ts");
    const html = renderMarkdown(md);
    expect(html).toContain('data-kind="surface"');
    expect(html).toContain("Hello &lt;b&gt;");
    expect(html).toContain('<code class="language-js">const x = 1;');
    expect(html).not.toContain("```surface");
  });

  it("hands a fence to the theme as a slot when the theme draws components", async () => {
    const { createBlockRegistry } = await import("@cloudhal/core-ts/blocks");
    const { renderBodyParts, SURFACE_SLOT } = await import("../src/markdown.ts");
    const parts = renderBodyParts({ format: "markdown", value: md }, undefined, {
      registry: createBlockRegistry(),
      components: new Set(["testimonial"]),
    });
    const slot = parts.find((p) => "slot" in p);
    expect(slot && "slot" in slot ? slot.slot.type : undefined).toBe(SURFACE_SLOT);
    expect(
      slot && "slot" in slot ? (slot.slot.props.surface as SurfaceSection).components : [],
    ).toHaveLength(2);
  });
});
