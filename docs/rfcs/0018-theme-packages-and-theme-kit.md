# RFC-0018: Theme packages and the theme kit — many themes, one engine, generator-ready
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-15
- Related:
  - RFC-0001 (`Site.theme`: `ThemeRef { name, version, config }`);
  - RFC-0015 / ADR-0030 (block registry; `src/blocks.ts`);
  - RFC-0017 / ADR-0031 (design settings, `GeneratorPlan`, `apply_plan`; D1: the generator writes data, never code);
  - RFC-0019 (bylines, corrections, search: the first features delivered through the kit);
  - **RFC-0020 (agentic build and generative UI): the centre of the design.** This RFC is the theme layer under it. A theme supplies RFC-0020's component catalog and renders it.
  - RFC-0006 / RFC-0007 / RFC-0008 / RFC-0004 (analytics, comments, time gates, media: the plumbing every theme repeats today);
  - `docs/design/starter-references.md` (competitor survey).
- References: see §References at the end.

## Summary
- **Where this fits.** RFC-0020 makes building a live, streamed conversation that writes generative UI surfaces. This RFC defines what a theme gives that loop: a catalog of components with their renderers, settings, styles, templates and presets, packaged so many authors can ship themes and every theme gets platform fixes.
- **A theme becomes a package** with a data-only manifest (name, version, settings, block types, templates, section styles, presets) and Astro templates. It plugs into `cloudhal()` and injects the site's routes. A project can be just configuration, or keep the theme in `src/` as today ("local theme"), and `cloudhal theme eject` turns one into the other.
- **The theme kit** (`@cloudhal/astro-renderer/kit`) turns a request into a typed view — page, article, archive, search — and does every platform duty itself: redirects, gates, cache tags, comments, embeds, menus, SEO. Templates only draw. Platform fixes reach every theme with an `npm update`, instead of living in copies of a 250-line route file.
- **The generator gets a richer vocabulary**, still data only: data blocks that list entries, page templates, section styles (width, tone, spacing, motion) and presets (named starting points that are `GeneratorPlan`s). Landing pages, motion pages, blogs and newsrooms are compositions of these, never generated code.

## Motivation
- **More themes are coming, from more authors.** Today a theme is the starter copied into the project. Its `src/pages/[...path].astro` holds about 200 lines of platform logic: route resolution, redirects and 410s, time-gate notices, comment threads, media context, embed CSP headers, cache tags, menus and derived navigation. A second theme would copy all of it. A fix to any of it (a new cache tag, a new gate) never reaches existing projects, because the copy is theirs.
- **Theme authors need a stable contract, not internals.** What a template may rely on — the shape of an article, a list item, an archive — is implicit today and changes with the renderer.
- **The generator needs more than blocks and colors.** RFC-0017 writes settings and pages of registry blocks. A newsroom front page needs blocks that *list entries* (a lead story, topic rails). A landing page needs full-width bands with tones and entrance motion. A theme needs named starting points ("Newsroom", "Magazine", "Product launch") that the generator refines. None of these exist yet.
- **Mature systems converged on the same shape.** Shopify OS 2.0 (JSON templates, section schemas, presets, theme settings), WordPress block themes (`theme.json`, style variations, patterns, templates) and Astro Starlight (a theme as an integration, component overrides, a route-data view model) all separate *data the platform validates* from *templates the author writes*. Cloudhal's settings and block registry already follow that split; this RFC completes it.

## Proposal

### 1. The theme manifest (data only)
Every theme has one manifest. It is data with type imports only, like `src/blocks.ts` and `src/settings.ts` today, so the CLI, the admin Worker, Studio and agents read it without the theme's dependencies.
```ts
// @cloudhal/core-ts/theme (Worker-safe)
export interface ThemeManifest {
  name: string;                    // slug, matches Site.theme.name
  version: string;                 // semver of the theme package
  engine: 1;                       // theme kit major version it targets (§3)
  title: Localized;
  description?: Localized;
  locales: readonly string[];      // UI strings the theme ships ("en", "tr")
  settings?: PropsSchema;          // RFC-0017 §1, unchanged
  blockTypes?: readonly BlockType[];        // RFC-0015 §6, plus data blocks (§4)
  catalog?: CatalogDef;            // RFC-0020 §2: primitives it renders or omits, its own components, catalog major
  templates?: readonly TemplateDef[];       // §5
  sectionStyle?: PropsSchema;      // §6
  styles?: readonly ThemeStyle[];           // §8: named looks (partial settings)
  presets?: readonly ThemePreset[];         // §8: named starting points (plans)
  readingSpeed?: number;           // words per minute for readingTime (default 230)
}
export interface TemplateDef {
  name: string;                    // slug: "default", "landing", "wide", "feature"
  title: Localized;
  description?: Localized;
  for: readonly ("page" | "entry")[];
}
```
- `src/blocks.ts` and `src/settings.ts` keep working. A manifest may import them, and a project without a manifest gets one built from them (`name` from `Site.theme.name`, `engine: 1`).
- `cloudhal theme check` (§9) validates the manifest, and every command that loads it today (`studio`, `mcp`, `deploy`) loads it through one function.
- **Keys are public API.** A setting, style key, template or block prop that sites have stored is part of the theme's interface. Renaming or removing one is a major version of the theme, and it ships a rename map (`migrations: { "accent": "brand" }`) that the store applies when the new version is deployed. Ghost drops a site's saved value when a key is renamed; Cloudhal keeps it and flags it instead.

### 2. Packaging: a theme is an integration
```js
// astro.config.mjs of a project using a packaged theme
import { cloudhal } from "@cloudhal/astro-renderer/integration";
import blog from "@cloudhal/theme-blog";
export default defineConfig({
  integrations: [cloudhal({ siteId, dataDir, theme: blog({
    overrides: { Header: "./src/components/Header.astro" },   // optional, Starlight-style
  }) })],
});
```
- **What a theme package exports:**
  - `default(options) → CloudhalTheme`: its manifest, its route entry points (`[...path]`, `rss.xml`, `[...path]/rss.xml`, `sitemap.xml`, `robots.txt`, and `search` from RFC-0019), its CSS entry, and a map of **named, overridable components** (`Header`, `Footer`, `ArticleHeader`, `EntryCard`, `Byline`, …).
  - `./manifest`: the manifest for the CLI.
- **Routes are injected** by `cloudhal()` with Astro's `injectRoute`. A project can still add its own files in `src/pages`. Astro ranks a static path such as `/press` above the theme's catch-all `[...path]`, so the project's page answers there.
- **Mandatory platform slots.** Every layout renders the kit's `<CloudhalHead view>` inside `<head>` and `<CloudhalFoot view>` before `</body>`. They own the SEO tags, JSON-LD, theme variables, the view-transition opt-in and Cloudhal's first-party scripts (analytics, comments, player), so CSP and SEO never depend on each theme getting them right. `theme check` fails a layout without them, as Ghost's gscan does for `{{ghost_head}}`.
- **CSS layers and tokens.** The kit's base rules sit in `@layer cloudhal`, the theme's in `@layer theme`, and project overrides are unlayered, so overrides win without specificity contests. Settings become `--ch-{group}-{name}` variables (`--ch-color-brand`, `--ch-space-m`), the convention WordPress uses for `theme.json` presets.
- **Overrides** replace one named component with a project file that receives the same props. This is the supported way to customise a packaged theme without forking it, and the props of every named component are part of the theme's public API (semver).
- **Local themes** (today's model) stay first-class: the routes live in `src/pages` and call the same kit. `cloudhal theme eject` copies a package's templates into `src/`, rewrites `astro.config.mjs`, and keeps the manifest.
- **One theme per deployment.** `cloudhal deploy` bundles one theme. `Site.theme.name` and `version` record what a site was designed for. Studio warns when they differ from the deployed manifest, and settings are validated against the deployed one (unchanged from RFC-0017).
- **`cloudhal init --theme <pkg> [--preset <name>]`** creates a project for a theme package. The default stays the blog theme.

### 3. The theme kit (engine 1)
`@cloudhal/astro-renderer/kit` is the contract between Cloudhal and theme authors. Everything a template reads comes from it, and its types are semver'd as the **engine**.
```ts
// in a route file of any theme
const view = await loadView(Astro, config, theme);   // ThemeView | Response
if (view instanceof Response) return view;           // redirects, 404, 410, 503
```
`loadView` does what the blog route does by hand today:
- resolve the route;
- answer redirects and gones;
- load comments, media, menus or derived navigation, and gate notices;
- set cache tags and the embed header;
- build SEO head data.

It returns one of:
```ts
type ThemeView = PageView | EntryView | ArchiveView | SearchView;   // SearchView: RFC-0019
interface Chrome {                          // shared by every view
  site: Site; locale: string; meta: HeadMeta; settings: ThemeLook;  // themeVariables (RFC-0017)
  nav: ActiveNavItem[]; footer?: ActiveNavItem[]; notice?: GateNotice;
  strings: KitStrings; search: boolean; template: string;           // §5
}
interface EntryView extends Chrome {
  kind: "entry";
  entry: ContentEntry; card: EntryCard;     // the article's own card (below)
  header: { kicker?: TermLink; title: string; dek?: string;
            bylines: Byline[]; published?: string; updated?: string; readingMinutes: number };
  cover?: Figure; toc: TocItem[]; body: BodyParts;   // BodyParts renders through <Body/>
  terms: EntryTaxonomy; related: EntryCard[]; prevNext: { prev?: EntryCard; next?: EntryCard };
  corrections: Correction[];                // RFC-0019
  comments?: CommentsView;
}
interface EntryCard {                       // every list in every theme draws these
  id: string; href: string; title: string; dek?: string; kicker?: TermLink;
  cover?: Figure; published?: string; readingMinutes: number; bylines: Byline[];
}
```
- **Renderer additions** the kit needs:
  - Markdown headings get stable `id`s: slugified, deduplicated, and never colliding with Cloudhal's own ids. This makes a table of contents and deep links possible without JavaScript.
  - `toc(body)` for `h2` and `h3`.
  - `readingTime(entry, wpm)`, which counts body words and adds time for images.
  - `entryCard(entry, index, media)`.
- **Strings.** The kit ships the strings every theme needs, in English and Turkish: dates, "min read", pagination, gate notices and comment labels. A theme overrides or adds strings per locale.
- **Stability.** `engine: 1` freezes these shapes. Additive fields are minor releases. A breaking change is `engine: 2`, and the kit supports the previous engine for one major release of Cloudhal.

### 4. Data blocks (entries in blocks)
> RFC-0020 §3 generalises this. In a surface, entries are a data source (`$source: "entries"`) that any component can bind to. Data blocks remain as a shorthand: a registry block with `source: "entries"` gets the same resolution when it is used outside a surface.

A block type may declare that it lists entries:
```ts
interface BlockType {
  // …RFC-0015 fields…
  source?: "entries";   // new: the type has a `query` prop and receives `entries: EntryCard[]`
}
// the `query` prop is added by the registry (like `content` for markdown blocks):
// { collection: string; filter?: string; sort?: "newest" | "oldest" | "title"; limit: 1..50; offset?: 0..50 }
```
- **Store checks.** The `query` prop is checked on write: the collection must exist and the filter must parse (RFC-0002 filter syntax). A bad query is refused with 422 `invalid_props`.
- **Rendering.** The kit resolves every data block on a page in one pass, from the same source the page renders from (live in dev, the published snapshot on the site). Drafts never leak into public lists. The kit adds the right list and node cache tags.
- **Empty state.** A data block with no matching entries gets `entries: []` and the kit's localized empty text. On the public site it renders nothing unless the type opts in with `emptyState: true`.
- **Built-in data block `post-list`** (category `data`), with `layout: list | grid | lead | river`, `title?`, `showImages`, `showDek`, `showBylines` and the `query`. It supersedes `contentList` for new pages. `contentList` keeps rendering for existing ones.
- **Placement rules** (machine-readable, enforced by the store like props), for every block type, not only data blocks:
  - `templates?`: the templates the type may appear on (Shopify's `enabled_on`).
  - `limit?`: the most per page (a lead story: 1).
  - `private?`: hidden from Studio's picker and `list_block_types`; used only inside presets.
- **Themes add their own**, for example `topic-rail` (one featured card plus links), `lead-story` (one big story with three beside it) or `latest-river`. The generator learns them from `list_block_types` like any other type.

### 5. Templates (contract change)
`Page` and `ContentEntry` gain an optional `template` (Slug):
- The theme lists its templates in the manifest. The kit puts `view.template` in the chrome, and the theme's route picks the layout: `landing` without the article chrome and with full-bleed bands, `feature` with a large cover, `wide` for data-heavy pages.
- Unset means `default`. A template the deployed theme does not declare renders as `default` and is flagged in Studio, never rewritten (the rule RFC-0015 uses for blocks).
- The generator and agents choose a template per page from the manifest (`get_theme` returns it, §7).

### 6. Section styles (contract change)
Every `Section` variant gains an optional `style`: a declared map of at most 8 scalar values, validated against the manifest's `sectionStyle` schema (the props subset) on write.
```ts
// a typical sectionStyle a theme declares
{ width:   { enum: ["narrow", "wide", "full"] },
  tone:    { enum: ["surface", "muted", "brand", "inverse"] },
  spacing: { enum: ["s", "m", "l", "xl"] },
  motion:  { enum: ["none", "fade", "rise", "scale", "reveal"] },
  anchor:  { type: "string", pattern: "^[a-z][a-z0-9-]{0,40}$" } }   // in-page links
```
- The kit renders values as `data-ch-*` attributes on the section's wrapper, the same way `themeVariables` does for site settings. The theme's CSS gives them meaning.
- No value reaches CSS as text: only enums and bounded numbers pass, and `anchor` becomes an `id` after the pattern check.
- Tones are checked against the theme's contrast rules (RFC-0017 `x-contrast`), extended to per-tone pairs.

### 7. Motion as data, CSS only
Motion is the theme's CSS, switched by data. There is no script and no CSP change.
- **Site setting** `motion: off | subtle | expressive`, declared in the theme's settings. Per-section `style.motion` picks a preset.
- **Entrance and scroll effects** use CSS scroll-driven animations (`animation-timeline: view()`) inside `@supports` and `@media (prefers-reduced-motion: no-preference)`. Appear effects use `@starting-style`.
- **Page transitions** are an opt-in setting that emits cross-document View Transitions (`@view-transition { navigation: auto; }`).
- **Progressive by rule.**
  - A browser without support shows the finished, static page.
  - Reduced motion always wins.
  - Content is never hidden waiting for an animation; the start state is applied only inside the support query.
- The generator chooses presets and the site setting. It never writes keyframes. A "motion landing page" is a `landing` template with bands whose `style.motion` is set.
- MCP: `get_theme` (`content:read`) returns the manifest's templates, section style, block types, settings schema and presets, so agents compose with the theme's whole vocabulary in one read.

### 8. Styles and presets
**Styles** are named looks: partial overlays of the theme's settings, like Shopify's theme styles and WordPress's style variations ("Classic", "Ink", "Midnight").
```ts
interface ThemeStyle { name: string; title: Localized; values: Record<string, unknown>; preview?: string }
```
- **The site stores a reference, not a copy.** `Site.theme.config` holds `style: "<name>"` plus only the values the site changed. `style` is a reserved key, so a theme's settings may not declare it, and the store checks its value against the deployed manifest's styles. The look is resolved in order: the defaults, then the style, then the site's own values. When the theme updates a style, sites using it follow. WordPress copies a chosen variation into the database, so theme updates never reach those sites.
- Styles may set only presentational settings (colors, type, corners, density, motion). `theme check` enforces this and checks every style against the contrast rules.

A **preset** is a named starting point that is exactly a `GeneratorPlan` (RFC-0017 §2) plus the taxonomies it needs:
```ts
interface ThemePreset {
  name: string; title: Localized; description?: Localized;
  plan: GeneratorPlan;                       // settings, pages, menus, notes
  taxonomies?: ("author")[];                 // RFC-0019 bylines, created when missing
  style?: string;                            // a ThemeStyle to select
  intent: readonly ("blog" | "newsroom" | "magazine" | "landing" | "motion" | "docs" | "portfolio" | "shop")[];
  keywords?: readonly string[];              // retrieval metadata for the generator (WordPress pattern headers)
  preview?: string;                          // path of a screenshot in the theme package
}
```
- **Where presets apply:**
  - `cloudhal init --preset newsroom`;
  - Studio's "Start from a preset" (Appearance), shown with previews;
  - `apply_plan { preset: "newsroom" }`.
- Presets apply as drafts, like any plan (RFC-0017 D2), so a person reviews and publishes.
- **The generator's first step is choosing a preset**, then editing its plan for the brief. A theme's presets are how its author tells agents what it does well.
- **Budgets** bound both page weight and runaway agents: at most 30 sections per page (RFC-0017's cap), 64 props per block and 50 entries per data block. Shopify enforces similar per-template limits.
- **Presets hold no entries.** Demo content is a separate seed (`cloudhal seed demo`, §10), so a preset never fills a real site with fake articles.

### 9. Theme validation: `cloudhal theme check`
`cloudhal theme check` plays the role of Ghost's gscan and Shopify's Theme Check. It runs in CI for official themes and is required for listing in a future registry. It checks:
1. The manifest schema, the props subset of `settings`, `sectionStyle` and every block type, and the contrast rules.
2. Every block type, template and named component has an implementation, and every declared locale has every kit and theme string.
3. Every preset validates as a plan against the theme's own registry and templates.
4. **Gate.** `cloudhal deploy` runs checks 1–3 and refuses to deploy on a fatal issue. Ghost refuses to activate a theme that gscan fails.
5. **Render smoke.** The demo seed is rendered with each preset at 390 and 1440 px. It fails on console errors, horizontal scroll, axe-core violations of WCAG 2.2 AA, client JavaScript outside Cloudhal's own, CSS over 60 KB (gzip) and images without `alt`.

### 10. Official themes and the demo seed
- **`@cloudhal/theme-blog`**: the current starter, rebuilt on the kit. Presets: `blog` (today's look), `magazine` (grid, covers) and `newsroom` (lead + rails, topic sections, bylines, corrections).
- **`@cloudhal/theme-landing`** (later): `landing` and `feature` templates, band blocks (`feature-grid`, `stats`, `logo-cloud`, `cta-band`, `pricing-table`) and motion presets.
- **`starters/blog`** becomes a thin project that depends on `@cloudhal/theme-blog`.
- **`cloudhal seed demo`** writes a demo site: about 24 articles across categories, with authors, covers made by the CLI (generated gradient PNGs with no external fetch), corrections and a long read with a table of contents. It is used by `theme check`, the screenshots and live demos.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Keep copying starters (status quo) | Simple, full control | Platform fixes never reach projects; every theme re-implements ~200 lines | The core problem this RFC solves |
| Themes as data only (a `theme.json` with no templates) | Generator can write whole themes | Theme authors cannot express layout; looks converge | Data for choices, code for drawing; WordPress still has templates |
| A template DSL (Liquid-like) instead of Astro | Sandboxable, uploadable | A second language; loses Astro components and tooling | Astro is the renderer already; sandboxing is a registry concern |
| `contentList` variants in the contract (`layout` enum) | Typed | A contract change per layout; themes cannot add their own | Data blocks are the registry's extension point |
| Motion through a JS library | Rich timelines | Client script, CSP change, performance cost | Threat model promise 4; CSS covers entrance, scroll and page transitions |
| Style variations copied into the site (WordPress) | Site owns its look | Theme fixes and new tokens never reach the site | Reference plus diff (§8) |
| Generated block code (Shopify Sidekick blocks) | Any block on request | Code from a prompt; files drift from the repository | RFC-0017 D1: generators write data; new block code is a developer's commit |
| Several themes per deployment, chosen per site | Theme switching without deploy | Bundle size, test matrix, Cloud-only need | Later RFC for Cloud; one theme per deployment now |
| Free-form CSS variables per section | Flexible | CSS injection, unreadable pairs | Typed `style` with contrast rules (RFC-0017's rule) |
| Presets with sample entries | Instant full site | Fake articles in real sites | Separate demo seed |

## Compatibility & migration
- **Contracts (additive, optional).** `Page.template`, `ContentEntry.template` and `style` on every `Section` variant (a declared map, as hard rule 2 allows). `schemaVersion` stays 1, and fixtures and `pnpm gen` cover TS and Rust.
- **Interfaces.** `BlockType.source`, `ThemeManifest`, `loadView` and the kit types are new public API in `@cloudhal/core-ts` and `@cloudhal/astro-renderer`, so they need changesets.
- **Existing projects.** A local theme keeps working untouched. Its route file can adopt `loadView` line by line, since the kit uses the same helpers the route calls today. `contentList` keeps rendering, and Studio offers "convert to post list".
- **Starter.** `starters/blog` moves to the package in phase 18b. Projects created before keep their local copy.
- **Rollback.** Every part is additive. Removing a template or style value leaves the stored data flagged, not broken.

## Security & policy impact
- **Theme packages are code**, installed by developers through npm and reviewed like any dependency. Agents and the generator cannot install, switch or edit themes. They choose presets, templates, styles and settings, all data validated against the deployed manifest. `theme check` is quality tooling, not a malware scan. A future registry adds signing.
- **No new client script and no CSP change.** Motion is CSS. Data blocks render on the server.
- **Data blocks** read only what the page's source can read: published content on the site, live content in previews. Queries are capped at 50 entries and a 200-character filter, and checked on write.
- **Scopes.** `template` and `style` changes are content writes (`content:write`), like the sections they sit on. `get_theme` is `content:read`. Applying a preset follows `apply_plan` (RFC-0017 §3).

## Phases
| Phase | Scope | Contract |
|---|---|---|
| 18a | Kit: `loadView`, views, `EntryCard`, heading ids, `toc`, `readingTime`, kit strings; blog starter on the kit with article header, byline, ToC, cards, wide layout, color scheme | none |
| 18b | Manifest, `defineTheme`, injected routes, overrides, `@cloudhal/theme-blog`, `cloudhal theme eject`, `get_theme` | none |
| 18c | Data blocks: `source: "entries"`, `post-list`, kit resolution, Studio query form | none |
| 18d | Templates and section styles | `Page.template`, `ContentEntry.template`, `Section.style` |
| 18e | Presets, `cloudhal init --preset`, Studio "Start from a preset", `cloudhal seed demo`, `cloudhal theme check` | none |
| 18f | Motion presets, page transitions, `@cloudhal/theme-landing` | none |

## Open questions
1. **Default for `cloudhal init`.** Should a new project get the packaged theme, with ejection when wanted, or keep the local copy? Default: packaged theme. Ejecting is one command, and updates reach the project.
2. **Where the kit lives.** A subpath of `@cloudhal/astro-renderer` or its own package? Default: the subpath `./kit`, versioned with the renderer and with its own `engine` number.
3. **`style` on every section or only `component` sections?** Default: every section, so legacy heroes can also take tone and motion.
4. **Templates on entries.** Should entries get `template` now, or only pages? Default: both. `feature` long reads are an entry template.
5. **Demo covers.** Should the CLI generate gradient covers, or ship a small set of CC0 photos in the repository? Default: generated covers (no licence questions, no network).
6. **Child themes.** Should a theme be able to extend another (Hugo-style lookup: project, then child, then base)? Default: not in this RFC. Overrides cover sites; a later RFC adds `extends` if theme authors need it.
7. **Engine support window.** Is one Cloudhal major release of overlap enough for theme authors? Default: yes, with a deprecation notice from `theme check`.

## References
Theme systems (checked 2026-10-15):
- Shopify — JSON templates: https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates · section schema and presets: https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema · theme blocks: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks · settings: https://shopify.dev/docs/storefronts/themes/architecture/settings · Theme Check: https://shopify.dev/docs/storefronts/themes/tools/theme-check
- WordPress — `theme.json`: https://developer.wordpress.org/themes/global-settings-and-styles/ · style variations: https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/ · patterns: https://developer.wordpress.org/themes/patterns/
- Astro Starlight — overriding components: https://starlight.astro.build/guides/overriding-components/ · route data: https://starlight.astro.build/guides/route-data/ · plugins: https://starlight.astro.build/reference/plugins/ · Astro `injectRoute`: https://docs.astro.build/en/reference/integrations-reference/#injectroute-option
- Ghost — custom settings: https://docs.ghost.org/themes/custom-settings/ · gscan: https://github.com/TryGhost/gscan
- Shopify — limits: https://shopify.dev/docs/storefronts/themes/architecture/limits · theme styles (`settings_data.json` presets): https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json · block targeting: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/targeting · Theme Store requirements: https://shopify.dev/docs/storefronts/themes/store/requirements · AI block generation: https://changelog.shopify.com/posts/ai-block-generation-for-all-theme-store-themes
- WordPress — section styles (6.6): https://developer.wordpress.org/news/2024/06/styling-sections-nested-elements-and-more-with-block-style-variations-in-wordpress-6-6/ · starter patterns: https://developer.wordpress.org/themes/patterns/starter-patterns/ · Query Loop and core blocks: https://developer.wordpress.org/block-editor/reference-guides/core-blocks/ · theme review rules: https://make.wordpress.org/themes/handbook/review/required/
- Ghost — theme structure and required helpers: https://docs.ghost.org/themes/structure
- Hugo — theme components: https://gohugo.io/hugo-modules/theme-components/ · lookup order: https://gohugo.io/templates/lookup-order/
- Framer scroll effects (motion as panel data): https://www.framer.com/learn/scroll-effects/
- Browser support (caniuse, 2026-10): `animation-timeline: view()` ~88% (Chrome 115, Safari 26, Firefox 161): https://caniuse.com/mdn-css_properties_animation-timeline_view · `@starting-style` ~93%: https://caniuse.com/mdn-css_at-rules_starting-style · cross-document view transitions ~89%: https://caniuse.com/cross-document-view-transitions · scroll-driven animations guide: https://developer.chrome.com/docs/css-ui/scroll-driven-animations · WCAG 2.3.3: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
- CSS motion — scroll-driven animations: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations · `@starting-style`: https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style · cross-document view transitions: https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition · `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
