/** RFC-0025: the chrome a page shows, the checks the contract cannot make, the brand form. */
import { describe, expect, it } from "vitest";
import {
  brandFromForm,
  brandToForm,
  checkChrome,
  chromeMenuKeys,
  copyrightText,
  resolveChrome,
} from "../src/chrome.ts";

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
      { chrome: { header: "transparent", footer: "minimal" } },
    );
    expect(c.header.transparent).toBe(true);
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
