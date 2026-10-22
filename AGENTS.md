# AGENTS.md — Cloudhal

One page for coding agents (Claude Code, Codex, Cursor, …). Humans: see CONTRIBUTING.md.

## What this repo is
Cloudhal is an agent-native site platform. Sites are typed graphs (Site → Page → Section; ContentEntry; Snapshot). Agents change sites through an MCP server guarded by a policy engine; every change is snapshotted, diffable, previewable and reversible. TypeScript first; Rust mirrors the contracts and will take over the core later.

## Commands
```bash
pnpm install                      # once
pnpm check                        # biome lint, size check, generated-file checks, typecheck, vitest (CI equivalent)
pnpm lint:fix                     # auto-format
pnpm size:check                   # size ratchet (docs/engineering/code-structure.md); size:report prints the tables
cargo test --workspace            # Rust fixture tests (needs `pnpm --filter @cloudhal/core-contracts bundle` first; `pnpm gen` does it)
cargo clippy --workspace --all-targets -- -D warnings
pnpm gen                          # JSON Schema → TypeScript + Rust (requires cargo-typify 0.8.0)
pnpm drift                        # gen + fail if generated files changed
pnpm changeset                    # add a release note for a published package
pnpm design:lint [files…]         # Kumo design rules for apps/studio + packages/ui blocks (also a Claude Code hook)
pnpm design:shots -- <routes>     # headless screenshots at 1440/390 px; fails on sideways scroll / console errors
pnpm kumo ls|doc <Name>|blocks|add <Block>|ai   # Kumo CLI: component list, API docs, blocks, usage guide
pnpm i18n:export / pnpm i18n:import [--locale xx]  # translations as nested ICU JSON in .i18n/ (ADR-0034); only en is hand-edited
```

## Layout
- `packages/core-contracts/schemas/*.schema.json` — **the only hand-edited contract source**. `common.schema.json` holds shared `$defs`.
- `packages/core-contracts/src/generated/`, `crates/cloudhal-schema/src/generated/` — generated; never edit.
- `packages/core-contracts/fixtures/{valid,invalid}/<schema>/` — golden fixtures used by both languages.
- `packages/storage` — `SqlDriver`/`BlobStore` + adapters (`sqlite`, `d1`, `do-sqlite`, `fs`, `r2`; `SqlBlobStore`, `LayeredBlobStore`, `FetcherBlobStore` at the root) + migrations (`migrations/*.ts`, plain SQL). Conformance suites in `src/testing.ts`.
- `packages/core-ts` — `SiteGraphStore` (CAS on `rev`, snapshots, diff, publish, rollback). Behavioural suite in `src/testing.ts` runs on sqlite and Miniflare D1. `./local` opens the offline store; `seedStarterSite` seeds a demo. `./surfaces` is RFC-0020's generative UI: the catalog (primitives + block types), eval-free surface checks, bindings, repairs, JSON Patch (`patchPage`), `catalogPrompt`; `./interop` converts A2UI v0.9 and json-render to and from surfaces; `./design` is RFC-0021's DESIGN.md lint and guidance. `search.ts` is RFC-0019's FTS5 site search (index written with the publish batch; articles, pages, terms and authors, RFC-0029); `search-provider.ts` is RFC-0029's `SearchProvider` (`fts5`, `memory`, `withFallback`), set with `SiteGraphStoreOptions.search`; `search-ai.ts` is the experimental Cloudflare AI Search provider (`hybridProvider`, `searchProviderFromEnv`, `cloudhal.json` `search`, docs/guides/search.md).
- `packages/schedules` — RFC-0008: time model (only `temporal-polyfill/implementation`, `now` injected, never `Temporal.Now`), RRULE subset, release model (`rl1:`), automation/run state, taint and budgets, `runDue`; `./sql` is `SqlScheduleStore`, `./engine` the Temporal-free part core-ts and the site Worker use. Worker-safe; conformance suites in `src/testing.ts` on sqlite and Miniflare D1.
- `packages/astro-renderer` — `GraphSource` (live/snapshot), `cloudhal()` integration (virtual config + dev route-cache watcher), `.astro` section components (`Surface.astro` for RFC-0020 surfaces; `./surfaces` renders them, `./kit` has the table of contents and reading time). Routes live in starters, not here.
- `packages/cli` — the `cloudhal` CLI (`init`, `dev`, `studio`, `mcp`, `deploy`, `push`, `pull`, …; every command is in `src/cli/help.ts`, which `cloudhal --help` prints and the docs site's CLI reference is generated from); TS bin run by Node 24 type stripping. `src/cli.ts` parses flags and dispatches through `COMMANDS`, built from `src/cli/commands-{local,remote,content,ops,site}.ts` (a new command is one handler plus one line in `src/cli/help.ts`). E2E test spawns the bin (Astro disables dev middleware under `VITEST`). Cloudflare tests run both Workers on workerd via wrangler's `createTestHarness`; test files run serially (shared starter caches).
- `packages/cloudflare` — the admin Worker (`createAdminWorker`); `./playground` is RFC-0036's playground Worker (`createPlaygroundWorker`, the `PlaygroundSite` Durable Object, signed session cookies). Generated entries must import `@cloudhal/cloudflare/workerd-prelude` first (ADR-0012).
- `packages/agent-runtime` / `packages/mcp-server` — policy, skills, audit; MCP tools and transports (ADR-0011). `@cloudhal/mcp-server/render` is RFC-0021's `render_page` core: a small DevTools client, the in-page checks and limits; the CLI drives local Chrome with it (`render-chrome.ts`), the admin Worker Browser Rendering (`browser-render.ts`).
- `starters/blog` — the theme boundary: `src/pages/[...path].astro`, `src/layouts`, `src/theme.ts`.
- `packages/api` — Hono app (`createApi`), Better Auth (`src/auth.ts`), error mapping; shared suite `src/testing.ts` on sqlite + D1. Build chat is `build-turn.ts`, its model eval `build-eval.ts`; `design-pass.ts` is RFC-0021 21c (Build chat looks at its render, the eval's vision-judged score).
- `packages/ui` — `export * from "@cloudflare/kumo"` + blocks; `styles.css` is the only Tailwind entry for admin UIs. Heavy kits have lazy subpaths: `./charts` (ECharts), `./editor` (the Tiptap markdown body editor, RFC-0014).
- `packages/messages` — RFC-0032 / ADR-0032: the ICU MessageFormat 1 subset of Studio's catalogs (`plural`, `select`, `selectordinal`, `number`). `./compile` (build-time only: the Vite plugin `./vite`, the type generator, tests; `bundle-budget.ts` keeps it out of every chunk) and `./format` (Worker-safe runtime, cached `Intl.PluralRules`/`NumberFormat`), which is also Studio's `Intl` layer: `formatNumber`, `formatDate`, `formatRelative`, `formatList` and cached `numberFormat`/`dateTimeFormat`/`relativeTimeFormat`/`displayNames`/`collator` — screens and blocks never build `Intl` formatters themselves (lint `i18n-format`). Catalogs compile to data, never code.
- `patches/` — `pnpm patch` files (`patchedDependencies` in `pnpm-workspace.yaml`). `@cloudflare__kumo@2.14.0.patch` is **generated** by `node scripts/kumo-patch.ts`: the hand-written changes in `patches/kumo/*.patch` (`tooltip-timestamp.patch` adds `TimeseriesChart`'s `tooltipTimestampFormat`, DESIGN.md §2v "Kumo locale") plus every physical utility in Kumo's `dist` made logical (ADR-0033 A1). Never edit it; on a Kumo upgrade rename it and the `patchedDependencies` entry, re-run the script, `pnpm install`, re-check the gaps in `docs/design/kumo-upstream-notes.md`. `packages/ui/test/kumo-rtl.test.tsx` fails when the installed Kumo is not patched.
- `apps/studio` — SPA; routes in `src/router.tsx`, screens in `src/routes`, typed API client `src/lib/api.ts` (a barrel over `src/lib/api/<area>.ts`), i18n in `src/i18n` (messages are ICU MF1, compiled at build time, with parameter types generated into `src/i18n/generated/params.ts` by `pnpm gen` — never edit it; languages registered in `locales.ts`; add keys to `en.ts` and every `<locale>.ts`, or to a lazy namespace `src/i18n/lazy/<ns>.<locale>.ts` (the list and how to add one: `src/i18n/namespaces.ts`; DESIGN.md §1); only the active language of the core catalogs loads, `tr.ts` through `loadLocale`, and each other language's lazy-namespace loaders come with it from the generated `src/i18n/loaders/<locale>.ts`; Arabic and Persian format with Western digits through the registry's `intl` tag).
- `docs/adr/` decisions (with sources) · `docs/rfcs/` proposals · `docs/design/DESIGN.md` the binding admin design system (Kumo).
- `.agents/skills/` — skills for you: `contract-change`, `add-capability`, `write-rfc`, `studio-ui`, `translate`, and Cloudflare's official **`kumo-design`** (installed from `cloudflare/kumo`, tracked in `skills-lock.json`; update with `npx skills update`). Any admin-UI change loads `kumo-design` + `studio-ui` and follows `docs/design/DESIGN.md`.

## Hard rules
1. **Never edit generated files.** Change the schema, run `pnpm gen`, commit both.
2. **Schema subset** (so TS and Rust generators agree): discriminated unions = `oneOf` with inline variants and a one-value enum discriminator, `kind: {"type":"string","enum":["x"]}` unless the domain says otherwise (field definitions use `type`, ADR-0043); no `default`; no `$dynamicRef`/`unevaluated*`/`dependentSchemas`; cross-file `$ref` only to `common.schema.json#/$defs/*` or another root schema's top level; `additionalProperties: false` on every object except declared maps.
3. **Every root type** has `schemaVersion` (enum `[1]`); mutable nodes have `rev`. New fields are optional unless an RFC says otherwise.
4. **No interactive DB transactions** anywhere (D1 has none); only atomic `batch()`. Composite writes guard later statements on the earlier CAS (match on the new content `hash`, not `rev + 1`).
5. **Worker-safe imports:** code reachable from a Worker never imports Node-only modules at top level (`better-sqlite3`, `node:fs` helpers, `@cloudhal/core-contracts/bundle`, `@cloudhal/api/auth/node`). Use the package subpaths.
6. **Runtime validation** uses the precompiled validators (`assertValid`/`isValid`), never `new Ajv()` (Workers forbid eval).
7. **Admin UIs** import UI primitives from `@cloudhal/ui` only (`@cloudflare/kumo`/`@base-ui/react` in apps are lint errors) and are composed from Kumo components and blocks: every screen is a `PageLayout` with a registered template, sections are `SectionCard`s, no hand-made cards, headers, containers or raw HTML controls. Look APIs up with `pnpm kumo doc <Name>` before writing markup; if Kumo lacks something, add a block to `packages/ui/src/blocks`, never a one-off in a screen. `pnpm design:lint` must pass (it also runs after every agent edit via `.claude/settings.json`).
8. **Skills** (`SKILL.md`) use only the six spec fields; Cloudhal data goes in `metadata` as `cloudhal.*` string keys.
9. **Secrets** never in code, fixtures or docs. Test values live in `.env.example`.
10. **UI strings** go through `useT()` with keys in `en.ts` (only English is edited by hand; every other `<locale>.ts` is generated by `pnpm i18n:import`, ADR-0034) and every language's `<locale>.ts` (or every file of a lazy namespace, read with `useT("<ns>")`; languages are registered in `apps/studio/src/i18n/locales.ts`); no hard-coded words in `apps/studio/src` or `packages/ui/src` — visible text, `aria-label`/`title`/`placeholder`/`alt`, toasts, banners, label tables and block defaults (blocks take every word as a prop, no English fallback; API errors through `apiErrorText`). Enforced by the `i18n`, `i18n-plural`, `i18n-concat` and `i18n-format` rules (and `rtl-logical` for physical CSS utilities, ADR-0033) of `pnpm design:lint` (`apps/studio/scripts/i18n-lint.ts`, run in `pnpm check` by `test/design-rules.test.ts` and on every agent edit); legitimate literals go in its `ALLOWED` list or carry an `i18n-ignore: <reason>` comment.
11. Conventional commits, `git commit -s` (DCO). Changeset for published-package changes.
12. **Size ratchet** ([docs/engineering/code-structure.md](docs/engineering/code-structure.md)): files ≤ 800 lines (soft 400; `.astro` 500, tests 1500; i18n dictionaries are data and exempt — the Studio bundle budget guards them), functions ≤ 150 lines, depth ≤ 5, ≤ 4 positional params (use an options object beyond 3); one responsibility per module, dispatch tables instead of giant switches. `pnpm size:check` (in `pnpm check`) fails on a new violation or when a file in `scripts/size-baseline.json` grows — put new code in a new module next to it; after shrinking one, run `node scripts/size-check.ts --update`.

## Versions (pinned via pnpm catalog / Cargo workspace)
Node 24 · pnpm 12 · TypeScript 7.0 · Biome 2.5 · Vitest 5 · Turborepo 2.11 · Rust 2024 edition · json-schema-to-typescript 16.0.0 · cargo-typify 0.8.0 · ajv 8.20 · jsonschema 0.59 · better-sqlite3 13 · miniflare 4.20260730 (last stable 4.x; see ADR-0012) · wrangler 4.148 · @astrojs/cloudflare 14.3 · Astro 7.3 · Tailwind 4.3 · marked 18 · Hono 4.13 · Better Auth 1.7.7 · Kumo 2.14 · React 19.3 · TanStack Router 1.170 / Query 5.104 · Vite 8.3.

## When unsure
Read `docs/adr/README.md` and the relevant ADR; each ADR links its primary sources. If the change alters a contract or a public interface, write an RFC first (`.agents/skills/write-rfc`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
