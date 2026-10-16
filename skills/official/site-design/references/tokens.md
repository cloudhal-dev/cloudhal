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

## Surfaces
- Bands and cards take a `surface`. Use `gradient` or `mesh` once a page, for the hero or the call to action; `muted`, `dots`, `grid` or `noise` to separate quiet sections; `raised` for cards on a muted band; `brand`, `accent` or `inverse` for at most two loud moments.
- Give the bands a menu or button points to an `anchor` (`pricing`, `faq`), and link to `#pricing`.

## Check
- After changing the look, `render_page` again at 1440 and 390 px. When `mode` is dark or auto, render_page also checks contrast in the dark scheme; render with `scheme: "dark"` to see it.
- `get_design_tokens` exports the result as a W3C design tokens file for a designer.
