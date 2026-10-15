# Agent-built sites: gap analysis

What stops Claude, Codex or any MCP agent from building a **modern, interactive, well-structured site end to end** on Cloudhal, and what to build next. Collected 2026-10-15.

## Method

- **Inventory of the code.** An audit of the repository: 89 MCP tools, the surface catalog, the theme layer, the interaction runtime, media, guidance and site-level structure.
- **Building a page ourselves.** A real build: Claude (Claude Code) connected to the live newsroom over MCP with an `edits`-mode key and rebuilt the home page draft with `patch_draft`. Snapshot `snap_3V4W1D5DCY7X75EE84JN`, approval `appr_S3EM38GW74Y5YSV`.
- **Three web research tracks:**
  - how AI site builders reach modern design (v0, Lovable, Framer, Webflow, Wix Harmony, Figma Sites/Make, Google Stitch, Relume, Builder.io);
  - what site and design MCP servers expose, and what Claude and Codex support;
  - what modern sites need technically in 2026, CSS-first.
- **Two runs of the Build model eval** (RFC-0020 open question 7).

Vendor claims are marked as such in the sources. Third-party claims that were not verified are listed under Caveats.

## Where Cloudhal stands

| Capability | Cloudhal today | Evidence |
|---|---|---|
| Pages as validated data | **Strong.** Surfaces: a flat tree, 25 primitives plus 5 blocks, repairs, JSON Patch, `VALIDATION_FAILED` with pointers | `core-ts/surfaces.ts` |
| Safe streaming build loop | **Strong.** Build view, Build chat, MCP Apps preview, click-to-scope, held steps | RFC-0020 status |
| Interop | **Strong.** A2UI v0.9 and json-render in and out | `core-ts/surface-interop.ts` |
| Governance | **Strong.** Drafts, snapshots, approvals, agent modes, audit | ADR-0015/0016 |
| Design tokens | **Weak.** 6 site-wide settings: 4 colors, 4 system font stacks, 3 radii, contrast-checked. No web fonts, no dark mode | `starters/blog/src/settings.ts` |
| Per-section or per-element styling | **Missing.** Only tone/spacing/width/align enums on a few primitives; no `style` on surfaces (RFC-0018 18d not shipped) | catalog |
| Section library, layouts, variants | **Missing.** No hero/feature/pricing/logo/testimonial compositions; one blog theme with a `max-w-3xl` column | RFC-0018 18b–18f pending |
| Motion | **Missing.** No keyframes, transitions, reveals or page transitions in theme or catalog (18f not shipped) | `global.css` |
| Rich components | **Missing.** Icons, carousel, marquee, counter, table, chart, dialog/lightbox, video background | RFC-0020 deviations |
| Forms and server actions | **Missing.** No contact, newsletter or polls | RFC-0020 §8 |
| Images | **Weak.** Upload by bytes (4 MB) or URL; no stock search, no generation, no focal point or treatments | `media/types.ts` |
| Seeing the result | **Missing.** `preview_page` returns HTML with a *neutral* stylesheet, not the theme. No screenshots, no a11y or performance checks | `astro-renderer/preview.ts:447` |
| Agent design guidance | **Missing.** Server instructions and the 6 official skills say nothing about design, layouts or page recipes; `catalogPrompt` (~9 KB) teaches syntax only | `mcp-server/server.ts`, `skills/official` |
| Site-level orchestration | **Weak.** One page per call; no `plan_site` / `apply_plan` (RFC-0017 7b); menus and theme settings always need approval; publish carries every pending draft | tools audit; own build |

**Building a page ourselves** confirmed each weak row:

- **Styling:** the only choices were tones, spacing and ratios. No palette, typography, background, hover or motion.
- **Seeing the result:** checking the result needed a separate browser. `preview_page` would have shown a neutral layout.
- **Images:** they were found by hand, by matching articles to asset ids. There is no "photo of Cappadocia" search.
- **Variety:** a card grid is just Card, Image and Heading. Nothing gives it a modern rhythm.
- **Publishing:** it also carried an unrelated draft article, a draft page, and the earlier Build chat output (a placeholder section from GLM-4.7-Flash).

## Five findings

1. **The architecture is right.** Builders whose AI picks from presets and tokens (Framer, Webflow, Wix Harmony, Figma Sites, Relume) produce the most consistently polished marketing sites. Code-generating tools (v0, Lovable) reach quality through curated libraries (shadcn) and heavy repair pipelines.

   Every generative-UI spec we checked leaves styling to the host: A2UI theme keys, json-render variants, Adaptive Cards host config, Kumo semantic tokens. None has a motion vocabulary. Cloudhal's "data, never code" model matches the best performers. It needs a **richer vocabulary**, not a different model.

2. **The gap is vocabulary, not mechanics.** Cloudhal can already stream, validate, repair, preview and govern. What agents lack is something worth choosing:
   - a token system with real variety;
   - section compositions with variants;
   - surface treatments;
   - motion presets.

   That is what makes a page look 2026.

3. **Agents are blind.** Lovable drives a real browser and screenshots at three widths. Webflow returns element snapshots, Figma `get_screenshot`, Builder a preview URL plus a screenshot.

   Both Claude Code and Codex pass image tool results to the model, so a screenshot tool is directly usable. Cloudhal gives agents neutral HTML that does not even show the theme. Without seeing, an agent cannot iterate toward good design.

4. **Guidance is the cheapest lever.** Anthropic's ~400-token `frontend-design` skill fixes much of the generic "AI look" (Inter, purple gradients, flat backgrounds).

   - Webflow serves guidelines as a tool and as a resource, plus per-site Agent Instructions.
   - Sanity serves best-practice rules as tools.
   - Relume's MCP picks components by section description and content count, and found models otherwise "always chose 3 pricing plans".

   Instructions and tools are the only channels every client honours. Codex has no MCP prompts, and Claude Code cuts instructions at 4,096 characters.

5. **Reliability comes from the pipeline, not the model.** The Build eval showed this: format tolerance, held steps and repairs moved gpt-oss-120b from 3/5 to 5/5 finished briefs. v0 reports raw LLM output failing up to ~10% of the time and 93% error-free generations after its autofixer (vendor numbers). Keep investing in deterministic repair before model calls.

## Gaps and proposals, by priority

Each proposal says what an agent sends as data and how Cloudhal renders it CSS-first, under `script-src 'self'` with no model-written code.

### P0: let agents see and steer (foundation)

**G1. Render-and-look tool.**
- **Tool.** `render_page {siteId, pageId, widths: [1440, 390], fullPage?}` returns `image` content (PNG) plus `structuredContent` with deterministic QA:
  - horizontal scroll at 390 px;
  - images without alt text;
  - heading order;
  - text/background contrast of the rendered tokens;
  - empty images;
  - CLS risk (media without a ratio).
- **Renderer.** It renders the **theme** (the real preview route), not `PREVIEW_CSS`.
- **Implementation.**
  - On Cloudflare: Browser Run (Browser Rendering) screenshot from the admin Worker.
  - On Node: the headless-Chrome path already in `apps/studio/scripts/screenshots.ts`.
- **Follow-up.** axe-core and a Lighthouse lab run as `audit_page`.
- **Effort:** M. **Why first:** it raises the ceiling of every other improvement (finding 3).

**G2. Design guidance as tools, skill and instructions.**
- A Cloudhal **site-design skill** in the spirit of `frontend-design`, written in terms of Cloudhal tokens, sections and motion presets. It covers:
  - one distinctive font pairing;
  - a dominant colour with accents;
  - an orchestrated entrance;
  - section rhythm (alternating surfaces);
  - real content counts (no default "3 plans");
  - checking with `render_page` before publish.
- **Delivery.** Served three ways:
  - as `skill://` (SEP-2640);
  - as a `get_design_guidelines` tool (for Codex);
  - in the first lines of the server instructions, which today never mention `get_catalog` or surfaces.
- **Per-site rules.** Site-resident **design rules** (Webflow's Agent Instructions, Stitch DESIGN.md) let an owner pin brand rules every agent receives.
- **Effort:** S. **Why:** the cheapest lever (finding 4).

**G3. Design token system v2** (extends RFC-0017 7a and RFC-0018). The agent picks only enums; code expands them.
- **Colour.** A seed hue, a scheme (tonal / vibrant / neutral / mono), a contrast level and a mode (light / dark / auto). The renderer generates OKLCH roles and checks WCAG 2.2 at expansion time.
- **Type.** A curated font-pairing id (self-hosted variable WOFF2), a scale ratio and fluid sizes (`clamp()`, Utopia-style `--step-n`), with `text-wrap: balance` on headings.
- **Shape and density.** Radius (none → full), density (compact / cozy / airy).
- **Dark mode.** Through `light-dark()` once the blog theme's fixed greys move to variables (an RFC-0018 prerequisite).
- **Export.** Exportable as W3C DTCG 2025.10 for Figma and Style Dictionary.
- **Effort:** M–L.

**G4. Section and surface styles** (RFC-0018 18d, moved up).
- Per section and per Band/Card, a `surface`: plain, muted, inverse, accent, gradient, mesh, or pattern (dots / grid / noise).
- Also `width` (contained / wide / full-bleed), `spacing` and `anchor`.
- Gradients and meshes are layered `radial-gradient`s from theme tokens; patterns are SVG data URIs. No images and no CSS from the agent.
- **Effort:** M.

### P1: a vocabulary worth choosing

**G5. Section library with variants.**
- Named compositions of primitives, chosen by **content count and description**, not just by title:
  - hero: centered, split 7:5, split media-left, bento, with social proof;
  - features: grid, bento, alternating;
  - logo cloud and marquee;
  - testimonials: grid, wall, carousel;
  - pricing with a monthly/yearly toggle;
  - FAQ, stats with counters, timeline, CTA band, team, newsletter, footer.
- **Tools.** `list_sections {query}` and `insert_section {sectionKind, variant, content}` expand to an ordinary surface, so it stays editable and diffable. Also exported to `catalogPrompt` as examples.
- **Precedent.** Tailwind Plus's most frequent sections were Features 15, Hero 12, Pricing 12, CTA 11 and Team 9. Relume ships 1,000+ components.
- **Effort:** L, delivered incrementally.

**G6. Motion presets** (RFC-0018 18f, moved up). This would set Cloudhal apart, since no generative-UI spec has motion.
- **Site level.** `theme.motion: none | subtle | expressive`.
- **Per node.** `reveal: fade-up | fade | scale | slide-x | stagger` and `hover: lift | glow | tilt | underline-grow`.
- **Elsewhere.** Marquee, count-up, and page transitions.
- **CSS.** `animation-timeline: view()` inside `@supports` and `prefers-reduced-motion: no-preference`. The final state is the default, so Firefox, which lacks scroll-driven animations, still shows content.
  - Page transitions use cross-document View Transitions (`@view-transition { navigation: auto }`, Chrome and Safari; Firefox navigates normally).
  - Stagger uses a renderer-set `--i`.
  - Counters use `@property` with the final number in the DOM.
- **Effort:** M.

**G7. Missing primitives.**
- **Icon:** a curated SVG sprite, Lucide subset; v0 snaps to the nearest real icon.
- **Video:** an asset, poster and loop, usable as a background.
- **Carousel:** scroll snap, plus runtime buttons; `::scroll-button` as an enhancement.
- **Marquee, Counter, Table.**
- **Dialog/Lightbox:** `<dialog>` / popover, anchor positioning.
- **Media with focal point and treatments:** duotone, framed, tilt.
- **Band with background image and scrim.**
- **Children for blocks**, deferred in RFC-0020.
- **Effort:** M per group.

**G8. Images an agent can actually find.**
- **Search:** `search_images {query}` over a licensed stock provider, through the existing server-side fetch with allow-list and attribution stored on the asset.
- **Generation:** `generate_image {prompt, ratio}` with Workers AI, written as an asset with required alt text.
- An art-direction token keeps imagery consistent.
- RFC-0017 open question 6 said "never generate images". Revisit it, since Wix, Hostinger, Sanity and Figma all generate.
- **Effort:** M.

### P2: whole sites, not single pages

**G9. Plan → outline → build.**
- **Tools.** `plan_site` proposes a sitemap with per-page section outlines (Relume, Framer Wireframer and Squarespace Blueprint all start here). `apply_plan` (RFC-0017 7b) builds all pages, the navigation and the theme as one reviewable change, with **one** approval.
- **Batch creation.** Batch page creation inside a plan; menus stop needing one approval per change.
- **Effort:** L.

**G10. Scoped publish.** Publish only the pages and entries a change touched, instead of everything pending. Our own home-page build carried unrelated drafts. Releases (RFC-0008) already pin node versions, so this can reuse them. **Effort:** M.

**G11. Forms and server actions.** One "reader actions" RFC (RFC-0020 open question 5): contact, newsletter and poll, with Turnstile, rate limits, a submission store and email delivery (already present for auth). **Effort:** L.

**G12. Responsive overrides.** A small per-breakpoint map on layout nodes (`columns {base, md, lg}`, `hide`, `order`), never raw CSS. **Effort:** S–M.

### P3: polish and ecosystem

- **MCP ergonomics:**
  - `_meta["anthropic/requiresUserInteraction"]` on publish and rollback, so Claude asks even in auto modes;
  - accurate `readOnlyHint` / `destructiveHint`;
  - instructions under 4,096 characters with keywords first (Claude Code tool search);
  - `outputSchema` everywhere;
  - document Codex `approval_mode` for publish.
- **MCP Apps preview with theme CSS and images.** Today images do not load and the preview uses neutral styles.
- **Visual property panel** for the picked node in Studio (click-to-scope is done; v0 Design mode and Lovable Visual Edits add direct edits).
- **Theme packages and presets** (RFC-0018 18b/18e): "Editorial Serif", "SaaS Bold", "Minimal Mono", "Warm Studio", each a set of G3 tokens, G4 surfaces and G6 motion.
- **A capability-scoped "island"** for bespoke widgets: calculators, configurators. Every tree-based builder has an escape hatch (Webflow AI code components, Framer Workshop, Wix custom elements). This needs its own RFC and threat model.
- **i18n for agents:** hreflang, translation links, locale-aware sitemap and navigation.

## Suggested order

| Step | Contents | Unlocks |
|---|---|---|
| 1 | G2 guidance + G1 `render_page` | Agents can see and are told what good looks like; it improves results with today's catalog |
| 2 | G3 tokens v2 + G4 surface styles | Distinctive sites from the same structure; dark mode |
| 3 | G6 motion + G7 icons, carousel, marquee, counter, video | "Feels modern" |
| 4 | G5 section library + G8 images | Fast, varied, on-topic pages |
| 5 | G9 plan/apply + G10 scoped publish | Whole sites in one reviewed change |
| 6 | G11 forms, G12 responsive, P3 items | Real business sites |

**Measuring it.** Extend the Build model eval with a **design pass**:
- render each result at 1440 and 390 px (G1);
- run the deterministic QA;
- score screenshots against a rubric with a vision model: hierarchy, typography, color, rhythm, imagery, motion use.

Track first-render success, QA pass rate and design score per model and per release, as v0 tracks first-render success.

## Caveats

- Several builder details are vendor claims, or come from third-party summaries: Framer 2026 agent updates, Lovable "90% fewer errors", Wix internals, Codex prompt support, Canva tool names.
- Browser support:
  - scroll-driven animations and cross-document View Transitions are not in Firefox stable as of October 2026 (Interop 2026 targets);
  - `light-dark()` reaches Baseline "widely available" around November 2026.

  Treat them as progressive enhancement.
- WCAG 2.2 AA is the bar; APCA is informative only.

## Sources

**Builders**
- v0 agent architecture: https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent
- v0 design systems: https://v0.app/docs/design-systems
- v0 Design mode: https://v0.app/docs/design-mode
- Fireworks on v0's autofixer: https://fireworks.ai/blog/vercel
- Lovable Visual Edits: https://lovable.dev/blog/introducing-visual-edits
- Lovable browser testing: https://docs.lovable.dev/features/browser-testing
- Framer animations: https://framer.com/features/animations
- Webflow AI site builder: https://webflow.com/blog/ai-site-builder
- Webflow interactions with GSAP: https://webflow.com/blog/webflow-interactions-with-gsap
- Wix Harmony: https://www.wix.com/press-room/home/post/wix-launches-wix-harmony-the-ai-website-builder-that-merges-human-and-artificial-intelligence-rein
- Figma Sites: https://www.figma.com/blog/introducing-figma-sites/
- Figma Make guidelines: https://developers.figma.com/docs/code/write-design-system-guidelines/
- Google Stitch: https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/
- Relume: https://relume.io/
- Relume Library MCP: https://www.relume.io/relume-library-mcp
- Builder.io Fusion: https://builder.io/blog/fusion
- Anthropic frontend-design skill: https://claude.com/blog/improving-frontend-design-through-skills

**MCP**
- Webflow MCP: https://developers.webflow.com/mcp/tools/data-tools.md
- Webflow skills: https://developers.webflow.com/mcp/reference/skills.md
- Figma MCP: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- Builder Fusion MCP: https://www.builder.io/c/docs/fusion-mcp-server
- Sanity MCP: https://www.sanity.io/docs/ai/mcp-server
- Vercel MCP: https://vercel.com/docs/ai-tooling/vercel-mcp/tools
- Cloudflare Browser Rendering: https://developers.cloudflare.com/browser-rendering/
- MCP tools spec: https://modelcontextprotocol.io/specification/latest/server/tools
- MCP Apps: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
- Skills extension: https://modelcontextprotocol.io/seps/2640-skills-extension
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Codex MCP: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- Playwright MCP: https://playwright.dev/mcp/vision-mode

**Web platform**
- Interop 2026: https://web.dev/blog/interop-2026
- Same-document View Transitions Baseline: https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available
- Cross-document View Transitions: https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
- WebKit features in Safari 26: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- DTCG 2025.10: https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/
- Radix Themes: https://www.radix-ui.com/themes/docs/components/theme
- Utopia fluid type: https://utopia.fyi/type/
- Tailwind Plus components: https://tailwindcss.com/components
