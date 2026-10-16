# RFC-0024: Motion, scroll and ambient effects
- Status: Accepted (2026-10-16; open questions decided below); 24a–24d shipped
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-16
- Related:
  - RFC-0018 §7 and phase 18f (motion presets, never shipped; this RFC replaces them), RFC-0020 (surfaces, the interaction runtime, "motion stays CSS"), RFC-0021 (`render_page`, the design judge), RFC-0022 (functions, data bindings), RFC-0023 (tokens, surfaces, DTCG export);
  - `docs/design/agent-built-sites-gap-analysis.md` G6 and G7;
  - `docs/design/site-chrome-and-overlays.md` (the companion R&D report: header, footer, overlays).
- References (checked 2026-10-16; see "Sources"):
  - CSS scroll-driven animations, scroll-triggered animations (`timeline-trigger`), View Transitions Level 2;
  - WCAG 2.2: 2.2.2 Pause, Stop, Hide (A), 2.3.1 Three Flashes (A), 2.3.3 Animation from Interactions (AAA);
  - Framer, Webflow (GSAP), Wix Studio effect taxonomies; tsParticles presets.

## Summary
Cloudhal pages cannot move: there is no transition, animation or reduced-motion rule anywhere in the theme or the renderer. Builders such as Framer and Webflow get much of their "modern" feel from motion: scroll reveals, parallax, scroll storytelling, marquees, kinetic type, particle and gradient backgrounds, and page transitions.

This RFC gives agents **a motion vocabulary of presets they choose as data**:
- a `motion` field on every surface component;
- four new primitives (`Marquee`, `Counter`, `Scrolly`, `ScrollProgress`);
- ambient backgrounds for bands, including particles;
- site settings for the motion level and page transitions.

The renderer turns them into CSS first, with two small first-party scripts loaded only when a page uses them. Accessibility is built in:
- the effective motion is the lowest of the site's level, the reader's `prefers-reduced-motion` and a pause control the site always shows when something loops;
- nothing hides content without JavaScript;
- nothing animates layout.

The MCP server and CLI support all of it: the catalog teaches it, the checks guard it, and `render_page` shows it.

## Motivation
- **Sameness, again.** After RFC-0023, colors, type and surfaces vary. A page still sits still. In the 23e eval the gap to well-made template sites was mostly motion, imagery and section variety.
- **Agents cannot write motion safely today.** The only way to "add an animation" would be CSS or script, which Cloudhal never accepts from agents (data, never code; CSP `script-src 'self'`).
- **Imaginative sites need more than fades.** Scroll storytelling (a chart that changes as you read), kinetic headlines, particle or aurora heroes and shared-element page transitions open a level of design that today needs a front-end developer. Our goal is that an agent can build them in one conversation, and that a person never has to hand-tune them.
- **Accessibility and performance are where motion usually fails.** Most hand-made motion ignores reduced motion, loops without a pause control (a WCAG A failure), animates layout (CLS) or runs scroll listeners on the main thread (INP). Presets let us get these right once, for every site.
- **The platform is ready, unevenly.**
  - Scroll-driven animations are in Chrome and Safari 26, but not in stable Firefox (an Interop 2026 area).
  - Cross-document View Transitions are in Chrome and Safari, and partly in Firefox.
  - Scroll-triggered animations are in Chrome only.

  A preset layer can use each where it exists and fall back cleanly, which hand-written CSS rarely does.

## Proposal

### 1. Levels: what a site allows, what a reader gets
New theme settings (RFC-0017 schema subset, all enums):

| Setting | Values | Default |
|---|---|---|
| `motion` | `none` · `subtle` · `standard` · `expressive` | `standard` for new sites (see Compatibility) |
| `pageTransition` | `none` · `crossfade` · `slide` · `morph` | `none` |

- **A page can override the site's level** with `Page.motion` (an optional enum: a landing page at `expressive` on a `subtle` site, or a legal page at `none`).
- **The effective level** is the lowest of three:
  - the page's `motion`, or else the site's;
  - the reader's `prefers-reduced-motion` (`reduce` caps the level at `subtle`);
  - the reader's pause control (`paused` caps the level at `none` for loops and ambient effects).

  The renderer writes `data-ch-motion="<level>"` on `<html>`. CSS rules for each preset are scoped to the levels that allow them, so the cap is pure CSS. The runtime reads the same attribute.
- **What each level allows:**

  | Level | Allowed |
  |---|---|
  | `none` | nothing moves: final states only |
  | `subtle` | opacity fades of 200 ms or less, hover color and shadow changes, `crossfade` transitions; no movement over 8 px, no parallax, no loops, no ambient motion (posters only) |
  | `standard` | every reveal and hover preset, scroll effects with small ranges, `Marquee`, `Counter`, slow ambient effects |
  | `expressive` | larger ranges, split-text reveals, `Scrolly` pinning, particle backgrounds, `slide` and `morph` transitions |

- **The pause control.**
  - The theme renders a "Pause motion" `<button aria-pressed>` in the site footer, and in the hero band too when that band has an ambient effect, whenever a page has anything that loops for more than 5 seconds (WCAG 2.2.2).
  - The choice is remembered in `localStorage` (wrapped in try/catch) and applies to every page.
  - The renderer decides whether the control is needed, so an agent cannot leave it out.

### 2. `motion` on every component
`SurfaceComponent` gains an optional `motion` object next to `visible`. It applies to primitives and blocks alike. Every field is an enum or a clamped number; nothing is a string the renderer passes through.

```ts
type Motion = {
  reveal?:                     // once, when the element enters the viewport
    | "fade" | "rise" | "sink" | "slide-start" | "slide-end" | "scale-in" | "blur-in"
    | "wipe-up" | "wipe-start" | "mask-rise"
    | "split-words" | "split-chars" | "split-lines";   // Heading and Text only
  scroll?:                     // continuous, tied to the element's position in the viewport
    | "parallax" | "fade-through" | "scale-through" | "rotate-through" | "pan";
  depth?: -3 | -2 | -1 | 1 | 2 | 3;                    // parallax and pan strength and direction
  hover?: "lift" | "scale" | "glow" | "underline" | "zoom-media" | "tilt" | "magnetic" | "spotlight";
  loop?: "float" | "pulse" | "gradient-shift" | "spin-slow";   // decorative elements only
  speed?: "fast" | "normal" | "slow";                  // duration token
  delay?: 0 | 1 | 2 | 3 | 4;                           // steps of the stagger token
  stagger?: boolean;                                   // children reveal one after another
  replay?: boolean;                                    // reveal again on re-entry (default false)
};
```

- **The catalog checks** the fields against the component:
  - `split-*` only on `Heading` and on `Text` under 300 characters;
  - `zoom-media` only on `Card` and `Image`;
  - `loop` only on `Image`, `Badge`, `Stat` and decorative `Card`s, never on text the reader must read;
  - `stagger` only on layout primitives.
- **Budgets per page**, checked by the store as warnings (`patch_draft` returns them), not refusals:
  - at most 1 ambient background in view at a time;
  - at most 3 `scroll` effects in view;
  - at most 2 `split-*` headings;
  - at most 1 `Scrolly`;
  - at most 2 loops visible at once.

  `render_page` reports the same budgets as a check.
- **Snapping.** Unknown preset names snap to the nearest known one, as unknown component names do today (RFC-0020 repairs), so a model that writes `"fadeInUp"` gets `rise` and a note.

### 3. New primitives
| Primitive | Props | Rendering |
|---|---|---|
| `Marquee` | `speed` (slow/normal/fast), `direction` (start/end), `pauseOnHover` (default true), `gap`; at least 3 children | Children plus an `aria-hidden` copy in a CSS transform loop. Paused by the pause control. At `subtle` or `none` it is a static row that wraps. |
| `Counter` | `value` (number or binding), `from`, `format` (as `formatNumber`/`formatPercent`/currency), `prefix`, `suffix`, `duration` (fast/normal/slow) | The final value is in the HTML. With motion allowed, the runtime counts up from `from` once, on entry, through `@property` or a short rAF. Screen readers get the final text only. |
| `Scrolly` | `side` (start/end), `ratio` (1-1, 2-1, 1-2); children: one `media` child (any component, sticky) and 2–12 `Step` children | Scroll storytelling. Each `Step` has an optional `set: {path, value}` that writes into the surface data when the step reaches the middle of the viewport, so a `Chart`, `Image` or `Stat` bound to that path changes as the reader scrolls. Below `expressive`, or without JavaScript, the steps stack with the media repeated in its final state, so nothing is lost. |
| `ScrollProgress` | `placement` (page-top or section), `tone` | A progress bar driven by `animation-timeline: scroll()`, with a tiny rAF fallback that sets `--ch-progress`. |

`Heading` gains `effect: "highlight" | "gradient-text" | "rotate-words"`; `rotate-words` takes `words` (2–6 short strings) and is a loop, so it needs the pause control. `Image` gains `parallax` through `motion.scroll` (no new prop).

### 4. Ambient backgrounds
`Band` (and `Card` with `surface` set) gains `ambient`:

```ts
type Ambient = {
  kind:
    | "aurora" | "gradient-shift" | "grain" | "beams"                        // CSS
    | "particles";                                                          // canvas
  preset?: "dots" | "links" | "stars" | "snow" | "bubbles" | "fireflies";  // particles only
  density?: "low" | "medium" | "high";
  colors?: "brand" | "accent" | "brand-accent" | "neutral";                // role tokens only
  interactive?: boolean;                                                   // particles react to the pointer
};
```

- **CSS kinds** are layered gradients from the color roles, animated through `@property` angles and positions. They are slow (at least 12 s a cycle), never flash, and respect the pause control.
- **`particles`** are drawn by a lazily loaded `/_cloudhal/ambient.1.js`:
  - Canvas2D in a worker (`OffscreenCanvas`), main thread when workers are unavailable;
  - colors read from the role variables;
  - device-pixel ratio capped at 2;
  - particle count scaled by area and capped (at most 120 with links, 400 without);
  - 30 fps;
  - paused off screen (IntersectionObserver) and in hidden tabs.
- **The canvas** is `aria-hidden` and sits under the content.
- **Fallbacks.** Ambient effects are not loaded at all below `standard`, under Save-Data, or with `deviceMemory` of 2 GB or less. The band then shows a static poster: the same gradient, unmoving.
- **Text on ambient bands** uses the band's surface roles, and the canvas never draws over 8% contrast against the surface (RFC-0023 §4), so contrast holds.
- **WebGL tier, phase 24f:** `kind: "mesh"` and `"shader"`, drawn by `ambient-gl.1.js` under the same guards (decision 1).

### 5. Page transitions
`pageTransition` writes `@view-transition { navigation: auto; }` with:
- `crossfade`: the default animation, shortened;
- `slide`: view transition types for back and forward where supported, a crossfade elsewhere;
- `morph`: components with the same id on two pages, such as a card's image and the article's cover, get `view-transition-name: ch-<section>-<id>`, so they move between pages. The renderer writes the names; agents only keep ids stable.

Under `reduce` every transition becomes a crossfade, or none at `none`. Browsers without cross-document transitions simply navigate. Transitions never delay navigation beyond the browser's own render blocking.

### 6. Motion tokens
`@cloudhal/core-ts/tokens` gains `motionCss(level)`:
- `--ch-dur-fast|normal|slow` (150/300/600 ms, scaled down at `subtle`);
- `--ch-ease-standard|emphasized|exit` as `linear()` or `cubic-bezier()`;
- `--ch-move-s|m|l` (8/24/64 px, capped at `subtle`, scaled by the density from RFC-0023 §3);
- `--ch-stagger` (60 ms).

The DTCG export (RFC-0023 §5) adds `duration` and `cubicBezier` tokens.

### 7. How it renders
- **CSS first.** Every preset is a class or `data-ch-*` attribute with rules in the theme kit's motion layer (`@layer ch-motion`), using `transform`, `opacity`, `filter: blur()` (reveals only) and `clip-path` only, never layout properties.
- **Content is never hidden without JavaScript.**
  - Reveals start from the final state.
  - Where `animation-timeline: view()` is supported, the reveal is a scroll-driven animation that needs no script.
  - Elsewhere, `/_cloudhal/motion.1.js`, after load, adds the "before" state only to elements that are **below the fold**, so nothing visible blinks, then reveals them with IntersectionObserver.
  - `timeline-trigger` is used where supported.
- **Two lazy modules, separate from `surface.N.js`:**

  | Module | What it does | Budget (gzip) |
  |---|---|---|
  | `motion.1.js` | reveals, stagger, counters, `Scrolly` steps, pointer effects (`tilt`, `magnetic`, `spotlight` write `--ch-mx`/`--ch-my` through the CSSOM), the scroll-progress fallback, the pause control | ≤ 5 KB |
  | `ambient.1.js` | particles | ≤ 8 KB |

  The page loads them only when it uses them; the interaction runtime's budget is untouched. Both follow the existing pattern: versioned paths, hash-pinned in tests, old names served as aliases.
- **Split text** is split by the renderer at build time. Each word or character is a `<span aria-hidden="true">`, and the heading keeps its full text as the accessible name. The runtime never touches text nodes.
- **No layout shift.** Reveals keep the element's box; `Counter` reserves the width of its final value (`tabular-nums`); `Scrolly` pins with `position: sticky`. `render_page` measures CLS while it scrolls (§8).
- **No scroll hijacking.** There is no smooth-scroll library and no wheel interception. `scrollTo` (the existing action) becomes instant under `reduce`, fixing the gap the runtime has today.
- **CSP.** No change: scripts are first-party files, styles are classes plus CSSOM custom properties, and the worker is same-origin (`script-src 'self'` covers it). Nothing evaluates code; no CDN.

### 8. Agents, MCP and CLI
Motion must be fully usable by an agent working only through MCP or the CLI.
- **`get_catalog`.** `catalogPrompt` gains a short motion section: the `motion` fields, which components take which presets, the budgets, and two examples (a hero with `rise` and `stagger`; a `Scrolly` whose steps drive a chart).
- **`get_design`.** It reports the motion level, page transition and budgets, and says how to change them. DESIGN guidance gains a motion point: "motion should guide the eye, not decorate: one entrance per section, at most one ambient band, never animate text people are reading".
- **`set_theme_settings`** takes `motion` and `pageTransition` (approval as before).
- **`patch_draft`.** It checks `motion`, snaps unknown names and returns budget warnings with JSON Pointers.
- **`render_page`:**
  - New `motion` option: `static` (default: final states, so screenshots never catch an element mid-animation), `reduce` or `full`.
  - New checks:
    - `reduced-motion`: render with `prefers-reduced-motion: reduce` and confirm no running animation moves an element more than 8 px (`document.getAnimations()`);
    - `motion-cls`: layout shift while scrolling the page;
    - `pause-control`: loops or ambient effects present without the control;
    - `motion-budget`: §2 budgets;
    - `flash`: no element changes luminance more than 3 times a second.
  - New `frames: n` (at most 6): screenshots at evenly spaced scroll positions with motion `full`, so an agent can see a `Scrolly` or a reveal sequence.
- **`get_design_tokens`** includes the motion tokens.
- **The site-design skill** gains motion recipes per kind of site: editorial `subtle`; SaaS `standard` with a gradient or particle hero and a `Scrolly` "how it works"; portfolio `expressive` with split headings and `morph`; local business `subtle`.
- **CLI:**
  - `cloudhal render <path> [--width 1440,390] [--scheme dark] [--motion static|reduce|full] [--frames n] [--out dir]` saves screenshots and prints the checks (the CLI can render today only through MCP);
  - `cloudhal motion audit [--path <p>]` prints, per page, the motion in use, the budgets and the checks.
- **Interop.** A2UI and json-render have no motion. Export drops `motion` with a note, and import never adds it.
- **Studio:**
  - the Appearance form shows `motion` and `pageTransition`;
  - the surface outline shows a small badge per component with motion (its preset name);
  - the preview has a "reduced motion" toggle.
- **The design judge.** The rubric gains `motion`: "Does motion guide attention (entrances, scroll story) without distracting, and does the page work with motion reduced?" Screenshots cannot show motion, so the judge also receives the `frames` and the motion summary.

### Invariants
1. Agents choose presets and enums. CSS, keyframes, easing curves, scripts and selectors never come from them.
2. Content is complete and visible without JavaScript and at `motion: none`. Motion only adds.
3. The effective level never exceeds the reader's `prefers-reduced-motion` or pause choice.
4. Anything that moves for more than 5 seconds can be paused from a control the renderer always provides.
5. No preset animates layout properties or causes layout shift. No preset flashes more than 3 times a second.
6. Motion scripts load only on pages that use them, stay within their budgets and use no eval or third-party code.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| GSAP (free since 2025) with ScrollTrigger and SplitText | Mature, huge vocabulary | Third-party runtime (about 70 KB and more), imperative, encourages scroll hijacking; agents would need to write timelines | Breaks "data, never code" and the budget; presets give the 90% case |
| Motion (motion.dev) | Small, WAAPI-based | Still a dependency; its features we need are a few hundred lines | Our two modules stay smaller and match our presets exactly |
| CSS only, no script | Zero JS | No counters, particles, `Scrolly` data steps or pointer effects; no Firefox fallback for scroll effects | Keeps CSS first, adds a small script only where CSS cannot |
| Let agents write keyframes or CSS | Unlimited | CSS injection, no accessibility or performance guarantees, unreviewable | Breaks every invariant |
| Lottie or Rive animations | Designer tools, rich | lottie-web uses `eval`; Rive and dotLottie need WASM (`'wasm-unsafe-eval'`) and are 200 KB or more | Out of v1; could return as a sandboxed asset type |
| Smooth-scroll (Lenis-style) | "Premium" feel | Breaks keyboard, scrollbar and nested scrolling expectations; a known accessibility complaint | Never |
| `motion` as a catalog prop inside `props` | No contract change | Every catalog entry would repeat it; blocks could not take it; harder to strip on export | A sibling of `visible` is uniform and easy to check |

## Compatibility & migration
- **Contract.**
  - `common.schema.json#/$defs/SurfaceComponent` gains `motion`, optional, an object (`additionalProperties: true`, checked by the store, like `visible`). That is a new optional field, `schemaVersion` unchanged; `pnpm gen` regenerates TS and Rust.
  - `Band` and `Card`'s `ambient`, the new primitives and `Heading.effect` are catalog props (RFC-0020: props are checked against the catalog), so they need no contract change.
- **Themes.** The blog theme gains the motion layer and the settings, synced to the examples. A theme without the motion settings renders `data-ch-motion="none"`, so existing sites do not move until a person or agent turns motion on.
- **Defaults.** New sites from `cloudhal init` start at `standard`; readers who ask for reduced motion still get `subtle`. Existing sites keep `none` (no stored value) until they choose.
- **`Page.motion`.** An optional enum on `page.schema.json`, so pages without it follow the site.
- **Rollback.** Remove the settings and the motion layer. Stored `motion` fields are ignored by a renderer that does not know them (the store keeps them), and pages render in their final state.

## Security & policy impact
- **No new scopes.** Motion is part of `patch_draft` (`content:write`) and theme settings (`site:write` with approval).
- **No new script sources, no CSP change.** The modules are first-party and versioned. Particles run in a same-origin worker.
- **Nothing from an agent reaches CSS or JS as free text.** Every value is an enum or a clamped number mapped by the renderer.
- **Abuse limits.** Budgets per page, the flash check and the always-present pause control keep a malicious or careless agent from shipping a page that harms readers (vestibular triggers, seizures).

## Rollout
| Phase | Scope |
|---|---|
| 24a | Levels and pause control; motion tokens; `motion.reveal`, `stagger`, `speed`, `delay`, `hover` presets (CSS first, `motion.1.js` reveals); the `SurfaceComponent.motion` contract field; catalog prompt and checks; `render_page` `motion` option with the `reduced-motion` and `motion-cls` checks; `scrollTo` respects reduced motion |
| 24b | Scroll effects (`parallax`, `*-through`, `pan`) with scroll-driven CSS and a fallback; `ScrollProgress`; `Scrolly` with data steps; `render_page` `frames` |
| 24c | Kinetic type (`split-*`, `Heading.effect`), `Marquee`, `Counter`, loops; the `pause-control`, `flash` and `motion-budget` checks |
| 24d | Ambient backgrounds: CSS kinds, then `particles` (`ambient.1.js`) with guards and posters |
| 24e | Page transitions (`crossfade`, `slide`, `morph`); DTCG motion tokens; CLI `render` and `motion audit`; Studio controls; the judge's `motion` criterion and skill recipes; an eval recorded here |
| 24f | WebGL ambient tier (`kind: "mesh"` and `"shader"` presets) as `ambient-gl.1.js`, under the same guards as particles |

## Decisions (formerly open questions)
These were decided on 2026-10-16. The test for each was which option serves developers (a small, predictable core), agent users (more to choose from, safely) and readers (accessible, fast) best.

1. **WebGL tier: yes, as phase 24f, not in the first phases.**
   - **What ships.** `ambient.kind` gains `mesh` (an animated mesh gradient) and `shader` (noise and flow presets), drawn by a third lazy module, `ambient-gl.1.js`.
   - **When it runs.** Only at `expressive`, never on low-memory devices or under Save-Data. It shows the CSS poster until the GPU context is ready and falls back to it on context loss.
   - **Why.** It is what makes award-level heroes possible without code. Keeping it last and guarded protects mid-range phones.
2. **Pause control placement: the footer always, plus the band that loops.**
   - The renderer places the control in the footer, and inside any band in the first viewport that has an ambient effect or a loop, so it is reachable early.
   - When RFC-0025's header has a `motion-toggle` action, the header carries it too.
3. **Per-page level: yes.** `Page.motion` overrides the site's level in both directions (§1). Landing pages can be expressive on a calm site, and documents can be still.
4. **Default for new sites: `standard`.** New sites should feel alive from the first build. Reduced-motion readers still get `subtle`, and existing sites stay at `none` until someone chooses.
5. **Cursor effects: component-level only.**
   - `spotlight`, `magnetic` and `tilt` stay on single components, for fine pointers only.
   - A site-wide cursor follower is not offered: it replaces a system affordance, hurts usability and adds vestibular risk for little gain.
6. **Lottie: a follow-up "animation asset", not a runtime.** A later media RFC converts a designer's Lottie or Rive file to a looping video and poster at upload (RFC-0004 media pipeline). Designers' work can then be used under the same CSP, with no `eval` or WASM on site pages.

## Status
- **24a shipped.**
  - **Contract.** `SurfaceComponent.motion` (an object checked by the store, like `visible`) and `Page.motion` (`MotionLevel`) are optional fields; `pnpm gen` updated TypeScript and Rust, and fixtures were added.
  - **Presets.** `@cloudhal/core-ts/surfaces` checks `motion`:
    - **Reveals:** 10 kinds (`fade` … `mask-rise`).
    - **Hovers:** 8 kinds; `underline`, `zoom-media`, `tilt`, `magnetic` and `spotlight` fit only some components.
    - **`speed`, `delay` (0–4), `stagger` and `replay`.** `stagger` is accepted on layout components only.
    - **Fields from later phases** (`scroll`, `depth`, `loop`) are refused with the phase that brings them.
  - **Repairs.** `repairMotion` snaps the names models write (`fadeInUp` → `rise`, `animation` → `reveal`, a delay in ms → steps).
  - **Agents.**
    - The catalog prompt teaches the presets and their rules.
    - A2UI and json-render exports leave motion out, with a note.
    - DESIGN guidance gains point 8 (motion guides attention).
    - `get_design` reports the level.
    - The site-design skill has motion recipes per kind of site.
  - **Tokens.** `motionCss()` writes durations, distances, the stagger step and easings for each level, scoped to `:root[data-ch-motion]`, so a page's own level needs no other CSS. The blog theme gains `motion` (default `none`). `cloudhal init` sets new sites to `standard` (decision 4). `Page.motion` overrides the level in `Base.astro`.
  - **Rendering.**
    - The renderer writes presets as `data-ch-reveal`, `data-ch-speed`, `data-ch-d`, `data-ch-hover` and `data-ch-replay` on the component's outer element, or on a wrapper around a theme's own component.
    - A staggered parent hands its reveal to its children, one step apart; this is done on the server, so CSS alone staggers them.
    - Motion that does not check is left out, and the component still draws.
  - **Entrances.**
    - Components on the first screen play their entrance with `@starting-style`, with no script.
    - Components below get their "before" state from `/_cloudhal/motion.1.js` (2.3 KB, hash-pinned, gzip budget 5 KB) only while off screen, and reveal on entry.
    - Wipes and masks start fully clipped, which an observer never sees intersect, so their parent is watched.
    - A component the reader scrolled past before the module ran is revealed at once.
    - Reveals use `opacity`, `translate`, `scale`, `filter` and `clip-path`; hovers use `transform` and `box-shadow`, so one element can have both.
  - **Reduced motion.** Reveals do not play at all, which is stricter than §1's "fades of 200 ms or less", and hovers keep color and shadow only. `scrollTo` jumps instead of smooth-scrolling; the interaction runtime is now `surface.8.js`, with `surface.7.js` as an alias.
  - **`render_page`.**
    - New option `motion`: `static` (default), `reduce` or `full`.
    - Two new checks: `reduced-motion` (content hidden, or animations that move, for a reader who asked for less) and `motion-cls` (layout shift above 0.1 while the page loads and is scrolled through).
    - Checks wait for entrances to finish, and content still waiting for its reveal counts as visible.
  - **Checked** in Chrome on a demo page with every preset:
    - every reveal played on scroll, even when scrolled through fast;
    - `lift` and the pointer-driven `tilt` worked;
    - `render_page` passed every check with motion `static` and `full`.
  - **Left for later.** The pause control is in the module and the theme CSS. It is rendered once loops exist (24c). Studio's motion badges come in 24e.
- **24b shipped.**
  - **Scroll effects.** `motion.scroll` takes `parallax`, `fade-through`, `scale-through`, `rotate-through` or `pan`; `parallax` and `pan` take a `depth` from -3 to 3 (not 0).
    - The catalog refuses scroll together with a reveal (they would fight over the same properties) and on form controls, and repairs common names (`scroll-fade` → `fade-through`, a depth of 7 → 3).
    - With scroll-driven animations (Chrome, Safari) the theme plays them over `view()` with no script. Elsewhere, the motion module writes the progress as `--ch-p` once a frame from passive scroll events, which fallback rules read.
    - Only `fade-through` plays at `subtle`; nothing moves under reduced motion.
  - **`Scrolly` and `Step`.** These replace §3's `Step.set`: rather than each step writing its own value, the story writes the number of the step being read to one binding (`step: {path}`).
    - The first child changes with it through `visible` conditions or `choose`, so every effect is expressed with existing data bindings.
    - The catalog checks the shape: a bound step, one child in view, then 2–12 `Step`s, and a `Step` only inside a `Scrolly`.
    - A scroll story makes its surface live. The motion module marks the step crossing the middle of the screen and sends its number in a `ch:set` event, which the interaction runtime (now `surface.9.js`, with 8 as an alias) writes to the data. This works at every motion level, since it is content, not movement.
    - **Layout.** On wide screens the first child is sticky beside the steps (`side`, `ratio`); on phones it is sticky above them, at most 45% of the screen. The step being read gets a brand rule at its edge rather than dimming the others, so contrast holds.
    - Without JavaScript the steps read in order next to the first child in its starting state.
  - **`ScrollProgress`.** It shows the page or the section; uses `scroll()` or a named view timeline (`--ch-section`), with the module's fallback elsewhere; and is hidden at `none`.
  - **The motion module** is now `motion.2.js` (1.6 KB gzip), with 1 as an alias.
  - **`render_page`.**
    - `frames` (1–6) takes screenshots at evenly spaced scroll positions, each after the page settles, with motion `full` unless set, so an agent can see a scroll story.
    - The new `motion-budget` check flags more than 6 scroll effects or more than one scroll story on a page. §2's per-page budgets are this check rather than `patch_draft` warnings, since the store has no warning channel.
  - **Interop.** A2UI exports a scroll story as a column (the first part, then the steps) and leaves the progress bar out.
  - **Guidance.** The catalog prompt, DESIGN guidance point 8, `get_design` and the skill's recipes say when to use a scroll story and how to check it.
  - **Checked** in Chrome on a demo scroll story:
    - each step changed the bound stat (0 → 120 → 740) and the shown badge;
    - the first child stayed pinned;
    - the progress bar and parallax followed the scroll;
    - `render_page` frames showed each step at 1440 and 390 px.

    Its only finding was the demo's own heading order.
- **24c shipped.**
  - **Kinetic type.** `reveal` gains `split-words`, `split-chars` and `split-lines`, on a written `Heading` or `Text` only (at most 60 characters for characters, 300 for words and lines).
    - The renderer splits the text at build time into `aria-hidden` pieces, each with its place as `--ch-i`; screen readers read the whole text once from a visually hidden copy. Lines are numbered by the motion module once the line breaks are known.
    - The element stays put while its pieces rise and fade in turn: on the first screen through `@starting-style`, below it on entry.
  - **Heading effects.** `Heading.effect` adds:
    - `highlight`: the words *between asterisks*, else the last word, under an accent band that sweeps in;
    - `gradient-text`: from the brand to the link color, both checked on the page by the token expansion. This differs from §3, which named no colors; it keeps large headings at 3:1 or more.
    - `rotate-words` with `words` (2–6): the words take turns where `{words}` stands. The widest word holds the width, so nothing shifts; screen readers get the list once.
  - **`Marquee`.** At least 3 children; `speed`, `direction`, `pauseOnHover`, `gap`. It is a still, wrapping row until the motion module copies its children once (hidden from screen readers, `inert`, ids removed) and sets it moving, at `standard` and above.
  - **`Counter`.** It replaces §3's `format` with `decimals`, `prefix`, `suffix`, `label` and `duration`; `value` may be a binding in a live surface, which shows the bound value without counting.
    - The final number is in the HTML, formatted for the page's locale, and screen readers read only that.
    - A hidden copy in the same grid cell holds its width while it counts up once on entry (ease-out, 0.9–2.2 s).
    - A counter the reader scrolled past keeps its final number.
  - **Loops.** `motion.loop` takes `float`, `pulse`, `gradient-shift` or `spin-slow`. Each fits only some decorative components and goes alone (no reveal or scroll). They use `translate`, `scale`, `rotate` or `background-position`, so hover effects still work.
  - **The pause control is now on the page.** The renderer adds "Pause motion" / "Hareketi duraklat" (`aria-pressed`) at the end of every surface with a marquee, rotating words or a loop.
    - This differs from §1's footer placement: the control sits next to what moves and needs no page-level knowledge.
    - It shows only where motion plays. Pressing it pauses every loop on every page: CSS animations pause and rotating words stop. The choice is remembered.
  - **`render_page`.** The new `flash` check flags a running animation that repeats more than three times a second and changes brightness (WCAG 2.3.1). `motion-budget` also flags more than 2 split texts or more than 2 loops.
  - **Interop.** A2UI exports a counter as its final number, a marquee as a still row, and rotating words as the first word.
  - **Guidance.** The catalog prompt, DESIGN guidance point 8 and the skill's recipes say where kinetic type, marquees and counters fit.
  - **The motion module** is now `motion.3.js` (2.3 KB gzip), with 1 and 2 as aliases.
  - **Checked** in Chrome on a demo page:
    - rotating words took turns, the marquee moved, and counters counted up to 11, 38,000 and 99.9 with their width held;
    - the pause control stopped the marquee and the words and remembered the choice;
    - `render_page` flagged only the demo's deliberate third loop, with no contrast finding for gradient text and no flashing.
  - **Fixed during checking.** Counter suffixes no longer drift: a hidden copy holds the width, where `ch` units had over-reserved for separators.

- **24d shipped.**
  - **Ambient backgrounds.** `Band` and `Card` take `ambient: {kind, preset, density, colors, interactive}`.
    - **CSS kinds:** `aurora`, `gradient-shift`, `grain` and `beams`, on bands and cards.
    - **`particles`:** bands only, with `dots`, `links`, `stars`, `snow`, `bubbles` or `fireflies`.
    - The catalog allows one ambient background per section; `render_page`'s `motion-budget` flags more than 2 on a page.
  - **Drawing.**
    - CSS kinds are a `::before` layer under the content, from the role colors at about a fifth of their strength (`colors`: brand with accent, brand with its gradient end, accent with link, or neutral greys). The surface's text roles keep their contrast.
    - They move slowly (12–18 s a cycle) at `standard` and above, and are a still poster everywhere else.
    - Particle bands show a soft gradient poster and a canvas (`aria-hidden`, under the content, no pointer events).
  - **The ambient module.** `/_cloudhal/ambient.1.js` (1.8 KB gzip, hash-pinned, budget 8 KB) paints the canvas. The motion module (now `motion.4.js`, 1–3 aliased) imports it only at `standard` or above, without Save-Data and with more than 2 GB of memory.
  - **Guards.**
    - Device-pixel ratio capped at 2.
    - Particles scaled by the band's area and its density, fewer at `standard`, capped at 120 with links and 400 without.
    - 30 frames a second.
    - It stops off screen, in a hidden tab, and while the reader has paused motion (watched on `<html>`).
    - Twinkles and glows change over seconds, so nothing flashes.
    - `interactive` pushes particles away from a fine pointer.
  - **Deviations from §4.**
    - Particles are drawn on the main thread rather than in a worker: the caps keep the work small, and it saved a second file.
    - The canvas reads colors from the band's `--ch-amb-*` variables, so dark mode needs nothing more.
  - **Pause control.**
    - Ambient sections get it, and only the first control on a page stays visible, since one control pauses every page.
    - Pausing also stops `::before` and `::after` layers. The 24c rule had put pseudo-elements inside `:is()`, which made the whole rule invalid; it is now three separate selectors. This also fixes pausing marquees and loops.
  - **Interop.** A2UI exports leave ambient out, with a note.
  - **Guidance.** The catalog prompt, DESIGN guidance point 8 (one ambient, behind the hero) and the skill's recipes cover it.
  - **Checked** in Chrome:
    - particles painted and moved, and stopped when paused;
    - beams and aurora paused with the control;
    - `render_page` passed every check in light and dark with motion `static` and `full`, apart from the demo's deliberate four backgrounds.

## Sources
- **Scroll-driven animations:**
  - Chrome: https://developer.chrome.com/docs/css-ui/scroll-driven-animations
  - Safari 26: https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/
  - MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline
- **Interop 2026:** https://web.dev/blog/interop-2026 and https://hacks.mozilla.org/2026/02/launching-interop-2026/
- **Scroll-triggered animations:** https://developer.chrome.com/blog/scroll-triggered-animations
- **View Transitions:**
  - Same-document Baseline: https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available
  - Cross-document support: https://caniuse.com/cross-document-view-transitions
  - 2025 features: https://developer.chrome.com/blog/view-transitions-in-2025
- **`@starting-style`:** https://web.dev/blog/baseline-entry-animations
- **`@property`:** https://developer.mozilla.org/en-US/docs/Web/CSS/@property
- **OffscreenCanvas:** https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- **WCAG:**
  - 2.2.2: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
  - 2.3.3: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
  - 2.3.1: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- **Performance:**
  - Reduced motion: https://web.dev/articles/prefers-reduced-motion
  - Animations guide: https://web.dev/articles/animations-guide
  - Scroll animation case study: https://developer.chrome.com/blog/scroll-animation-performance-case-study
- **Builders:**
  - Framer effects: https://www.framer.com/updates/component-effects
  - Webflow and GSAP: https://webflow.com/blog/gsap-becomes-free and https://webflow.com/blog/webflow-interactions-with-gsap
  - Wix Studio animations: https://support.wix.com/en/article/studio-editor-about-animations
- **Libraries:**
  - SplitText accessibility: https://gsap.com/docs/v3/Plugins/SplitText/
  - tsParticles presets: https://particles.js.org/guides/vanilla
  - Motion `scroll()`: https://motion.dev/dom/scroll
- **Lottie and Rive under CSP:** https://github.com/LottieFiles/dotlottie-web/wiki/CSP-and-WASM-Self%E2%80%90Hosting-Guide and https://rive.app/docs/runtimes/runtime-sizes.md
