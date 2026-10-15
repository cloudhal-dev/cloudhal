import type { Page, SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { createBlockRegistry, defineBlockTypes } from "../src/blocks.ts";
import {
  applyPatch,
  catalogPrompt,
  checkSurface,
  createCatalog,
  evaluateCondition,
  nearestComponent,
  PatchError,
  patchPage,
  repairComponent,
  resolveProps,
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
    ).toEqual([
      "/components/0/props/text/call one of formatDate, formatNumber, formatCurrency, pluralize, concat, length, required, minLength, maxLength, email, range",
    ]);
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
    ).toEqual(["/components/0/visible one of {path}, eq, ne, gt, lt, and, or, not"]);
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
