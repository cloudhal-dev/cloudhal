# ADR-0013: Publishing to npm — sources in the monorepo, dist in the tarball
- Status: Accepted
- Date: 2026-10-08
- Related: ADR-0001 (contracts), ADR-0006 (toolchain), ADR-0012 (deployment)
- Sources: https://nodejs.org/api/module.html#modulestriptypescripttypescode-options · https://nodejs.org/api/typescript.html (type stripping is not applied under node_modules) · https://pnpm.io/package_json#publishconfig · https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files (.gitignore is never packed)

## Context
Every package exports its TypeScript sources so the monorepo needs no build step (Node 24 strips types, Vite/wrangler/Vitest read TS). Published as-is, the packages would not run: Node refuses to strip types inside `node_modules`, `core-contracts` imported a directory it did not ship, and `cloudhal init` outside the monorepo produced a project with `catalog:` dependencies npm cannot install. The roadmap's public-alpha promise is `npm create cloudhal` in five minutes.

## Decision
1. **Two export maps.** `exports` keeps pointing at `src/*.ts` for development; `publishConfig.exports` (pnpm swaps it in on pack/publish) points at `dist/*.js` with `types` → `dist/*.d.ts`, conditions (e.g. `workerd`) preserved. `scripts/build-packages.ts --write-publish-config` derives it; `--check` fails CI when it drifts. Tarballs ship `dist` (+ `schemas` for contracts) only.
2. **Build = strip + rewrite, declarations from one tsc pass.** JS per file via Node's `module.stripTypeScriptTypes` (sources are erasable-only), relative `.ts` specifiers rewritten to `.js` with es-module-lexer; `.d.ts` from a single `tsc --emitDeclarationOnly` over all packages (`tsconfig.build.json`), each package keeping its own files. `.astro`/JSON/generated assets are copied with the same rewrite. No bundler; output mirrors the source tree.
3. **The CLI carries its assets.** `dist/assets/{studio,starters,skills}`: the built Studio (no source maps), the starters with `workspace:`/`catalog:` replaced by real versions, and the official skills. `src/assets.ts` resolves them in the published layout first, then in the monorepo. `.gitignore` ships as `_gitignore` and `init` renames it.
4. **`create-cloudhal`** (`npm create cloudhal@latest`) wraps `cloudhal init`; starters get npm scripts (`dev`, `build`, `studio`, `deploy`) and their own `@cloudhal/cli`.
5. **`@cloudhal/ui` stays private**: it is bundled into the Studio build and not consumed on its own yet.
6. **One version for everything published** (amended 2026-10-20, after dogfooding cloudhal.com): the published packages are a changesets `fixed` group, and a starter names each `@cloudhal/*` package at that exact version, as `pnpm publish` writes `workspace:*`. Astro, a peer of the renderer and the CLI, is pinned to the version the monorepo installed, so a project gets one copy. `cloudhal init` run from a source checkout, outside the workspace, links the packages to that checkout (`link:`, installed with pnpm) instead of naming a version that may not be on npm. New projects get `pnpm-workspace.yaml` `allowBuilds`, bun `trustedDependencies` and yarn `nodeLinker: node-modules`, and next steps in the package manager that ran the command.
7. **Proof:** `scripts/smoke-pack.ts` packs everything, then with plain npm in an empty directory runs create → install → snapshot/build → `cloudhal dev` → `deploy --dry-run` (CI: weekly, manual, and on packaging changes).

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Per-package `tsc` emit | Standard | Cross-package source imports make tsc emit (or reject) other packages' files | Needs project references / path rewiring for every package |
| tsdown / rolldown bundling | Small output, d.ts bundling | New toolchain; its d.ts plugin uses the TypeScript JS API, which TS 7 does not have | Risk without benefit for libraries this size |
| Ship `.ts` and let consumers compile | No build | Node will not run it from node_modules; consumer type-checking of our sources | Does not work |
| `development` export condition | One map | Node/wrangler do not set it; bins and Workers would need flags | Fragile |

## Consequences
- Positive: the monorepo stays build-free; npm users get plain JS + types; the full user path is tested.
- Negative: `stripTypeScriptTypes` is still experimental in Node 24 (a warning during builds); two export maps to keep in sync (checked in CI).
- Risks: a source file using non-erasable syntax would fail the build — `erasableSyntaxOnly` in tsconfig already forbids it.
