# RFC-0027: Carousel
- Status: Accepted (2026-10-17; the directions were decided in the companion research)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-17
- Related:
  - RFC-0020 (surfaces), RFC-0024 (motion levels, the page-wide pause), RFC-0025 (overlays, `Lightbox`), RFC-0026 (icons), RFC-0028 (image fit, planned);
  - `docs/design/carousels.md`, the research: platform status, the APG pattern, the evidence on auto-rotating heroes, libraries compared and the decisions taken here (sources there).

## Summary
A `Carousel` catalog component: its children are slides, in four variants (`hero`, `rail`, `gallery`, `testimonials`). It works without JavaScript (a scroll-snap track, markers as real links) and a small first-party module adds buttons, position, announcements and, for heroes only and off by default, guarded autoplay. The store enforces the evidence: few hero slides, no autoplay by default, no carousel inside a carousel.

## Motivation
- Heroes, product and logo rails, testimonials and galleries are among the most requested landing-page parts; agents have only `Marquee` (a moving strip, not navigable) and `Lightbox`.
- Carousels are easy to get wrong: auto-rotation nobody can stop, slides hidden from keyboard users, layout shift, a lazy first image. Making them data the store checks lets every site get them right.

## Proposal

### 1. The component
```jsonc
{ "component": "Carousel",
  "props": {
    "label": "Featured stories",                 // required; never the word "carousel"
    "variant": "hero" | "rail" | "gallery" | "testimonials",
    "perView": 1 | 2 | 3 | 4,                    // rail; absent = as many as fit (itemWidth)
    "itemWidth": "s" | "m" | "l",
    "peek": "none" | "s" | "m",                  // a part of the next slide shows
    "align": "start" | "center",
    "gap": "none" | "s" | "m" | "l" | "xl",
    "aspect": "16:9" | "21:9" | "4:3" | "1:1" | "3:4",   // required for hero and gallery
    "controls": "both" | "arrows" | "markers" | "none",
    "markers": "numbers" | "dots" | "labels" | "thumbs",
    "loop": true,                                // hero only (27d)
    "autoplay": "off" | "slow" | "normal"        // hero only, off by default (27d)
  },
  "children": ["slide-1", "slide-2", "…"] }
```

### 2. Markup (no JavaScript needed)
- `<section role="region" aria-roledescription="carousel" aria-label>` around a focusable scroll-snap track; each slide a `group` with `aria-roledescription="slide"` and a name ("2 of 5").
- Markers are `<nav>` links to the slides (`scroll-target-group: auto` gives the current one a style in Chromium); arrow buttons are rendered hidden for the module to reveal, so their place is kept.
- Hero slide 1's images load eagerly with high priority; every other slide's images are lazy.

### 3. The module (27b)
`/_cloudhal/carousel.1.js`, loaded only with a carousel: prev/next (by a slide or a view, aware of the ends and RTL), the current position (`scrollend` or IntersectionObserver) on markers and a "2 / 5" counter, marker clicks that scroll the track instead of jumping the page, a polite announcement after the reader moves, `inert` off-screen hero slides, and the guarded autoplay of 27d. No scroll hijacking.

### 4. Rules the store enforces
1. Slides: hero 2–5, rail and testimonials 2–12, gallery up to 24.
2. `aspect` is required for hero and gallery; `controls: none` only on a rail with a peek.
3. No carousel inside a carousel, a `Marquee` or a `Scrolly`; overlays are never slides.
4. The label never contains "carousel" (assistive technology already says it).
5. (27d) Autoplay only on a hero, at most one per page, at least 5 s and long enough for the longest slide's text; never below motion `standard`, under reduced motion or while the reader has paused motion; it stops for good on any interaction and always has a rotation button first.

### 5. Checks
`render_page` adds `carousel-label` (named carousel and slides) and `carousel-lcp` (hero slide 1 not lazy, other slides lazy) in 27a; focus, CLS and autoplay checks with the module.

### Invariants
1. Every slide is reachable without JavaScript, by scrolling and by the marker links.
2. Nothing moves on its own unless the site asked for it, motion allows it, and the reader can stop it.
3. Slides keep one frame size: nothing shifts as the reader moves.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Native `::scroll-button()` / `::scroll-marker` | No script at all | Chromium only; markers exposed as tabs without panels | Anchors until the accessibility settles and Safari/Firefox ship |
| A library (Splide, Embla, Swiper) | Mature behaviour | 6–20 KB, third party, transform-based | Native scroll plus ~4 KB of our own |
| Extend `Lightbox` into a gallery | One component | Different job (a viewer, not a strip) | A gallery may open a Lightbox later |
| A JSON Schema contract change | Rust mirrors it | Like RFC-0024/0025 components, the catalog checks props | Catalog-only |

## Compatibility & migration
New component only; nothing existing changes. Rollback: the catalog entry and its renderer.

## Security & policy impact
None new: props are enums and short text; the module is first-party under `script-src 'self'`.

## Rollout
| Phase | Scope |
|---|---|
| 27a | Rail and hero without JavaScript: catalog, rules, rendering, CSS, image loading, label and LCP checks |
| 27b | `carousel.1.js`: buttons, position, announcements, inert fallback, markers that scroll; focus and CLS checks |
| 27c | `gallery` (thumbnails) and `testimonials` |
| 27d | Hero `loop` and `autoplay` with every guard; the autoplay check |
| 27e | Theme hero areas accept a hero carousel; DESIGN.md, `get_design` and the build eval |

## Open questions
None; `docs/design/carousels.md` decided them.

## Status
- **27a shipped.**
  - **Catalog.** `Carousel` with variants `hero` and `rail`; `gallery` and `testimonials` come in 27c. Props: `label`, `perView`, `itemWidth`, `peek`, `align`, `gap`, `aspect`, `controls`, and `markers` (numbers or dots).
  - **Rules.**
    - Hero 2–5 slides, rail 2–12.
    - A hero needs an `aspect`.
    - `controls: none` only on a rail with a peek.
    - The label never says "carousel".
    - No overlay as a slide; no carousel inside a Carousel, Marquee or Scrolly.
    - `catalogPrompt` prefers a static hero.
  - **Markup.**
    - A `region` with `aria-roledescription` (Turkish too), a focusable scroll-snap track, and each child wrapped as a named slide ("2 of 5") by `slideWrapper`, in both renderers.
    - Markers are links to the slides; `scroll-target-group` and `:target-current` highlight the current one in Chromium.
    - Arrows are rendered with `data-ch-pending` (`visibility: hidden`, their place kept) for the 27b module.
    - Hero slide 1's images load with priority; the others stay lazy.
  - **CSS.**
    - `perView` and peek through custom properties.
    - Container queries cap `perView` at 2 in a medium carousel and 1 in a narrow one.
    - A hero is full width; one frame per slide; wide frames become 4:5 in a narrow carousel.
    - Smooth scrolling only where motion plays.
  - **Checks.** `render_page` adds `carousel-label` and `carousel-lcp`. It now remembers which images the page asked to be lazy before it loads them all.
  - **Known gap.** A transparent header reads the hero's first slide only (`heroSurface` walks into the carousel), so later slides with other surfaces may differ. `header-contrast` checks the first slide.
- **27b shipped.**
  - **Module.** `/_cloudhal/carousel.1.js` is 972 B gzipped and loads only with a carousel.
    - The arrows appear. They move by a slide (hero) or by what is in view (rail), through `scrollIntoView`, so right-to-left and the site's `scroll-behavior` hold. At the ends they carry `aria-disabled`.
    - The current slide is measured from the slides' boxes on `scroll`/`scrollend`. It shows on its marker (`aria-current`).
    - Marker clicks scroll the track without jumping the page or changing the hash.
    - A polite live region names the slide after the reader moves.
    - A hero's off-screen slides are `inert`.
    - No wheel or drag handling.
  - **Check.** `render_page` adds `carousel-focus`: the arrows must have appeared (the module ran), and no focusable element may sit in an off-screen hero slide unless it is inert.
  - **Design note.** Position is measured from geometry rather than an IntersectionObserver. Hidden tabs (and the preview pane) pause observers; geometry stays correct after any move, and a short timer catches moves that cause no scroll.
