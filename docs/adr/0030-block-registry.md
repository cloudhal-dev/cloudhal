# ADR-0030: One block registry for page sections and bodies
- Status: Accepted
- Date: 2026-10-14
- Related: RFC-0015 (the design), RFC-0014 open question 5 and phase 6, ADR-0028 (markdown canonical, block index), ADR-0029 (AI commands), ADR-0008 (precompiled validators), ADR-0026 (sanitizer), PR #35
- Sources: the generic directives proposal — https://talk.commonmark.org/t/generic-directives-plugins-syntax/444 · `micromark-extension-directive` (MIT) — https://github.com/micromark/micromark-extension-directive · `marked` extensions — https://marked.js.org/using_pro#extensions · Tiptap node views (MIT) — https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views

## Context
Page sections are a closed set of four kinds, and markdown bodies have no typed parts. Editors want callouts, buttons, videos and FAQs, and agents can only describe them in prose. The theme and UI generator (phase 7) needs a vocabulary it can produce, check and render. RFC-0014 reserved block directives in profile v1 and asked for one registry with a `component` section kind.

## Decision
Adopt RFC-0015. The owner accepted it on 2026-10-14 with the drafted defaults, and changed one: type names are global.
- **Block types are data:**
  - A name, a localized title, where the type may appear (`section` / `body`), a props schema, a container or leaf form, and an example.
  - Each type has one Astro component, used both for sections and for bodies.
- **Storage:**
  - Pages: a new `ComponentSection` (`{ id, kind: "component", type, props }`). `props` is a declared map shaped like `ContentEntry.fields`.
  - Bodies: block directives (`:::name{attrs}` … `:::`, leaf `::name{attrs}`), with scalar props only.
  - Markdown stays canonical (ADR-0028).
- **Props validation:**
  - A JSON Schema subset, checked by a small dependency-free interpreter with no `eval`. The same interpreter drives Studio's generated forms.
  - Contracts keep their precompiled ajv validators.
- **Built-ins:** `callout`, `button`, `embed` (YouTube or Vimeo, click to load; CSP `frame-src` only when used) and `faq` (sections only). The four existing section kinds stay as they are.
- **Names are global and English-rooted:**
  - One namespace for built-in and theme types alike (`pricing-table`, `testimonial`), never theme-prefixed. Content therefore moves between themes that share a name, and agents and the generator learn one vocabulary.
  - A built-in name belongs to its schema; themes may restyle it.
  - Duplicate names in one deployment are a deploy error.
- **Theme types:**
  - Declared in a pure-data `src/blocks.ts`, with components in `theme.ts` `blocks`.
  - `cloudhal deploy` validates and bundles them into the admin Worker.
  - Unknown or no-longer-fitting content is kept and flagged, never dropped or rewritten, and not rendered publicly.
- **Agents:** `list_block_types`; `edit_body` `insertBlock` and `setProps`; `component` sections in the page tools. The store answers bad props with 422 `invalid_props`.
- **Phases:** 6a (core, sections, Studio forms), 6b (body directives), 6c (MCP), 6d (theme types).

## Alternatives considered
| Alternative | Why not |
|---|---|
| MDX components in bodies | Executes code; unsafe for agent-written content; not Worker-friendly |
| Custom HTML elements in bodies | Raw HTML is escaped in profile v1; the sanitizer allowlist would grow per type |
| A typed JSON body tree | Reverses ADR-0028 |
| Full JSON Schema with ajv compiled at deploy | Generated code per theme; no form generation |
| A contract variant per block type | Every theme block would need an RFC |
| Theme-prefixed type names (`acme-pricing`) | Ties content to one theme; agents and the generator would learn a vocabulary per theme |

## Consequences
- **Positive:**
  - Sections and bodies can hold typed, validated, agent-editable blocks without a contract change per type.
  - Themes extend the vocabulary.
  - The generator gets a target.
- **Negative:**
  - A second validator (the subset interpreter) to maintain next to ajv.
  - The body renderer splits markdown at directives.
- **Risks:**
  - Two themes may give the same global name different props. The store validates against the deployed schema, and content that no longer fits is kept and flagged.
  - Bodies already containing `:::` lines are reported once before rendering changes.
