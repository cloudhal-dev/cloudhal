# Icons on public sites: research and decisions

Research for the next RFC (icons in themes and surfaces). Studio already uses Phosphor through Kumo; public sites have almost none: hand-drawn SVGs for the menu, caret and close buttons, and social links as text.

## What Astro offers (installed: astro 7.3.6)
- **SVG components are stable** (since 5.7): `import Logo from "./logo.svg"` renders an inlined `<svg>`, props override the file's attributes; `size`, `title` and sprite `mode` were removed in 5.6 (use `width`/`height`, `aria-label`). https://docs.astro.build/en/guides/images/ · https://astro.build/blog/astro-570/ · https://astro.build/blog/astro-560/
- **SVG optimisation** is still experimental (`experimental.svgOptimizer`, svgo, build only). https://docs.astro.build/en/reference/experimental-flags/svg-optimization/
- **No official icon library.** And SVG components work only for `.astro` imports at build time; our surfaces are rendered to strings in plain TypeScript (`packages/astro-renderer/src/surfaces.ts`), so we need icons as strings in TS data.

## Options

| Option | License | Icons | Style | String in a Worker | Notes |
|---|---|---|---|---|---|
| `@phosphor-icons/core` | MIT | ~1,500 | 6 weights (thin…fill, duotone) | via our codegen | Same family as Studio; ~75 brand logos |
| `lucide-static` | ISC | ~1,600 | stroke, adjustable width | yes, exports strings | No brand logos by policy |
| `astro-icon` (Iconify) | — | any set | any | `.astro` only | Bundles whole sets in server output without `include` |
| `unplugin-icons` | MIT | all Iconify | any | `?raw` at build | Needs a bundler step |
| `@iconify-json/*` + `@iconify/utils` | per set | 200k+ | any | yes (`iconToSVG`) | Good for codegen |
| `simple-icons` | CC0, per-icon licenses vary | 3,400+ brands | fill | yes | Dropped LinkedIn in v14; brands can ask removal |
| Tabler | MIT | 6,000+ | stroke + filled | via codegen | Large, no Studio match |
| Heroicons | MIT | ~300 | outline/solid | via codegen | Small, no brands |

Sources: https://github.com/phosphor-icons/core · https://lucide.dev/guide/packages/lucide-static · https://lucide.dev/brand-logo-statement · https://github.com/natemoo-re/astro-icon · https://github.com/unplugin/unplugin-icons · https://iconify.design/docs/libraries/utils/icon-to-svg.html · https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md · https://shields.io/blog/simple-icons-14 · https://github.com/tabler/tabler-icons · https://github.com/tailwindlabs/heroicons

## Accessibility
- **Decorative** (next to text): `aria-hidden="true" focusable="false"`, no `<title>`. https://www.w3.org/WAI/tutorials/images/decorative/
- **Icon-only buttons and links**: the name goes on the control (`aria-label` or hidden text), the SVG stays hidden; labelling the SVG fails in some screen readers. https://www.sarasoueidan.com/blog/accessible-icon-buttons/
- `fill="currentColor"`, `width/height="1em"`; check `forced-colors`. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
- **RTL**: directional icons (arrows, chevrons, back, external, send) mirror under `[dir=rtl]`; logos, checks and clocks do not.

## Decisions
1. **Phosphor** (`@phosphor-icons/core`, MIT): the same family as Studio, so previews and the admin match; six weights let a theme choose a feel as a token; brand logos in the same style.
2. **Social icons from Phosphor** (11 of our 12 networks). **Bluesky** from simple-icons (`siBluesky`) after checking its per-icon license, until Phosphor has one. Logos are monochrome in `currentColor`, never recoloured or distorted, and only link to the owner's own profiles.
3. **Delivery: inline SVG strings** from a generated, versioned TS map in `@cloudhal/core-ts/icons` (no JavaScript, no request, CSP unchanged, Worker-safe, works in `.astro` and in surfaces). A codegen script reads an allow-list, runs svgo and writes the map; `pnpm drift` covers it. Same-page `<symbol>`/`<use>` dedupe later, for repeated icons.
4. **Semantic names, a curated set of about 96**: interface (≈20: `menu`, `close`, `search`, `chevron-down`, `arrow-right`, `external`…), actions and status (≈25: `check`, `info`, `warning`, `download`, `copy`, `share`…), content and topics (≈35: `mail`, `phone`, `map-pin`, `calendar`, `clock`, `star`, `heart`, `quote`, `play`…) and social (the 12 `SocialLink` networks). Names are the contract, so a theme can swap the drawings later.
5. **`IconName` lives in `@cloudhal/core-ts/icons` for now** (revised in RFC-0026): icons sit in surface props, which the catalog checks, and no contract field uses them yet; the enum joins `common.schema.json` when one does (menu item icons, for example).
6. **Catalog**: an `Icon` primitive (`name`, `label?`, `size`, `tone`); `icon` on `Button` (with `iconPosition`), `Badge` and `Stat`; list markers. Icons are decorative unless given a label; a Button keeps its label as the accessible name. `catalogPrompt` lists the names by group; a repair suggests the nearest name.
7. **Themes**: phase 1 picks a Phosphor weight (regular, light, bold, fill) as a design token, with one map per weight behind its own subpath; phase 2 lets a theme package supply its own drawings for the same names.

## Rollout (RFC-0026)
1. Contract `IconName`, `core-ts/icons` (`renderIcon`), regular weight; replace the theme's hand-drawn menu, caret and close icons; footer social links become labelled icon links.
2. Catalog: `Icon`, `icon` on Button, Badge and Stat, list markers; prompt, checks and repair; RTL and forced-colors CSS.
3. The weight token and per-weight subpaths; optional same-page dedupe.
4. Theme-supplied icon maps; Studio pickers use the same names.
