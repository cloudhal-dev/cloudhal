# @cloudhal/ui

The only UI entry point for Cloudhal admin surfaces (ADR-0003): Kumo (`@cloudflare/kumo`) re-exported as-is, plus Cloudhal blocks:

- `StatusBadge` — editorial lifecycle badge (`label` prop for localisation).
- `SnapshotTimeline` — newest-first snapshots with publish / roll back actions (`labels` prop).
- `ApprovalDialog` — the human-approval gate used for publish, rollback and delete.
- Analytics (DESIGN.md §2v): `StatTile`, `AnalyticsRangePicker`, `BreakdownTable`, `BreakdownMeters`, `AnalyticsQuotaBanner`, `useChartPalette`; the ECharts-backed `AnalyticsTimeseries`, `CountryMap` and `ReadersSummary` come from the separate `@cloudhal/ui/charts` entry so only lazy routes load ECharts.

Import styles once in the app: `@import "@cloudhal/ui/styles.css";` (Kumo tokens → Tailwind 4 → sources). Put `class="isolate"` on the root element and wrap the app in `<Toasty>`.

Rules: never import `@base-ui/react` directly (lint error); copy Kumo *blocks* here with `npx @cloudflare/kumo add <Block>` and own them; no `dark:` variants, use Kumo tokens.
