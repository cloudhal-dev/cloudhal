/** RFC-0027: carousels drawn without JavaScript — a scroll-snap track, named slides, link markers. */
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
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
});
