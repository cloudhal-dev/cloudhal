# AGENTS.md — Cloudhal

One page for coding agents (Claude Code, Codex, Cursor, …). Humans: see CONTRIBUTING.md.

## What this repo is
Cloudhal is an agent-native site platform. Sites are typed graphs (Site → Page → Section; ContentEntry; Snapshot). Agents change sites through an MCP server guarded by a policy engine; every change is snapshotted, diffable, previewable and reversible. TypeScript first; Rust mirrors the contracts and will take over the core later.

## Commands
```bash
pnpm install                      # once
pnpm check                        # biome lint + typecheck + vitest  (CI equivalent)
pnpm lint:fix                     # auto-format
cargo test --workspace            # Rust fixture tests (needs `pnpm --filter @cloudhal/core-contracts bundle` first; `pnpm gen` does it)
cargo clippy --workspace --all-targets -- -D warnings
pnpm gen                          # JSON Schema → TypeScript + Rust (requires cargo-typify 0.8.0)
pnpm drift                        # gen + fail if generated files changed
pnpm changeset                    # add a release note for a published package
```

## Layout
- `packages/core-contracts/schemas/*.schema.json` — **the only hand-edited contract source**. `common.schema.json` holds shared `$defs`.
- `packages/core-contracts/src/generated/`, `crates/cloudhal-schema/src/generated/` — generated; never edit.
- `packages/core-contracts/fixtures/{valid,invalid}/<schema>/` — golden fixtures used by both languages.
- `packages/storage` — `SqlDriver`/`BlobStore` + adapters (`sqlite`, `d1`, `fs`, `r2`) + migrations (`migrations/*.ts`, plain SQL). Conformance suites in `src/testing.ts`.
- `packages/core-ts` — `SiteGraphStore` (CAS on `rev`, snapshots, diff, publish, rollback). Behavioural suite in `src/testing.ts` runs on sqlite and Miniflare D1. `./local` opens the offline store; `seedStarterSite` seeds a demo.
- `packages/astro-renderer` — `GraphSource` (live/snapshot), `cloudhal()` integration (virtual config + dev route-cache watcher), `.astro` section components. Routes live in starters, not here.
- `packages/cli` — `cloudhal init|dev|snapshot|build|studio|mcp|deploy|push|pull`; TS bin run by Node 24 type stripping. E2E test spawns the bin (Astro disables dev middleware under `VITEST`). Cloudflare tests run both Workers on workerd via wrangler's `createTestHarness`; test files run serially (shared starter caches).
- `packages/cloudflare` — the admin Worker (`createAdminWorker`). Generated entries must import `@cloudhal/cloudflare/workerd-prelude` first (ADR-0012).
- `packages/agent-runtime` / `packages/mcp-server` — policy, skills, audit; MCP tools and transports (ADR-0011).
- `starters/blog` — the theme boundary: `src/pages/[...path].astro`, `src/layouts`, `src/theme.ts`.
- `packages/api` — Hono app (`createApi`), Better Auth (`src/auth.ts`), error mapping; shared suite `src/testing.ts` on sqlite + D1.
- `packages/ui` — `export * from "@cloudflare/kumo"` + blocks; `styles.css` is the only Tailwind entry for admin UIs.
- `apps/studio` — SPA; routes in `src/router.tsx`, screens in `src/routes`, typed API client `src/lib/api.ts`, i18n in `src/i18n` (add keys to `en.ts` and `tr.ts`).
- `docs/adr/` decisions (with sources) · `docs/rfcs/` proposals · `docs/design/DESIGN.md` the binding admin design system (Kumo).
- `.agents/skills/` — skills for you: `contract-change`, `add-capability`, `write-rfc`, `studio-ui`, and Cloudflare's official **`kumo-design`** (installed from `cloudflare/kumo`, tracked in `skills-lock.json`; update with `npx skills update`). Any admin-UI change loads `kumo-design` + `studio-ui` and follows `docs/design/DESIGN.md`.

## Hard rules
1. **Never edit generated files.** Change the schema, run `pnpm gen`, commit both.
2. **Schema subset** (so TS and Rust generators agree): discriminated unions = `oneOf` with inline variants and `kind: {"type":"string","enum":["x"]}`; no `default`; no `$dynamicRef`/`unevaluated*`/`dependentSchemas`; cross-file `$ref` only to `common.schema.json#/$defs/*` or another root schema's top level; `additionalProperties: false` on every object except declared maps.
3. **Every root type** has `schemaVersion` (enum `[1]`); mutable nodes have `rev`. New fields are optional unless an RFC says otherwise.
4. **No interactive DB transactions** anywhere (D1 has none); only atomic `batch()`. Composite writes guard later statements on the earlier CAS (match on the new content `hash`, not `rev + 1`).
5. **Worker-safe imports:** code reachable from a Worker never imports Node-only modules at top level (`better-sqlite3`, `node:fs` helpers, `@cloudhal/core-contracts/bundle`, `@cloudhal/api/auth/node`). Use the package subpaths.
6. **Runtime validation** uses the precompiled validators (`assertValid`/`isValid`), never `new Ajv()` (Workers forbid eval).
7. **Admin UIs** import UI primitives from `@cloudhal/ui` only; direct `@base-ui/react` imports are lint errors.
8. **Skills** (`SKILL.md`) use only the six spec fields; Cloudhal data goes in `metadata` as `cloudhal.*` string keys.
9. **Secrets** never in code, fixtures or docs. Test values live in `.env.example`.
10. **UI strings** go through `useT()` with keys in both `en.ts` and `tr.ts`; no hard-coded English in `apps/studio`.
11. Conventional commits, `git commit -s` (DCO). Changeset for published-package changes.

## Versions (pinned via pnpm catalog / Cargo workspace)
Node 24 · pnpm 12 · TypeScript 7.0 · Biome 2.5 · Vitest 5 · Turborepo 2.11 · Rust 2024 edition · json-schema-to-typescript 16.0.0 · cargo-typify 0.8.0 · ajv 8.20 · jsonschema 0.58 · better-sqlite3 13 · miniflare 4.20260730 (last stable 4.x; see ADR-0012) · wrangler 4.148 · @astrojs/cloudflare 14.3 · Astro 7.3 · Tailwind 4.3 · marked 18 · Hono 4.13 · Better Auth 1.7.7 · Kumo 2.14 · React 19.3 · TanStack Router 1.170 / Query 5.104 · Vite 8.3.

## When unsure
Read `docs/adr/README.md` and the relevant ADR; each ADR links its primary sources. If the change alters a contract or a public interface, write an RFC first (`.agents/skills/write-rfc`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
