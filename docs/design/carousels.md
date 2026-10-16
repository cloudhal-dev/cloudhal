# Carousels and sliders: research and decisions

Research for RFC-0027 (a carousel for generated UI and theme hero areas). Sources at the end.

## The platform (October 2026)
- **Everywhere, no JavaScript**: scroll snap; fragment links (`href="#slide-3"`) as slide pickers (they also jump the page and change the hash); lazy images in horizontal scrollers (Chrome 121+ uses the vertical thresholds).
- **Chromium only**: CSS carousels (`::scroll-button()`, `::scroll-marker`, `:target-current`, Chrome 135; Safari and Firefox have none, ~71% global); `scroll-target-group: auto` (Chrome 140: ordinary anchor links get `:target-current`); `scroll-state()` queries (Chrome 133: `snapped`, `scrollable`); `interactivity: inert` (Chrome 135).
- **Native markers' accessibility is not ready**: they are exposed as tabs without tabpanels, with wrong counts and focus in hidden slides (Sara Soueidan, 2025); Chrome has fixed part of it.
- **Not in the platform**: looping and auto-advance (left out of the CSS proposal on purpose).

## Accessibility and evidence
- **APG carousel pattern**: a labelled `region` with `aria-roledescription="carousel"` (the label never says "carousel"); slides are labelled `group`s (`aria-roledescription="slide"`, "3 of 10" as a fallback); native buttons that never move focus; a rotation control first in Tab order that stops rotation for good; a polite live region, off while rotating.
- **WCAG 2.2.2**: auto-advancing content needs pause/stop; pausing only while focused is not enough; our page-wide pause (RFC-0024) already helps.
- **Evidence against auto-rotating heroes**: ~1% of visitors click a slide, 89% of those slide 1 (Notre Dame); NN/g: people miss later frames — use ≤ 5, show "2 / 5", dots are weak, use a peek, allow ~3 words per second, prefer a static hero; Baymard: 46% of homepage carousels have usability problems; government design systems leave carousels out.

## Approaches

| Approach | Size | For us |
|---|---|---|
| CSS only (snap, anchors, Chromium extras) | 0 KB | The baseline: works without JS, no CLS, native swipe and momentum, RTL by logical properties |
| Embla / Keen | ~6–7 KB | Transform-based, third party |
| Splide | ~12 KB | Best accessibility out of the box (our model for behaviour) |
| Swiper | ~20 KB | Every feature, heavy, JS-first |
| Material 3 layouts | — | Names worth borrowing: hero (one large + peek), uncontained rail |

## Decisions
1. **One catalog component, `Carousel`**, each child one slide (Cards, Images, Stacks…), with `label` (required) and `variant` `hero | rail | gallery | testimonials`; `perView` (1–4 or auto with `itemWidth`), `peek`, `align`, `gap`, `aspect` (required for hero and gallery), `controls`, `markers` (`numbers` shown as "2 / 5" by default; `labels`, `dots`, `thumbs` for galleries), `loop`, `autoplay`. Catalog-only, like RFC-0024/0025 components: no contract change.
2. **No-JS baseline**: a scroll-snap track (focusable, `overscroll-behavior-inline: contain`), markers as real anchor links (`scroll-target-group: auto` + `:target-current` add the active style in Chromium), arrow buttons rendered hidden for the module to reveal (their space reserved). **No native `::scroll-button()`/`::scroll-marker`** until their accessibility settles and Safari or Firefox ship them.
3. **A small first-party module, `carousel.1.js`** (~3–4 KB, only with a carousel): prev/next with correct ends (direction-aware, RTL), position tracking (`scrollend` or IntersectionObserver), "2 / 5" and `aria-current` on markers, marker clicks scroll the track (no page jump, no hash), a polite live region after the reader moves, `inert` for off-screen hero slides where CSS cannot, and autoplay with all guards. No scroll hijacking: swipe is native scroll.
4. **Autoplay: hero only, off by default.** At most one per page; interval ≥ 5 s and long enough for the longest slide's text (~3 words per second); never below motion `standard`, under reduced motion, while the reader has paused motion, or in a hidden tab; stops for good on focus, pointer or swipe, pauses on hover; a rotation button first in Tab order.
5. **Loop: hero only** (the module rewinds; without JS the carousel is bounded). Rails never loop.
6. **Limits**: hero 2–5 slides, rail and testimonials 2–12, gallery up to 24; no carousel inside a carousel, a Marquee or a Scrolly; overlays are never slides (a slide's Button may open one).
7. **Images**: hero slide 1 eager with high fetch priority in the first section, all other slides lazy; one frame `aspect` for every hero and gallery slide; `sizes` from `perView`; gallery and hero slides use the fit modes of `docs/design/images.md` (gallery defaults to blur-fill).
8. **Gallery stays apart from `Lightbox`**: a gallery carousel may open its image large in a Lightbox later.
9. **Guidance**: static hero by default; a hero carousel only for 2–5 equally important messages; nothing reachable only from slide 3+.
10. **`render_page` checks**: `carousel-label`, `carousel-lcp`, `carousel-focus`, `carousel-autoplay`, CLS while stepping, and a no-JS pass; `overflow-x` and `tap-target` cover the track and controls.

## Rollout (RFC-0027)
| Phase | Scope |
|---|---|
| 27a | `Carousel` rail and hero without JavaScript: catalog, rules, rendering, CSS, image loading, label/LCP checks |
| 27b | `carousel.1.js`: buttons, position, live region, inert fallback, markers that scroll; focus and CLS checks |
| 27c | `gallery` (thumbnails) and `testimonials` |
| 27d | Hero `loop` and `autoplay` with every guard; the autoplay check |
| 27e | Theme hero areas accept a hero carousel; DESIGN.md and `get_design` guidance; the build eval's rubric |

## Sources
- WebKit Interop 2026 https://webkit.org/blog/17818/announcing-interop-2026/ · web.dev Interop 2026 https://web.dev/blog/interop-2026 · carousel best practices https://web.dev/articles/carousel-best-practices
- CSS carousels https://developer.chrome.com/blog/carousels-with-css · spec https://drafts.csswg.org/css-overflow-5/#scroll-marker-pseudo · caniuse https://caniuse.com/wf-scroll-markers · MDN https://developer.mozilla.org/en-US/docs/Web/CSS/::scroll-marker · Chrome 140 https://developer.chrome.com/blog/chrome-140-beta · scroll-target-group https://una.im/scroll-target-group/ · CSS scrollspy https://sarasoueidan.com/blog/css-scrollspy/ · scroll-state https://developer.chrome.com/blog/css-scroll-state-queries · Chrome 135 https://developer.chrome.com/blog/chrome-135-beta · accessible carousel https://developer.chrome.com/blog/accessible-carousel · explainer https://github.com/flackr/carousel/blob/main/README.md · CSS carousels' accessibility https://sarasoueidan.com/blog/css-carousels-accessibility
- APG https://www.w3.org/WAI/ARIA/apg/patterns/carousel/ · WCAG 2.2.2 https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html · Notre Dame https://erikrunyon.com/2013/07/carousel-interaction-stats/ · NN/g https://www.nngroup.com/articles/designing-effective-carousels/ · Baymard https://baymard.com/blog/homepage-carousel · Scottish Government https://designsystem.gov.scot/styles/images/carousels · Queensland Health https://www.design-system.health.qld.gov.au/about/exploring-our-decisions/carousels · Dawn #1183 https://github.com/Shopify/dawn/issues/1183 · Shopify a11y https://shopify.dev/themes/best-practices/accessibility
- Embla https://www.embla-carousel.com/ · Splide a11y https://splidejs.com/guides/accessibility/ · Swiper https://swiperjs.com/swiper-api · Material carousel https://developer.android.com/develop/ui/compose/components/carousel · scrollend in Safari 26.2 https://webalur.com/en/blog/safari-version-26-2-introduces-scrollend
