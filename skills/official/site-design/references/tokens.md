# Look recipes (RFC-0023)

When the theme offers design tokens (`get_design` shows colors, type and shape), set the whole look with a few choices instead of picking colors: `seed`, `scheme`, `contrast`, `mode`, `typePairing`, `typeScale`, `radius` and `density` through `set_theme_settings`. It waits for a person's approval. The color roles, light and dark, are derived and always meet WCAG. Never write colors per role, CSS or images.

Start from the recipe closest to the site, then adjust to the brand: its own color as the seed, if it has one.

| Kind of site | seed (if the brand has none) | scheme | typePairing | typeScale | radius | density | mode |
|---|---|---|---|---|---|---|---|
| Editorial: news, magazine, journal | deep blue `#1e3a8a` or ink `#18181b` | neutral | editorial | balanced | none or small | cozy | auto |
| SaaS or product | the product color, e.g. violet `#7c3aed` | vibrant | modern | dramatic for the landing page, balanced elsewhere | medium or full | airy | light or auto |
| Developer tool or docs | green `#16a34a` or blue `#2563eb` | tonal | technical | compact | small | compact | auto (many readers prefer dark) |
| Portfolio or studio | one strong color, e.g. orange `#ea580c` | mono or neutral | classic or editorial | dramatic | none | airy | light |
| Local business: café, clinic, shop | a warm, friendly color, e.g. teal `#0f766e` or terracotta `#c2410c` | tonal | humanist | balanced | large | cozy | light |
| Institution: school, council, NGO | a calm blue or green | neutral | classic | balanced | small | cozy | light |

## Motion (RFC-0024)
Set the site's `motion` level with `set_theme_settings`, and give components motion presets in `patch_draft` (`motion` next to `visible`; `get_catalog` lists them). A page can set its own level (a launch page at `expressive` on a `subtle` site).

| Kind of site | motion | Presets that fit |
|---|---|---|
| Editorial | subtle (data stories standard) | `fade` on section headings; `underline` on story links; a `Scrolly` for an explainer whose chart changes as the reader goes |
| SaaS or product | standard (landing pages expressive) | hero heading `rise`, its buttons a `delay` later; feature grid `stagger`; cards `lift`; one `spotlight` card; a `Scrolly` "how it works"; a hero image with `parallax` depth 1–2 |
| Developer tool or docs | subtle | `fade`; `underline` on links |
| Portfolio or studio | expressive | `mask-rise` or `wipe-up` on headings; image cards `zoom-media` or `tilt` |
| Local business | standard | `rise` on sections; menu cards `lift` |
| Institution | subtle | `fade` only |

Scroll story: `Scrolly` with `step` bound to `/step` (start it at 1 in the data), the first child a `Chart`, `Stat` or a `Stack` of images shown by `visible` conditions on `/step`, then 2–12 `Step`s with short text. Check it with `render_page` `frames: 4`.

Rules: one entrance per section, hover only on things people click, never motion on text people are reading. Pages must be complete with motion off: render_page renders with reduced motion by default; render with `motion: "full"` to check layout shift.

## Surfaces
- Bands and cards take a `surface`. Use `gradient` or `mesh` once a page, for the hero or the call to action; `muted`, `dots`, `grid` or `noise` to separate quiet sections; `raised` for cards on a muted band; `brand`, `accent` or `inverse` for at most two loud moments.
- Give the bands a menu or button points to an `anchor` (`pricing`, `faq`), and link to `#pricing`.

## Check
- After changing the look, `render_page` again at 1440 and 390 px. When `mode` is dark or auto, render_page also checks contrast in the dark scheme; render with `scheme: "dark"` to see it.
- `get_design_tokens` exports the result as a W3C design tokens file for a designer.
