/** RFC-0025: the chrome a page shows, the checks the contract cannot make, the brand form. */
import type { Page } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  brandFromForm,
  brandToForm,
  checkChrome,
  chromeMenuKeys,
  copyrightText,
  heroSurface,
  resolveChrome,
} from "../src/chrome.ts";

/** A page's first section: a surface whose root Stack starts with a Band painted `surface`. */
const hero = (surface: string): Page["sections"][number] => ({
  id: "sec_hero000001",
  kind: "surface",
  catalog: "blog@1",
  components: [
    { id: "root", component: "Stack", children: ["band"] },
    { id: "band", component: "Band", props: { surface }, children: ["title"] },
    { id: "title", component: "Heading", props: { text: "Hello", level: 1 } },
  ],
});

describe("heroSurface and the transparent header (RFC-0025 §2)", () => {
  it("finds a loud first band, three levels deep at most, and an old tone", () => {
    expect(heroSurface({ sections: [hero("gradient")] })).toBe("gradient");
    expect(heroSurface({ sections: [hero("muted")] })).toBeUndefined();
    expect(heroSurface({ sections: [] })).toBeUndefined();
    const tone = hero("x");
    if (tone.kind === "surface")
      tone.components[1] = {
        id: "band",
        component: "Band",
        props: { tone: "brand" },
        children: ["title"],
      };
    expect(heroSurface({ sections: [tone] })).toBe("brand");
  });

  it("reads a hero carousel only when every slide opens with the same loud band (RFC-0027 27e)", () => {
    const carousel = (a: string, b: string) => ({
      id: "sec_herocar0001",
      kind: "surface" as const,
      catalog: "blog@1",
      components: [
        {
          id: "root",
          component: "Carousel",
          props: { label: "Spring", variant: "hero", aspect: "16:9" },
          children: ["s1", "s2"],
        },
        { id: "s1", component: "Band", props: { surface: a }, children: [] },
        { id: "s2", component: "Band", props: { surface: b }, children: [] },
      ],
    });
    expect(heroSurface({ sections: [carousel("inverse", "inverse")] as never })).toBe("inverse");
    expect(heroSurface({ sections: [carousel("inverse", "brand")] as never })).toBeUndefined();
    expect(heroSurface({ sections: [carousel("inverse", "muted")] as never })).toBeUndefined();
  });

  it("keeps the header solid where the page opens without a loud band", () => {
    const site = { chrome: { header: { overHero: "transparent" as const } } };
    expect(resolveChrome(site, { sections: [hero("muted")] }).header).toMatchObject({
      transparent: false,
    });
    expect(resolveChrome(site, { sections: [hero("accent")] }).header).toMatchObject({
      transparent: true,
      over: "accent",
    });
    expect(resolveChrome(site).header.transparent).toBe(false);
  });
});

describe("resolveChrome", () => {
  it("reproduces the former header and footer without settings", () => {
    const c = resolveChrome({});
    expect(c.header).toMatchObject({
      layout: "logo-left",
      behavior: "static",
      width: "content",
      nav: "primary",
      actions: [{ kind: "search" }],
      hidden: false,
      transparent: false,
    });
    expect(c.footer).toMatchObject({
      layout: "simple",
      legal: "footer",
      credit: true,
      fallbackRss: true,
    });
    expect(c.menus).toEqual(["primary", "footer"]);
  });

  it("lets a page hide, thin or clear its chrome", () => {
    const c = resolveChrome(
      { chrome: { footer: { layout: "columns", columns: [{ heading: "Docs", menu: "docs" }] } } },
      { chrome: { header: "transparent", footer: "minimal" }, sections: [hero("inverse")] },
    );
    expect(c.header).toMatchObject({ transparent: true, over: "inverse" });
    expect(c.footer.layout).toBe("minimal");
    expect(c.footer.columns).toEqual([]);
    expect(c.footer.fallbackRss).toBe(false);
    expect(resolveChrome({}, { chrome: { header: "hidden", footer: "hidden" } })).toMatchObject({
      header: { hidden: true },
      footer: { hidden: true },
    });
  });

  it("lists every menu the chrome names once", () => {
    const c = resolveChrome({
      chrome: {
        header: { nav: "main", utility: "top" },
        footer: { layout: "cta-band", columns: [{ heading: "A", menu: "main" }], legal: "legal" },
      },
    });
    expect(c.menus).toEqual(["main", "top", "legal"]);
    expect(c.footer.cta).toBeUndefined();
  });
});

describe("checkChrome", () => {
  it("finds what the contract cannot see", () => {
    const issues = checkChrome(
      {
        header: {
          nav: "missing",
          actions: [{ kind: "search" }, { kind: "search" }, { kind: "button", label: "Go" }],
        },
        footer: { layout: "cta-band", copyright: "© {year} {owner}" },
      },
      chromeMenuKeys([{ key: "footer" }]),
    );
    expect(issues.map((i) => i.path)).toEqual([
      "/header/nav",
      "/header/actions/1",
      "/header/actions/2",
      "/footer",
      "/footer/copyright",
    ]);
    expect(checkChrome(undefined)).toEqual([]);
  });

  it("fills the copyright line", () => {
    expect(copyrightText("© {year} {site}", "Ledgerly", 2026)).toBe("© 2026 Ledgerly");
  });
});

describe("brand form", () => {
  it("turns asset values into image references and back", async () => {
    const { brand, issues } = await brandFromForm(
      { logo: "asset:asset_ABCDEF12", logoDark: "asset:asset_MISSING1", logoHeight: "s" },
      async (id) =>
        id === "asset_ABCDEF12"
          ? { src: "/media/ab/logo.svg", width: 80, height: 20, alt: "L" }
          : undefined,
    );
    expect(issues).toEqual([
      { path: "/logoDark", message: "an image asset of this site (asset:<id>)" },
    ]);
    expect(brand).toEqual({
      logo: {
        assetId: "asset_ABCDEF12",
        src: "/media/ab/logo.svg",
        alt: "L",
        width: 80,
        height: 20,
      },
      logoHeight: "s",
    });
    expect(brandToForm(brand)).toEqual({ logo: "asset:asset_ABCDEF12", logoHeight: "s" });
    expect((await brandFromForm({}, async () => undefined)).brand).toBeUndefined();
  });
});
