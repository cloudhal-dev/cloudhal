# RFC-0015: Block registry — typed blocks for page sections and bodies
- Status: Draft (2026-10-14)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-14
- Related:
  - RFC-0014 §1 (profile v1 reserves directives), §6 (outline of this RFC), open question 5 (one registry with a `component` section kind), phase 6;
  - ADR-0028;
  - RFC-0016 (AI commands work on any block);
  - ADR-0008 (precompiled validators, no `eval`);
  - ADR-0026 (HTML sanitizer);
  - RFC-0013 (static CSP);
  - phase 7 (the theme and UI generator, which builds on this registry).
- References (syntax and prior art; not re-fetched for this draft):
  - Generic directives proposal (CommonMark forum): https://talk.commonmark.org/t/generic-directives-plugins-syntax/444
  - `micromark-extension-directive` / `remark-directive` (MIT), the most used implementation of that syntax: https://github.com/micromark/micromark-extension-directive
  - `marked` extensions (custom block tokenizers): https://marked.js.org/using_pro#extensions
  - Tiptap custom nodes and node views (MIT): https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views
  - JSON Schema 2020-12 validation vocabulary: https://json-schema.org/draft/2020-12/json-schema-validation

## Summary
- **What:** one registry of block types, a callout or an embedded video for example. Each type has a name, a props schema, an Astro component and an editor form.
- **Where blocks live:**
  - In a page as a new `component` section: `{ kind: "component", type, props }`.
  - In a markdown body as a directive: `:::callout{tone="warning"}` … `:::`. Bodies stay plain markdown.
- **Who defines types:** Cloudhal ships a few built-ins. A theme adds its own in a pure-data `src/blocks.ts`, which `cloudhal deploy` hands to the admin Worker so Studio and agents know them.
- **Props:** written in a small JSON Schema subset. One dependency-free interpreter validates them on Workers without `eval` and generates Studio's forms.
- **Agents:** they list the types and insert or change blocks by id (`edit_body`'s `insertBlock` and `setProps`, page tools for sections).

## Motivation
- **The fixed set is too small.** Sections are a closed set (hero, richText, image, contentList), and anything else means raw HTML or a new contract field. Editors ask for callouts, buttons, embedded videos, FAQs and pricing tables.
- **Bodies cannot hold structure.** Markdown bodies have no typed parts, so an agent writing "a warning box" can only describe it in prose.
- **The generator needs a target.** The planned theme and UI generator (phase 7) needs a vocabulary it can produce, validate and render. That vocabulary is this registry.
- **Why now.** RFC-0014 gave bodies stable block ids and operations, and RFC-0016 made AI edit blocks. Typed blocks are the next layer, and RFC-0014 already reserved the directive syntax in profile v1.

## Proposal

### 1. A block type
```ts
// @cloudhal/core-ts/blocks (Worker-safe, no dependencies beyond core-ts)
export interface BlockType {
  /** `[a-z][a-z0-9-]{1,40}`; built-ins are unprefixed, a theme's are `<theme>-<name>` by convention. */
  name: string;
  title: Record<string, string>;            // per UI locale, `en` required: "Callout"
  description?: Record<string, string>;
  icon?: string;                            // a Phosphor icon name, for Studio's menus
  category?: "text" | "media" | "layout" | "data";
  /** Where it may appear (D2). */
  where: ("section" | "body")[];
  /** The props, in the subset of §3. */
  props: PropsSchema;
  /** Body form only: whether the directive wraps markdown (a container) or not (a leaf). */
  content?: "markdown" | "none";
  /** What `list_block_types` and the slash menu insert first. */
  example: { props: Record<string, unknown>; markdown?: string };
}
```
- A type is **data**. Its rendering lives elsewhere: an Astro component in the renderer or theme, keyed by `name` (§5).
- The same object is read by:
  - the store (validation),
  - the API and MCP (`list_block_types`),
  - Studio (menus and forms),
  - the renderer (which component).

### 2. Where blocks are stored (D1, contract change)
**Page section.** A new variant in `section.schema.json`:
```json
{
  "type": "object",
  "title": "ComponentSection",
  "description": "A typed block from the block registry (RFC-0015): `type` names a registered block type, `props` follow its schema.",
  "additionalProperties": false,
  "required": ["id", "kind", "type", "props"],
  "properties": {
    "id": { "$ref": "common.schema.json#/$defs/Id" },
    "kind": { "type": "string", "enum": ["component"] },
    "type": { "type": "string", "pattern": "^[a-z][a-z0-9-]{1,40}$" },
    "props": { "type": "object", "description": "Validated against the type's props schema by the store, not by this contract.", "additionalProperties": true }
  }
}
```
`props` is a declared map, so hard rule 2's exception applies. It has the same shape as `ContentEntry.fields`, which the generators already turn into TypeScript `Record<string, unknown>` and Rust `serde_json::Map`. The store enforces the 64-prop limit (§Security), so the contract needs no `maxProperties`. `schemaVersion` stays 1, and the new variant is additive. Fixtures for phase 6a:
- `valid/section/component-callout.json`;
- `invalid/section/component-bad-type.json` (type `Callout`);
- `invalid/section/component-extra-field.json` (a field next to `props`).

**Body.** A markdown directive (the generic directives syntax, block level only). It is already part of profile v1 (RFC-0014 §1):
```markdown
:::callout{tone="warning" title="Before you start"}
Back up your **database** first.
:::

::embed{url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
```
- **Container** (`content: "markdown"`): `:::name{attrs}` on its own line, markdown inside, closed by `:::` on its own line.
  - Nesting uses more colons (`::::outer` … `::::`).
  - Profile v1 keeps one level of nesting at most.
- **Leaf** (`content: "none"`): `::name{attrs}` on one line.
- **Attributes:**
  - `key="value"`, with `\"` and `\\` escapes. A bare `key` means `true`.
  - Values are strings in the text and are coerced by the type's schema (numbers, booleans, enums).
  - **Body directives take scalar props only** (D3). Types with lists or nested objects are section-only.
- **Block index and operations:**
  - In the index (RFC-0014 §3) a directive is one top-level block of type `directive:<name>`.
  - `get_body` returns its parsed `{ type, props }` next to the markdown.
  - Its hash covers the whole directive, inner markdown included.

### 3. The props schema subset (D4)
A props schema is a JSON Schema object written in a subset small enough to:
- validate with a ~200-line interpreter (no code generation, no `eval`, so it runs on Workers, in Studio and in Node);
- turn into a form.

| Keyword | Allowed |
|---|---|
| `type` | `object` (root and one nested level), `string`, `integer`, `number`, `boolean`, `array` |
| object | `properties`, `required`, `additionalProperties: false` (always) |
| string | `minLength`, `maxLength` (≤ 10,000), `pattern` (RE2-safe subset, ≤ 200 chars), `enum` (≤ 50), `format`: `url` (the renderer's `safeHref` rule), `asset` (`asset:<id>`), `color` (`#rrggbb`), `markdown` (inline markdown, ≤ 2,000) |
| number, integer | `minimum`, `maximum`, `multipleOf` |
| array | `items` (a scalar or a one-level object), `minItems`, `maxItems` (≤ 50) |
| annotations | `title`, `description` (per-locale maps allowed: `{ "en": …, "tr": … }`), `default` (form prefill only; never applied silently), `x-widget` (`textarea`, `radio`, `asset-picker`) |

- Anything else is rejected when a type is registered, so a theme cannot ship a schema the interpreter does not understand.
- Built-in contracts keep their precompiled ajv validators (ADR-0008). This interpreter covers only block props, whose schemas come from themes at deploy time and cannot be precompiled with Cloudhal.

### 4. Built-in types (D5)
| Name | Where | Props | Content |
|---|---|---|---|
| `callout` | section, body | `tone`: `info` / `success` / `warning` / `danger` (default `info`), `title?` (≤ 120) | markdown |
| `button` | section, body | `label` (≤ 60), `href` (`url`), `variant`: `primary` / `secondary` | none |
| `embed` | section, body | `url` (`url`): a YouTube, YouTube-nocookie or Vimeo video URL in v1, `title` (≤ 200, required for accessibility) | none |
| `faq` | section | `items`: array (≤ 50) of `{ question (≤ 300), answer (markdown, ≤ 2,000) }` | — |

- The existing section kinds (hero, richText, image, contentList) stay as they are in v1. They may become registry types later without a contract break, since both forms render through the same lookup (§5).
- `embed` renders a privacy-preserving placeholder: a poster and a "Play" button that loads the iframe from `youtube-nocookie.com` or `player.vimeo.com` on click.
  - The site's CSP gains those two hosts in `frame-src`, only when a published snapshot uses `embed` (RFC-0013's static `_headers` are computed per build).

### 5. Rendering
- **Sections.** `Sections.astro` renders `kind: "component"` by looking up `type` in `{ ...builtInBlocks, ...theme.blocks }`, a map from name to Astro component.
  - An unknown type renders nothing on the public site and a labelled placeholder in previews.
- **Bodies.** `RichText.astro` and article bodies split the markdown into top-level units (`splitMarkdown`).
  - Runs of ordinary units render with `marked` as today.
  - Each directive unit renders with the same component, receiving `{ props, children }`, where `children` is the inner markdown rendered by the same safe renderer.
  - So a block looks the same in a section and in a body, and themes override one component for both.
- **Safety.**
  - Props are validated before render.
  - String props are text: Astro escapes them. `markdown` props render through the safe renderer. `url` and `asset` props go through `safeHref` and the asset resolver.
  - No raw HTML enters through props.

### 6. Theme types
- **Declaring.** A theme declares its types in `src/blocks.ts`. The file is pure data with no Astro or DOM imports, so Node and Workers can import it:
  ```ts
  import { defineBlockTypes } from "@cloudhal/core-ts/blocks";
  export const blockTypes = defineBlockTypes([{ name: "acme-pricing", where: ["section"], props: {…}, … }]);
  ```
  Its components go in `src/theme.ts`'s new `blocks` map: `export const blocks = { "acme-pricing": Pricing }`.
- **Deploying.** `cloudhal deploy` validates the theme's types (names, subset, examples against their own schema) and generates `block-types.ts` into the admin Worker, the way skills are bundled today. `cloudhal studio` imports the file directly.
- **Serving.**
  - `GET /api/sites/:siteId/block-types` (`content:read`) returns the registry Studio uses.
  - MCP `list_block_types` returns the same, with each props schema as JSON Schema.
- **A type that disappears.** If a type in stored content is missing from the registry (a theme removed it), the content is kept. Studio shows the block as "Unknown block · <name>", editable as markdown or JSON, and the public site renders nothing.

### 7. Writes and agents (D6)
- **Validation.**
  - The store validates `component` sections and body directives of known types on every write. Bad props are a 422 `invalid_props` naming the block and the field.
  - Unknown types are accepted but reported in the write's result (`unknownBlocks`), so an import from another theme is never lost.
- **New `edit_body` operations** (RFC-0014 §4 reserved them):
  - `insertBlock { after, type, props, markdown? }` writes the directive for the agent, so agents never hand-write attribute syntax.
  - `setProps { block, props }` changes a directive's attributes and keeps its inner markdown.
  - Both validate against the registry.
- **Page tools.** `update_page` and the section tools accept `component` sections. `list_block_types` helps agents pick types and props.

### 8. Studio
- **Sections.** "Add section" lists the component types, grouped by category. The section form is generated from the props schema with Kumo inputs:
  - `Input` (`url` checked, `color` with a swatch), `InputArea`, `Select` / `Radio` for enums, `Switch`, number `Input`;
  - the asset picker for `asset`;
  - a repeatable list for arrays, with move, add and remove.

  The generated form is a new block in `packages/ui/src/blocks`, so it serves every type.
- **Bodies.**
  - The slash menu lists body-capable types.
  - A directive is a Tiptap node: a `SectionCard`-like frame with the type's icon and title, a "Properties" `Popover` holding the generated form, and, for containers, the inner markdown edited in place.
  - The codec reads and writes the directive syntax exactly. An unparseable directive stays a source block (RFC-0014 phase 1 rule: nothing silently rewritten).
  - Markdown mode shows the directive text.
- **Preview.** Draft previews render blocks like the site.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| MDX components in bodies | Familiar to developers; any prop shape | Executes code at build; not safe for agent-written content; no Workers runtime; ties bodies to React/JSX | Bodies stay data; directives are inert text |
| HTML custom elements in bodies (`<cloudhal-callout>`) | Renders anywhere | Raw HTML is escaped by profile v1; sanitizer allowlist grows per type; awkward for agents | Directives keep markdown readable and safe |
| A typed body tree (blocks as JSON) instead of markdown | Precise structure | Reverses ADR-0028 (markdown canonical) | Rejected in RFC-0014 |
| Full JSON Schema with ajv compiled at deploy | Complete validation | `cloudhal deploy` would ship generated code per theme; Studio would need ajv in the browser; no form generation from arbitrary schemas | A subset gives validation and forms from one definition |
| A new section kind per type in the contract | Fully typed contracts | Every theme block becomes a contract change and an RFC | The registry is exactly the extension point contracts lack |
| Gutenberg-style block comments in HTML (`<!-- wp:… -->`) | Proven at scale | HTML-centric; comments are invisible in markdown tools | Directives are the markdown community's syntax for this |

## Compatibility & migration
- **Contracts.** One additive section variant; `schemaVersion` stays 1. Old readers of `Section` see an unknown `kind`; `Sections.astro` already renders unknown kinds as an empty marker.
- **Bodies.**
  - Existing bodies have no directives. A body that happens to contain `:::` lines is read as a directive only when the name matches `[a-z][a-z0-9-]{1,40}` and the fences pair up. Otherwise it stays text, as today.
  - Before rendering changes, the renderer and Studio count bodies with `:::` lines (a one-off report in `cloudhal snapshot`) so nothing changes unannounced.
- **Rust.** The Rust core's splitter learns the directive fence when it learns the profile (RFC-0014 §2). The fixtures `fixtures/*/body-markdown` gain directive cases.
- **Rollback.** Remove the `component` sections and directives; the rest of the content is untouched. Unknown-type handling means switching themes never loses data.

## Security & policy impact
- **No code from content.** Props are data, validated by a fixed interpreter; components come from Cloudhal or the deployed theme only. Agents and AI can choose types and props, never components.
- **URLs and media.** `url` props follow `safeHref` (RFC-0014 safe renderer), `asset` props the asset resolver (RFC-0004). `embed` allows a fixed host list and loads nothing until clicked, and CSP `frame-src` lists only those hosts and only when used.
- **Scopes.** No new scope. Writing a block is writing the page or entry (`content:write`, own limits for articles), and proposing one is `content:propose` (ADR-0028).
- **Limits.**
  - ≤ 64 props per block, ≤ 50 array items, ≤ 10,000 characters per string.
  - The body and page size limits still apply.
  - The interpreter's `pattern` support is a linear-time subset (no backreferences or lookaround), so a theme cannot ship a catastrophic regex.

## Phases
| Phase | What | Contract |
|---|---|---|
| 6a | `@cloudhal/core-ts/blocks`: types, subset interpreter, built-ins, `defineBlockTypes`; `component` section; store validation; renderer for sections; Studio section forms; `GET …/block-types` | `ComponentSection` |
| 6b | Body directives: splitter, block index `directive:<name>`, renderer split, codec and Tiptap node, slash menu | none (profile v1) |
| 6c | MCP: `list_block_types`, `insertBlock`, `setProps`, `component` sections in page tools; AI commands keep directives intact | none |
| 6d | Theme types: `src/blocks.ts`, deploy bundling, unknown-type UI | none |

## Open questions
Defaults proposed, to be accepted with this RFC:
1. **Built-in types:** `callout`, `button`, `embed` (YouTube or Vimeo, click to load), `faq` (sections only).
2. **Body directive props:** scalars only; lists and objects are section-only.
3. **Validation:** the props subset interpreter (§3), not ajv at deploy.
4. **Unknown types:** kept, reported, editable as markdown or JSON, not rendered publicly.
5. **Existing section kinds:** unchanged in v1; moving them into the registry is a later, compatible step.
6. **Theme type names:** a convention (`<theme>-<name>`), not enforced; built-in names are reserved.
