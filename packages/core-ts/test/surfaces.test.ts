import type { Page, SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { createBlockRegistry, defineBlockTypes } from "../src/blocks.ts";
import {
  applyPatch,
  bodySurfaces,
  calculateExpression,
  catalogPrompt,
  checkBodySurfaces,
  checkPageSurfaces,
  checkSurface,
  createCatalog,
  evaluateCondition,
  isInteractive,
  nearestComponent,
  PatchError,
  parseSurfaceFence,
  patchPage,
  repairComponent,
  resolveProps,
  resolveValue,
  SURFACE_FUNCTIONS,
  SURFACE_LIMITS,
  type SurfacePatchError,
} from "../src/surfaces.ts";

const testimonial = defineBlockTypes([
  {
    name: "testimonial",
    title: "Testimonial",
    where: ["section", "body"],
    props: {
      type: "object",
      additionalProperties: false,
      required: ["quote", "author"],
      properties: {
        quote: { type: "string", minLength: 1, maxLength: 500 },
        author: { type: "string", minLength: 1, maxLength: 80 },
      },
    },
    example: { props: { quote: "Lovely.", author: "Ada" } },
  },
]);
const catalog = createCatalog({ name: "blog", blocks: createBlockRegistry(testimonial) });

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
const messages = (s: SurfaceSection) =>
  checkSurface(s, catalog).issues.map((i) => `${i.path} ${i.message}`);

describe("catalog", () => {
  it("holds the primitives and the registry's section blocks under <theme>@<major>", () => {
    expect(catalog.id).toBe("blog@1");
    expect(catalog.get("Stack")?.kind).toBe("primitive");
    expect(catalog.get("callout")?.kind).toBe("block");
    expect(catalog.get("testimonial")?.kind).toBe("block");
    expect(catalog.get("Script")).toBeUndefined();
  });

  it("leaves out primitives the theme omits", () => {
    expect(createCatalog({ omit: ["Tabs"] }).get("Tabs")).toBeUndefined();
  });

  it("prompts with the format, the functions and every component", () => {
    const prompt = catalogPrompt(catalog);
    expect(prompt).toContain("catalog blog@1");
    expect(prompt).toContain("### Heading (content; no children)");
    expect(prompt).toContain("### Tabs (interactive; children: TabPanel)");
    expect(prompt).toContain("### testimonial (block; no children)");
    expect(prompt).toContain("formatDate");
    expect(prompt).toContain("VALIDATION_FAILED");
  });
});

describe("checkSurface", () => {
  it("reports components without an id and children that are not a list, without failing", () => {
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: { a: 1 } as unknown as string[] },
          { component: "Text", props: { text: "x" } } as unknown as SurfaceComponent,
          { component: "Text", props: { text: "y" } } as unknown as SurfaceComponent,
        ]),
      ),
    ).toEqual([
      "/components/0/children children is a list of component ids",
      "/components/1/id every component needs an id",
      "/components/2/id every component needs an id",
    ]);
  });

  const ok = surface(
    [
      { id: "root", component: "Stack", children: ["title", "plans"] },
      { id: "title", component: "Heading", props: { text: { path: "/headline" }, level: 2 } },
      { id: "plans", component: "Tabs", children: ["monthly"] },
      { id: "monthly", component: "TabPanel", props: { label: "Monthly" }, children: ["quote"] },
      {
        id: "quote",
        component: "testimonial",
        props: { quote: "Worth it.", author: "Ada" },
        visible: { ne: [{ path: "/headline" }, ""] },
      },
    ],
    { headline: "Pricing" },
  );

  it("accepts a valid tree with bindings and conditions", () => {
    expect(checkSurface(ok, catalog)).toEqual({ issues: [], unknown: [], unreachable: [] });
  });

  it("needs a root and unique ids, and children that exist", () => {
    expect(messages(surface([{ id: "a", component: "Stack" }]))).toContain(
      '/components one component has id "root"',
    );
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["ghost"] },
          { id: "root", component: "Divider" },
        ]),
      ),
    ).toEqual([
      '/components/1/id "root" is used twice',
      '/components/0/children/0 no component "ghost"',
    ]);
  });

  it("refuses shared children and cycles", () => {
    const shared = surface([
      { id: "root", component: "Stack", children: ["a", "b"] },
      { id: "a", component: "Stack", children: ["c"] },
      { id: "b", component: "Stack", children: ["c"] },
      { id: "c", component: "Divider" },
    ]);
    expect(messages(shared)).toEqual(['/components/2/children/0 "c" already belongs to "a"']);
    const cycle = surface([
      { id: "root", component: "Stack", children: ["a"] },
      { id: "a", component: "Stack", children: ["root"] },
    ]);
    expect(messages(cycle)).toEqual(['/components/1/children/0 "root" cannot be a child here']);
  });

  it("limits depth", () => {
    const chain: SurfaceComponent[] = Array.from({ length: SURFACE_LIMITS.depth + 1 }, (_, i) => ({
      id: i === 0 ? "root" : `n${i}`,
      component: "Stack",
      ...(i < SURFACE_LIMITS.depth ? { children: [`n${i + 1}`] } : {}),
    }));
    expect(messages(surface(chain)).join()).toContain(`nested deeper than ${SURFACE_LIMITS.depth}`);
  });

  it("follows each component's child rules", () => {
    expect(
      messages(
        surface([
          { id: "root", component: "Tabs", children: ["x"] },
          { id: "x", component: "Heading", props: { text: "Hi" }, children: [] },
        ]),
      ),
    ).toEqual(["/components/0/children/0 Tabs holds only TabPanel"]);
    expect(
      messages(
        surface([
          { id: "root", component: "Heading", props: { text: "Hi" }, children: ["d"] },
          { id: "d", component: "Divider" },
        ]),
      ),
    ).toEqual(["/components/0/children Heading has no children"]);
  });

  it("keeps unknown components and components still arriving, without refusing them", () => {
    const s = surface([
      { id: "root", component: "Stack", children: ["x"] },
      { id: "x", component: "hologram", props: { anything: 1 } },
      { id: "later", component: "Divider" },
    ]);
    expect(checkSurface(s, catalog)).toEqual({
      issues: [],
      unknown: ["x"],
      unreachable: ["later"],
    });
  });

  it("checks literal props, and bindings by shape", () => {
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Heading",
            props: { level: 9, colour: "red", text: { path: "nope" } },
          },
        ]),
      ),
    ).toEqual([
      "/components/0/props/text/path a JSON Pointer into the surface's data, such as /plans/0/price",
      "/components/0/props/colour not a prop of this block",
      "/components/0/props/level at most 4",
    ]);
    expect(
      messages(
        surface([{ id: "root", component: "Text", props: { text: { call: "eval", args: {} } } }]),
      ),
    ).toEqual([`/components/0/props/text/call one of ${SURFACE_FUNCTIONS.join(", ")}`]);
  });

  it("refuses unsafe links and non-asset images", () => {
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["b", "i"] },
          { id: "b", component: "Button", props: { label: "Go", href: "javascript:alert(1)" } },
          { id: "i", component: "Image", props: { asset: "https://example.com/x.png" } },
        ]),
      ),
    ).toEqual([
      "/components/1/props/href a safe link",
      "/components/2/props/asset an asset:<id> reference",
    ]);
  });

  it("checks conditions", () => {
    expect(
      messages(surface([{ id: "root", component: "Divider", visible: { xor: [1, 2] } as never }])),
    ).toEqual(["/components/0/visible one of {path}, eq, ne, gt, lt, gte, lte, and, or, not"]);
  });

  it("checks data: size and entry sources", () => {
    const big = { blob: "x".repeat(SURFACE_LIMITS.dataBytes) };
    expect(messages(surface([{ id: "root", component: "Divider" }], big))).toEqual([
      `/data at most ${SURFACE_LIMITS.dataBytes} bytes of JSON`,
    ]);
    const src = {
      latest: {
        $source: "entries",
        query: { collection: "posts", filter: "category:news", limit: 6 },
      },
      bad: {
        $source: "entries",
        query: { collection: "Posts!", filter: "+(", sort: "random", limit: 500 },
      },
    };
    const got = messages(surface([{ id: "root", component: "Divider" }], src));
    expect(got).toHaveLength(4);
    expect(got[0]).toBe("/data/bad/query/collection a collection slug, such as posts");
    expect(got[1]).toMatch(/^\/data\/bad\/query\/filter not a valid filter/);
  });
});

describe("bindings and conditions at render time", () => {
  const data = {
    title: "Plans",
    price: 1234.5,
    when: "2026-10-15T00:00:00Z",
    n: 2,
    list: [1, 2, 3],
  };

  it("resolves paths and named functions", () => {
    const props = resolveProps(
      {
        a: { path: "/title" },
        b: { call: "formatNumber", args: { value: { path: "/price" }, digits: 1 } },
        c: { call: "formatDate", args: { value: { path: "/when" }, style: "long" } },
        d: { call: "pluralize", args: { count: { path: "/n" }, one: "# post", other: "# posts" } },
        e: { call: "concat", args: { parts: ["Hi ", { path: "/title" }] } },
        f: { call: "length", args: { value: { path: "/list" } } },
        g: { path: "/missing/deep" },
        h: "literal",
      },
      data,
      { locale: "en" },
    );
    expect(props).toEqual({
      a: "Plans",
      b: "1,234.5",
      c: "October 15, 2026",
      d: "2 posts",
      e: "Hi Plans",
      f: 3,
      g: undefined,
      h: "literal",
    });
    expect(
      resolveProps(
        { c: { call: "formatDate", args: { value: { path: "/when" }, style: "long" } } },
        data,
        {
          locale: "tr",
        },
      ).c,
    ).toBe("15 Ekim 2026");
  });

  it("evaluates conditions", () => {
    expect(evaluateCondition(undefined, data)).toBe(true);
    expect(evaluateCondition({ path: "/title" }, data)).toBe(true);
    expect(evaluateCondition({ eq: [{ path: "/n" }, 2] }, data)).toBe(true);
    expect(evaluateCondition({ gt: [{ path: "/price" }, 2000] }, data)).toBe(false);
    expect(
      evaluateCondition({ and: [{ path: "/title" }, { not: { path: "/missing" } }] }, data),
    ).toBe(true);
    expect(evaluateCondition({ gt: [{ path: "/title" }, 1] }, data)).toBe(false);
  });
});

describe("repair", () => {
  it("snaps misspelt names, by case first, then by up to two edits", () => {
    expect(nearestComponent("heading", catalog)).toBe("Heading");
    expect(nearestComponent("Hedaing", catalog)).toBe("Heading");
    expect(nearestComponent("Testimonail", catalog)).toBe("testimonial");
    expect(nearestComponent("Hologram", catalog)).toBeUndefined();
  });

  it("drops unknown props and fills missing required ones from the example, reporting both", () => {
    const r = repairComponent(
      { id: "q", component: "Testimonail", props: { quote: "Yes", colour: "red" } },
      catalog,
    );
    expect(r.component).toEqual({
      id: "q",
      component: "testimonial",
      props: { quote: "Yes", author: "Ada" },
    });
    expect(r.notes).toEqual([
      'q: component "Testimonail" → "testimonial"',
      'q: dropped unknown prop "colour"',
      'q: filled required prop "author" from the example',
    ]);
  });
});

describe("applyPatch (RFC 6902)", () => {
  const doc = { a: [1, 2], b: { c: "x" } };

  it("adds, replaces, removes, moves, copies and tests", () => {
    expect(
      applyPatch(doc, [
        { op: "add", path: "/a/-", value: 3 },
        { op: "add", path: "/a/0", value: 0 },
        { op: "replace", path: "/b/c", value: "y" },
        { op: "copy", from: "/b/c", path: "/d" },
        { op: "move", from: "/d", path: "/e" },
        { op: "remove", path: "/a/1" },
        { op: "test", path: "/e", value: "y" },
      ]),
    ).toEqual({ a: [0, 2, 3], b: { c: "y" }, e: "y" });
    expect(doc).toEqual({ a: [1, 2], b: { c: "x" } });
  });

  it("is all or nothing, and names the failing op", () => {
    expect(() =>
      applyPatch(doc, [
        { op: "add", path: "/z", value: 1 },
        { op: "replace", path: "/missing", value: 1 },
      ]),
    ).toThrow(PatchError);
    try {
      applyPatch(doc, [{ op: "test", path: "/b/c", value: "nope" }]);
    } catch (e) {
      expect((e as PatchError).index).toBe(0);
    }
    expect(() => applyPatch(doc, [{ op: "add", path: "/__proto__/x", value: 1 }])).toThrow(
      "reserved key",
    );
  });
});

describe("patchPage", () => {
  const page = {
    schemaVersion: 1,
    id: "page_home00001",
    siteId: "site_abc123",
    path: "/",
    title: "Home",
    locale: "en",
    status: "draft",
    sections: [],
    rev: 1,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
  } as unknown as Page;

  it("keeps the page's shape, and reads one child written as its id (RFC-0021 eval findings)", () => {
    for (const op of [
      { op: "remove", path: "/sections" },
      { op: "replace", path: "/title", value: 3 },
    ] as const)
      expect(() => patchPage(page, [op], catalog)).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              message:
                "the page keeps its title and its list of sections; change what is inside them",
            }),
          ],
        }),
      );
    const built = patchPage(
      page,
      [
        {
          op: "add",
          path: "/sections/-",
          value: surface([
            { id: "root", component: "Stack", children: "title" as unknown as string[] },
            { id: "title", component: "Heading", props: { text: "Hi", level: 2 } },
          ]),
        },
      ],
      catalog,
    );
    expect((built.value.sections[0] as SurfaceSection).components[0]?.children).toEqual(["title"]);
    expect(built.notes).toContain('root: children "title" made a list');
  });

  it("builds a surface op by op, repairing on the way", () => {
    const s = patchPage(
      page,
      [
        {
          op: "add",
          path: "/sections/-",
          value: surface([{ id: "root", component: "stack", children: [] }]),
        },
        {
          op: "add",
          path: "/sections/0/components/-",
          value: { id: "title", component: "Heading", props: { text: "Hello", size: "xl" } },
        },
        { op: "add", path: "/sections/0/components/0/children/-", value: "title" },
        { op: "replace", path: "/title", value: "Welcome" },
      ],
      catalog,
    );
    expect(s.value.title).toBe("Welcome");
    expect((s.value.sections[0] as SurfaceSection).components.map((c) => c.component)).toEqual([
      "Stack",
      "Heading",
    ]);
    expect(s.notes).toEqual([
      'root: component "stack" → "Stack"',
      'title: dropped unknown prop "size"',
    ]);
  });

  it("answers VALIDATION_FAILED with pointers the model can fix", () => {
    const run = (ops: Parameters<typeof patchPage>[1]) => {
      try {
        patchPage(page, ops, catalog);
      } catch (e) {
        return (e as SurfacePatchError).issues;
      }
      return [];
    };
    expect(run([{ op: "replace", path: "/status", value: "published" }])).toEqual([
      {
        code: "VALIDATION_FAILED",
        path: "/status",
        message: "a build may change /title, /sections and /seo only",
        op: 0,
      },
    ]);
    expect(
      run([
        { op: "add", path: "/sections/-", value: surface([{ id: "root", component: "Hologram" }]) },
      ]),
    ).toEqual([
      {
        code: "VALIDATION_FAILED",
        path: "/sections/0/components/0/component",
        message: '"Hologram" is not in the catalog (blog@1)',
      },
    ]);
    expect(run([{ op: "remove", path: "/sections/3" }])[0]).toMatchObject({
      path: "/sections/3",
      op: 0,
    });
  });
});

describe("store: surface sections (RFC-0020 §1)", () => {
  it("stores valid surfaces, refuses broken ones with pointers, keeps unknown components", async () => {
    const { MemoryBlobStore } = await import("@cloudhal/storage");
    const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
    const { SiteGraphStore, seedStarterSite, InvariantError } = await import("../src/index.ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "Surfaces", slug: "surfaces" });
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    if (!home) throw new Error("no home page");
    const saved = await store.updatePage({
      ...home,
      sections: [
        ...home.sections,
        surface(
          [
            { id: "root", component: "Stack", children: ["h"] },
            { id: "h", component: "Heading", props: { text: { path: "/t" } } },
          ],
          { t: "Hi" },
        ),
      ],
    });
    expect(saved.sections.at(-1)).toMatchObject({ kind: "surface", catalog: "blog@1" });
    const bad = store.updatePage({
      ...saved,
      sections: [
        ...home.sections,
        surface([{ id: "root", component: "Heading", props: { level: 2 } }]),
      ],
    });
    await expect(bad).rejects.toBeInstanceOf(InvariantError);
    await expect(bad).rejects.toMatchObject({
      code: "invalid_surface",
      details: { issues: [{ path: "/sections/2/components/0/props/text", message: "required" }] },
    });
    const kept = await store.updatePage({
      ...saved,
      sections: [...home.sections, surface([{ id: "root", component: "hologram" }])],
    });
    expect(kept.sections.at(-1)).toMatchObject({ kind: "surface" });
  });
});

describe("surfaces in bodies (RFC-0020 §5)", () => {
  const body = [
    "Our plans changed this year.",
    "",
    '```surface {"id":"pricing","catalog":"blog@1"}',
    '{"data":{"billing":"monthly"}}',
    '{"id":"root","component":"Stack","children":["t"]}',
    '{"id":"t","component":"Text","props":{"text":{"path":"/billing"}}}',
    "```",
    "",
    "```js",
    '```surface {"id":"not-a-fence","catalog":"blog@1"}',
    "```",
  ].join("\n");

  it("finds fences, merges data lines and skips fences inside other code blocks", () => {
    const fences = bodySurfaces(body);
    expect(fences).toHaveLength(1);
    expect(fences[0]).toMatchObject({ id: "pricing", catalog: "blog@1", complete: true, line: 2 });
    expect(fences[0]?.section.data).toEqual({ billing: "monthly" });
    expect(fences[0]?.section.components.map((c) => c.id)).toEqual(["root", "t"]);
    expect(checkBodySurfaces(body, catalog)).toEqual([]);
  });

  it("reports unclosed fences, bad lines, duplicate ids, entry sources and component problems", () => {
    const bad = [
      '```surface {"id":"a","catalog":"blog@1"}',
      '{"id":"root","component":"Heading","props":{"level":9}}',
      "not json",
      "```",
      '```surface {"id":"a","catalog":"blog@1"}',
      '{"data":{"latest":{"$source":"entries","query":{"collection":"posts","limit":3}}}}',
      '{"id":"root","component":"Divider"}',
    ].join("\n");
    expect(checkBodySurfaces(bad, catalog).map((i) => `${i.path} ${i.message}`)).toEqual([
      "/surface/a/lines/1 not one JSON object",
      "/surface/a/components/0/props/text required",
      "/surface/a/components/0/props/level at most 4",
      "/surface/a the fence is not closed",
      "/surface/a/info/id used by another fence",
      "/surface/a/lines/0/data/latest entry sources work in page surfaces only",
    ]);
  });

  it("parses only whole lines while a body streams", () => {
    const partial = parseSurfaceFence(
      '{"id":"live","catalog":"blog@1"}',
      ['{"id":"root","component":"Divider"}'],
      false,
    );
    expect(partial).toMatchObject({ complete: false, issues: [] });
    expect(partial.section.components).toHaveLength(1);
  });

  it("teaches models the fence syntax", () => {
    expect(catalogPrompt(catalog)).toContain('```surface {"id":"pricing","catalog":"blog@1"}');
  });
});

describe("store: surfaces in entry bodies", () => {
  it("refuses a broken fence and keeps a good one", async () => {
    const { MemoryBlobStore } = await import("@cloudhal/storage");
    const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
    const { SiteGraphStore, seedStarterSite } = await import("../src/index.ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "Fences", slug: "fences" });
    const [entry] = await store.listContentEntries(site.id, "posts");
    if (!entry) throw new Error("no entry");
    const fence = (component: string) =>
      `Intro\n\n\`\`\`surface {"id":"box","catalog":"blog@1"}\n{"id":"root","component":"${component}"}\n\`\`\`\n`;
    const saved = await store.updateContentEntry({
      ...entry,
      body: { format: "markdown", value: fence("Divider") },
    });
    expect(saved.body.value).toContain("```surface");
    await expect(
      store.updateContentEntry({ ...saved, body: { format: "markdown", value: fence("Heading") } }),
    ).rejects.toMatchObject({
      code: "invalid_surface",
      details: { issues: [{ path: "/surface/box/components/0/props/text", message: "required" }] },
    });
  });
});

describe("interactive components (RFC-0020 §4)", () => {
  it("accepts inputs bound to the data and buttons with actions, and says which surfaces are interactive", () => {
    const s = surface(
      [
        { id: "root", component: "Stack", children: ["t", "s", "b", "l"] },
        {
          id: "t",
          component: "Toggle",
          props: { options: ["monthly", "yearly"], value: { path: "/billing" } },
        },
        {
          id: "s",
          component: "Slider",
          props: { label: "Seats", min: 1, max: 50, value: { path: "/seats" } },
        },
        {
          id: "b",
          component: "Button",
          props: { label: "+1", onClick: { action: "increment", path: "/seats", by: 1 } },
        },
        { id: "l", component: "Button", props: { label: "Docs", href: "/docs" } },
      ],
      { billing: "monthly", seats: 5 },
    );
    expect(checkSurface(s, catalog).issues).toEqual([]);
    expect(isInteractive(s)).toBe(true);
    expect(
      isInteractive(
        surface([{ id: "root", component: "Button", props: { label: "x", href: "/x" } }]),
      ),
    ).toBe(false);
  });

  it("asks each action for what it needs", () => {
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["a", "b"] },
          { id: "a", component: "Button", props: { label: "Go", onClick: { action: "navigate" } } },
          { id: "b", component: "Button", props: { label: "?", onClick: { action: "explode" } } },
        ]),
      ),
    ).toEqual([
      "/components/1/props/onClick/href navigate needs href",
      "/components/2/props/onClick/action one of set, toggle, increment, reset, navigate, copy, share, scrollTo, append, open, close",
    ]);
  });
});

describe("carousels (RFC-0027)", () => {
  const slides = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      component: "Text",
      props: { text: `Slide ${i}` },
    }));
  const carousel = (props: Record<string, unknown>, n: number) =>
    surface([
      { id: "root", component: "Carousel", props, children: slides(n).map((x) => x.id) },
      ...slides(n),
    ]);

  it("accepts a rail and a hero within their limits", () => {
    expect(
      messages(carousel({ label: "Customer stories", peek: "s", controls: "none" }, 6)),
    ).toEqual([]);
    expect(
      messages(carousel({ label: "Spring offers", variant: "hero", aspect: "21:9" }, 3)),
    ).toEqual([]);
  });

  it("refuses too many hero slides, a hero without a frame, hidden controls without a peek and a vague label", () => {
    expect(
      messages(carousel({ label: "Our carousel", variant: "hero", controls: "none" }, 6)),
    ).toEqual([
      "/components/0/children a hero carousel has 2 to 5 slides",
      "/components/0/props/aspect a hero carousel keeps one frame size: set aspect",
      "/components/0/props/controls none only on a rail whose next slide peeks in",
      '/components/0/props/label name what it shows ("Customer stories"); assistive technology already says carousel',
    ]);
    expect(messages(carousel({ label: "One" }, 1))).toEqual([
      "/components/0/children a rail carousel has 2 to 12 slides",
    ]);
  });

  it("takes galleries of images with thumbnails and centred testimonials (27c)", () => {
    const img = (id: string) => ({
      id,
      component: "Image",
      props: { asset: "asset:ast_example01", alt: id },
    });
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Carousel",
            props: { label: "The bakery", variant: "gallery", aspect: "4:3", markers: "thumbs" },
            children: ["a", "b"],
          },
          img("a"),
          img("b"),
        ]),
      ),
    ).toEqual([]);
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Carousel",
            props: { label: "Photos", variant: "gallery", markers: "thumbs" },
            children: ["a", "t"],
          },
          img("a"),
          { id: "t", component: "Text", props: { text: "no picture" } },
        ]),
      ),
    ).toEqual([
      "/components/0/props/aspect a gallery carousel keeps one frame size: set aspect",
      '/components/0/children gallery slide "t" has no Image',
    ]);
    expect(
      messages(carousel({ label: "Kind words", variant: "testimonials", markers: "thumbs" }, 3)),
    ).toEqual(["/components/0/props/markers thumbs only on a gallery"]);
  });

  it("loops and plays only a hero, slowly enough to read every slide (27d)", () => {
    expect(
      messages(
        carousel(
          { label: "Spring", variant: "hero", aspect: "21:9", loop: true, autoplay: "slow" },
          3,
        ),
      ),
    ).toEqual([]);
    expect(messages(carousel({ label: "Features", loop: true, autoplay: "normal" }, 3))).toEqual([
      "/components/0/props/loop only a hero loops; a rail keeps its ends",
      "/components/0/props/autoplay only a hero may move on its own",
    ]);
    const wordy = surface([
      {
        id: "root",
        component: "Carousel",
        props: { label: "Spring", variant: "hero", aspect: "21:9", autoplay: "normal" },
        children: ["a", "b"],
      },
      { id: "a", component: "Text", props: { text: "word ".repeat(20).trim() } },
      { id: "b", component: "Text", props: { text: "short" } },
    ]);
    expect(messages(wordy)).toEqual([
      "/components/0/props/autoplay a slide has 20 words; normal (6 s) suits 18 at most — shorten it, use slow, or turn autoplay off",
    ]);
  });

  it("lets one carousel per page play on its own", () => {
    const hero = (id: string) => ({
      id: `sec_${id}00001`,
      kind: "surface" as const,
      catalog: "blog@1",
      components: [
        {
          id: "root",
          component: "Carousel",
          props: { label: "Spring", variant: "hero", aspect: "21:9", autoplay: "slow" },
          children: ["a", "b"],
        },
        { id: "a", component: "Text", props: { text: "a" } },
        { id: "b", component: "Text", props: { text: "b" } },
      ],
    });
    expect(
      checkPageSurfaces([hero("one"), hero("two")] as never, catalog).map(
        (i) => `${i.path} ${i.message}`,
      ),
    ).toEqual([
      "/sections/1/components/0/props/autoplay one carousel per page may play on its own",
    ]);
  });

  it("never nests a carousel or takes an overlay as a slide", () => {
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Carousel",
            props: { label: "Outer" },
            children: ["inner", "dlg"],
          },
          { id: "inner", component: "Carousel", props: { label: "Inner" }, children: ["a", "b"] },
          { id: "a", component: "Text", props: { text: "a" } },
          { id: "b", component: "Text", props: { text: "b" } },
          { id: "dlg", component: "Dialog", props: { title: "Hi" } },
        ]),
      ),
    ).toEqual([
      "/components/0/children a Dialog is not a slide; a slide's Button may open it",
      "/components/1 a carousel never sits inside a Carousel",
    ]);
  });
});

describe("icons (RFC-0026)", () => {
  it("accepts names of the set on Icon, Button, Badge, Stat and List markers, and refuses others", () => {
    const ok = surface([
      { id: "root", component: "Stack", children: ["i", "b", "g", "s", "l"] },
      { id: "i", component: "Icon", props: { name: "rocket", size: "l", tone: "brand" } },
      {
        id: "b",
        component: "Button",
        props: { label: "Next", href: "/next", icon: "arrow-right", iconPosition: "end" },
      },
      { id: "g", component: "Badge", props: { label: "New", icon: "sparkle" } },
      { id: "s", component: "Stat", props: { value: "24/7", label: "Support", icon: "chat" } },
      { id: "l", component: "List", props: { items: ["Fast"], marker: "check-circle" } },
    ]);
    expect(messages(ok)).toEqual([]);
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["i", "l"] },
          { id: "i", component: "Icon", props: { name: "unicorn" } },
          { id: "l", component: "List", props: { items: ["a"], marker: "triangle" } },
        ]),
      ),
    ).toEqual([
      "/components/1/props/name an icon name of the set (catalogPrompt lists them)",
      "/components/2/props/marker bullet, none or an icon name of the set",
    ]);
  });

  it("repairs icon names as models write them, and drops an unknown one where it is optional", () => {
    const fix = (c: Record<string, unknown>) => repairComponent(c as never, catalog);
    expect(
      fix({ id: "i", component: "Icon", props: { name: "ArrowForward" } }).component.props,
    ).toEqual({
      name: "arrow-right",
    });
    expect(
      fix({
        id: "b",
        component: "Button",
        props: { label: "Mail", href: "/m", icon: "fa-envelope" },
      }).component.props,
    ).toEqual({
      label: "Mail",
      href: "/m",
      icon: "mail",
    });
    const dropped = fix({ id: "g", component: "Badge", props: { label: "x", icon: "unicorn" } });
    expect(dropped.component.props).toEqual({ label: "x" });
    expect(dropped.notes).toEqual(['g: dropped icon "unicorn" (not in the set)']);
    expect(
      fix({ id: "l", component: "List", props: { items: ["a"], marker: "bullet" } }).notes,
    ).toEqual([]);
  });

  it("lists the names once, by group, in the prompt", () => {
    const prompt = catalogPrompt(catalog);
    expect(prompt).toContain("Icons (RFC-0026), by name only");
    expect(prompt).toContain("Social: x, bluesky, mastodon");
    expect(prompt.match(/"chevron-down"|chevron-down/g)?.length).toBe(1);
  });
});

describe("overlays (RFC-0025 §3)", () => {
  const dialog = (id = "terms", props: Record<string, unknown> = { title: "Terms" }) => ({
    id,
    component: "Dialog",
    props,
    children: [`${id}-text`, `${id}-close`],
  });
  const inner = (id = "terms") => [
    { id: `${id}-text`, component: "Text", props: { text: "Fine print." } },
    {
      id: `${id}-close`,
      component: "Button",
      props: { label: "Close", onClick: { action: "close" } },
    },
  ];
  const opener = (target: string, id = "open") => ({
    id,
    component: "Button",
    props: { label: "Read the terms", onClick: { action: "open", target } },
  });

  it("accepts a dialog its button opens and its own button closes, and keeps the surface static", () => {
    const s = surface([
      { id: "root", component: "Stack", children: ["open", "terms"] },
      opener("terms"),
      dialog(),
      ...inner(),
    ]);
    expect(messages(s)).toEqual([]);
    expect(isInteractive(s)).toBe(false);
  });

  it("refuses targets that are not overlays, stray closes, nested modals and too many", () => {
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["open", "loose", "terms"] },
          opener("loose"),
          { id: "loose", component: "Button", props: { label: "x", onClick: { action: "close" } } },
          { ...dialog(), children: ["terms-text", "terms-close", "inner"] },
          ...inner(),
          { id: "inner", component: "Drawer", props: { title: "More" } },
        ]),
      ),
    ).toEqual([
      '/components/1/props/onClick/target "loose" is not a Dialog, Drawer, Popover or Lightbox of this surface',
      "/components/2/props/onClick close belongs inside a Dialog, Drawer, Popover or Lightbox, or names one (target)",
      "/components/6 a dialog never opens inside another; close one first",
    ]);
    const four = ["a", "b", "c", "d"];
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: four },
          ...four.map((id) => ({ id, component: "Popover", props: {} })),
        ]),
      ),
    ).toEqual(["/components/4 at most 3 overlays per section; put the rest on pages"]);
  });

  it("needs titles on dialogs and drawers, and tooltips on a Button or Link", () => {
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["d", "t", "h"] },
          { id: "d", component: "Drawer", props: {} },
          { id: "t", component: "Tooltip", props: { text: "Hi", for: "h" } },
          { id: "h", component: "Heading", props: { text: "Plans", level: 2 } },
        ]),
      ),
    ).toEqual([
      "/components/1/props/title required",
      "/components/2/props/for names a Button or Link of this surface",
    ]);
  });
});

describe("computed values (RFC-0022 22a)", () => {
  const ctx = { locale: "en" };
  const v = (value: unknown, data: unknown = {}) => resolveValue(value, data, ctx);
  const call = (name: string, args: Record<string, unknown>) => ({ call: name, args });

  it("does arithmetic, leaves blanks empty and shows 0.1 + 0.2 as 0.3", () => {
    expect(v(call("add", { values: [0.1, 0.2] }))).toBe(0.3);
    expect(v(call("multiply", { values: [{ path: "/seats" }, 9] }), { seats: 12 })).toBe(108);
    expect(v(call("subtract", { a: 10, b: "2,5" }))).toBe(7.5);
    expect(v(call("divide", { a: 1, b: 3 }))).toBe(0.3333333333);
    expect(v(call("divide", { a: 1, b: 0, fallback: "–" }))).toBe("–");
    expect(v(call("divide", { a: 1, b: 0 }))).toBe("");
    expect(v(call("add", { values: [1, { path: "/blank" }] }), { blank: "" })).toBe("");
    expect(v(call("add", { values: [1, "x"] }))).toBe("");
    expect(v(call("round", { value: 1.005, digits: 2 }))).toBe(1.01);
    expect(v(call("floor", { value: -1.5 }))).toBe(-2);
    expect(v(call("ceil", { value: 1.01, digits: 1 }))).toBe(1.1);
    expect(v(call("abs", { value: -3 }))).toBe(3);
    expect(v(call("min", { values: [3, 1, 2] }))).toBe(1);
    expect(v(call("max", { values: [3, 1, 2] }))).toBe(3);
    expect(v(call("clamp", { value: 70, min: 1, max: 50 }))).toBe(50);
    expect(v(call("power", { base: 2, exponent: 10 }))).toBe(1024);
    // a blank result stays blank when formatted (a calculator before anything is typed)
    expect(v(call("formatNumber", { value: "" }))).toBe("");
    expect(v(call("formatCurrency", { value: "", currency: "USD" }))).toBe("");
    expect(v(call("power", { base: 2, exponent: 1001 }))).toBe("");
    // a 30-year loan of 200,000 at 6 %: about 1,199.10 a month
    const r = call("divide", { a: 6, b: 1200 });
    const payment = call("divide", {
      a: call("multiply", { values: [200000, r] }),
      b: call("subtract", {
        a: 1,
        b: call("power", { base: call("add", { values: [1, r] }), exponent: -360 }),
      }),
    });
    expect(v(call("round", { value: payment, digits: 2 }))).toBe(1199.1);
    expect(v(call("number", { value: " 42 " }))).toBe(42);
    expect(v(call("number", { value: "", fallback: 0 }))).toBe(0);
    expect(v(call("formatPercent", { value: 0.256, digits: 1 }))).toBe("25.6%");
  });

  it("chooses and branches with the data, and aggregates lists", () => {
    const data = { activity: "light", n: 7, plans: [{ price: 9 }, { price: 19 }, { price: "" }] };
    const factor = call("choose", {
      value: { path: "/activity" },
      cases: { low: 1.2, light: 1.375 },
      default: 1,
    });
    expect(v(factor, data)).toBe(1.375);
    expect(v(factor, { activity: "other" })).toBe(1);
    expect(
      v(
        call("if", { cond: { gte: [{ path: "/n" }, 7] }, ifTrue: "a week", ifFalse: "days" }),
        data,
      ),
    ).toBe("a week");
    expect(v(call("if", { cond: { lt: [{ path: "/n" }, 7] }, ifTrue: "x" }), data)).toBe("");
    expect(v(call("sum", { list: { path: "/plans" }, field: "price" }), data)).toBe(28);
    expect(v(call("average", { list: { path: "/plans" }, field: "price" }), data)).toBe(14);
    expect(v(call("count", { list: { path: "/plans" }, field: "price" }), data)).toBe(2);
    expect(v(call("average", { list: [] }))).toBe("");
  });

  it("computes the RFC's calorie example from nested calls", () => {
    const kcal = call("multiply", {
      values: [
        call("add", {
          values: [
            call("multiply", { values: [10, { path: "/weight" }] }),
            call("multiply", { values: [6.25, { path: "/height" }] }),
            call("multiply", { values: [-5, { path: "/age" }] }),
            call("choose", { value: { path: "/sex" }, cases: { male: 5, female: -161 } }),
          ],
        }),
        call("choose", { value: { path: "/activity" }, cases: { low: 1.2, light: 1.375 } }),
      ],
    });
    const data = { sex: "female", age: 30, height: 165, weight: 60, activity: "light" };
    expect(v(call("formatNumber", { value: kcal, digits: 0 }), data)).toBe("1,815");
    expect(v(kcal, { ...data, weight: "" })).toBe("");
    // the checks accept nested calls, maps and conditions as arguments
    expect(
      messages(surface([{ id: "root", component: "Stat", props: { label: "kcal", value: kcal } }])),
    ).toEqual([]);
  });

  it("reads typed expressions by grammar only", () => {
    expect(calculateExpression("12+3*4")).toBe(24);
    expect(calculateExpression("(1 + 2) × 3 ÷ 4")).toBe(2.25);
    expect(calculateExpression("-2*-3")).toBe(6);
    expect(calculateExpression("10 % 4")).toBe(2);
    expect(calculateExpression("0.1+0.2")).toBe(0.3);
    expect(calculateExpression("1/0")).toBe("");
    expect(calculateExpression("2+")).toBe("");
    expect(calculateExpression("alert(1)")).toBe("");
    expect(calculateExpression("constructor")).toBe("");
    expect(calculateExpression("(".repeat(40) + "1" + ")".repeat(40))).toBe("");
    expect(calculateExpression("1+".repeat(120) + "1")).toBe("");
    expect(v(call("calculate", { expression: { path: "/display" } }), { display: "7*6" })).toBe(42);
  });

  it("computes formulas over named values (RFC-0022: what models write easily)", () => {
    const data = {
      sex: "female",
      age: 30,
      height: 165,
      weight: 60,
      activity: "light",
      amount: 200000,
      rate: 6,
      years: 30,
    };
    const kcal = call("calculate", {
      expression: "(10*w + 6.25*h - 5*a + s) * f",
      vars: {
        w: { path: "/weight" },
        h: { path: "/height" },
        a: { path: "/age" },
        s: call("choose", { value: { path: "/sex" }, cases: { male: 5, female: -161 } }),
        f: call("choose", { value: { path: "/activity" }, cases: { low: 1.2, light: 1.375 } }),
      },
    });
    expect(v(call("round", { value: kcal }), data)).toBe(1815);
    const payment = call("calculate", {
      expression: "p * r / (1 - (1 + r)^(-12*y))",
      vars: {
        p: { path: "/amount" },
        r: call("divide", { a: { path: "/rate" }, b: 1200 }),
        y: { path: "/years" },
      },
    });
    expect(v(call("round", { value: payment, digits: 2 }), data)).toBe(1199.1);
    // a blank variable or an unknown name leaves the result empty; ^ binds tighter than unary minus
    expect(v(call("calculate", { expression: "w + 1", vars: { w: "" } }))).toBe("");
    expect(v(call("calculate", { expression: "w + 1", vars: {} }))).toBe("");
    expect(calculateExpression("-2^2")).toBe(-4);
    expect(calculateExpression("2^3^2")).toBe(512);
    expect(calculateExpression("2 ^ 1001")).toBe("");
    expect(calculateExpression("weight height", { weight: 1, height: 2 })).toBe("");
    expect(calculateExpression("constructor", {})).toBe("");
    expect(
      messages(surface([{ id: "root", component: "Stat", props: { label: "kcal", value: kcal } }])),
    ).toEqual([]);
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Text",
            props: { text: call("calculate", { expression: "x", vars: { "bad name": 1 } }) },
          },
        ]),
      ),
    ).toEqual([
      "/components/0/props/text/args/vars an object of at most 20 names (letters, digits, _) and their values",
    ]);
  });

  it("checks depth, call counts, cases and conditions in calls", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 9; i++) deep = call("abs", { value: deep });
    expect(messages(surface([{ id: "root", component: "Text", props: { text: deep } }]))).toEqual([
      "/components/0/props/text/args/value/args/value/args/value/args/value/args/value/args/value/args/value/args/value calls nest at most 8 deep",
    ]);
    // past the limit the value is empty, not computed
    expect(v(deep)).toBe("");
    const many = Array.from({ length: 26 }, (_, i) => ({
      id: `t${i}`,
      component: "Text",
      props: {
        text: call("add", { values: Array.from({ length: 20 }, () => call("abs", { value: 1 })) }),
      },
    }));
    expect(
      messages(
        surface([{ id: "root", component: "Stack", children: many.map((c) => c.id) }, ...many]),
      ),
    ).toContain("/components at most 500 function calls (this surface has 546)");
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Text",
            props: {
              text: call("if", {
                cond: { gte: [{ path: "/n" }] },
                ifTrue: "a",
                ifFalse: call("choose", { value: 1, cases: "x" }),
              }),
            },
          },
        ]),
      ),
    ).toEqual([
      "/components/0/props/text/args/cond/gte two operands",
      "/components/0/props/text/args/ifFalse/args/cases an object of at most 20 keys and their values",
    ]);
    expect(
      messages(
        surface([
          {
            id: "root",
            component: "Text",
            props: { text: call("calculate", { expression: "1".repeat(201) }) },
          },
        ]),
      ),
    ).toEqual(["/components/0/props/text/args/expression at most 200 characters"]);
  });
});

describe("local inputs (RFC-0022 22b)", () => {
  it("accepts bound inputs, refuses unbound ones, and checks options", () => {
    const ok = surface(
      [
        {
          id: "root",
          component: "Stack",
          children: ["w", "name", "vat", "act"],
        },
        {
          id: "w",
          component: "NumberField",
          props: { label: "Weight", value: { path: "/w" }, unit: "kg", min: 30 },
        },
        {
          id: "name",
          component: "TextField",
          props: { label: "Name", value: { path: "/name" }, kind: "email" },
        },
        {
          id: "vat",
          component: "Checkbox",
          props: { label: "Include VAT", checked: { path: "/vat" } },
        },
        {
          id: "act",
          component: "RadioGroup",
          props: {
            label: "Activity",
            value: { path: "/act" },
            variant: "buttons",
            options: [
              { value: "low", label: "Low" },
              { value: "high", label: "High" },
            ],
          },
        },
      ],
      { w: "", name: "", vat: false, act: "low" },
    );
    expect(messages(ok)).toEqual([]);
    expect(isInteractive(ok)).toBe(true);
    expect(
      messages(
        surface([
          { id: "root", component: "Stack", children: ["w", "c", "r"] },
          { id: "w", component: "NumberField", props: { label: "Weight", value: 70 } },
          { id: "c", component: "Checkbox", props: { label: "Yes", checked: true } },
          {
            id: "r",
            component: "RadioGroup",
            props: { label: "Pick", value: { path: "/r" }, options: [{ value: "a", label: "A" }] },
          },
        ]),
      ),
    ).toEqual([
      '/components/1/props/value bind it to the surface\'s data: {"path":"/…"} (the reader\'s input is written there)',
      '/components/2/props/checked bind it to the surface\'s data: {"path":"/…"} (the reader\'s input is written there)',
      "/components/3/props/options at least 2 items",
    ]);
  });

  it("lets set and append write computed values, and keeps appends short", () => {
    const button = (onClick: Record<string, unknown>) =>
      surface([{ id: "root", component: "Button", props: { label: "=", onClick } }], {
        display: "",
      });
    expect(
      messages(
        button({
          action: "set",
          path: "/display",
          value: { call: "calculate", args: { expression: { path: "/display" } } },
        }),
      ),
    ).toEqual([]);
    expect(messages(button({ action: "append", path: "/display", value: "7" }))).toEqual([]);
    expect(messages(button({ action: "append", path: "/display" }))).toEqual([
      "/components/0/props/onClick/value append needs value",
    ]);
    expect(messages(button({ action: "append", path: "/display", value: "x".repeat(21) }))).toEqual(
      ["/components/0/props/onClick/value at most 20 characters at a time"],
    );
    expect(messages(button({ action: "set", path: "/d", value: { call: "nope" } }))).toEqual([
      `/components/0/props/onClick/value/call one of ${SURFACE_FUNCTIONS.join(", ")}`,
    ]);
  });

  it("teaches models to bind inputs", () => {
    const prompt = catalogPrompt(catalog);
    expect(prompt).toContain("### NumberField (interactive; no children)");
    expect(prompt).toContain('"value":{"path":"/weight"}');
  });
});

describe("surface styles (RFC-0023 §4)", () => {
  it("takes a surface and an anchor from the catalog's lists, and refuses others", () => {
    const ok = surface([
      {
        id: "root",
        component: "Band",
        props: { surface: "mesh", anchor: "features" },
        children: ["c"],
      },
      { id: "c", component: "Card", props: { surface: "raised" }, children: [] },
    ]);
    expect(messages(ok)).toEqual([]);
    const bad = messages(
      surface([{ id: "root", component: "Band", props: { surface: "neon", anchor: "Top Bar" } }]),
    );
    expect(bad.some((m) => m.includes("surface"))).toBe(true);
    expect(bad.some((m) => m.includes("anchor"))).toBe(true);
  });
});

describe("image fit (RFC-0028 28b)", () => {
  const sec = (props: Record<string, unknown>) => ({
    id: "sec_imagefit01",
    kind: "surface" as const,
    catalog: "blog@1",
    components: [
      { id: "root", component: "Image", props: { asset: "asset:asset_FIT0000001", ...props } },
    ],
  });
  it("takes a fit, and refuses natural with a frame", () => {
    expect(messages(sec({ fit: "blur-fill", ratio: "16:9" }) as never)).toEqual([]);
    expect(messages(sec({ fit: "natural" }) as never)).toEqual([]);
    expect(messages(sec({ fit: "natural", ratio: "1:1" }) as never)).toEqual([
      expect.stringMatching(/^\/components\/0\/props\/fit natural shows/),
    ]);
    expect(messages(sec({ fit: "stretch" }) as never).length).toBeGreaterThan(0);
  });
});
