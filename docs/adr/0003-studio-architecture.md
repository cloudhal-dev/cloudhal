# ADR-0003: Studio is a Vite React SPA on Kumo; Astro only renders sites
- Status: Accepted (supersedes the initial "Astro + React islands" assumption)
- Date: 2026-10-07
- Sources: https://github.com/cloudflare/kumo · https://kumo-ui.com/installation · https://kumo-ui.com/api/component-registry · https://docs.astro.build/en/guides/integrations-guide/react/ · https://ui.shadcn.com/docs/changelog

## Context
The initial plan proposed Astro + React islands for Studio with Kumo UI. Verified today: React context does not cross Astro islands (Kumo's portal/toast/command-palette providers cannot be shared), children from `.astro` into React arrive as strings, and an interactive admin degenerates into one `client:only` island per page. Kumo is MIT, `@cloudflare/kumo` 2.14 on `@base-ui/react` 1.8, Tailwind 4, Phosphor; it ships a machine-readable component registry and CLI.

## Decision
`apps/studio` is a **Vite 8 + React 19 single-page app** (TanStack Router + Query, Tailwind 4 via `@tailwindcss/vite`), served as static assets from a Worker next to the API. **Kumo** is the component layer, consumed only through `packages/ui` (`@cloudhal/ui`): Kumo components from npm, Kumo blocks copied in and owned, Cloudhal blocks (DiffViewer, SnapshotTimeline, PolicyBadge, AgentRunPanel, ApprovalDialog) built on top. Direct `@base-ui/react` imports are lint errors. **Astro 7** is used only for `astro-renderer` (visitor sites) and `apps/site` (docs/marketing).

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Astro + React islands | One framework for everything | Isolated React roots, string children, no shared providers | Breaks Kumo's compound components |
| TanStack Start (SSR) | Server functions, streaming | Heavier, moving fast, SSR of an authenticated admin adds little | Revisit only if SSR becomes a requirement |
| shadcn/ui (Base UI style) instead of Kumo | Code-owned, huge ecosystem | No agent-facing registry/CLI; more assembly | Kept as the fallback behind the `@cloudhal/ui` barrel |

## Consequences
- Positive: one React root, providers everywhere, Kumo's registry feeds the `studio-ui` skill.
- Negative: Kumo 2.x deprecates things weekly; the barrel is mandatory to contain churn.
- Risks: Kumo stalls → swap to shadcn behind the barrel; Base UI package rename already happened once (`@base-ui-components/react` is frozen; use `@base-ui/react`).

## Addendum (2026-10-22): the Cloudhal blocks as built
Of the blocks named in the Decision, `SnapshotTimeline` and `ApprovalDialog` are in `packages/ui/src/blocks`. The others were not built under those names:
- **DiffViewer:** body changes use the `BodyDiff` block; snapshot diffs are Studio's `SnapshotDiffDialog` (`apps/studio/src/components`).
- **PolicyBadge:** mode and scope badges are Studio components (`ModeBadge` in `AgentModes.tsx`, `ScopeBadge.tsx`); audit decisions use the `AuditBadges` block.
- **AgentRunPanel:** agent work is shown by `BuildActivity` and `BuildChatLog` (Build chat) and `ScheduleRunRow` (automation runs).

The current block list is `packages/ui/src/blocks`, and the rules for adding one are in [DESIGN.md](../design/DESIGN.md). The docs site is `apps/docs` (Astro Starlight, [ADR-0039](0039-cloudhal-dev-docs-site.md)), not `apps/site`.
