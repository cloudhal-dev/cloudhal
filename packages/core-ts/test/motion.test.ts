/** RFC-0024 24a: motion presets on surface components, their checks, repairs and tokens. */
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { toA2ui, toJsonRender } from "../src/surface-interop.ts";
import {
  catalogPrompt,
  checkSurface,
  createCatalog,
  repairComponent,
  repairMotion,
  usesMotion,
} from "../src/surfaces.ts";
import { MOTION_LEVELS, motionCss } from "../src/tokens.ts";

const catalog = createCatalog();
const surface = (components: SurfaceComponent[]): SurfaceSection => ({
  id: "sec_motion000001",
  kind: "surface",
  catalog: "blog@1",
  components: components as SurfaceSection["components"],
});
const issues = (components: SurfaceComponent[]) =>
  checkSurface(surface(components), catalog).issues.map((i) => `${i.path} ${i.message}`);

describe("motion on components (RFC-0024 §2)", () => {
  it("takes reveals, hovers, speed, delay, stagger and replay", () => {
    const ok = [
      {
        id: "root",
        component: "Grid",
        props: { columns: 3 },
        children: ["a", "b"],
        motion: { reveal: "rise", stagger: true },
      },
      {
        id: "a",
        component: "Card",
        children: [],
        motion: { hover: "lift", speed: "slow", delay: 2, replay: true },
      },
      {
        id: "b",
        component: "Button",
        props: { label: "Go", href: "/go" },
        motion: { hover: "magnetic" },
      },
    ] as SurfaceComponent[];
    expect(issues(ok)).toEqual([]);
    expect(usesMotion(surface(ok))).toBe(true);
    expect(usesMotion(surface([{ id: "root", component: "Stack" } as SurfaceComponent]))).toBe(
      false,
    );
  });

  it("refuses unknown presets, misplaced effects and fields that come in later phases", () => {
    const out = issues([
      {
        id: "root",
        component: "Heading",
        props: { text: "Hi", level: 1 },
        motion: { reveal: "explode", hover: "zoom-media", stagger: true, delay: 9, loop: "float" },
      } as SurfaceComponent,
    ]);
    expect(out).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\/components\/0\/motion\/reveal one of fade, rise/),
        "/components/0/motion/hover zoom-media fits Card, Image",
        "/components/0/motion/stagger only on Stack, Row, Grid, Columns, Band, Card",
        "/components/0/motion/delay steps of the stagger, 0 to 4",
        "/components/0/motion/loop not available yet (RFC-0024 phase 24c)",
      ]),
    );
  });

  it("snaps the names models write to the presets they mean, and reports it", () => {
    expect(
      repairMotion({ animation: "fadeInUp", hover: "grow", speed: "medium", delay: 300 }, "h"),
    ).toEqual({
      motion: { reveal: "rise", hover: "scale", speed: "normal", delay: 3 },
      notes: [
        'h: motion "animation" → "reveal"',
        'h: motion.reveal "fadeInUp" → "rise"',
        'h: motion.hover "grow" → "scale"',
        'h: motion.speed "medium" → "normal"',
        "h: motion.delay 300 → 3",
      ],
    });
    // one edit away snaps too; a close miss of nothing stays for the check to name
    expect(repairMotion({ reveal: "rize" }, "x").motion).toEqual({ reveal: "rise" });
    const fixed = repairComponent(
      {
        id: "h",
        component: "Heading",
        props: { text: "Hi", level: 1 },
        motion: { reveal: "slideUp" },
      },
      catalog,
    );
    expect(fixed.component.motion).toEqual({ reveal: "rise" });
  });

  it("teaches motion in the catalog prompt", () => {
    const prompt = catalogPrompt(catalog, "en");
    expect(prompt).toContain("`motion` (optional, next to `visible`)");
    expect(prompt).toContain("never on body text people are reading");
  });

  it("leaves motion out of A2UI and json-render exports, with a note", () => {
    const s = surface([
      {
        id: "root",
        component: "Heading",
        props: { text: "Hi", level: 1 },
        motion: { reveal: "rise" },
      },
    ] as SurfaceComponent[]);
    expect(toA2ui(s).notes).toContain(
      "motion presets have no A2UI equivalent (RFC-0024); left out",
    );
    expect(toJsonRender(s).notes).toContain(
      "motion presets have no json-render equivalent (RFC-0024); left out",
    );
    expect(JSON.stringify(toJsonRender(s).spec)).not.toContain("rise");
  });
});

describe("motion tokens (RFC-0024 §6)", () => {
  it("writes one set per level: nothing moves at none, fades only at subtle", () => {
    const css = motionCss();
    for (const level of MOTION_LEVELS) expect(css).toContain(`:root[data-ch-motion="${level}"]{`);
    expect(css).toContain(':root[data-ch-motion="none"]{--ch-dur-fast:0ms;--ch-dur-normal:0ms');
    expect(css).toMatch(
      /:root\[data-ch-motion="subtle"\]\{[^}]*--ch-dur-slow:200ms;[^}]*--ch-move-l:8px/,
    );
    expect(css).toMatch(/:root\[data-ch-motion="expressive"\]\{[^}]*--ch-move-l:88px/);
    expect(motionCss()).toBe(css);
  });
});
