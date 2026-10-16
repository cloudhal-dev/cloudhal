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
  surfaceLoops,
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
        "/components/0/motion/loop float fits Image, Badge, Stat, Card",
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

describe("scroll effects and scroll stories (RFC-0024 24b)", () => {
  it("takes a scroll effect with a depth, but not together with a reveal or on a form control", () => {
    expect(
      issues([
        {
          id: "root",
          component: "Image",
          props: { asset: "asset:ast_example01", alt: "Harbour" },
          motion: { scroll: "parallax", depth: -2 },
        } as SurfaceComponent,
      ]),
    ).toEqual([]);
    const out = issues([
      { id: "root", component: "Stack", children: ["a", "b"] },
      {
        id: "a",
        component: "Heading",
        props: { text: "Hi", level: 1 },
        motion: { reveal: "rise", scroll: "fade-through", depth: 2 },
      },
      {
        id: "b",
        component: "Slider",
        props: { label: "Seats", min: 1, max: 9, value: { path: "/s" } },
        motion: { scroll: "pan", depth: 0 },
      },
    ] as SurfaceComponent[]);
    expect(out).toEqual(
      expect.arrayContaining([
        "/components/1/motion/scroll use reveal or scroll, not both",
        "/components/1/motion/depth only with scroll parallax or pan",
        "/components/2/motion/scroll form controls do not move with the scroll",
        "/components/2/motion/depth -3 to 3, not 0 (negative moves the other way)",
      ]),
    );
    expect(repairMotion({ scroll: "scroll-fade", depth: 7 }, "i").motion).toEqual({
      scroll: "fade-through",
      depth: 3,
    });
  });

  it("checks a scroll story: a bound step, one child in view, then 2–12 Steps", () => {
    const story = [
      {
        id: "root",
        component: "Scrolly",
        props: { step: { path: "/step" } },
        children: ["chart", "s1", "s2"],
      },
      { id: "chart", component: "Stat", props: { value: { path: "/step" }, label: "Step" } },
      { id: "s1", component: "Step", children: ["t1"] },
      { id: "t1", component: "Text", props: { text: "First" } },
      { id: "s2", component: "Step", children: ["t2"] },
      { id: "t2", component: "Text", props: { text: "Second" } },
    ] as SurfaceComponent[];
    expect(issues(story)).toEqual([]);
    expect(usesMotion(surface(story))).toBe(true);
    const bad = issues([
      { id: "root", component: "Stack", children: ["sc", "lost"] },
      { id: "sc", component: "Scrolly", props: { step: "/step" }, children: ["s1", "s2"] },
      { id: "s1", component: "Step" },
      { id: "s2", component: "Step" },
      { id: "lost", component: "Step" },
    ] as SurfaceComponent[]);
    expect(bad).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\/components\/1\/props\/step bind it to the surface's data/),
        "/components/1/children one child to keep in view, then 2 to 12 Steps",
        "/components/4 a Step belongs inside a Scrolly",
      ]),
    );
    expect(catalogPrompt(catalog, "en")).toContain("Scroll story: a Scrolly holds one child");
  });
});

describe("kinetic type, marquees, counters and loops (RFC-0024 24c)", () => {
  it("splits only short written headings and texts, and loops only decoration", () => {
    expect(
      issues([
        { id: "root", component: "Stack", children: ["h", "c", "b"] },
        {
          id: "h",
          component: "Heading",
          props: { text: "Ship faster", level: 1 },
          motion: { reveal: "split-chars" },
        },
        { id: "c", component: "Card", children: [], motion: { loop: "gradient-shift" } },
        { id: "b", component: "Badge", props: { label: "New" }, motion: { loop: "pulse" } },
      ] as SurfaceComponent[]),
    ).toEqual([]);
    const out = issues([
      { id: "root", component: "Stack", children: ["h", "i", "t"] },
      {
        id: "h",
        component: "Heading",
        props: {
          text: "A headline far too long to animate letter by letter, sixty characters and more",
          level: 2,
        },
        motion: { reveal: "split-chars" },
      },
      {
        id: "i",
        component: "Image",
        props: { asset: "asset:ast_example01", alt: "x" },
        motion: { reveal: "split-words", loop: "float" },
      },
      { id: "t", component: "Text", props: { text: "Read me" }, motion: { loop: "spin-slow" } },
    ] as SurfaceComponent[]);
    expect(out).toEqual(
      expect.arrayContaining([
        "/components/1/motion/reveal split text is at most 60 characters",
        "/components/2/motion/reveal split-words fits Heading and Text",
        "/components/2/motion/loop a loop goes alone: no reveal or scroll with it",
        "/components/3/motion/loop spin-slow fits Image, Badge",
      ]),
    );
    expect(repairMotion({ loop: "bob", reveal: "typewriter" }, "x").motion).toEqual({
      loop: "float",
      reveal: "split-chars",
    });
  });

  it("checks marquees and rotating words, and knows which surfaces loop", () => {
    const looping = [
      { id: "root", component: "Stack", children: ["h", "m", "n"] },
      {
        id: "h",
        component: "Heading",
        props: {
          text: "Invoices that {words}",
          level: 1,
          effect: "rotate-words",
          words: ["chase", "close"],
        },
      },
      { id: "m", component: "Marquee", props: { speed: "slow" }, children: ["a", "b", "c"] },
      { id: "a", component: "Badge", props: { label: "A" } },
      { id: "b", component: "Badge", props: { label: "B" } },
      { id: "c", component: "Badge", props: { label: "C" } },
      { id: "n", component: "Counter", props: { value: 38000, suffix: "+", label: "Freelancers" } },
    ] as SurfaceComponent[];
    expect(issues(looping)).toEqual([]);
    expect(surfaceLoops(surface(looping))).toBe(true);
    expect(usesMotion(surface([looping[0], looping[6]] as SurfaceComponent[]))).toBe(true);
    expect(
      issues([
        { id: "root", component: "Stack", children: ["h", "m"] },
        { id: "h", component: "Heading", props: { text: "Hi {words}", effect: "rotate-words" } },
        { id: "m", component: "Marquee", children: [] },
      ] as SurfaceComponent[]),
    ).toEqual(
      expect.arrayContaining([
        "/components/1/props/words 2 to 6 words that take turns where {words} stands",
        "/components/2/children at least 3 children to scroll",
      ]),
    );
    expect(catalogPrompt(catalog, "en")).toContain("Kinetic headings: Heading");
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
