# RFC-0023: Design tokens v2 and surface styles
- Status: Accepted; 23a–23d shipped
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-16
- Related:
  - RFC-0017 (theme settings, `set_theme_settings`, `x-contrast`), RFC-0018 (theme kit, CSS layers, 18d section styles), RFC-0021 (DESIGN.md, `render_page`, the design judge), RFC-0022 (surface tools);
  - `docs/design/agent-built-sites-gap-analysis.md` G3 and G4 (step 2 of its suggested order).
- References (checked 2026-10-16):
  - CSS Color 4 `oklch()` and CSS Color 5 `light-dark()`: https://www.w3.org/TR/css-color-5/#light-dark
  - W3C Design Tokens Community Group format 2025.10: https://www.designtokens.org/tr/drafts/format/
  - Utopia fluid type scales: https://utopia.fyi/type/calculator/
  - WCAG 2.2 contrast: 1.4.3, 1.4.6, 1.4.11.

## Summary
Sites built from the same structure look alike, because a theme exposes four colors, four font stacks and three corner styles, and its CSS hard-codes about a hundred greys. This RFC replaces hand-picked colors with **tokens agents choose as enums**:
- a seed color, a palette scheme, a contrast level and a light, dark or automatic mode;
- a curated font pairing and a fluid type scale;
- corner radius and density.

**Code expands them into OKLCH color roles and CSS variables,** checks WCAG at expansion time, and gives every site dark mode. Bands and cards gain **surface styles** (accent, gradient, mesh, dot and grid patterns) built from the same tokens. Agents never write a color, CSS or an image to get them.

## Motivation
- **Sameness.** In the RFC-0021 design evals the judge's most common note was "lacks variation in tone and rhythm". The catalog has the structure (bands, grids, cards); the theme has too few distinct looks to choose from.
- **Agents pick hex codes badly.** `set_theme_settings` takes four free colors checked only for contrast. Models pick near-identical greys or loud pairs; nothing guides them towards a coherent palette.
- **No dark mode.** The blog theme's CSS uses fixed Tailwind greys (`zinc-*`, about 100 uses), so a dark scheme is impossible without rewriting it. RFC-0018 names moving them to variables as a prerequisite.
- **Precedent.** Tools whose AI picks presets and tokens (Framer, Webflow, Wix Harmony, Figma Sites, Relume) produce the most consistently polished sites, as the gap analysis found. Material 3's dynamic color builds a full scheme from one seed with guaranteed contrast.

## Proposal

### 1. Color: one seed, roles derived
New theme settings, all scalars (the RFC-0017 schema subset):

| Setting | Values | Default |
|---|---|---|
| `seed` | `#rrggbb` | the theme's brand color |
| `scheme` | `tonal` (seed hue, soft) · `vibrant` (seed hue, saturated) · `neutral` (near-grey with a seed tint) · `mono` (greys, seed only for the brand) | `tonal` |
| `contrast` | `standard` (AA) · `high` (AAA for text) | `standard` |
| `mode` | `light` · `dark` · `auto` (follows the reader) | `light` |

**Expansion** (`@cloudhal/core-ts/tokens`, pure, Worker-safe):
- **Tonal palettes.** The seed is converted to OKLCH. The scheme fixes chroma; tonal palettes (primary, neutral, neutral-variant) are generated at fixed lightness steps.
- **Roles** are taken from those steps for light and for dark:

```ts
type ColorRole =
  | "surface" | "surface-muted" | "surface-raised" | "surface-inverse"
  | "text" | "text-muted" | "text-inverse"
  | "border" | "brand" | "on-brand" | "accent" | "on-accent" | "link" | "focus";
```

- **Contrast is guaranteed by construction.** Every role pair that carries text or UI is checked (WCAG 2.2: 4.5:1 for text, 7:1 for text at `high`, 3:1 for UI parts). A failing pair moves its foreground's lightness one step at a time until it passes; the expansion never emits a failing pair. The steps taken are returned as notes for Studio and agents.
- **Output.** `themeVariables` emits `--ch-color-<role>` for each role:
  - `light` and `dark` emit one value per role;
  - `auto` emits `light-dark(<light>, <dark>)` with `color-scheme: light dark` on `:root`.
- **Fallback.** Browsers without `oklch()` or `light-dark()` get the light value through a preceding `#rrggbb` declaration.
- **Old settings still work.** A theme that declares only the old settings (`brand`, `link`, `surface`, `text`) keeps them. A site that sets them keeps its colors until it sets `seed`, which wins. `get_theme_settings` shows both and says which applies.

### 2. Type: a pairing and a fluid scale

| Setting | Values | Default |
|---|---|---|
| `typePairing` | a curated id: `editorial` (serif display, sans text), `modern` (geometric sans), `humanist`, `technical` (sans and mono), `classic` (serif), `system` | `system` |
| `typeScale` | `compact` (1.2) · `balanced` (1.25) · `dramatic` (1.333) | `balanced` |

- **Pairings** map to font families shipped by the theme as self-hosted variable WOFF2 files (OFL-licensed: e.g. Fraunces, Source Serif 4, Inter, Space Grotesk, IBM Plex Mono), preloaded only for the families a page uses. `system` loads nothing.
- **The scale** becomes fluid steps `--ch-step--1 … --ch-step-5` with `clamp()` between 390 and 1440 px (Utopia's method), so headings shrink on phones without breakpoints.
- **Headings** get `text-wrap: balance` and body text `text-wrap: pretty` where supported.

### 3. Shape and density

| Setting | Values | Default |
|---|---|---|
| `radius` | `none` · `small` · `medium` · `large` · `full` | `small` |
| `density` | `compact` · `cozy` · `airy` | `cozy` |

They become `--ch-radius-{s,m,l}` and `--ch-space-{xs…xl}`, which the theme's CSS uses for buttons, cards, fields, bands and gaps. The existing `radius` setting keeps its three values as a subset.

### 4. Surface styles for bands and cards
`Band` and `Card` gain a `surface` prop:

| `surface` | Built from |
|---|---|
| `plain` · `muted` · `raised` · `inverse` | the matching color role |
| `accent` | `accent` with `on-accent` text |
| `gradient` | a two-stop linear gradient between brand and accent roles |
| `mesh` | three layered `radial-gradient`s from brand, accent and surface roles |
| `dots` · `grid` | an SVG pattern (a data URI the renderer writes from the `border` role) over `surface-muted` |
| `noise` | a fixed, tiny SVG turbulence texture over `surface-muted`, at low opacity |

- **The renderer writes these,** never the agent. Text on each surface uses the role the expansion paired with it, so contrast holds on every surface; patterned surfaces keep their pattern at no more than 8% contrast so text stays readable.
- **`tone` stays.** The existing `Band.tone` maps to `surface` (`surface` → `plain`, `muted`, `brand` → `accent`, `inverse`).
- **`Band` also gains `anchor`** (an id for `#links`, `[a-z][a-z0-9-]{0,40}`), so a menu can link to a section.
- **No JSON Schema change:** these are catalog props (RFC-0020 props are free-form and checked against the catalog).

### 5. Agents, Studio and the eval
- **`get_design`** returns the token settings with their allowed values, the expanded roles (light and dark) with their contrast ratios, and the notes.
- **`set_theme_settings`** takes the new settings (enums only), and `render_page` takes an optional `scheme: light | dark` to look at both.
- **DESIGN guidance** point 1 becomes "pick a seed, a scheme and a pairing that fit the brand, and keep to them".
- **The site-design skill** gains a palette and pairing recipe per kind of site (editorial, SaaS, portfolio, local business).
- **Studio's Appearance form** shows the seed, the enums, a live swatch grid of the roles for light and dark, and the contrast notes. The old free color pickers stay for themes that use them.
- **The design judge rubric** gains `color`: "Is the palette coherent, with one dominant color and accents used with purpose?".
- **`render_page`** gains a `contrast` check in dark mode, run when the site's mode is `dark` or `auto`.
- **Export.** `cloudhal tokens export [--format dtcg]` and a `get_design_tokens` MCP tool write the expanded tokens as W3C DTCG 2025.10 JSON for Figma and Style Dictionary.

### Invariants
1. Agents and people choose enums and one seed color. CSS, colors per role and images never come from them.
2. The expansion is pure and deterministic: the same settings give the same variables on the server, in previews and in exports.
3. No emitted text/background pair fails WCAG 2.2 at the chosen contrast level, in light or dark.
4. A page renders without JavaScript, and without `oklch()` or `light-dark()` support it falls back to the light values.
5. Old settings keep working until a site opts into `seed`.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Keep free colors, add more of them | No new model | More ways to pick badly; no dark mode; contrast checks only after the fact | Choices should be coherent by construction |
| A fixed list of named palettes | Simple, curated | Few distinct looks; brands cannot match their color | A seed plus scheme gives both brand fit and curation |
| Agents write CSS variables directly | Unlimited | Unchecked contrast, CSS injection surface, no dark pairing | Breaks "data, not code" |
| HSL instead of OKLCH | Wider old-browser support | Uneven perceived lightness; contrast drifts across hues | OKLCH keeps steps perceptually even; a `#rrggbb` fallback covers old browsers |
| Google Fonts links | Huge choice | Third-party requests, privacy and CSP changes | Self-hosted, curated pairings; licences checked once |

## Compatibility & migration
- **No core contract change.** `Site.theme.config` is a map checked against the theme's schema; the new settings are theme schema keys. The theme kit (RFC-0018) documents the role variable names, `--ch-color-<role>`, as the convention.
- **The blog theme moves its fixed greys to role variables** (23a). Its default settings reproduce today's light look within a step, and screenshots before and after are compared in `render_page`.
- **Live sites** keep their colors until someone sets `seed`.
- **Rollback:** remove the new keys from the theme schema; stored values fall back to defaults (`themeVariables` already drops values that no longer fit).

## Security & policy impact
- **No new scopes.** `set_theme_settings` stays `site:settings` with approval for agents, as in RFC-0017.
- **Nothing free-form reaches CSS:** colors are `#rrggbb` checked by pattern, every other value is an enum, and SVG patterns are generated by the renderer from role colors.
- **Fonts** are static files shipped with the theme. No third-party requests and no CSP change.

## Rollout
| Phase | Scope |
|---|---|
| 23a | `@cloudhal/core-ts/tokens` (OKLCH palettes, roles, contrast repair, notes); `seed`, `scheme`, `contrast`, `mode` in the blog theme; its greys moved to role variables; dark and auto modes; `get_design` and Appearance swatches; `render_page --scheme dark` |
| 23b | Type pairings (self-hosted variable fonts), the fluid scale, `text-wrap` |
| 23c | Radius and density tokens |
| 23d | Surface styles for `Band` and `Card`, `Band.anchor`, the tone mapping |
| 23e | DTCG export (CLI and MCP), the `color` rubric criterion, skill recipes, an eval and judge-check run recorded here |

## Open questions
1. **Font payload.** Ship every pairing's files with the theme (about 1–2 MB in the deploy, only the used ones downloaded), or let a site pick one pairing at deploy time to keep the bundle small?
2. **Per-page mode.** Should a page or a band force dark (for a landing hero) regardless of the site mode, or is `surface: inverse` enough?
3. **Accent derivation.** Derive the accent as the seed's complementary hue, a fixed rotation, or let the person pick a second seed?
4. **Gradient taste.** Keep gradients and meshes off by default in the site-design guidance (easy to overuse) and allow them only for heroes and calls to action?

## Status
- **23a shipped.**
  - **Expansion.** `@cloudhal/core-ts/tokens` (`expandColorTokens`) builds 16 roles for light and dark from the seed in OKLCH. That is the §1 list plus `text-subtle` and `border-strong`, which the blog theme's greys needed. The light brand is the seed itself; the accent hue is the seed's turned by 150°, as a fixed rotation (open question 3).
  - **Contrast.** Eleven pairs are checked (text 4.5:1 or 7:1 at `high`, UI parts 3:1), plus text on brand and on accent. A failing foreground moves one lightness step at a time; backgrounds never move. If neither white nor near-black text reads on a fill, the fill is moved instead. Every move is returned as a `repairs` entry and as a note. A test runs 9 seeds × 4 schemes × 2 levels × light and dark without one failing pair.
  - **Which colors apply.** `siteColorTokens` decides for the renderer, `get_design` and Studio alike. The seed applies when the theme declares `seed` and the site set one or chose a dark or automatic mode; otherwise the site's old four colors apply, with the former greys (`legacyColorRoles`), so live sites look the same.
  - **The blog theme.** It gains `seed`, `scheme`, `contrast` and `mode`. Its CSS reads `--ch-color-*`, and Tailwind's `zinc-*` and `white` are remapped to the roles with `@theme inline`, so no class had to change for dark mode. Light renders matched the old look; dark and seeded renders passed every `render_page` check (calculator, pricing, chart pages).
  - **Agents.** `get_design` returns `colors`: source, settings, both role sets, every pair's ratio and the repairs. Its text says which settings to change and to render dark when the mode is dark or auto. `render_page` takes `scheme: light | dark`, and DESIGN guidance points 1 and 8 say so.
  - **Studio.** The Appearance form shows `ColorRolePreview` under the fields: a sample and swatches for light, and for dark once a seed is set. The repairs appear in the person's language, and it works out live as the fields change.
  - **Moved to later phases.** The dark-mode `contrast` check run automatically by the site's mode, and the site-design skill recipes, move to 23e.
- **23b shipped.**
  - **Pairings.** The blog theme gains `typePairing` (default `system`, which keeps the older `font` setting):
    - `editorial`: Fraunces and Inter;
    - `modern`: Space Grotesk and Inter;
    - `humanist`: Source Sans 3;
    - `technical`: JetBrains Mono headings and code, Inter text;
    - `classic`: Source Serif 4.
  - **Font files.** They are self-hosted in the theme's `public/fonts`: Fontsource 5.3 variable files, upright, weight axis only, latin and latin-ext (Turkish), with their OFL-1.1 licences. That is 12 files, 0.48 MB in the deploy.
    - `fonts.css` declares them with unicode ranges, so a page downloads only its pairing's families and the subsets its text needs.
    - `Base.astro` preloads the pairing's latin files (`src/fonts.ts`).
    - This answers open question 1: every pairing ships with the theme, and readers download only what is used.
  - **Scale.** `typeScale` (`compact`, `balanced`, `dramatic`; no default) writes fluid steps `--ch-step--1 … --ch-step-6` with Utopia's method.
    - Body text runs from 16 px at 390 px wide to 17 px at 1440 px. The ratio is gentler on phones (1.125, 1.15 or 1.2) than on desktops (1.2, 1.25 or 1.333).
    - A step 6 was added for the theme's largest hero size.
    - Tailwind's `text-base` to `text-5xl` read the steps, with their fixed sizes as fallbacks. Until a site chooses a scale nothing is written, so live sites keep their sizes.
  - **Wrapping.** Headings get `text-wrap: balance`; paragraphs, list items and quotes `pretty`.
  - **Agents.** `get_design` returns `type` (pairing, scale) and says how to change them. DESIGN guidance point 1 and the theme's DESIGN.md say which pairing fits which kind of site.
  - **Checked.** Every pairing rendered with `render_page` at 1440 and 390 px passes every check, including dramatic headings on phones.
- **23c shipped.**
  - **Settings.** The blog theme's `radius` grows to `none`, `small`, `medium`, `large` and `full` (its three old values keep their names), and `density` (`compact`, `cozy`, `airy`) is new.
  - **Variables.** `shapeCss` (`@cloudhal/core-ts/tokens`) writes:
    - `--ch-radius-control`, for buttons and single-line fields; it is a pill at `full`, while cards and bands keep the smaller radii;
    - `--ch-radius-s`, `-m` and `-l`;
    - `--ch-space-unit`, which is 0.875×, 1× or 1.2× Tailwind's 0.25rem;
    - `--ch-space-xs` to `-xl`, for themes and custom CSS.
  - **The theme.** It maps Tailwind's `rounded*` sizes and its spacing unit to these variables, so every padding, gap and band follows the density without class changes. Controls take the control radius; this replaces the old corner rules for buttons, CTAs and callouts.
  - **Defaults.** `small` and `cozy` are Tailwind's own values, so existing sites keep their look. One exception: the header search field takes the control radius, 4 px instead of 6 px.
  - **Agents.** `get_design` returns `shape`, and the theme's DESIGN.md says which corners and spacing fit which site.
  - **Checked.** Pill and airy, and square and compact, both rendered with `render_page` at 1440 and 390 px and passed every check, the tap targets on compact included.
- **23d shipped.**
  - **Surfaces.** `Band` and `Card` take `surface` (`SURFACE_STYLES`): `plain`, `muted`, `raised`, `inverse`, `brand`, `accent`, `gradient`, `mesh`, `dots`, `grid` and `noise`.
    - `brand` was added to the §4 list so that every old tone has a surface with the same look.
    - `tone` maps through `TONE_SURFACE`. Its `brand` maps to `brand`, not `accent` as §4 proposed, because pages with a brand band would otherwise change color.
  - **Rendering.** The renderer writes `data-surface`; an old `tone` also stays as `data-tone` for themes that style it. The theme draws each surface from the color roles only:
    - `gradient` runs from the brand to a new `gradient` role: the brand turned 40° towards the accent, then moved until text on brand still reads on it. The expansion checks that pair, so text on a gradient keeps its contrast; a test runs every seed, scheme and level.
    - `mesh` is three soft radial lights from the brand and accent over the muted surface.
    - `dots` and `grid` are CSS gradients from the border roles, not SVG data URIs, so they follow light and dark through `light-dark()`.
    - `noise` is a fixed grey SVG grain at 18% opacity.
    - Without `color-mix()` or gradient interpolation, browsers fall back to the plain fill.
  - **Anchors.** `Band.anchor` (`^[a-z][a-z0-9-]{0,40}$`) becomes the band's `id`, so links can jump to it. Anchors starting with `ch-` are dropped so they cannot clash with the renderer's own ids. A band with an anchor keeps a small scroll margin.
  - **Text on loud surfaces.** Buttons, links and secondary text on loud surfaces (inverse, brand, accent, gradient) follow the surface's own text color, as the loud tones did.
  - **Guidance.** DESIGN guidance point 2 and the theme's DESIGN.md say when to use which surface: gradient and mesh at most once a page, for the hero or the call to action (open question 4).
  - **Checked.** A page with every surface passed the contrast check in light, dark and auto, at 1440 and 390 px.
  - **Follow-up.** The accent derived from a violet seed (hue + 150°) comes out a dark mustard once repaired for white text. Open question 3 (how to derive the accent) is worth revisiting in 23e.
