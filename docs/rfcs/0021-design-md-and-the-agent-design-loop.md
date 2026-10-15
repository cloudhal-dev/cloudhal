# RFC-0021: DESIGN.md and the agent design loop
- Status: Accepted; 21a, 21b and 21c shipped
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-15
- Related:
  - `docs/design/agent-built-sites-gap-analysis.md` (G1, G2; the evidence behind this RFC);
  - RFC-0017 (design settings, `set_theme_settings`), RFC-0018 (themes, theme kit), RFC-0020 (surfaces, Build chat, MCP Apps);
  - ADR-0015 (agent modes), ADR-0030 (block registry), the skills format (`SKILL.md`, AGENTS.md hard rule 8).
- References (checked 2026-10-15):
  - Google Stitch DESIGN.md (an agent-readable design system file): https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/
  - Webflow MCP skills and Agent Instructions: https://developers.webflow.com/mcp/reference/skills.md
  - Anthropic, "Improving frontend design through Skills": https://claude.com/blog/improving-frontend-design-through-skills
  - Figma Make guidelines: https://developers.figma.com/docs/code/write-design-system-guidelines/
  - MCP tool results (image content, `structuredContent`): https://modelcontextprotocol.io/specification/latest/server/tools
  - MCP skills extension (SEP-2640): https://modelcontextprotocol.io/seps/2640-skills-extension
  - Cloudflare Browser Rendering: https://developers.cloudflare.com/browser-rendering/

## Summary
Agents building Cloudhal sites have no taste to follow and no eyes. They get no design guidance, and `preview_page` returns HTML with a neutral stylesheet, not the theme.

This RFC adds three things:
1. **DESIGN.md:** design rules in Markdown, a theme default plus the site's own, which every agent reads through `get_design`.
2. **An official `site-design` skill:** the process an agent follows.
3. **`render_page`:** returns the theme-rendered page as images at desktop and mobile widths, with deterministic quality checks, so an agent can look, fix and look again before a person publishes.

## Motivation
- **What agents produce today.** Claude, Codex, Cursor and Studio's Build chat all build through the same MCP tools. The result is plain, and it looks the same whoever builds it:
  - the server instructions and the six official skills say nothing about design;
  - `catalogPrompt` (~9 KB) teaches syntax only.

  An unguided model drifts to "the high-probability centre": default fonts, purple gradients, flat sections (Anthropic). A ~400-token guide fixes much of that.
- **Brand rules have nowhere to live.** A site owner cannot write down "one serif display face, warm neutrals, no stock-photo people, every page ends with a newsletter band" in a place every agent reads.

  Stitch's DESIGN.md, Webflow's Agent Instructions and Figma Make's `Guidelines.md` exist for this. They are portable Markdown that travels with the site, not with one client.
- **Agents cannot see the result.**
  - Lovable screenshots at three widths. Webflow returns element snapshots. Figma has `get_screenshot`.
  - Claude Code and Codex both pass image tool results to the model.
  - Cloudhal's `preview_page` does not even use the theme's CSS. In the gap analysis, the only way to check the newsroom home page was a separate browser.
- **Why now.** Every later step of the gap analysis (tokens v2, surface styles, motion, section library) only pays off once agents are guided and can check their work. The Build model eval also showed that pipeline and guidance, not the model, move quality.

## Proposal

### 1. DESIGN.md: two layers

**The theme's DESIGN.md.**
- **What and where.** A file shipped with the theme (`starters/blog/DESIGN.md`), read at build time into the renderer config (like `settings.ts`).
- **What it says** about the theme:
  - what it is good at (editorial, landing);
  - the components it styles best and their variants;
  - the section rhythm it expects;
  - its defaults.
- **Who changes it.** Theme authors write it; sites cannot change it.

**The site's DESIGN.md.** The owner's brand and design rules, stored on the site.

**Contract change (additive):**
```jsonc
// site.schema.json → properties
"design": {
  "type": "object",
  "additionalProperties": false,
  "required": ["markdown"],
  "description": "The site's design rules for people and agents (RFC-0021): Markdown read with the theme's DESIGN.md.",
  "properties": {
    "markdown": { "type": "string", "minLength": 1, "maxLength": 24000 }
  }
}
```

It lives on `Site`, so it is snapshotted, diffed and rolled back with the site and moves with `cloudhal push`/`pull`. It has no effect on rendering; it is guidance.

**The format: Markdown with recommended headings.** Unknown headings are kept. Recognised headings:

| Heading | What it holds |
|---|---|
| `## Brand` | Purpose, audience, voice in one paragraph |
| `## Colors` | Which theme settings and tones to use and how (`{color.brand}` refers to a design setting) |
| `## Typography` | Font choice, heading scale, case |
| `## Layout` | Section rhythm, widths, spacing, how many sections a page has |
| `## Components` | Which catalog components and variants to prefer or avoid (names in backticks: `` `Band` ``, `` `testimonial` ``) |
| `## Imagery` | Photo style, ratios, alt-text voice |
| `## Motion` | How much motion (for when presets exist) |
| `## Pages` | Recipes: "a landing page is hero → 3 features → proof → pricing → FAQ → CTA" |
| `## Do` / `## Don't` | Short rules |

**`design_lint`** gives warnings, never errors:
- `` `Name` `` references that are not in the site's catalog;
- `{color.x}` references that are not design settings;
- a missing `## Brand`;
- length over 8,000 characters (agents read it on every build).

Studio shows the warnings; `get_design` returns them.

### 2. Reading and changing it: MCP tools

**`get_design {siteId}`** (`site:read`, read-only). Everything an agent needs before it designs, in one call:
```ts
{
  /** The theme's DESIGN.md, then the site's, each marked with where it comes from. */
  design: { theme?: string; site?: string; warnings: string[] };
  /** The design settings now (RFC-0017): values, plus each key's type in one line. */
  settings: Record<string, unknown>;
  /** The catalog id and component names (details stay in get_catalog). */
  catalog: { id: string; components: string[] };
  /** Cloudhal's design guidance (§3): about 2 KB, the same for every site. */
  guidance: string;
  rev: number;
}
```

The site's Markdown reaches agents as **owner-written data**, between `<site-design-rules>` tags in the text result:
- it can shape design choices;
- it never grants scopes, skips approvals or changes tools (see Security).

**`set_design {siteId, rev, markdown | null}`** (`site:write`, **always waits for a person**, like `set_theme_settings`):
- the approval prompt shows the diff;
- a design rule changes every later build, so a person signs off;
- people edit it directly in Studio.

**Instructions.** The server's `INSTRUCTIONS` gain one paragraph near the top. It stays within Claude Code's 4,096-character budget, with keywords first:

> "Building or redesigning pages: call get_design first and follow the site's design rules, then get_catalog; build with patch_draft in small steps; check with render_page at desktop and mobile widths and fix what it reports before you ask a person to publish."

### 3. The `site-design` skill and Cloudhal's guidance

**The skill.** `skills/official/site-design/SKILL.md`. It uses the six spec fields only, with metadata `cloudhal.scopes: "site:read,content:read,content:write,preview:create"`. The steps:
1. **`get_design`.** Read the rules. When the site has none, propose a short DESIGN.md to the person (do not `set_design` silently).
2. **Plan.** For each page, list its sections with real content counts. Do not default to three of everything.
3. **Build** with `patch_draft`, a few components per step, `root` first.
4. **Check.** `render_page` at 1440 and 390 px. Fix every reported issue and anything that does not follow the rules. Look at the images: hierarchy, rhythm, contrast, empty space.
5. **Hand over.** `create_snapshot`, then report what changed with the preview URL. A person publishes.

**References:**
- `references/guidance.md`: the text `get_design` returns as `guidance`;
- `references/page-recipes.md`: landing, editorial home, about, pricing and contact, using today's catalog;
- `references/checklist.md`: the pre-publish checks.

**Cloudhal's design guidance** (~2 KB, in the spirit of `frontend-design`, written for Cloudhal's vocabulary):
- **Commit.** Choose one display treatment and one accent; vary section tones in rhythm (`surface` → `muted` → `brand`/`inverse`); never three identical sections in a row.
- **Hierarchy.** One h1 per page, a big contrast between heading and body sizes, short headings, sentence case.
- **Content.** Real copy and real images from the media library, alt text that describes. Counts follow the content, not habit.
- **Layout.** Lead with the strongest element. Use `Columns 2-1` or `Band width=full` for contrast, and grids of 2–4 items.
- **Interactivity.** Only where it helps a reader decide (pricing toggle, tabs, FAQ).
- **Check before handing over** (`render_page`).

**Delivery to every client.**
- **Tool:** the `get_design` result — tools are the only channel every client reads; Codex has no MCP prompts.
- **Skill resources:** `skill://site-design/…`, already served by the MCP server; SEP-2640 when clients adopt it.
- **Build chat:** the system prompt adds the effective DESIGN.md (cut at 8,000 characters) and the guidance.

### 4. `render_page`: the agent sees the page

**`render_page {siteId, pageId, widths?: (1440|768|390)[], fullPage?: boolean}`** (`preview:create`, read-only).
- **Input.** `widths` defaults to `[1440, 390]`; `fullPage` defaults to `true` and is cut at 8,000 px high.
- **Output.**
  - One **`image` content block** (PNG, at most 1,600 px wide after scaling) per width.
  - `structuredContent`:
```ts
{
  url: string;                  // the signed preview it rendered
  widths: { width: number; height: number; truncated: boolean }[];
  checks: { id: string; ok: boolean; count: number; examples: string[] }[];
}
```
- **What it renders:** the **theme's preview route** (`/?cloudhal-preview=…`), the same page a person sees in Studio's preview, not `PREVIEW_CSS`.
- **Deterministic checks**, measured in the rendered DOM at each width:

| Check | Fails when |
|---|---|
| `overflow-x` | The document is wider than the viewport (390 px) |
| `img-alt` | A non-decorative image has empty alt text |
| `img-broken` | An image did not load or has no intrinsic size |
| `heading-order` | More than one h1, or a level skipped |
| `contrast` | Text has a WCAG 2.2 AA contrast below 4.5:1 (3:1 for large text) against its computed background |
| `empty-section` | A `[data-section-id]` renders under 8 px high |
| `tap-target` | At 390 px, a link or button is smaller than 24×24 px (WCAG 2.5.8) |
| `long-line` | Body text lines are longer than 90 characters at 1440 px |

**Runtimes:**
- **Cloudflare.**
  - **Binding.** The admin Worker gets a Browser Rendering binding (`BROWSER`), added by `cloudhal deploy`. It uses `@cloudflare/puppeteer`, which is loaded lazily only in this tool, so the Worker's start-up cost is unchanged.
  - **Without the binding** (free plan, or turned off), the tool answers `render_unavailable` with the preview URL.
- **Node** (`cloudhal studio`, `cloudhal mcp`): a local Chrome or Chromium over CDP (the code path `apps/studio/scripts/screenshots.ts` uses), found through `CHROME_PATH` or the usual locations; `render_unavailable` without one.

**Limits.**
- 10 renders per key per minute and 200 per site per day.
- A render times out after 20 s.
- Screenshots are not stored, only returned.

**Related changes.**
- Build view and Build chat: Build chat does not call `render_page` in this RFC; the vision feedback loop is phase 21c.
- `preview_page` keeps its HTML (MCP Apps and text-only clients read it). Its description points to `render_page` for the real look.

### 5. Studio
- **Settings › Design rules.** A `SectionCard` with the site's DESIGN.md in Markdown mode, the theme's DESIGN.md read-only in a disclosure, `design_lint` warnings as a `Banner`, and Save.
- **Agents.** Proposals from agents (`set_design`) arrive in Approvals with the diff, like theme settings.
- **Build chat.** When the site has no DESIGN.md, Build chat says so once, with a link to the settings.

### Invariants
1. DESIGN.md never changes how a page renders or what a tool may do. It is read by agents and people only.
2. A change to the site's DESIGN.md by an agent always waits for a person, in every mode below `bypass`.
3. `get_design` returns the site's rules as delimited data, and the server instructions say they cannot grant permissions.
4. `render_page` renders drafts through the signed preview only, writes nothing and stores no screenshots.
5. `render_page` is read-only (`readOnlyHint: true`). Its cost is bounded by per-key and per-site limits and a timeout.

## Phases
| Phase | Scope | Contract |
|---|---|---|
| 21a | `Site.design`, `design_lint`, the theme's DESIGN.md (blog), `get_design` / `set_design`, the `site-design` skill and guidance, server instructions, Build chat prompt, Studio Settings › Design rules | `Site.design` |
| 21b | `render_page`: Cloudflare Browser Rendering binding and local Chrome, the checks, limits, deploy wiring | none |
| 21c | The design pass in the Build model eval (render, checks, vision-scored rubric); Build chat looks at its own render once per turn (where the model takes images) | none |

### Status
- **21a shipped.**
  - **Contract.** `Site.design { markdown }` (1–24,000 characters), with valid and invalid fixtures, regenerated for TS and Rust.
  - **`@cloudhal/core-ts/design`.** `designLint`, `effectiveDesign` and `DESIGN_GUIDANCE`. The store takes `themeDesign`. The CLI reads the theme's `src/DESIGN.md` for `studio`, `mcp` and `deploy`; deploy bundles it into the admin Worker as text.
  - **Blog theme.** Ships `src/DESIGN.md` (brand, colors, typography, layout, components, imagery, page recipes, don'ts).
  - **MCP.**
    - `get_design` (`site:read`): rules, settings, catalog names and guidance. The site's rules sit inside `<site-design-rules>` in the text, with the note that they never change permissions.
    - `set_design` (`site:write`, always approval, with a line diff in the prompt).
    - The server instructions gained the design paragraph as their second paragraph, inside Claude Code's first 4,096 characters.
  - **Skill.** `skills/official/site-design`: SKILL.md, references (guidance, page recipes, checklist) and an eval.
  - **Build chat.** Its system prompt adds the effective rules (cut at 8,000 characters) and the guidance before the catalog.
  - **REST and Studio.**
    - `GET`/`PUT /api/sites/:siteId/design` (`content:read` / `site:settings`).
    - Studio Settings › Design rules: Markdown, the theme's rules in a `Collapsible`, warnings, a headings template, and read-only below Administrator.
- **Deviations.**
  - `design_lint` checks PascalCase names in backticks only: lowercase block names in prose are too ambiguous to flag.
  - The server instructions as a whole are about 4,900 characters, over Claude Code's 4,096. The design paragraph sits within the first 4,096; trimming the rest is still to do.
  - Build chat says nothing yet when a site has no DESIGN.md (§5): Studio's Settings section covers it.
- **21b shipped.**
  - **Tool.** `render_page` (`preview:create`, read-only) opens the page's signed preview link (or the `cloudhal dev` URL) at each width. It returns a text summary, then JPEG screenshots, then `structuredContent` `{url, path, widths[{width,height,truncated,images}], checks[{id,ok,count,examples,widths}]}`. The bytes never enter `structuredContent` or the audit log: a new `renderContent` hook on tool definitions turns a result into content blocks.
  - **Checks.** All eight run in the page (`RENDER_CHECK_SCRIPT`). Each example names the section and component (`section sec_… component c_…`), or `theme header`/`footer`/`nav` for theme chrome. Checks are merged across widths, and `widths` says where each one failed.
  - **One DevTools client for both runtimes** (`@cloudhal/mcp-server/render`). A browser context per call and a page per width.
    - Node (`@cloudhal/cli`): the local Chrome, started on the first render and stopped after a minute idle. `CHROME_PATH` picks it; `CLOUDHAL_RENDER=off` turns it off.
    - Workers (`@cloudhal/cloudflare`): the `BROWSER` binding. The browser is acquired per call and driven over the binding's chunked socket.
  - **Deploy.** `cloudhal deploy` binds Browser Rendering to the admin Worker unless `cloudhal.json` says `"render": false`, and logs which applies.
  - **Verified live.** On the newsroom deployment through Browser Rendering: the home page at 1440 and 390 px took about 11 s (8 screenshots, all checks passed). The binding delivers binary messages as Blobs on current compatibility dates, so the socket asks for ArrayBuffers and reads any Blob in order. Timeouts name the stage they stopped in.
  - **Limits.** As specified, in memory per process or isolate. Errors are `render_unavailable`, `render_limited` and `render_failed`, each pointing to `preview_page`.
- **Deviations (21b).**
  - **Screenshots.** One JPEG per viewport (up to 4 per width, quality 60), not one tall PNG per width: tall images are scaled down by models until text is unreadable. A phone page that overflows sideways does not scroll, so its screenshots stop after the first and are marked truncated.
  - **No `@cloudflare/puppeteer`.** A small DevTools client serves Node and Workers alike, so there is no new package and nothing to load lazily.
  - **Articles too.** `entryId` is accepted like `preview_page`'s.
  - **`img-alt`** fails on a missing `alt` attribute; `alt=""` marks a decorative image and passes.
  - **`empty-section`** also fails on a section with no text or media.
  - **`tap-target`** applies WCAG 2.5.8's spacing exception: a small target fails only when a 24 px circle on it touches another target. Links inside sentences are exempt.
  - **`heading-order`** also fails on a page with no level-1 heading.

- **21c shipped.**
  - **Build chat looks once per turn** (`look` in `runBuildTurn`).
    - **When.** After the model's steps, the draft is rendered with the deployment's browser (the same one `render_page` uses): its signed preview, or its preview HTML when the site has no domain.
    - **Vision models** (`VISION_MODELS`: Llama 4 Scout, Mistral Small 3.1, Gemma 3) see two screenshots per width and the failed checks.
    - **Other models** see the checks as text, and only when something failed.
    - **The extra round.** The model gets one more round to fix what it saw, or answers `{"done":true}`.
    - **Studio.** The `look` event says which checks failed, in the person's language, and the extra round shows as "Improving what it saw…".
  - **The eval's design pass** (`cloudhal ai build-eval --design [--look] [--judge <model>|none]`, local or `--remote`).
    - **Per result.** The page is rendered (preview HTML), its failed checks recorded, and a vision judge (default Llama 4 Scout) scores it 1–5 on `DESIGN_RUBRIC`: fidelity, hierarchy, rhythm, spacing, readability, mobile.
    - **The table** gains "Failed checks/turn" and "Design score".
    - **`--look`** lets the built model see its render first, as Build chat does.
  - **`@cloudhal/api`'s `design-pass.ts`.** Holds `lookAt`, `lookMessage`, `rubricMessages`, `parseRubric` and `scoreDesign`. `AiMessage` content may now be text plus `image_url` parts (OpenAI's shape; checked on Workers AI with Llama 4 Scout and Mistral Small 3.1, about 2,000 input tokens per screenshot).
- **Deviations (21c).**
  - **Look round.** Build chat's look is one extra round after the refusal rounds (not counted in `maxRounds`). Refusals in it are reported, not retried.
  - **The eval renders the preview HTML,** not the theme's route: eval pages are never stored. The judge sees the same markup and Cloudhal's preview styles for every model, which is what a comparison needs.

- **First design evals** (2026-10-15, the newsroom deployment, `--remote --design --look`, judge Llama 4 Scout):

  | Model | Finished | Acceptance | Total | Failed checks/turn | Design score |
  |---|---|---|---|---|---|
  | `@cf/openai/gpt-oss-120b` | 4/5 | 69% | 32.7 s | 0 | 4.0 |
  | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 4/5 | 28% | 29.8 s | 0.25 | 4.0 |
  | `@cf/openai/gpt-oss-20b` | 3/5 | 46% | 35.1 s | 0 | 4.0 |
  | `@cf/zai-org/glm-4.7-flash` | 5/5 | 20% | 332 s | 0.8 | 3.5 |

  - **The design pass found what "finished" hides.** GLM "finished" 5/5, but two of its pages rendered empty: score 1 and 2.33, with empty sections flagged.
  - **Looking fixed half of what it found.** The look round found failed checks in 6 turns, mostly a page without a level-1 heading. The model's next round fixed them in 3.
  - **No builder takes images.** All four builders are text-only, so their look is the checks as text. The models that take images (Llama 4 Scout, Mistral Small 3.1) cannot write Build's JSON.
  - **The judge barely separates real pages.** It scores empty pages low but nearly every real page exactly 4.
  - **Pricing failed for every model.** Eight more samples of gpt-oss-120b showed why: the whole surface went into one long step. One sample closed it with `}}}]]` instead of `}}]}` (and the reader, counting only braces, swallowed the lines after it); another garbled the component list.
    - **Fixed.** The reader tracks brackets and ends an object at its last closer. `parseLine` puts closers in order, as a repair. An unreadable step is refused with where it broke and a request for smaller steps.
    - **After the fix,** gpt-oss-120b built pricing in both of two runs (acceptance 100% and 96%, scores 3.5 and 4).
  - **That re-run found three more gaps, now fixed in core.**
    - A component whose `children` was not a list crashed the check: a single id is now made a list, anything else is reported.
    - Components without an id were reported as `"undefined" is used twice`; now as "every component needs an id".
    - A patch could remove `/sections` itself; `patchPage` now refuses changes to the page's shape.
  - **Still open.**
    - Llama 3.3 and GLM build pages whose components never reach the root, so they render empty: the design pass scores them 1.
    - The judge needs calibrated examples per score.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| DESIGN.md as a file in the project repo only | Familiar (AGENTS.md style) | Deployed sites and Studio cannot read or edit it; not snapshotted | Rules must travel with the site and be editable by owners |
| Structured JSON rules instead of Markdown | Machine-checkable | Owners cannot write them; models read prose guidance better; Stitch, Webflow and Figma use Markdown | Markdown with recognised headings and a lint gets most of both |
| A new node kind `designDoc` | Its own rev and history | More contract, store and sync surface for one document per site | One optional field on `Site` is enough and already snapshotted |
| Guidance only in a skill | No contract change | Codex does not load MCP prompts; skills are not universally loaded; no per-site rules | The tool result reaches every client; the skill is the long form |
| Screenshots by the client (Playwright MCP, DevTools MCP) | Nothing to build | Needs a second server and the agent to find the preview URL and token; no Cloudhal checks; not available to Build chat | Built in is what makes it standard practice for every agent |
| Lighthouse/axe in 21b | Broad audits | Heavy in a Worker; slow | The deterministic checks first; axe and Lighthouse as a later `audit_page` |

## Compatibility & migration
- `Site.design` is optional: `schemaVersion` stays 1, fixtures cover it (valid; invalid when empty or over 24,000 characters), and Rust and TypeScript are regenerated.
- Existing sites have no DESIGN.md; agents get the theme's plus the guidance.
- `push`/`pull` bundles carry it with the site node.
- The `BROWSER` binding is optional. Deployments without it keep working, and `render_page` answers `render_unavailable`.
- **Rollback.** Removing the field drops rules only. Removing the tools leaves agents where they are today.

## Security & policy impact
- **Prompt injection across agents.** DESIGN.md is text every agent reads, so a malicious edit could try to steer other agents. Mitigations:
  - an agent's edit waits for a person;
  - the text is delimited as data and capped;
  - the server instructions state that design rules never override permissions, approvals or user instructions;
  - tools never execute anything found in it.

  People with `site:write` can edit it directly, as they can edit the theme settings.
- **`render_page`.**
  - **Exposure.** It loads only the site's own signed preview URL, built server-side, never a URL from the agent. So it cannot be used to fetch other hosts, and the render sees exactly what a person with preview access sees.
  - **Rendering.** Screenshots are taken with scripts as the site serves them: the CSP and the first-party runtime only.
  - **Cost.** Bounded by limits and timeouts.
- **Scopes.** No new scope. `get_design` needs `site:read`, `set_design` `site:write` plus approval, `render_page` `preview:create`.

## Open questions
1. **Agent-proposed rules.** Should an agent be able to propose a first DESIGN.md through `set_design` on a site that has none, or only describe it in its answer? Default: it may propose; it waits for a person.
2. **Per-locale rules.** One DESIGN.md per site, or per locale? Default: one per site; locale-specific notes live under headings.
3. **Import.** Should `cloudhal design import <url>` derive a first DESIGN.md from an existing site (as Stitch does)? Default: later, as an agent workflow in the skill rather than a command.
4. **Browser Rendering on the free plan.** Is the binding available and within limits there? Default: verify during 21b; the tool degrades to `render_unavailable`.
5. **Image size.** Which screenshot size keeps quality and token cost balanced for Claude and Codex? Default: 1,440 px wide scaled to at most 1,600 px; mobile at full 390 px.
