# ADR-0009: Renderer reads live nodes in dev and a snapshot in builds; starters own routes
- Status: Accepted
- Date: 2026-10-08
- Related: ADR-0002, RFC-0001
- Sources: https://docs.astro.build/en/reference/integrations-reference/ · https://docs.astro.build/en/reference/programmatic-reference/ · https://github.com/withastro/astro/pull/16776 (dev route cache) · https://docs.astro.build/en/reference/publish-to-npm/

## Context
The renderer must serve two situations with one code path: an author previewing drafts locally, and a production build that must be reproducible from an approved snapshot. Astro 7 keeps `getStaticPaths()` results cached across dev requests (since 6.3.6), and it skips its dev middleware under Vitest.

## Decision
- `GraphSource` abstraction with `LiveSource` (current nodes, drafts included, read per request) and `SnapshotSource` (node bodies from the blob store of one snapshot, published nodes only). `cloudhal dev` uses live; `cloudhal build` resolves published → latest → fresh snapshot and sets `CLOUDHAL_SOURCE=snapshot:<id>`.
- The `cloudhal()` integration only provides configuration (`virtual:cloudhal/config`), SSR externals, and a data-directory watcher that clears Astro's dev route cache (`astro:content-changed` + full reload). **Routes and layouts belong to the starter/theme**, so themes stay explicit and forkable.
- Section rendering is a dispatcher over `section.kind` with a component map; themes override per kind.
- The CLI runs Astro programmatically (`dev()`, `build()` with `root`), and ships as TypeScript executed by Node 24 type stripping until the first published release adds a build step.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Astro Content Layer loaders | Official data path, `refreshContent` | Loader runs at startup; live edits need refresh plumbing; snapshot vs live becomes two loaders | Direct `GraphSource` is simpler and already covers both |
| On-demand rendering (`prerender = false`) in dev | No route cache issue | Requires an adapter even for a static site | Static output is the product promise |
| Integration-injected routes | Zero files in starters | Themes cannot change page structure without escape hatches | Starters as the theme boundary |

## Consequences
- Positive: one renderer, two provenance modes; production HTML is reproducible from a snapshot id.
- Negative: the dev watcher relies on an internal Astro HMR event name; pinned Astro minor, covered by the e2e test.
- Risks: rich text is rendered without sanitisation until the Sprint 5 policy work; only trusted authors until then.
