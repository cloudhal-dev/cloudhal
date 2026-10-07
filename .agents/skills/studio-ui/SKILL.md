---
name: studio-ui
description: Build or change Cloudhal admin UI (Studio, capability panels, docs UI) using Kumo via @cloudhal/ui. Use for any React component, page or block in apps/studio or packages/ui. Not for visitor-facing sites (those use the theme system, not Kumo).
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:studio"
---

# Studio UI

**Read first:** `docs/design/DESIGN.md` (binding) and the official `kumo-design` skill in `.agents/skills/kumo-design`. The design-rules test in `apps/studio/test/design-rules.test.ts` must stay green.

Stack (ADR-0003): Vite 8 + React 19 SPA, TanStack Router + Query, Tailwind 4, **Kumo** (`@cloudflare/kumo` 2.x on `@base-ui/react`, Phosphor icons) consumed only through `@cloudhal/ui`. Cloudhal is a premium, community-facing product: use Kumo's components and blocks, not hand-rolled markup.

## Before writing UI
1. Look up the real API: `pnpm --filter @cloudhal/ui exec kumo ls` and `… kumo doc <Component>`; registry: `https://kumo-ui.com/api/component-registry`; agent guide: `… kumo ai`.
2. Pick the Kumo building block first: page structure → `PageHeader` (ours, with `actions`) / `ResourceListPage`; lists → `LayerCard className="p-0"` + `Table`; nothing yet → `Empty` (icon, title, description, `commandLine`/`contents`); forms → `Input`/`InputArea`/`Select`/`TagInput` with their own `label`/`description`/`error` props (no custom Field); messages → `Banner`; confirmations → `ApprovalDialog` (ours) or `DeleteResource` (type-to-confirm); menus → `DropdownMenu`; navigation → `Sidebar.*`, `Breadcrumbs`, `Tabs`; actions → `Button` (`icon`, `loading`, `variant`), `ButtonGroup`, `Toolbar`.
3. Text: `Text` component — `variant="heading"` (+ `size="lg"` for page-level), body 14px, `bold` for emphasis; `mono-secondary` for ids/paths; `InlineCopyText` for copyable ids.

## Kumo design rules (from the kumo-design skill — enforce in review)
- 14px content text; 16px+ only headings. Sentence case headings. Never `font-bold` (use `font-semibold`/`bold`), never `tracking-*`.
- Related text closer together than unrelated (`gap-1.5` inside a title/description pair, `gap-6` between groups); optically balance padding (`px-5 py-4`).
- No hover colour transitions. No borders with drop shadows: `ring ring-kumo-line`; concentric radii when nested.
- Never stack `LayerCard` inside `LayerCard`. Never conditionally render dialogs — control `open`.
- Semantic tokens only (`bg-kumo-base`, `text-kumo-subtle`, `text-kumo-danger` …); no raw Tailwind colours; no `dark:` variants (Kumo switches via `light-dark()`); merge classes with `cn()`.
- Icons from `@phosphor-icons/react`, aligned with the first line of text; icon-only buttons need `aria-label` and `shape="square"`.

## Cloudhal rules
- Import only from `@cloudhal/ui` (Biome blocks `@base-ui/react`). Kumo blocks are copied with `pnpm --filter @cloudhal/ui exec kumo add <Block>` into `packages/ui/src/blocks/kumo` and owned by us (lint/format disabled there).
- Routing: Kumo `href`s go through `LinkProvider` → TanStack Router (`AppLink`); use `href` on `Sidebar.MenuButton`, `Breadcrumbs.Link`, `Link`.
- Lifecycle changes are explicit actions (`StatusActions`), never a status `Select`; publishing always passes `ApprovalDialog`.
- Every string through `useT()` with keys in `en.ts` + `tr.ts`; Kumo's own strings stay English until `KumoLocaleProvider` is wired.
- Styles: `@import "@cloudhal/ui/styles.css"` once; root `class="isolate"`; app wrapped in `LinkProvider` → `TooltipProvider` → `Toasty`.
- Tests: Vitest + Testing Library on happy-dom with the ResizeObserver/matchMedia setup; test behaviour (actions, labels), not Kumo internals.

## References
- https://kumo-ui.com/installation · https://github.com/cloudflare/kumo (AGENTS.md, skills/kumo-design)
- `docs/adr/0003-studio-architecture.md`
