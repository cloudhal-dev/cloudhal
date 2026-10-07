---
name: studio-ui
description: Build or change Cloudhal admin UI (Studio, capability panels, docs UI) using Kumo via @cloudhal/ui. Use for any React component, page or block in apps/studio or packages/ui. Not for visitor-facing sites (those use the theme system, not Kumo).
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:studio"
  cloudhal.status: "stack decided (ADR-0003); apps/studio and packages/ui land in Sprint 4"
---

# Studio UI

Stack (ADR-0003): Vite 8 + React 19 SPA, TanStack Router + Query, Tailwind 4 via `@tailwindcss/vite`, **Kumo** (`@cloudflare/kumo` 2.x on `@base-ui/react` 1.8, Phosphor icons). Visitor sites never load Kumo.

## Rules
1. Import primitives from `@cloudhal/ui` (the barrel over Kumo), never from `@base-ui/react` or another kit — Biome `noRestrictedImports` enforces it.
2. Kumo **components** come from npm; Kumo **blocks** (`PageHeader`, `ResourceListPage`, `DeleteResource`) are copied into `packages/ui/src/blocks` with `npx @cloudflare/kumo add <Block>` and then owned by us. Block names are case-sensitive.
3. Cloudhal blocks (`DiffViewer`, `SnapshotTimeline`, `PolicyBadge`, `AgentRunPanel`, `ApprovalDialog`) live in `packages/ui/src/blocks` and are the only place with product-specific composition.
4. Tailwind: `global.css` order is `@source` (Kumo dist) → `@import "@cloudflare/kumo/styles/tailwind"` → `@import "tailwindcss"`. App root gets `class="isolate"`. No `dark:` variants — Kumo uses `light-dark()`.
5. Everything is one React root; Dialog/Toast/Command Palette providers live at the app shell.
6. Accessibility: keyboard path for every action; `⌘K` command bar entries for every page-level action.

## Look things up, don't guess
- Component list and props: `npx @cloudflare/kumo ls` / `npx @cloudflare/kumo doc <Component>`; machine-readable: `https://kumo-ui.com/api/component-registry`.
- Kumo's own agent guide: `npx @cloudflare/kumo ai`.
- Expect 2.x deprecations (e.g. `MenuBar` → `Tabs`); run `npx @cloudflare/kumo migrate` after upgrades.

## References
- https://kumo-ui.com/installation · https://github.com/cloudflare/kumo (AGENTS.md, CLI source)
- `docs/adr/0003-studio-architecture.md`
