/**
 * RFC-0020 §9: A2UI v0.9 and json-render in and out. The A2UI messages below follow the spec's
 * own basic-catalog examples (google/A2UI, `specification/v0_9/catalogs/basic/examples`,
 * Apache-2.0): the product card and the login form.
 */
import { describe, expect, it } from "vitest";
import {
  A2UI_BASIC_CATALOG,
  fromA2ui,
  fromJsonRender,
  InteropError,
  toA2ui,
  toJsonRender,
} from "../src/surface-interop.ts";
import { checkSurface, createCatalog } from "../src/surfaces.ts";

const catalog = createCatalog({ name: "blog", major: 1 });
const v = "v0.9";
const sid = "gallery-product-card";

const productCard = [
  {
    version: v,
    createSurface: { surfaceId: sid, catalogId: A2UI_BASIC_CATALOG, sendDataModel: true },
  },
  {
    version: v,
    updateComponents: {
      surfaceId: sid,
      components: [
        { id: "root", component: "Card", child: "main-column" },
        { id: "main-column", component: "Column", children: ["image", "details"] },
        { id: "image", component: "Image", url: { path: "/imageUrl" }, fit: "cover" },
        {
          id: "details",
          component: "Column",
          children: ["name", "rating-row", "price-row", "actions"],
        },
        { id: "name", component: "Text", text: { path: "/name" }, variant: "h3" },
        { id: "rating-row", component: "Row", children: ["stars", "reviews"], align: "center" },
        { id: "stars", component: "Text", text: { path: "/stars" }, variant: "body" },
        {
          id: "reviews",
          component: "Text",
          text: {
            call: "formatString",
            args: { value: "(${/reviewCount} reviews)" },
            returnType: "string",
          },
          variant: "caption",
        },
        { id: "price-row", component: "Row", children: ["price"], align: "start" },
        {
          id: "price",
          component: "Text",
          text: { call: "formatCurrency", args: { value: { path: "/price" }, currency: "USD" } },
          variant: "h2",
        },
        { id: "actions", component: "Row", children: ["add-cart-btn"] },
        { id: "add-cart-btn-text", component: "Text", text: "Add to Cart" },
        {
          id: "add-cart-btn",
          component: "Button",
          child: "add-cart-btn-text",
          variant: "primary",
          action: { event: { name: "addToCart", context: {} } },
        },
      ],
    },
  },
  {
    version: v,
    updateDataModel: {
      surfaceId: sid,
      value: {
        imageUrl: "https://example.com/p.jpg",
        name: "Wireless Headphones Pro",
        stars: "★★★★★",
        reviewCount: 2847,
        price: 199.99,
      },
    },
  },
];

const byId = (r: ReturnType<typeof fromA2ui>) =>
  new Map(r.surface.components.map((c) => [c.id, c]));

describe("A2UI import", () => {
  it("turns the product card into a valid surface and says what it left out", () => {
    const r = fromA2ui(productCard, { sectionId: "sec_product01", catalog: catalog.id });
    expect(checkSurface(r.surface, catalog).issues).toEqual([]);
    const c = byId(r);
    expect(c.get("root")).toEqual({ id: "root", component: "Card", children: ["main-column"] });
    expect(c.get("main-column")?.children).toEqual(["details"]); // the image is gone
    expect(c.get("name")).toMatchObject({
      component: "Heading",
      props: { text: { path: "/name" }, level: 3 },
    });
    expect(c.get("reviews")).toMatchObject({
      component: "Text",
      props: {
        text: { call: "concat", args: { parts: ["(", { path: "/reviewCount" }, " reviews)"] } },
        size: "s",
        muted: true,
      },
    });
    expect(c.get("price")?.props?.text).toEqual({
      call: "formatCurrency",
      args: { value: { path: "/price" }, currency: "USD" },
    });
    // the button's text child became its label; the event could not come along
    expect(c.get("add-cart-btn")).toMatchObject({
      component: "Button",
      props: { label: "Add to Cart", variant: "primary" },
    });
    expect(c.has("add-cart-btn-text")).toBe(false);
    expect(r.surface.data).toMatchObject({ name: "Wireless Headphones Pro", price: 199.99 });
    expect(r.notes.join("\n")).toMatch(/Image components were left out/);
    expect(r.notes.join("\n")).toMatch(/no server actions/);
  });

  it("drops form inputs with a reason, maps choices, tabs and links, and expands template lists", () => {
    const r = fromA2ui(
      [
        { version: v, createSurface: { surfaceId: "s", catalogId: A2UI_BASIC_CATALOG } },
        {
          version: v,
          updateComponents: {
            surfaceId: "s",
            components: [
              { id: "root", component: "Column", children: ["user", "tabs", "plans", "docs"] },
              {
                id: "user",
                component: "TextField",
                label: "Username",
                value: { path: "/username" },
              },
              {
                id: "tabs",
                component: "Tabs",
                tabs: [
                  { title: "Monthly", child: "m" },
                  { title: { path: "/yearlyTitle" }, child: "y" },
                ],
              },
              { id: "m", component: "Text", text: "$9" },
              { id: "y", component: "Text", text: "$90" },
              { id: "plans", component: "List", children: { path: "/plans", componentId: "plan" } },
              { id: "plan", component: "Text", text: { path: "name" } },
              {
                id: "docs",
                component: "Button",
                child: "docs-label",
                variant: "borderless",
                action: {
                  functionCall: { call: "openUrl", args: { url: "https://cloudhal.dev/docs" } },
                },
              },
              { id: "docs-label", component: "Text", text: "Read the docs" },
              {
                id: "billing",
                component: "ChoicePicker",
                options: [
                  { label: "Monthly", value: "monthly" },
                  { label: "Yearly", value: "yearly" },
                ],
                value: { path: "/billing" },
                variant: "mutuallyExclusive",
              },
            ],
          },
        },
        {
          version: v,
          updateDataModel: {
            surfaceId: "s",
            path: "/plans",
            value: [{ name: "Free" }, { name: "Pro" }],
          },
        },
        { version: v, updateDataModel: { surfaceId: "s", path: "/yearlyTitle", value: "Yearly" } },
      ],
      { sectionId: "sec_mixed00001", catalog: catalog.id },
    );
    expect(checkSurface(r.surface, catalog).issues).toEqual([]);
    const c = byId(r);
    expect(c.has("user")).toBe(false);
    expect(r.notes.join("\n")).toMatch(
      /TextField components were left out: text fields need server actions/,
    );
    const tabs = c.get("tabs");
    expect(tabs?.children?.map((k) => c.get(k)?.props?.label)).toEqual(["Monthly", "Yearly"]);
    expect(c.get("plans")?.children?.map((k) => c.get(k)?.props?.text)).toEqual([
      { path: "/plans/0/name" },
      { path: "/plans/1/name" },
    ]);
    expect(c.get("docs")?.props).toEqual({
      label: "Read the docs",
      variant: "ghost",
      href: "https://cloudhal.dev/docs",
    });
    expect(c.has("billing")).toBe(false); // never placed under root
  });

  it("applies later messages over earlier ones and refuses what is not a surface", () => {
    const r = fromA2ui(
      [
        { version: v, createSurface: { surfaceId: "a", catalogId: A2UI_BASIC_CATALOG } },
        {
          version: v,
          updateComponents: {
            surfaceId: "a",
            components: [{ id: "root", component: "Text", text: "First" }],
          },
        },
        {
          version: v,
          updateComponents: {
            surfaceId: "a",
            components: [{ id: "root", component: "Text", text: "Second" }],
          },
        },
        { version: v, createSurface: { surfaceId: "b", catalogId: A2UI_BASIC_CATALOG } },
      ],
      { sectionId: "sec_later00001", catalog: catalog.id },
    );
    expect(r.surface.components).toEqual([
      { id: "root", component: "Text", props: { text: "Second" } },
    ]);
    expect(r.notes.join("\n")).toMatch(/2 surfaces; converted "a"/);
    expect(() => fromA2ui([], { sectionId: "sec_x00000001", catalog: catalog.id })).toThrow(
      InteropError,
    );
    expect(() =>
      fromA2ui(
        [
          {
            version: v,
            updateComponents: {
              surfaceId: "c",
              components: [{ id: "x", component: "Text", text: "No root" }],
            },
          },
        ],
        {
          sectionId: "sec_x00000001",
          catalog: catalog.id,
        },
      ),
    ).toThrow(/no "root"/);
  });
});

describe("A2UI export", () => {
  it("writes basic-catalog messages that import back to the same surface", () => {
    const surface = fromA2ui(productCard, {
      sectionId: "sec_product01",
      catalog: catalog.id,
    }).surface;
    const { messages, notes } = toA2ui(surface, { surfaceId: "card" });
    expect(messages[0]).toEqual({
      version: v,
      createSurface: { surfaceId: "card", catalogId: A2UI_BASIC_CATALOG },
    });
    const components = (
      messages[1] as { updateComponents: { components: Record<string, unknown>[] } }
    ).updateComponents.components;
    expect(components.find((c) => c.id === "add-cart-btn")).toEqual({
      id: "add-cart-btn",
      component: "Button",
      child: "add-cart-btn-label",
      variant: "primary",
      action: { event: { name: "press", context: {} } },
    });
    expect(components.find((c) => c.id === "reviews")?.text).toEqual({
      call: "formatString",
      args: { value: "(${/reviewCount} reviews)" },
      returnType: "string",
    });
    expect(messages[2]).toMatchObject({ updateDataModel: { surfaceId: "card", path: "/" } });
    expect(notes).toEqual([]);
    const back = fromA2ui(messages, { sectionId: "sec_product01", catalog: catalog.id }).surface;
    expect(back.components.map((c) => [c.id, c.component])).toEqual(
      surface.components.map((c) => [c.id, c.component]),
    );
  });

  it("flattens Cloudhal-only components and leaves images out without a URL resolver", () => {
    const surface = {
      id: "sec_landing001",
      components: [
        {
          id: "root",
          component: "Band",
          props: { tone: "brand" },
          children: ["hero", "stat", "pic", "faq"],
        },
        { id: "hero", component: "Heading", props: { text: "Ship faster", level: 1 } },
        { id: "stat", component: "Stat", props: { value: "99.9%", label: "Uptime" } },
        { id: "pic", component: "Image", props: { asset: "asset:asset_abc123", alt: "Team" } },
        {
          id: "faq",
          component: "Disclosure",
          props: { summary: "Can I cancel?" },
          children: ["answer"],
        },
        { id: "answer", component: "Text", props: { text: "Any time." } },
      ],
    } as never;
    const out = toA2ui(surface);
    const components = (
      out.messages[1] as { updateComponents: { components: Record<string, unknown>[] } }
    ).updateComponents.components;
    expect(components.find((c) => c.id === "root")).toEqual({
      id: "root",
      component: "Column",
      children: ["hero", "stat", "faq"],
    });
    expect(components.find((c) => c.id === "hero")).toMatchObject({
      component: "Text",
      variant: "h1",
    });
    expect(components.find((c) => c.id === "stat")).toEqual({
      id: "stat",
      component: "Column",
      children: ["stat-value", "stat-label"],
    });
    expect(out.notes.join("\n")).toMatch(/images were left out: pass assetUrl/);
    const withUrls = toA2ui(surface, {
      assetUrl: (ref) => `https://news.example/media/${ref.slice(6)}`,
    });
    const pic = (
      withUrls.messages[1] as { updateComponents: { components: Record<string, unknown>[] } }
    ).updateComponents.components.find((c) => c.id === "pic");
    expect(pic).toEqual({
      id: "pic",
      component: "Image",
      url: "https://news.example/media/asset_abc123",
      description: "Team",
    });
  });
});

describe("json-render", () => {
  it("imports a spec written against Cloudhal's catalog, bindings and visibility included", () => {
    const r = fromJsonRender(
      {
        root: "page",
        elements: {
          page: { type: "Stack", props: { gap: "m" }, children: ["title", "price", "promo"] },
          title: { type: "Heading", props: { text: "Pricing", level: 2 } },
          price: { type: "Stat", props: { value: { $state: "/price" }, label: "per month" } },
          promo: {
            type: "Badge",
            props: { label: "Sale" },
            visible: [{ $state: "/onSale" }, { $state: "/price", gte: 5 }],
          },
        },
        state: { price: "$9", onSale: true },
      },
      { sectionId: "sec_jsonrend01", catalog: catalog.id },
    );
    expect(checkSurface(r.surface, catalog).issues).toEqual([]);
    expect(r.surface.components[0]).toEqual({
      id: "root",
      component: "Stack",
      props: { gap: "m" },
      children: ["title", "price", "promo"],
    });
    expect(r.surface.components[2]?.props?.value).toEqual({ path: "/price" });
    expect(r.surface.components[3]?.visible).toEqual({
      and: [{ path: "/onSale" }, { gte: [{ path: "/price" }, 5] }],
    });
    expect(r.surface.data).toEqual({ price: "$9", onSale: true });
    const back = toJsonRender(r.surface);
    expect(back.spec).toMatchObject({
      root: "root",
      elements: { price: { type: "Stat", props: { value: { $state: "/price" } } } },
      state: { price: "$9", onSale: true },
    });
    expect(() =>
      fromJsonRender({ elements: {} }, { sectionId: "sec_x00000001", catalog: catalog.id }),
    ).toThrow(InteropError);
  });
});
