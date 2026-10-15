# RFC-0020: Agentic build — generative UI surfaces, streamed build sessions and interactive components
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-15
- Related:
  - RFC-0015 / ADR-0030 (block registry: the catalog's components);
  - RFC-0017 / ADR-0031 (design settings; `GeneratorPlan` and `apply_plan`, which this RFC turns into a stream; Kumo catalog panels, which use the same surface format);
  - RFC-0018 (theme packages: a theme supplies the catalog and its renderers);
  - RFC-0014 / ADR-0028 (markdown canonical, block ids, body operations);
  - RFC-0016 / ADR-0029 (model transport, budgets);
  - ADR-0011 (MCP), ADR-0015 (agent modes);
  - threat model, promise 4 (first-party scripts only).
- References: §References. Package versions checked with `npm view` on 2026-10-15.

## Summary
- **Pages and articles can hold generative UI surfaces.** A surface is a flat list of catalog components with ids, children and props, plus a data model. Props may bind to the data model with JSON Pointer paths, and interactions fire named actions. The shape follows Google's A2UI v0.9, Vercel's json-render and Kumo's `UITree`, so a model trained on any of them writes ours. It is data, never code, and it is validated on every write.
- **Building is a live, streamed session.** An agent (Studio's Build chat, the CLI, or any MCP client) sends JSON Patch operations against a draft. Cloudhal validates and repairs each operation, applies it, and streams the change to everyone watching. Studio shows a v0-style split view: the conversation on one side, the real site rendered by the real theme on the other, updating as elements land.
- **Markdown carries UI inline.** A ` ```surface ` fence inside an article streams one component per line. Prose and interactive UI interleave the way ChatGPT and Claude answers do, and the published site renders them with a small first-party runtime, so `script-src 'self'` holds.

## Motivation
- **Agent builders set the bar now.** v0, Lovable and Bolt build a working page from a conversation and show it growing live. ChatGPT and Claude answer with interactive widgets inside text. Cloudhal's agents can write pages, but only as finished tool calls. Nothing streams, the preview refreshes after the fact, and content has no interactive parts.
- **Those tools generate code and repair it afterwards.** Bolt emits whole files, Lovable patches JSX through an AST, and v0 rewrites the stream and runs autofixers. By Vercel's own account, unrepaired model output can be wrong about one time in ten. Code from a prompt is also exactly what Cloudhal's model forbids on a live site: agents write data through the policy engine.
- **The industry converged on a data format.** A2UI, json-render, Kumo's catalog and OpenUI each describe UI as a flat list of components from a trusted catalog, with bindings and named actions, streamed incrementally. Data can be validated *per operation, while it streams*. That is stronger than repairing code after the fact, and it keeps Cloudhal's guarantees: drafts, snapshots, diffs, approval, rollback.
- **Today's pieces almost fit.**
  - The block registry is a catalog without nesting, data or interaction.
  - `apply_plan` (RFC-0017) is a batch, not a stream.
  - Kumo panels (RFC-0017 §4) already use a `UITree`.
  - Body directives put typed blocks inside markdown.

  This RFC joins them into one format and one live loop.

## Proposal

### 1. Surfaces (contract change)
A new `Section` variant, and the same object inside markdown bodies (§5):
```jsonc
{ "id": "sec_…", "kind": "surface",
  "catalog": "blog@1",                       // theme name @ catalog major (RFC-0018 manifest)
  "components": [                            // flat, ≤ 200; one has id "root"
    { "id": "root",  "component": "Stack",   "children": ["title", "plans"] },
    { "id": "title", "component": "Heading", "props": { "level": 2, "text": { "path": "/headline" } } },
    { "id": "plans", "component": "Tabs",    "children": ["monthly", "yearly"] },
    …
  ],
  "data": { "headline": "Pricing", "billing": "monthly" },   // ≤ 64 KB JSON
  "style": { "width": "wide", "tone": "muted", "motion": "rise" } }   // RFC-0018 §6
```
Invariants:
1. **Structure.**
   - Component ids are unique per surface and match `[a-z][a-z0-9-]{0,40}`.
   - `children` refer to ids in the same surface. The tree is acyclic, at most 8 deep, and every component is reachable from `root`.
2. **Every `component` is a catalog entry** (§2), and its `props` pass the entry's schema. Values are checked by the existing eval-free props interpreter (RFC-0015 §3), extended with bindings (§3).
3. **Unknown and misfitting parts are kept and flagged, never dropped or rewritten** (the RFC-0015 rule). The site does not render them, and previews show a labelled placeholder.
4. **Limits:** 200 components, 64 KB of data and 30 surfaces per page. Every prop keeps the registry's existing limits.

Field names follow A2UI v0.9 (`id`, `component`, `children`). Props sit under `props`, a declared map (hard rule 2), so the contract keeps `additionalProperties: false`. A2UI's inline props map to it mechanically (§9).

### 2. The catalog
A catalog is what a surface may contain. It is the block registry grown into a component system:
- **Layout primitives (built in, styled by the theme):** `Stack`, `Row`, `Grid`, `Columns`, `Band`, `Card`, `Spacer`, `Divider`.
- **Content primitives (built in):** `Heading`, `Text` (inline markdown), `Markdown` (block markdown through the safe renderer), `Image` (assets only), `Icon` (the theme's set), `Button`, `Link`, `Badge`, `Stat`, `Quote`, `List`, `Table`, `Chart` (a fixed set of chart kinds over data-model series), `Video` (RFC-0015's embed).
- **Interactive primitives (built in, §4):** `Tabs`, `Accordion`, `Toggle`, `Select`, `Slider`, `Counter`, `Carousel`, `Disclosure`, `Form` and its fields.
- **Registry blocks** (`callout`, `faq`, `testimonial`, a theme's `pricing-table`, …) are catalog components too. A block type gains optional `children: "any" | readonly string[]` so containers can nest (Shopify's `@theme` rule).
- **The theme provides the catalog** (RFC-0018 manifest `catalog`). It renders every component with its own Astro components, may restyle or omit primitives, and adds its own components. `catalog: "<theme>@<major>"` records which catalog a surface was written for.
- **One source for prompts.** `catalogPrompt(catalog)` turns the catalog into the model's instructions: names, props, bindings, examples. Studio's Build chat and `get_theme` (RFC-0018 §7) use it, so the model sees exactly what the validator accepts. This is the idea behind Kumo's `generatePrompt` and json-render's `catalog.prompt`, built on our JSON Schema subset instead of Zod. Zod's JIT path needs `new Function`, which Workers forbid (hard rule 6).

### 3. Data model, bindings, functions
- **Bindings.** A prop declared `"x-bindable": true` accepts a literal or `{ "path": "/json/pointer" }` into the surface's `data`. Visibility uses `visible: <condition>`, with `eq`, `ne`, `gt`, `lt`, `and`, `or`, `not` over paths and literals (Kumo's `VisibilityCondition`).
- **Named functions, no code.** `{ "call": "formatDate", "args": { "value": { "path": "/d" }, "style": "long" } }`. The set is fixed and Cloudhal implements it: `formatDate`, `formatNumber`, `formatCurrency`, `pluralize`, `concat`, `length`, `required`, `minLength`, `maxLength`, `email`, `range`. There is no regex function, which avoids ReDoS.
- **Server data sources.** `data` may hold `{ "$source": "entries", "query": { collection, filter, sort, limit ≤ 50 } }`. The renderer resolves it on the server from the page's own source, published or preview, as `EntryCard[]` (RFC-0018 §3), and tags the cache. RFC-0018's data blocks become this one mechanism, and more sources follow the same pattern (`terms`, `menus`, `analytics.summary` for previews).

### 4. Interactive components on the public site
- **Rendered on the server first.** Every surface is HTML from the theme's Astro components, including its initial state, so a reader without JavaScript gets a complete page. `Tabs`, `Accordion` and `Disclosure` use native `<details>` and radio patterns that work with no script at all.
- **Enhanced by one first-party runtime.** Pages whose surfaces bind state or fire actions load `/_cloudhal/i.<hash>.js`, about 6 KB gzip and hashed, like the analytics and comments scripts. It reads each surface's data model from a `<script type="application/json">` element that the server escapes. Then it applies bindings, visibility and checks, and runs actions. CSP stays `script-src 'self'`, and nothing from the model is ever evaluated.
- **Actions are names Cloudhal implements.**
  - **Client actions:** `set` (a path to a literal or path value), `toggle`, `increment`, `reset`, `navigate` (safe in-site paths or `safeHref` URLs), `copy`, `share` (Web Share, falling back to copy), `scrollTo` (an anchor).
  - **Server actions** (`submit`) post to Cloudhal endpoints only. In v1 that is the reader-facing ones that already exist, such as the comment form. Form storage, newsletter signup and polls each come with their own RFC and rate limits.
- **Motion** stays CSS (RFC-0018 §7). The runtime only toggles classes and attributes.
- **Threat model, promise 4** gains "the interaction runtime" in its list of first-party scripts. No other change is needed.

### 5. Markdown and UI, interleaved
Bodies stay markdown (ADR-0028). A surface is written inline as a fenced block whose lines are JSON values:
````markdown
Our plans changed this year. Here is what you pay:

```surface {"id":"pricing","catalog":"blog@1"}
{"data":{"billing":"monthly"}}
{"id":"root","component":"Stack","children":["switch","table"]}
{"id":"switch","component":"Toggle","props":{"options":["monthly","yearly"],"value":{"path":"/billing"}}}
{"id":"table","component":"pricing-table","props":{"period":{"path":"/billing"}}}
```

Questions? Ask in the comments.
````
- **Line rules.** The info string holds the surface's `id` and `catalog`. Every following line is either one component or a `{"data": …}` merge. Components may come in any order and are buffered until `root` exists, which is A2UI's rule.
- **Why lines.** A line is complete or not. A streaming renderer validates and shows each completed line and ignores the unfinished tail. Nothing half-parsed is ever shown as if valid.
- **Directives stay** for small, one-line blocks (`::button{…}`, `:::callout … :::`). A directive or fence that is still open while streaming shows a placeholder until it closes.
- **The store** parses fences as surfaces, applies §1's invariants, and indexes them as body blocks (RFC-0014 block ids). The article editor shows each one as a live node view. Agents edit them by id with the same patch operations as page surfaces (§6).
- **Prose while streaming** goes through a healing pass that closes unterminated emphasis, links and code before each render, the technique of Streamdown's `remend`. Only the renderer's view is healed; stored text is never changed.

### 6. Build sessions: the live loop
**Operations.** Every change to a draft target (a page's sections, a surface or an entry body) is an RFC 6902 JSON Patch operation. This is json-render's SpecStream and AG-UI's `StateDelta` vocabulary.
```jsonc
{ "op": "add", "path": "/sections/2/components/-", "value": { "id": "cta", "component": "Button", … } }
```
**The pipeline for each op**, on the server, in this order:
1. **Policy.** The session's actor must hold the target's scopes. The agent mode decides as for any write (ADR-0015).
2. **Repair**, which is deterministic and reported, never silent:
   - snap an unknown component, icon or enum value to the nearest catalog entry by edit distance (≤ 2);
   - fill missing required props from the type's `example`;
   - drop props the schema does not know.

   Each repair is returned as a note.
3. **Validate** the resulting document: schema, catalog, invariants and limits.
4. **Apply, or refuse.** A refusal is `{ code: "VALIDATION_FAILED", path, message }`, so the model corrects itself, as A2UI recommends.

**The session.**
- **Where it runs.** On Cloudflare, one Durable Object per target, built on the Agents SDK. On Node (`cloudhal studio`), an in-process object.
- **Who it serves.** It holds the draft document in memory and serves every viewer and writer over WebSocket, with SSE as a fallback.
- **Events.** It broadcasts in AG-UI's vocabulary: `RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `STATE_SNAPSHOT`, `STATE_DELTA`, `RUN_FINISHED` and `RUN_ERROR`, and `CUSTOM` for repair notes and validation failures. A reconnecting viewer gets a snapshot, then the deltas after it.
- **Persistence.** The draft is written to the store with CAS (hard rule 4) at checkpoints: after 2 seconds of quiet, every 50 operations, and at the end of a turn. Each turn's end is one snapshot, so a build is a few readable versions, not thousands. The session keeps per-operation history for undo until it closes.
- **Ghosts.** While a model is still writing a tool call, viewers receive its partial input (AI SDK `input-streaming`, MCP `tool-input-partial`). Studio draws it as an unvalidated ghost of the one element being written, and commits it only when the operation passes. Partial JSON is never stored.

**The preview.**
- **Real rendering.** Studio's preview is the real site in preview mode, on the preview origin, rendered by the real theme. One renderer serves preview and production, as with Lovable's live dev server, but without a build step.
- **Updates.** On each committed delta, the session tells the preview which sections changed. The preview fetches their server-rendered HTML and morphs it into place with a preview-only first-party script, at most 4 updates per second.
- **Scroll and focus.** The preview follows the element being built.

**Who drives a session.**
- **Studio's Build chat.**
  - The person types a brief. The site's model (RFC-0016 transport; tool calls through the AI SDK with `workers-ai-provider`, the path ADR-0029 reserved for structured output) answers with text and patch operations as tool calls.
  - The person can click an element in the preview to scope the next instruction to it, which is Lovable's visual edit as data.
  - Budgets: RFC-0016's daily cap counts one build turn as one command.
- **Any MCP client.** `open_build_session {target}`, `patch_draft {session, rev, ops[]}` (each op passes the pipeline; the reply lists applied ops, repairs and failures), `get_draft`, and `close_build_session`. `apply_plan` (RFC-0017) becomes a stream of these operations.
- **MCP Apps (outward only).** Cloudhal serves its preview as a `ui://cloudhal/preview` resource, our own bundle, so Claude, ChatGPT and other MCP Apps hosts show the live draft inside the conversation. Nothing from MCP Apps reaches the public site.

**Ending a session.** The person reviews the draft through the existing diff and preview and publishes as usual. A build never publishes (RFC-0017 D2).

### 7. Admin panels share the format
RFC-0017's Kumo panels become surfaces whose catalog is `kumo@2` (Kumo's `UITree` maps one to one) and whose actions are MCP tools. Each panel action keeps running as the person who clicks, under the same policy. The result is one format, one validator and one streaming loop, with two catalogs: the site's theme for readers and Kumo for Studio.

### 8. What does not change
- **No model-written code.** The model writes no code, CSS, HTML or script, anywhere.
- **No new path to the public site.** Everything a session writes is a draft, published by a person.
- **The existing section kinds** (`hero`, `richText`, `image`, `contentList`, `component`) keep working. Studio offers "convert to surface".

### 9. Interop
- **A2UI import/export** (pinned to v0.9.1, tracking v1.0): `createSurface` and `updateComponents` become a surface and patch operations, and `updateDataModel` becomes `data` patches. Any A2A or AG-UI agent can therefore build a Cloudhal page, and Cloudhal surfaces can be shown by A2UI's renderers.
- **json-render specs** convert the same way: `elements` become components, and the `$state` bindings become paths.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Generate code like v0 / Lovable / Bolt | Unlimited UI | Code from prompts on live sites, after-the-fact repair, no per-op policy, no data diffs | Breaks the agent-writes-data model; validated data is the stronger loop |
| MCP Apps / OpenAI Apps iframes on the site | Arbitrary interactive UI | Model or third-party HTML+JS, sandbox origin, CSP widening | Outward preview only (§6) |
| Adopt A2UI verbatim as the stored format | Standard | Preview-stage spec with renames coming in v1.0; inline props break hard rule 2 | Align names, keep our contract, convert at the edge (§9) |
| json-render or Kumo catalog with Zod at runtime | Ready-made | Zod's JIT needs `new Function` on Workers; 0.x churn | JSON Schema subset, eval-free (§2) |
| MDX in bodies | Familiar | `evaluate` runs `eval`; code in content | Rejected since RFC-0015 |
| Markdoc tags for UI | Typed attributes | Another syntax beside directives; tags do not stream line by line | Fenced JSONL streams safely (§5) |
| Stream partial JSON straight into the stored draft | Most "live" | Invalid states stored, flicker, nothing to roll back to | Ghosts in the viewer, commit per valid op (§6) |
| Client-side preview renderer | Instant | A second renderer that drifts from the theme's Astro components | Server-rendered fragments plus morph (§6) |

## Compatibility & migration
- **Contracts (additive).** A new `SurfaceSection` variant in `section.schema.json` with `SurfaceComponent` in `common.schema.json`. `schemaVersion` stays 1. Fixtures cover valid trees, cycles, unreachable components, depth, limits and bindings. `pnpm gen` regenerates TS and Rust.
- **Bodies.** ` ```surface ` fences are new syntax. Existing bodies with such a fence (unlikely) are reported once before rendering changes, as RFC-0015 did for `:::`.
- **Storage.** Build session history lives in the Durable Object, or in memory on Node. Checkpoints are ordinary draft writes, so no migration is needed.
- **Packages.** New public API: `@cloudhal/core-ts/surfaces` (types, validator, patch pipeline, `catalogPrompt`), `@cloudhal/astro-renderer` (surface rendering, interaction runtime) and `@cloudhal/api` (session routes). Each needs a changeset.
- **Rollback.** Additive: removing surfaces leaves pages with their other sections. Turning the runtime off leaves server-rendered initial states.

## Security & policy impact
- **No code from models**, on the site or in Studio. Components come from the deployed catalog, and functions and actions are fixed sets implemented by Cloudhal.
- **One new first-party script** (the interaction runtime) and one preview-only script (the morph). Both are hashed and self-hosted. The site CSP is unchanged.
- **Data model safety.**
  - Data is JSON, escaped into `application/json` script elements, and never interpolated into HTML or CSS.
  - Bound values render as text, through the same escaping as props.
  - `navigate` accepts only `safeHref` URLs.
- **Prompt injection.**
  - Content can ask a model to write operations, but every operation passes policy and validation and lands in a draft a person reviews.
  - Reader-side actions cannot reach agents or tools in v1.
  - Server actions, when they come, re-validate their input and run under their own rate limits.
- **Sessions.** Joining a session needs read access to its target, and writing needs the target's write scopes. Every applied operation is audited per turn (counts, ops summary). Sessions close after 30 minutes idle.
- **Budgets.** Operations are capped at 500 per turn and 20 per second per session, plus the limits in §1.

## Phases
| Phase | Scope | Contract |
|---|---|---|
| 20a | Surfaces: contract, built-in primitives, blog theme renderers, store validation, `patch_draft` with repair notes and `VALIDATION_FAILED`, `catalogPrompt` | `SurfaceSection` |
| 20b | Build sessions: Durable Object / Node session, AG-UI events, Studio Build view (split chat and live preview, ghosts, morph) | none |
| 20c | Studio Build chat on the site's model (tool calls), click-to-scope, budgets | none |
| 20d | Markdown surfaces: ` ```surface ` fences, streaming renderer with healing, editor node view | none |
| 20e | Interaction runtime: bindings, visibility, checks, client actions; threat model update | none |
| 20f | MCP Apps preview resource; A2UI and json-render import/export; Kumo panels as surfaces | none |

### Status
- **20a shipped.**
  - **Contract:** `SurfaceSection` and `SurfaceComponent`, with fixtures.
  - **`@cloudhal/core-ts/surfaces`:**
    - the catalog: 22 primitives plus the registry's section blocks;
    - eval-free checks of the tree, props, `{path}` bindings, named functions, visibility conditions, data and `$source` queries;
    - deterministic repairs, RFC 6902 `applyPatch`, `patchPage` with `VALIDATION_FAILED` issues, and `catalogPrompt`.
  - **The store** refuses broken surfaces with `invalid_surface` (422) and keeps unknown components.
  - **Rendering:**
    - `@cloudhal/astro-renderer/surfaces` turns a surface into a resolved tree and HTML;
    - `Surface.astro` / `SurfaceNode.astro` let the theme's `blocks` map draw any component, primitives included;
    - previews render surfaces;
    - entry sources load from the page's own source.
  - **MCP:** `get_catalog` (`content:read`) and `patch_draft` (`content:write`; CAS on `rev`, repairs reported, one snapshot per call).
  - **Studio** shows surfaces read-only.
  - **Blog starter:** styles every primitive. Bands leave the reading column; tabs and disclosures work without JavaScript.
- **Deviations in 20a:**
  - **Primitives not shipped yet.** `Toggle`, `Select`, `Slider`, `Counter`, `Carousel` and `Form` need the interaction runtime and land with 20e. `Table`, `Chart`, `Icon` and `Video` come later.
  - **Blocks cannot hold children yet.** `BlockType.children` from §2 is not in this phase.
  - **No `style` on surfaces.** Section styles (RFC-0018 §6) arrive with phase 18d for every section kind.
  - **The `catalog` id is recorded, not enforced.** Surfaces are checked against the deployed catalog whatever `catalog` says. Component names are one global vocabulary, as block names are (ADR-0030).
  - **Previews ignore source filters.** A preview of an entry source shows the collection's newest entries without applying the filter. The site applies it.

- **20b, first part, shipped** (live build view on one server):
  - **Build events.** `BuildObserver` in `@cloudhal/mcp-server`: `patch_draft` and `update_page` report applied changes, and `patch_draft` reports refused operations. Studio saves report too.
  - **Hub and stream.** The API's in-process `BuildHub` streams events at `GET /api/sites/:siteId/pages/:pageId/build/events` (`content:read`, at most 20 viewers per page) as server-sent events. The stream is AG-UI-shaped:
    - `STATE_SNAPSHOT` on connect;
    - `STATE_DELTA` carrying the rendered preview, the ops, the repairs and the changed section ids;
    - `CUSTOM` `validation_failed` with the refused parts' JSON Pointers.
  - **Studio Build view** (`/sites/:siteId/pages/:pageId/build`, DESIGN.md §2ac): an activity feed (`BuildActivity`), "Connect an agent", and `PreviewPanel morph`. The panel merges each version into the shown document by `data-section-id`, outlines what changed and keeps scroll and open tabs. The frame is `sandbox="allow-same-origin"`; scripts never run.
  - **Previews** style the primitives.
  - **Demo:** `apps/demo-newsroom/scripts/build-agent.ts`, a scripted MCP agent that builds a landing page step by step, including a refused step it then fixes and a repaired typo.
- **20b, second part, shipped** (Cloudflare):
  - **Build rooms.** One `BuildRoom` Durable Object per page (`BUILD_ROOMS`, SQLite-backed, migration `v2`) carries build events between the admin Worker's isolates. Writes post to `/publish`; each Build view stream holds a hibernatable WebSocket to the room, which limits a page to 20 viewers.
  - **Same API on both runtimes.** `createDurableBuildHub` implements the API's `BuildHub`, so the server-sent events route and Studio are unchanged.
  - **Async observers.** `BuildObserver` methods may be async. Tools and Studio saves await them through `notifyBuild`, which waits at most 2 seconds and never fails the write.
  - **Verified on workerd:** an agent's `patch_draft` over MCP reaches a Build view stream through the room.
- **20c shipped** (Studio's Build chat):
  - **The turn.** `POST /api/sites/:siteId/ai/build/:pageId` (`content:write`) `{ message }`. It runs on the site's model through RFC-0016's transport, with no new dependency.
  - **JSON Lines.** The model writes one JSON object per line: `say` (a note to the person), `ops` (one step) or `done`. A line is whole or not, like ` ```surface ` fences (§5). Each finished step is repaired, validated, written to the draft and shown in the Build view while the model writes the next one.
  - **Refusals go back.** Refused steps return to the model with their JSON Pointers, for at most 3 rounds.
  - **One turn, one unit.** A turn is one AI command against the daily cap, one AI job per person, and one snapshot (`reason: manual`). It is audited as `build_chat` without the brief, and it runs at most 5 minutes with 8,192 output tokens per round.
  - **Progress.** Progress streams to Studio as NDJSON: `round`, `say`, `writing` (the components named in the line being written, a lightweight ghost), `step`, `done` and `error`.
  - **Studio.** "Build with AI" sits at the top of the Build view (`BuildChat`, `BuildChatLog`): the brief, Build / Stop, and the transcript with repairs and outcomes. When AI is off or unreachable, the card says so and how to change it.
- **20c, click-to-scope, shipped** (Lovable's visual edit as data):
  - **Picking.** "Pick" in the Build view's preview header turns on a layer over the frame. It finds the section or component under the pointer by coordinates (`previewTargetAt`), so the frame still runs no scripts and its document is never changed. The pointer outlines the part; a click picks it; Escape stops.
  - **Previews mark components.** Each surface component's outer element carries `data-component-id`, in previews only; the public site's markup is unchanged.
  - **The scope.**
    - Build chat shows the picked part ("Changing Button “cta” in section 2") with a button to clear it. Briefs go out with `scope {sectionId, componentId?}` until it is cleared or a later version removes the part.
    - The API refuses a scope that is not on the page (400) before the model runs.
    - The model reads the part, its JSON Pointer and "change only that part unless the brief clearly asks for more". This is guidance, not enforcement: a brief may still change more.
- **20d shipped** (markdown surfaces):
  - **core-ts.**
    - `bodySurfaces` finds ```` ```surface ```` fences; ```` ``` ```` and `~~~` both open one, and fences inside other code blocks do not count.
    - `parseSurfaceFence` reads one line at a time: each line is a component or a `{"data":…}` merge, and `complete: false` marks a fence still streaming.
    - `checkBodySurfaces` checks the fences with the page-surface rules.
  - **The store** checks article bodies and rich-text sections. It refuses an unclosed fence, a duplicate fence id or an entry source (`$source` works in page surfaces only) with `invalid_surface`, keeps unknown components, and leaves the markdown unchanged.
  - **The renderer** draws fences everywhere bodies render: site, previews and feeds. With the theme's components, a fence becomes a body slot that `Body.astro` fills with `Surface.astro`, so theme blocks draw inside articles too.
  - **Studio's editor** keeps fences verbatim as source blocks (a code block would cut the info string).
  - **`catalogPrompt`** teaches the fence syntax.
- **20e shipped** (the interaction runtime):
  - **Components.**
    - **Primitives:** `Toggle`, `Select` and `Slider`. A `{path}` binding on `value` makes the input write to that path.
    - **Button actions:** `Button.onClick` takes `set`, `toggle`, `increment`, `reset`, `navigate`, `copy`, `share` or `scrollTo`. The store checks what each action needs. `href` is optional when an action is set.
    - **Gate:** `isInteractive` decides which surfaces load the runtime.
  - **Rendering a live surface.**
    - The data model goes in an inert, escaped `<script type="application/json" data-ch-state>`.
    - Bound text carries `data-ch-text`, inputs `data-ch-model`, actions `data-ch-action`.
    - Conditional components are rendered hidden inside a `display: contents` wrapper (`data-ch-visible`).
    - Only those surfaces load `/_cloudhal/surface.1.js`.
  - **The runtime.**
    - It is a constant module: about 5.7 KB, versioned and pinned by hash in a test.
    - It is served by `cloudhal dev`, always written for the Site Worker, and written by static builds only when a page has a live surface.
    - Its functions and conditions are tested against core-ts's.
    - It refuses prototype paths and unsafe navigation.
  - **The threat model's promise 4** lists the runtime and the video player.
  - **The blog theme** styles the inputs and action buttons.
- **20f, first part, shipped** (MCP Apps preview, per the MCP Apps extension 2026-01-26):
  - **Tools.** `preview_page` and `patch_draft` carry `_meta.ui.resourceUri: "ui://cloudhal/preview"`.
  - **Resource.** The server serves `ui://cloudhal/preview` as `text/html;profile=mcp-app`: Cloudhal's own constant View, with `prefersBorder`.
  - **View behaviour.**
    - It sends `ui/initialize`, then `ui/notifications/initialized`.
    - It shows `preview_page`'s HTML in a shadow root, with scripts, frames, forms and links removed.
    - After `patch_draft` it calls `tools/call preview_page` through the host for the new version. A refused step shows the refusal.
    - It reports `size-changed`, answers `ui/resource-teardown`, and ignores messages not from its host.
  - **Clients without UI support** ignore the metadata and get the same text and structured results.
  - **Tests.** A real MCP client sees the metadata and reads the resource; the View runs in happy-dom against a fake host.
- **20f, second part, shipped** (interop, §9):
  - **`@cloudhal/core-ts/interop`.** These conversions are deterministic, Worker-safe and never silent: what has no equivalent is left out and listed in `notes`.
    - `fromA2ui` / `toA2ui` handle A2UI v0.9 messages and the basic catalog (open question 6: v0.9 now; `A2UI_VERSION` is the adapter's version).
    - `fromJsonRender` / `toJsonRender` handle json-render specs: `root` + `elements`, `$state` ⇄ `{path}`, visibility (`gte`/`lte` as `not`), and `state` ⇄ `data`.
  - **A2UI import.**
    - Messages apply in order: later components replace earlier ones, and data updates merge.
    - Mapping: `Text` with `h1`–`h5` becomes `Heading`, `caption` a small muted `Text`; `Column`/`List` become `Stack`; `Row` stays `Row` (with `justify` mapped); `Card` stays `Card`; `Tabs` becomes `Tabs` + `TabPanel`s; `Modal` becomes `Disclosure`.
    - A `Button` takes its text child as its label; `openUrl` becomes `href`.
    - `ChoicePicker` becomes `Toggle` (2–8 exclusive options) or `Select`; `Slider` stays `Slider`.
    - Template lists are expanded once from the data, with relative paths made absolute.
    - Functions: `formatString` with plain `${/path}` interpolation becomes `concat`; `formatNumber`, `formatCurrency`, `formatDate`, `pluralize`, `required`, `email` and `length` are renamed to Cloudhal's.
    - Left out, with a reason: server events, `TextField`, `CheckBox`, `DateTimeInput`, `Image`/`Video`/`AudioPlayer` URLs and `Icon`. Components of other catalogs keep their name and props for the store to judge.
  - **A2UI export.** Surfaces become basic-catalog messages.
    - Cloudhal-only components flatten: `Stat`, `Quote`, `List` and `Disclosure` become `Column`s of `Text`; bands, grids and columns become `Column`/`Row`.
    - Button actions become events named after the action, and `navigate`/`href` become `openUrl`.
    - Images become absolute URLs on the site's primary domain, or are left out without one.
  - **MCP.**
    - `import_surface {format: a2ui | json-render, document, surfaceId?, replaceSectionId?}` (`content:write`) takes messages as an array or JSON Lines. It goes through `patch_draft`'s repairs, validation, write, snapshot and build events, and adds the conversion `notes`.
    - `export_surface` (`content:read`) returns the document and its `notes`.
- **Deviations in 20f so far:**
  - **Images.** Images in the MCP Apps preview do not load: the default MCP Apps CSP allows no image hosts, and preview media paths are relative to the deployment.
  - **No capability check.** The `ui` metadata is not gated on the client advertising `io.modelcontextprotocol/ui` (the stateless HTTP transport sees capabilities per request). Hosts without it ignore the metadata.
  - **Still to do.** Kumo panels as surfaces (needs RFC-0017 phase 7c).
  - **Interop is one-shot, not a live stream.** `import_surface` converts a finished message list. An A2UI agent streaming into a Build view through AG-UI (`updateComponents` as patch operations as they arrive) is not wired yet.
  - **A2UI client messages are out of scope.** Cloudhal surfaces have no server actions, so there are no `action` messages back to an agent. Button events are exported for renderers to route.
- **Deviations in 20e:**
  - **No server actions.** `submit`, forms, polls and newsletter signup each wait for their own RFC.
  - **Not shipped yet:** `Carousel` and `Counter` (a `Stat` plus an `increment` button covers counters).
  - **Plain-text updates.** Bound `Text` updates as plain text in the browser; the server renders its markdown first.
  - **Previews stay static.** Previews render live surfaces with their initial state only, because the preview frame runs no scripts.
- **Deviations in 20d:**
  - **No live editor node view.** Fences show as source blocks, edited in Markdown mode.
  - **No healing renderer yet.** The healing pass for partially streamed prose has no consumer until Build chat writes article bodies; `parseSurfaceFence` already supports partial fences.
  - **No body block operations.** Body surfaces are edited through the body (`update_entry`, `edit_body`), not through `patch_draft` operations by block id.
- **Deviations in 20c:**
  - **Text, not tool calls.** The model answers in JSON Lines over plain text streaming, instead of tool calls through the AI SDK. This works with every Workers AI text model and adds nothing to the admin Worker's bundle.
  - **Ghosts are names.** A ghost shows the component names in the line being written, not an outline in the preview.
  - **The transcript is per browser.** It is not kept; the draft and its snapshot are what last.
  - **Model choice is open.** The model eval (open question 7) is still to be done. Build uses the site's chosen model.
- **Deviations in 20b so far:**
  - **No checkpoints yet.** Each `patch_draft` call is still one store write and one snapshot; checkpoints (§6) come with 20c, where a model streams many small operations.
  - **No ghosts yet.** They need partial tool input, which an MCP server never sees; they come with Studio's own model loop (20c).
  - **No undo history yet.** Snapshots cover rollback; per-operation undo comes with checkpoints.
  - **Fragments are whole documents.** The preview is the framework-free preview document, merged in place, not the theme's server-rendered fragments. The theme's look in the Build view follows the site preview work in 20b part 2.

## Open questions
1. **Session runtime on Cloudflare.** Use the Agents SDK (`agents` 0.28, pre-1.0) or a plain Durable Object with our own WebSocket protocol? Default: a plain Durable Object speaking AG-UI events. The Agents SDK stays an option once it reaches 1.0.
2. **Checkpoint cadence.** Is 2 seconds of quiet, 50 ops or the end of a turn right? Default: yes, tuned after measurement.
3. **Repair aggressiveness.** Should snapping an unknown component name (edit distance ≤ 2) be on by default, or only report? Default: on, always reported, never for actions.
4. **Interaction runtime size budget.** Default: 6 KB gzip, enforced in CI.
5. **Server actions** (forms, polls, newsletter): one RFC each, or one "reader actions" RFC? Default: one RFC with a shared submission store and rate limits.
6. **A2UI version.** Should we export v0.9.1 now, or wait for v1.0? Default: v0.9.1 now, behind an adapter version flag.
7. **Model choice for Build.** Building pages needs reliable tool calling. Should Build recommend a different default model than the editor's AI commands (ADR-0029)? Default: yes. Pick by a small eval on our catalog (valid-op rate, repairs per turn, latency), run in CI against the recommended models.

## References
- Google A2UI: https://github.com/google/A2UI · spec v0.9: https://a2ui.org/specification/v0.9-a2ui/ · renderers: https://a2ui.org/reference/renderers/
- MCP Apps (SEP-1865): https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp · spec 2026-01-26: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx · announcement: https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- OpenAI Apps SDK UI: https://developers.openai.com/apps-sdk/build/chatgpt-ui
- AG-UI events: https://docs.ag-ui.com/concepts/events
- json-render: https://github.com/vercel-labs/json-render · streaming: https://json-render.dev/docs/streaming
- AI SDK generative UI: https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces · tool parts: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage · RSC paused: https://ai-sdk.dev/docs/ai-sdk-rsc/migrating-to-ui
- Streamdown: https://github.com/vercel/streamdown
- v0's agent pipeline: https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent
- Lovable visual edits: https://lovable.dev/en/blog/visual-edits · Bolt prompt format: https://raw.githubusercontent.com/stackblitz/bolt.new/main/app/lib/.server/llm/prompts.ts
- Kumo catalog streaming: https://kumo-ui.com/streaming.md (and `@cloudflare/kumo@2.14.0` `dist/catalog.d.ts`)
- Cloudflare Agents SDK: https://developers.cloudflare.com/agents/api-reference/agents-api/
- OpenUI Lang: https://www.openui.com/docs/openui-lang · Markdoc tags: https://markdoc.dev/docs/tags · remark-directive: https://github.com/remarkjs/remark-directive · MDX security note: https://mdxjs.com/packages/mdx/
- JSON Patch: https://www.rfc-editor.org/rfc/rfc6902
