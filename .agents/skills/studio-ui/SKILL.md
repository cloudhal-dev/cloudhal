---
name: studio-ui
description: Build or change Cloudhal admin UI (Studio, capability panels, docs UI) using Kumo via @cloudhal/ui. Use for any React component, page or block in apps/studio or packages/ui. Not for visitor-facing sites (those use the theme system, not Kumo).
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:studio"
---

# Studio UI

**Read first:** `docs/design/DESIGN.md` (binding) and the official `kumo-design` skill in `.agents/skills/kumo-design`. Every file you write in `apps/studio/src` or `packages/ui/src/blocks` is checked by `apps/studio/scripts/design-lint.ts` — in CI, with `pnpm design:lint`, and by the Claude Code hook right after each edit. Do not work around a rule; fix the code or add a block to `@cloudhal/ui`.

Stack (ADR-0003): Vite 8 + React 19 SPA, TanStack Router + Query, Tailwind 4, **Kumo** (`@cloudflare/kumo` 2.x on `@base-ui/react`, Phosphor icons) consumed only through `@cloudhal/ui`. Cloudhal is a premium, community-facing product: use Kumo's components and blocks, not hand-rolled markup.

## Workflow (every UI change)
1. **Look it up, don't guess:** `pnpm kumo ls` (53 components), `pnpm kumo doc <Name>` (props, sub-components, examples), `pnpm kumo blocks` / `pnpm kumo add <Block>` (copied into `packages/ui/src/blocks/kumo`, owned by us), `pnpm kumo ai` (usage guide). Registry: `packages/ui/node_modules/@cloudflare/kumo/ai/component-registry.json`.
2. **Pick the template** (DESIGN.md §2) and register a new route in `ROUTE_TEMPLATES` (`apps/studio/scripts/design-lint.ts`): `list`, `dashboard`, `settings`, `editor`, `auth`, `shell`. Copy the reference screen: `SitesPage` (list + aside), `PagesPage` (list), `SiteOverviewPage` (dashboard), `LoginPage` (auth).
3. **Compose from blocks:**
   - page → `PageLayout` (`crumbs` from `Crumbs`/`SiteCrumbs`, `title`, `description`, `actions` for the primary action, `tabs` only for sub-views, `aside` for usage/help, `width="narrow"` for forms). Never your own container, header, breadcrumbs or columns.
   - sections → `SectionCard` (`title`, `icon`, `actions`, `description`, `flush` for tables, `footer` for Save); settings → `SettingsLayout` + `SettingsSection`; never nest cards.
   - lists → `ListToolbar` + `LayerCard p-0` + `Table` (+ `TableSkeleton` inside `<Table>`) + `Pagination`; empty → a bare `Empty` in the table's place (it has its own frame); empty inside a card/cell/dialog → `SectionEmpty`.
   - two-column bodies → `Columns` (container-aware), never Kumo `Grid variant="2-1|1-2"`.
   - summaries / quoted agent text inside a card or dialog → `InsetPanel` (`outline`, `recessed`).
   - forms → `Input`/`InputArea`/`Select`/`TagInput`/`InputGroup` with their own `label`/`description`/`error`; passwords → `PasswordField`; `className="w-full"` in cards.
   - messages → `Banner`; confirmations → `ApprovalDialog`, `DeleteResource`, `ConfirmDialog`; forms in overlays → `LayerDialog`; menus → `DropdownMenu`; actions → `Button` (`icon`, `loading`, `variant`), `ButtonGroup`, `Toolbar`.
4. **Nothing fits?** Build it in `packages/ui/src/blocks` (export it from `src/index.ts`, follow the same rules, add it to DESIGN.md §6), then use it. Screens never grow private visual primitives.
5. **Verify:** `pnpm design:lint`, `pnpm --filter @cloudhal/studio test`, then `STUDIO_EMAIL=… STUDIO_PASSWORD=… pnpm design:shots -- <routes>` (local test account; 1440 and 390 px, fails on sideways scroll or console errors) and look at every PNG: edges aligned with the page header, one control height per row, no nested cards.

## Kumo design rules (kumo-design skill — the lint enforces the mechanical ones)
- 14px content text; 16px+ only headings (titles come from `PageLayout`/`SectionCard`). Sentence case, never `uppercase`. Never `font-bold` (`<Text bold>`), never `tracking-*`.
- Related text closer together than unrelated (`gap-1.5` inside a title/description pair, `gap-6` between groups); optically balance padding (`px-5 py-4`, never `p-5`).
- No hover colour transitions. No borders with drop shadows: `ring ring-kumo-line`; concentric radii when nested.
- Never stack `LayerCard`/`SectionCard`. Never conditionally render dialogs — control `open`.
- Semantic tokens only (`bg-kumo-base`, `text-kumo-subtle`, `text-kumo-danger` …); no raw Tailwind colours; no `dark:`; no arbitrary `[..px]` values in screens; merge classes with `cn()`.
- Icons from `@phosphor-icons/react` only (16 px inline/nav, 24 px list-page title, 48 px `Empty`), aligned with the first line of text; icon-only buttons need `aria-label` and `shape="square"`.

## Cloudhal rules
- Import only from `@cloudhal/ui` (Biome blocks `@cloudflare/kumo` and `@base-ui/react` in apps). Kumo blocks live in `packages/ui/src/blocks/kumo` (lint/format disabled there).
- Routing: Kumo `href`s go through `LinkProvider` → TanStack Router (`AppLink`); use `href` on `Sidebar.MenuButton`, `Breadcrumbs.Link`, `Link`, `LinkButton`.
- Navigation lives in the sidebar; page tabs never repeat it. Surface-wide actions (Publish) live in the top bar (`AppFrame actions`).
- Lifecycle changes are explicit actions (`StatusActions`), never a status `Select`; publishing always passes `ApprovalDialog`.
- Counts are ICU `plural` messages (`{count, plural, one {# file} other {# files}}`) called as `t(key, { count })`, never a `…One` key or a ternary on the count; choices of a fixed set are `select` (DESIGN.md §1 "Message syntax", RFC-0032).
- Every string through `useT()` with keys in `en.ts` and every registered language's `<locale>.ts` (`i18n/locales.ts`; page titles/descriptions under `pageHeaders.*`) — or, for a feature's own wording, in a **lazy namespace** (DESIGN.md §1): `i18n/lazy/<ns>.<locale>.ts` (found by name; its type in `i18n/namespaces.ts`), read with `useT("<ns>")`, loaded with its routes through `withMessages(import(…), ["<ns>"])` in `router.tsx`. `analytics.*`, `analyticsSettings.*`, `readers.*`, `comments.*` and `commentsSettings.*` live there; add their keys to the `lazy/` files, never to the core catalogs. New features with screens of their own start as a lazy namespace. Kumo's own strings follow the Studio language too (DESIGN.md §2v "Kumo locale"): `KumoLocaleProvider` covers dialogs only; a `DatePicker` always gets `{...calendarLocaleProps(locale, labels)}` (never the deprecated, English-only `DateRangePicker`); blocks take every word, including what Kumo would hard-code (chart loader, map legend), as labels. `TimeseriesChart`'s `tooltipTimestampFormat` exists only through `patches/@cloudflare__kumo@2.14.0.patch` — re-check it on every Kumo upgrade.
- Styles: `@import "@cloudhal/ui/styles.css"` once; root `class="isolate"`; app wrapped in `LinkProvider` → `TooltipProvider` → `Toasty`.
- Tests: Vitest + Testing Library on happy-dom with the ResizeObserver/matchMedia setup; test behaviour (actions, labels), not Kumo internals.

## References
- https://kumo-ui.com/installation · https://github.com/cloudflare/kumo (AGENTS.md, skills/kumo-design)
- `docs/adr/0003-studio-architecture.md`
