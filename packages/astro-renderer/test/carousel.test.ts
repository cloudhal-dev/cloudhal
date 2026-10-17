/** RFC-0027: carousels drawn without JavaScript — a scroll-snap track, named slides, link markers. */

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { CAROUSEL_SCRIPT, CAROUSEL_SCRIPT_ALIASES } from "../src/carousel-client.ts";
import { renderSurface, surfaceTree } from "../src/surfaces.ts";

const section = (components: SurfaceComponent[]): SurfaceSection => ({
  id: "sec_carousel01",
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
});
const text = (id: string) => ({ id, component: "Text", props: { text: id } });

describe("carousels (RFC-0027 27a)", () => {
  const rail = section([
    {
      id: "root",
      component: "Carousel",
      props: { label: "Features", perView: 3, peek: "s", gap: "m" },
      children: ["a", "b", "c", "d"],
    },
    text("a"),
    text("b"),
    text("c"),
    text("d"),
  ]);
  const html = renderSurface(rail);

  it("draws a labelled region, a focusable track and named slides", () => {
    expect(html).toContain(
      '<section class="ch-carousel" id="ch-sec_carousel01-root" data-variant="rail" data-per-view="3" data-peek="s" data-gap="m" data-count="4" role="region" aria-roledescription="carousel" aria-label="Features"><div class="ch-carousel__track" id="ch-sec_carousel01-root-track" tabindex="0">',
    );
    expect(html).toContain(
      '<div class="ch-carousel__slide" id="ch-sec_carousel01-root-2" role="group" aria-roledescription="slide" aria-label="2 of 4">',
    );
    expect(html.match(/class="ch-carousel__slide"/g)).toHaveLength(4);
  });

  it("links markers to the slides and keeps the arrows for the module", () => {
    expect(html).toContain(
      '<nav class="ch-carousel__markers" data-style="numbers" aria-label="Slides">',
    );
    expect(html).toContain('<a href="#ch-sec_carousel01-root-3" aria-label="Slide 3">3</a>');
    expect(html).toContain(
      'data-ch-carousel="prev" data-ch-pending aria-controls="ch-sec_carousel01-root-track" aria-label="Previous slide"',
    );
  });

  it("speaks Turkish where the site does, and hides controls when asked", () => {
    const tr = renderSurface(
      section([
        {
          id: "root",
          component: "Carousel",
          props: { label: "Öne çıkanlar", controls: "none", peek: "s" },
          children: ["a", "b"],
        },
        text("a"),
        text("b"),
      ]),
      { media: { locale: "tr" } },
    );
    expect(tr).toContain('aria-roledescription="kaydırmalı alan"');
    expect(tr).toContain('aria-roledescription="slayt" aria-label="1 / 2"');
    expect(tr).not.toContain("ch-carousel__controls");
  });

  it("marks only a hero's first slide to load first", () => {
    const tree = surfaceTree(
      section([
        {
          id: "root",
          component: "Carousel",
          props: { label: "Spring", variant: "hero", aspect: "21:9" },
          children: ["one", "two"],
        },
        { id: "one", component: "Stack", children: ["t1"] },
        text("t1"),
        text("two"),
      ]),
    );
    const [one, two] = tree.root?.children ?? [];
    expect(one?.priority).toBe(true);
    expect(one?.children[0]?.priority).toBe(true);
    expect(two?.priority).toBeUndefined();
  });

  it("loads the carousel module with a carousel, pinned to its versioned name (27b)", () => {
    expect(html).toContain(`<script type="module" src="${CAROUSEL_SCRIPT.path}"></script>`);
    // Bump `carousel.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(CAROUSEL_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "7f92dc92f2d9",
    );
    expect(CAROUSEL_SCRIPT.path).toBe("/_cloudhal/carousel.2.js");
    expect(CAROUSEL_SCRIPT_ALIASES).toEqual(["/_cloudhal/carousel.1.js"]);
    expect(gzipSync(CAROUSEL_SCRIPT.code).length).toBeLessThan(2 * 1024);
    expect(CAROUSEL_SCRIPT.code).not.toMatch(
      /\beval\b|new Function|innerHTML|addEventListener\("wheel"/,
    );
    expect(CAROUSEL_SCRIPT.code).toContain('scrollIntoView({block:"nearest",inline:"start"})');
    expect(CAROUSEL_SCRIPT.code).toContain('setAttribute("aria-live","polite")');
  });

  it("draws a gallery's thumbnails from its slides' images, decorative inside named links (27c)", () => {
    const asset = {
      schemaVersion: 1,
      id: "asset_GALLERY001",
      siteId: "site_01HZX8K3Q9EF",
      kind: "image",
      mediaType: "image/png",
      bytes: 10,
      sha256: "ab".repeat(32),
      slug: "loaf",
      image: { width: 800, height: 600 },
      alt: { en: "A loaf" },
      storage: { kind: "blob" },
      status: "active",
    };
    const html = renderSurface(
      section([
        {
          id: "root",
          component: "Carousel",
          props: { label: "Bakery", variant: "gallery", aspect: "4:3", markers: "thumbs" },
          children: ["a", "b"],
        },
        { id: "a", component: "Image", props: { asset: "asset:asset_GALLERY001", alt: "A loaf" } },
        { id: "b", component: "Image", props: { asset: "asset:asset_GALLERY001", alt: "Another" } },
      ]),
      { media: { assets: new Map([["asset_GALLERY001", asset as never]]) as never } },
    );
    expect(html).toContain('data-variant="gallery"');
    expect(html).toContain(
      '<nav class="ch-carousel__markers" data-style="thumbs" aria-label="Slides">',
    );
    expect(html).toMatch(
      /<a href="#ch-sec_carousel01-root-2" aria-label="Slide 2"><img [^>]*alt=""/,
    );
  });
});
