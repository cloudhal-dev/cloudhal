/** RFC-0026: icons in surfaces, drawn from the curated set. */
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { renderSurface } from "../src/surfaces.ts";

const surface = (components: SurfaceComponent[]): SurfaceSection => ({
  id: "sec_icons00001",
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
});

describe("icons in surfaces (RFC-0026)", () => {
  const html = renderSurface(
    surface([
      { id: "root", component: "Stack", children: ["i", "a", "b", "g", "s", "l"] },
      { id: "i", component: "Icon", props: { name: "rocket", size: "l", tone: "brand" } },
      { id: "a", component: "Icon", props: { name: "warning", label: "Careful" } },
      {
        id: "b",
        component: "Button",
        props: { label: "Next", href: "/next", icon: "arrow-right", iconPosition: "end" },
      },
      { id: "g", component: "Badge", props: { label: "New", icon: "sparkle" } },
      { id: "s", component: "Stat", props: { value: "12", label: "Countries", icon: "globe" } },
      { id: "l", component: "List", props: { items: ["Fast", "Safe"], marker: "check" } },
    ]),
  );

  it("draws decorative icons, a named one when it stands alone, and icons after a label", () => {
    expect(html).toContain(
      '<span class="ch-icon-box" data-size="l" data-tone="brand"><svg class="ch-icon" data-icon="rocket"',
    );
    expect(html).toContain(
      'data-icon="warning" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" role="img" aria-label="Careful"',
    );
    expect(html).toMatch(
      /<a class="ch-button ch-button--primary" href="\/next">Next<svg class="ch-icon ch-button__icon" data-icon="arrow-right" data-ch-mirror [^>]*aria-hidden="true"/,
    );
    expect(html).toContain('<span class="ch-badge"><svg class="ch-icon" data-icon="sparkle"');
    expect(html).toContain(
      '<div class="ch-stat"><span class="ch-stat__icon"><svg class="ch-icon" data-icon="globe"',
    );
  });

  it("draws an icon bullet on every list item, and keeps bullet and none as they were", () => {
    expect(html).toContain(
      '<ul class="ch-list" data-marker="icon"><li><svg class="ch-icon ch-list__marker" data-icon="check"',
    );
    expect(html.match(/ch-list__marker/g)).toHaveLength(2);
    const plain = renderSurface(
      surface([{ id: "root", component: "List", props: { items: ["a"], marker: "none" } }]),
    );
    expect(plain).toContain('<ul class="ch-list" data-marker="none"><li>a</li></ul>');
  });
});
