# Code structure and size rules

Status: binding for new code from 2026-10-17. Enforced by `pnpm size:check` (part of `pnpm check`
and CI), Biome complexity warnings and the clippy lints in `Cargo.toml`. Data behind the numbers:
[`docs/reports/2026-10-code-size-analysis.md`](../reports/2026-10-code-size-analysis.md).

Cloudhal is written by humans and coding agents together. Both lose the thread in a 3 000-line
file: an agent reads it in slices and edits the wrong copy of a helper, a reviewer cannot see what a
diff touches, two parallel sessions conflict on the same file every day. Small modules with one job
are the cheapest way to keep parallel work safe. These rules say how small, and how we get there
without a big-bang refactor.

## 1. What mature projects use

| Source | File | Function | Params | Nesting | Complexity |
| --- | --- | --- | --- | --- | --- |
| ESLint core defaults (`max-lines`, `max-lines-per-function`, `max-params`, `max-depth`, `complexity`) | 300 | 50 | 3 | 4 | 20 (cyclomatic) |
| Biome 2.5 defaults (`noExcessiveLinesPerFile`, `noExcessiveLinesPerFunction`, `useMaxParams`, `noExcessiveCognitiveComplexity`) | 300 | 50 | 4 | — | 15 (cognitive) |
| Airbnb JS style | no file/function cap; `max-len` 100 | — | — | — | off |
| Google TypeScript style | no numeric caps; "one concept per file", named exports, no default exports | — | — | — | — |
| Clippy (`too_many_lines` pedantic, `too_many_arguments`, `cognitive_complexity`, `excessive_nesting`) | — | 100 | 7 | off by default | 25 (cognitive) |
| SonarSource cognitive complexity | — | — | 7 | — | 15 |
| McCabe (1976) | — | — | — | — | 10 |

Two lessons: tools ship tight defaults (300/50) that real codebases switch off because they are
noisy, and style guides that do not cap size (Google, Airbnb) rely on review instead. A rule only
helps if it is loud enough to fire on a real problem and quiet enough that nobody disables it. So
Cloudhal sets **soft limits** near the tool defaults (review guidance, editor warnings) and **hard
limits** about twice as high (CI fails), and freezes today's oversized code in a baseline that may
only shrink.

## 2. The numbers

Physical lines, comments and blanks included (what you scroll through).

| Measure | Soft (warn, review) | Hard (CI fails) | Enforced by |
| --- | ---: | ---: | --- |
| `.ts`/`.tsx`/`.js` file | 400 | 800 | `size:check`; Biome `noExcessiveLinesPerFile` warns at 800 |
| `.astro` component | 250 | 500 | `size:check` |
| `.css` file | 400 | 800 | `size:check` |
| `.rs` file (inline `#[cfg(test)]` modules) | 500 | 1000 | `size:check` |
| Test file (`*.test.ts`, `test/`, `testing*.ts`, `fixtures.ts`) | 800 | 1500 | `size:check` |
| Function / method / component body | 80 | 150 | `size:check`; Biome `noExcessiveLinesPerFunction` 150; clippy `too_many_lines` 150 |
| Nesting depth (if/for/while/switch/try; `else if` does not nest) | 4 | 5 | `size:check`; clippy `excessive_nesting` 5 |
| Positional parameters | 3 | 4 | `size:check`; Biome `useMaxParams` 4; clippy `too_many_arguments` 5 |
| Cognitive complexity (Biome/Sonar) | 15 | 25 (warning) | Biome `noExcessiveCognitiveComplexity` 25; clippy `cognitive_complexity` 25 |
| One string literal / template (client code, SQL, help text) | 6 000 chars | 12 000 chars | `size:check` |
| Translation dictionary (`apps/studio/src/i18n/{en,tr}.ts`, `i18n/lazy/*`) | — | no line limit | Studio bundle budget (§8) |

Why these values:

- **400 / 800 lines.** Today 125 of ~670 TypeScript source files are over 400 and 41 over 800; the median
  module is ~150. 400 lines is roughly what one person (or one agent read) holds at once; at 800 a
  file nearly always mixes two jobs (§4). Higher for Rust because its tests live in the same file.
- **80 / 150 lines per function.** ESLint's 50 fires on every React component with a JSX tree; 80
  is a component with its hooks and markup on two screens. 143 functions are over 150 today; none of
  them is a single job.
- **3 / 4 parameters.** From four on, call sites become `fn(a, b, undefined, true)`. Beyond three,
  take one options object (`{ siteId, rev, by }`) — named, order-free and extensible without a
  breaking change. Hard limit 4 so that a fourth positional is a reviewed exception.
- **Depth 4 / 5.** Deeper code is easier to read as an early return, a helper or a lookup table.
  Only 18 functions reach depth 5 today, 2 reach 6.
- **Complexity** is only a warning: cognitive complexity flags real tangles (`primitiveHtml` has a
  cyclomatic complexity of 171) but also long, flat `switch` dispatchers that are fine to read. The
  fix for both is in §5.

Functions inside test files are exempt from the function limits: `describe`/`it` bodies are lists
of cases. Test files still have a file cap; split suites by behaviour (`store.publish.test.ts`,
`store.rollback.test.ts`), as `testing-*.ts` already does.

Generated and vendored code is never measured: `packages/core-contracts/src/generated`,
`crates/cloudhal-schema/src/generated`, `packages/core-ts/src/generated`,
`packages/ui/src/blocks/kumo`, `dist`, `node_modules`, `*.d.ts`, tool configs.

## 3. The ratchet

`scripts/size-baseline.json` lists every file, function and string that was over a hard limit on
2026-10-17 (40 files, 201 functions, 1 string), with its size then.

- A **new** file, function or string over a hard limit fails `pnpm size:check`.
- A **baselined** one may not grow. Changing it is fine; adding lines means moving at least as many
  lines out (to a new module) in the same change.
- When a refactor shrinks a baselined entry, run `node scripts/size-check.ts --update`. It only
  ever lowers numbers or drops entries, so it is always safe; `size:check` reminds you when the
  baseline is looser than the code.
- A genuine exception (rare: a generated-looking table, a vendored script) is
  `node scripts/size-check.ts --update --allow-growth`; the baseline diff makes it visible in review,
  and the PR says why.

Function baseline keys are `file::Outer>inner` names (anonymous callbacks are named after their
call, e.g. `createApi>app.get("/sites")(cb)`). Renaming a baselined function makes it "new"; split
it instead.

`pnpm size:report` prints the full tables (per package, functions, strings, switches, churn risk);
the analysis report is its output plus the split plans.

## 4. One responsibility per module

A module does one of these, and its name says which:

| Kind | Contains | Imports allowed | Examples |
| --- | --- | --- | --- |
| **Model / pure logic** | types, validation, transforms, decisions; no IO, no clock, no `fetch` | other pure modules, contracts | `surfaces/checks/*`, `schedules/recurrence`, `design` lint |
| **Store / IO adapter** | SQL, blob, HTTP, Browser Rendering, `fetch`; translates rows ↔ model | model, `@cloudhal/storage` | `sql/store.ts`, `render-chrome.ts` |
| **Service / orchestration** | one use case composed from model + IO (publish, build turn, deploy) | model, IO | `build-turn.ts`, `commands/deploy/*` |
| **Transport** | Hono routes, MCP tool tables, CLI commands: parse input, call a service, map errors | service, model | `routes/*`, `tools/*` |
| **Rendering** | HTML/Astro/React output from a model; no data fetching | model | `render/primitives/*`, Studio sections |
| **Runtime client code** | browser code shipped as a string (§7) | none at runtime | `*-client.ts` |

Signals that a file needs splitting: it has two of the rows above; its tests need two unrelated
setups; two sessions edit it for unrelated reasons in the same week (see churn in the report).

### Folders and stable public paths

When a file grows past the soft limit, move its parts into a folder with the same name and keep
the original file as the barrel. Importers, `package.json` `exports` (source and `publishConfig`)
and tests do not change:

```text
packages/core-ts/src/surfaces.ts      // barrel: the old public API, named re-exports only
packages/core-ts/src/surfaces/
  shared.ts                           // limits, tiny guards
  catalog/                            // primitive definitions, createCatalog
  bindings/                           // values, the function table, resolve
  checks/                             // checkSurface orchestrator + rule tables
  patch/                              // JSON Patch, patchPage
  prompt.ts                           // catalogPrompt
```

- Barrels only re-export, by name (`export { checkSurface } from "./surfaces/checks/index.ts";`);
  no logic, no side effects, so internal helpers do not leak into the public API. Inside a package
  import the concrete module, not the barrel, to avoid cycles.
- A new area that starts as a folder uses `index.ts` as its barrel.
- Prefer explicit named re-exports over `export *` in package entry points, so the public API is a
  list someone can read (`@cloudhal/ui`'s `export * from "@cloudflare/kumo"` is the documented
  exception).
- Worker-safety (AGENTS.md rule 5) is per module: a split must not pull a Node-only import into a
  barrel that a Worker reaches. Put Node-only parts behind their own subpath (`./node`).

Per-package conventions:

- `packages/core-ts`: one folder per domain area (`surfaces/`, `taxonomy/`, `menu/`, `assets/`),
  with `model.ts`, `checks.ts`, `sql.ts`/`store.ts`, `index.ts`. `store.ts` (`SiteGraphStore`)
  is a facade: method bodies live in per-area engines (`store/entries.ts`, `store/snapshots.ts`,
  `store/publish.ts`), like the existing `AssetEngine`/`TaxonomyEngine`/`MenuEngine`, sharing one
  `StoreContext`. The facade itself is a documented exception to the soft limit while its public
  method list stays flat.
- `packages/api`: `routes/<area>/index.ts` builds a Hono sub-app; handlers live next to it
  (`routes/<area>/<verb>.ts` once the area passes 400 lines); `app.route("/<area>", …)` mounts it.
- `packages/mcp-server`: one `tools/<area>.ts` per tool family, each exporting a tool table; the
  server registers tables, it does not define tools.
- `packages/cli`: `commands/<name>/` per command with a `{ name, help, run }` table in `cli.ts`.
- `packages/astro-renderer`: `surfaces/render/<primitive>.ts` renderers keyed in a table.
- `apps/studio`: see §8.
- `starters/blog`: `src/styles/<feature>.css` per feature, imported by `global.css` (§8).

## 5. Dispatch tables, not giant switches

A `switch` that maps a name to a behaviour (primitive → HTML, command → handler, function name →
implementation, A2UI kind → surface node) becomes a typed table:

```ts
type PrimitiveRenderer<K extends PrimitiveName> = (node: PrimitiveNode<K>, ctx: RenderContext) => string;

export const PRIMITIVE_RENDERERS: { [K in PrimitiveName]: PrimitiveRenderer<K> } = {
  Text: renderText,
  Image: renderImage,
  // …
};

export const primitiveHtml = (node: PrimitiveNode, ctx: RenderContext) =>
  (PRIMITIVE_RENDERERS[node.kind] as PrimitiveRenderer<typeof node.kind>)(node, ctx);
```

- The mapped type makes a missing entry a type error (the exhaustiveness a `switch` +
  `assertNever` gave).
- Each renderer is a small function in its own module, testable alone; adding a primitive touches
  one new file and one table line.
- Keep a `switch` for a handful of cases that share local state. Rule of thumb: more than ~10
  cases, or cases longer than ~10 lines each, is a table.

## 6. Naming, exports, comments, errors

Match what is already in the repo:

- **Files** kebab-case (`build-turn.ts`, `surface-interop.ts`); React components PascalCase
  (`PageEditorPage.tsx`); tests next to the code (`foo.test.ts`) or in `test/`.
- **Exports** named only; default exports only where a framework requires them (Astro/Vite
  configs, Workers' `export default { fetch }`). Export what other modules use, nothing for tests
  only — test through the public function or move the helper to its own module.
- **Comments** as the repo writes them: a module doc comment saying what the module is for, which
  RFC/ADR it implements and any non-obvious constraint (Worker-safety, versioned assets); short
  `/** … */` on exported API whose name is not enough; inline comments only for *why*. No
  commented-out code, no banners.
- **Errors**: throw typed errors from `@cloudhal/core-ts` (`ConflictError`, `NotFoundError`, …) in
  model/service code; map them to HTTP/MCP results only in the transport layer
  (`packages/api` error mapping, MCP `invariantHint`). Never swallow an error without a comment
  saying why; never `catch {}` around IO except to translate it.
- **Parameters**: more than three → one options object (§2).

## 7. Runtime client modules (`String.raw` code)

`packages/astro-renderer/src/*-client.ts` ship small browser modules as string constants (served
from `/_cloudhal/`, `script-src 'self'`, no eval). They stay that way, with limits:

- One module per behaviour (`motion`, `carousel`, `overlay`, `surface` …), one exported constant,
  versioned file name, a test pinning the hash (existing practice).
- **Size cap: 12 000 characters per string (hard), 6 000 soft.** `surface-client.ts` is at ~11 000
  and is the first to split (bindings / actions / toasts as separate modules loaded on demand).
- Shared helpers (pointer parsing, toast) live in one `client-shared.ts` constant concatenated by the
  module that needs it, not copied.
- A string over ~30 lines that is *checked code* (e.g. `RENDER_CHECK_SCRIPT` in
  `packages/mcp-server/src/render.ts`, 26 000 chars) should become a real `.js` module under
  `src/client/` read at build time or bundled as text, so Biome and the type checker see it.
- SQL in migrations is data and is exempt in spirit; keep each migration to one feature.

## 8. Studio screens and CSS

Studio (`apps/studio`):

- A route file (`src/routes/*Page.tsx`) is composition only: `PageLayout`, its `SectionCard`s and
  the data hooks. **Soft 250, hard 800 lines** (the file limit); the component function ≤ 150.
- Move each section into `src/components/<page>/<Section>.tsx` and data/mutation logic into
  `src/components/<page>/use<Thing>.ts` hooks (not under `routes/`: design-lint treats every
  `.tsx` there as a route that needs a template). The route file keeps what its template requires
  (`PageLayout`, `crumbs=`, `title=`, and `EditorLayout`/`SectionCard` for editors). Reusable visual
  patterns become a `packages/ui` block (AGENTS.md rule 7).
- Modules imported only by a lazy route stay in its chunk; never import a heavy module from the
  shell (`apps/studio/bundle-budget.ts` `LAZY_ONLY`).
- `src/lib/api.ts` is split per resource (`lib/api/<area>.ts`); `lib/api.ts` stays as the barrel
  (137 files import it by that path).
- i18n dictionaries are data, not code, so they have **no line limit** (a long list of strings is
  not hard to read). What they cost is weight and merge conflicts, and the rules aim at those:
  - the shell imports `en.ts` *and* `tr.ts` eagerly, so every visitor downloads both languages;
    `apps/studio/bundle-budget.ts` (`initialGzipBytes`) is the guard, not `size:check`;
  - a new area's strings go in a lazy namespace (`src/i18n/lazy/<ns>.{en,tr}.ts`, DESIGN.md §1),
    loaded with its route; `en.ts`/`tr.ts` keep what the shell needs on first paint;
  - moving route-specific groups out of the eager files (and loading only the active language) is
    a bundle improvement, done for the user's sake, not to meet a line count.

CSS (`starters/blog`, themes): one file per feature (`styles/prose.css`, `styles/surfaces.css`,
`styles/comments.css` …), imported in order by `global.css`, which keeps only tokens, `@layer`
order and base. Same 400/800 limits.

## 9. Workflow

1. Before writing: if the file you are about to change is over the soft limit, put the new code in
   a new module next to it.
2. `pnpm check` runs Biome (errors), `size:check`, typecheck and tests. `pnpm lint` also shows the
   complexity warnings; your editor shows them inline.
3. Refactors of baselined files follow the split plans in the analysis report, one file per PR,
   public import paths unchanged, behaviour unchanged (tests untouched or only moved), then
   `node scripts/size-check.ts --update`.
