# RFC-0017: Theme and UI generator — design settings, generated pages and Kumo catalog panels
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-14
- Related:
  - RFC-0014 §8, phase 7 ("Generator": Kumo catalog panels, outputs are ordinary changes, generator tools that propose);
  - RFC-0015 and ADR-0030 (the block registry: the vocabulary the generator writes);
  - RFC-0016 and ADR-0029 (Workers AI, the model per site, budgets);
  - RFC-0005 (roles and scopes);
  - RFC-0001 (`Site.theme`: `ThemeRef { name, version, config }`, whose `config` is "validated by the theme's own schema");
  - DESIGN.md (Kumo, `PageLayout`, `SectionCard`).
- Sources (read in the installed packages, 2026-10-14):
  - `@cloudflare/kumo@2.14.0`, `./catalog`: `createKumoCatalog({ actions })`, `validateTree`, `validateElement`, `generatePrompt`, and the flat `UITree` / `UIElement` with `DynamicValue` (`{ path }`), `VisibilityCondition` and `Action`. It validates and describes; it does not render.
  - `@cloudflare/kumo@2.14.0`, `./ai/schemas` and `./registry/component-registry.json`: per-component prop schemas, generated from Kumo's sources.

## Summary
- **What.** A generator that writes a site's design and structure as data, from a prompt or by an agent: design settings (colors, type, spacing) in `Site.theme.config`, pages made of registry blocks, and Studio panels described as Kumo catalog trees.
- **How.** Everything it produces is an ordinary change: a draft, snapshotted, previewable, reversible, published by a person. It never writes code, CSS or HTML.
- **Why.** The registry (RFC-0015) gave the vocabulary. The generator uses it so that "make me a landing page for a bakery, warm colors" ends as a draft a person can read, change and publish.

## Motivation
- **Starting a site is still manual.** `cloudhal init` gives a blog with zinc greys. Colors, fonts and the first pages are hand-edited in code or section by section.
- **Agents can already write pages, but not the look.** They have no typed handle on design. They would have to edit CSS, which is code: agents change a site's data through the policy engine, and code ships from the repository through review and `cloudhal deploy`.
- **The design system has no runtime knobs.** `ThemeRef.config` exists in the contract (RFC-0001) but no theme declares or reads it.
- **Studio panels are hand-built.** Each capability needs React. Kumo now ships a catalog (`@cloudflare/kumo/catalog`) that validates AI-generated UI trees against its own components. That is a safe target for agent-built dashboards.

## Proposal

### 1. Design settings: `Site.theme.config` (no contract change)
A theme declares what can be changed about its look in **`src/settings.ts`**. The file is data only and uses type imports only, like `src/blocks.ts`:
```ts
import type { PropsSchema } from "@cloudhal/core-ts/blocks";
export const themeSettings: PropsSchema = {
  type: "object", additionalProperties: false,
  properties: {
    brand:   { type: "string", format: "color", title: { en: "Brand color", tr: "Marka rengi" } },
    accent:  { type: "string", format: "color" },
    surface: { type: "string", format: "color" },
    text:    { type: "string", format: "color" },
    font:    { type: "string", enum: ["system", "serif", "humanist", "mono"], "x-widget": "radio" },
    radius:  { type: "string", enum: ["none", "small", "large"] },
    density: { type: "string", enum: ["compact", "comfortable"] },
    hero:    { type: "string", enum: ["centered", "split"] },
  },
};
```
- **The same subset and interpreter as block props** (RFC-0015 §3) check `site.theme.config`. The store checks it on every `Site` write against the deployed theme's schema, refusing with `invalid_props` (422). Values that no longer fit after a theme change are kept and flagged, never rewritten.
- **Rendering.** The theme reads the values (`themeConfig(site)`) and writes them as CSS custom properties in its layout: `<style>:root{--brand:#…}</style>`, allowed by the existing `style-src 'unsafe-inline'`. Every value comes from a closed type: a `#rrggbb` color, an enum, a bounded number. Nothing in a value is free text that reaches CSS, so no injection is possible.
- **Fonts** are named stacks the theme maps to system fonts or to fonts it self-hosts under `public/`. A generated font URL is never loaded (CSP `font-src` stays as it is).
- **Contrast.** The interpreter gains one cross-field rule a theme may declare: `"x-contrast": [["text", "surface", 4.5], ["surface", "brand", 3]]`. Pairs below the ratio are an issue, so the generator cannot ship unreadable colors (WCAG 2.2 AA, 1.4.3 and 1.4.11).
- **Studio.** Site › Settings gets an "Appearance" section: `BlockPropsForm` over `themeSettings`, with a color swatch for `format: "color"` (RFC-0015 §8 already lists it). Changes save to the draft site and show in the preview.
- **Snapshots.** `Site` is in every snapshot, so design changes are diffed, previewed and published with the content, and rolled back with it.

### 2. The generator (D1–D3)
One engine, three callers: an agent over MCP, a person in Studio ("Generate…"), and `cloudhal init --prompt`.

**Inputs.**
- A brief: free text, at most 2,000 characters.
- Optional constraints: brand colors, tone, locale, the pages wanted.
- What exists: the site, its pages and the block types (`list_block_types`), so it extends rather than replaces.

**Outputs.** A *plan*. Every item is something the existing tools can already write:
```ts
interface GeneratorPlan {
  settings?: Record<string, unknown>;                 // → Site.theme.config (validated, §1)
  pages?: {                                           // → create_page / update_page, as drafts
    path: string; title: string; locale?: string;
    sections: Section[];                              // hero, richText, component (registry types only)
  }[];
  menus?: { key: "primary" | "footer"; items: MenuItemInput[] }[];  // → set_menu (RFC-0003)
  notes: string;                                      // what it did and why, for the person
}
```
- **D1. Data only.** The plan holds no code, CSS, HTML or scripts. Sections use known registry types with props that pass the interpreter. Rich text is markdown through the safe renderer. Images are `asset:` references to the media library, or none: the generator never fetches or invents images.
- **D2. Drafts, then a person publishes.**
  - Applying a plan writes drafts: new pages are `draft`, and existing published pages get a draft revision. It never publishes.
  - The person reviews the result through the existing draft preview and snapshot diff, and publishes with the usual policy.
  - An agent may also *propose* a plan instead of applying it (§3), the same way `edit_body` proposes (RFC-0014 phase 4).
- **D3. The model.**
  - In Studio and `init`, generation uses the site's AI settings: the RFC-0016 transport, model, gateway and daily budget.
  - The model is asked for JSON in the plan's shape (JSON mode), with the catalog of block types (their schemas) and the theme's settings schema in the system prompt. A plan that fails validation is shown with its issues and can be retried. It is never applied partly.
  - Agents over MCP bring their own model. They call the tools with a plan they built.

### 3. MCP tools
| Tool | Scope | What it does |
|---|---|---|
| `get_theme_settings` | `content:read` | The theme's settings schema, the current values and the contrast rules |
| `set_theme_settings` | `site:settings` (default mode: approval) | Writes `site.theme.config` to the draft site; validated |
| `apply_plan` | `content:write` (+ `site:settings` when it has `settings`) | Applies a `GeneratorPlan` as drafts in one call; returns what it created and the preview links |
| `apply_plan` with `mode: "propose"` | `content:propose` | Stores the plan for a person, who accepts all or part of it in Studio. Nothing is written until then |

- `apply_plan` is a convenience over the existing tools. It runs the same checks (registry, interpreter, page paths, menus) before anything is written, then writes all its parts in order.
- Each part is an ordinary write, audited as `apply_plan` with the plan's `notes`.

### 4. Kumo catalog panels (D4, D5)
Studio panels that agents or people describe as a **Kumo catalog `UITree`**, rendered with Kumo components. Examples: a site-overview card, a capability's settings or a small dashboard.
- **Storage.**
  - A `panels` table per site (migration): `{ id, siteId, slot, title, tree, data, rev, createdBy, status, createdAt }`.
  - `slot` is where it shows: `overview`, `settings`, or `capability:<name>`.
  - Panels are admin UI, not site content, so they are not in snapshots.
- **Validation (both on write and before render).** `createKumoCatalog({ actions })` and `validateTree`, plus Cloudhal's own rules:
  - **Components.** An allowlist of display and form components: `Surface`, `LayerCard`, `Text`, `Badge`, `Banner`, `Meter`, `Table`, `Button`, `Input`, `Select`, `Switch`, `Tabs`, `Empty` and the charts from `@cloudhal/ui/charts`. Nothing that takes raw HTML or arbitrary URLs. Links may only point into Studio.
  - **Data.** `{ path }` values read from a data model the panel declares as named, read-only sources from a fixed list. Examples: `analytics.summary`, `entries.count`, `comments.pending`, `schedule.next`. Each source has its own scope (`analytics:read`, `content:read`, `comments:read`). A panel shows to a person only the sources that person may read.
  - **Actions.** `Action.name` must be an MCP tool name. It runs through the same policy, approvals and audit as an agent's call, *as the person who clicks*. `confirm` is required for anything not read-only.
  - **Limits.** At most 200 elements, 10 sources and 10 actions per panel.
- **Rendering.** `CatalogPanel` in `@cloudhal/ui` maps each allowed `type` to the `@cloudhal/ui` component of the same name. It resolves `DynamicValue`s and `visible` conditions with Kumo's helpers (`resolveProps`, `evaluateVisibility`), and wraps the panel in a `SectionCard`. DESIGN.md rules apply: no hand-made cards. The allowlist is what keeps `design:lint`'s guarantees for generated UI.
- **Who.**
  - An agent's `propose_panel` (`content:propose`) creates a `pending` panel, which an Administrator activates.
  - Administrators may also create and edit panels in Studio from a prompt (RFC-0016 transport) or by hand as JSON.
  - `list_panels` and `get_panel` are read tools.
- **D5. Not a plugin system.** Panels compose existing data and tools. New capabilities still ship as code (`capabilities/`, `add-capability`).

### 5. Theme code stays code
New block types, components and layouts are code. They are written in the project repository by people or coding agents, reviewed in git, and shipped by `cloudhal deploy` (RFC-0015 §6).
- The generator may *suggest* a missing block type in its `notes` (for example, "a `pricing-table` type would fit here").
- A repository skill `theme-block` scaffolds one: the type in `src/blocks.ts`, an Astro component, a `theme.ts` mapping, styles and a test.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Generate Astro components or CSS at runtime | Unlimited looks | Code from a prompt on the live site; breaks the "agents write data" boundary, CSP and review | Security; D1 |
| A new `Theme` node in the contract | Explicit history | `ThemeRef.config` already exists and is snapshotted with `Site` | Duplicates RFC-0001 |
| Tokens as free-form CSS variables (`--x: <any>`) | Flexible | CSS injection, unreadable color pairs, no form | Typed settings with contrast rules instead |
| Panels as React components agents write | Full power | Code review per panel, bundle growth | Kumo catalog trees are validated data |
| Panels without actions (read-only) | Simplest | Dashboards cannot act ("approve all") | Actions through the existing policy are safe enough; confirm required |
| Apply plans directly to the live site | Fast | No review, no rollback before readers see it | D2: drafts, person publishes |

## Compatibility & migration
- **Contracts.** No contract change: `Site.theme.config` already exists, and plans are made of existing types. `schemaVersion` stays 1.
- **Storage.** One new table, `panels` (D1 and SQLite migration), and one for proposed plans. That could be a generalised proposals table; see open question 4.
- **Themes.**
  - A theme without `src/settings.ts` has no settings. Its config is left alone, and the Appearance section says the theme has none.
  - The blog starter gains a `settings.ts` and reads its values in `Base.astro`, keeping today's look as the defaults.
- **Rollout.**
  - **7a:** settings (`settings.ts`, store check, Appearance form, CSS variables in the starter).
  - **7b:** plans (`apply_plan`, propose mode, Studio "Generate…", `cloudhal init --prompt`).
  - **7c:** catalog panels (table, tools, `CatalogPanel`, the overview slot).
  - **7d:** the `theme-block` skill.
- **Rollback.** Settings and pages roll back with snapshots. Panels are deleted or deactivated.

## Security & policy impact
- **No code path from a prompt to the site.**
  - Settings are typed values, with colors checked as `#rrggbb` and enums.
  - Pages are registry blocks through the safe renderer.
  - Panels are allowlisted components and never reach the public site.
- **Scopes.**
  - `set_theme_settings` needs `site:settings`, Administrator and above, with approval in default mode.
  - `apply_plan` needs what each of its parts needs.
  - Proposals need `content:propose`.
  - Panel actions run as the person clicking, through the same policy, approvals and audit.
- **Budgets.** Studio and `init` generation count against the RFC-0016 daily budget, one generation per command. The plan size is capped: 20 pages, 30 sections per page and 64 props per block.
- **Prompt injection.** Plans are validated data. A brief that says "ignore the rules" can at worst produce a draft a person rejects. Panel trees from agents are inactive until an Administrator turns them on.
- **Contrast and accessibility** are enforced by the theme's declared rules (§1), and catalog components carry Kumo's accessibility.
- **Kumo catalog validation uses Zod.** Zod's JIT path uses `new Function`, which Workers forbid. Server-side validation must run Zod without JIT, or with a precompiled check; see open question 1.

## Open questions
1. **Server-side tree validation on Workers:** run Zod without JIT, or precompile the panel schema (hard rule 6)? Default: validate with Zod's jitless mode on the server, and also in the browser before render.
2. **Font hosting:** only the named system stacks in 7a, or self-hosted font assets from the media library too? Default: system stacks and theme-bundled fonts only.
3. **`cloudhal init --prompt`:** generate with the account's Workers AI over REST, which needs an account id and token, or seed and let the person run "Generate…" in Studio afterwards? Default: Studio after init; `--prompt` only when the AI environment variables are set.
4. **Proposals:** generalise `body_proposals` into one proposals table (`kind: "body" | "plan" | "panel"`), or keep a table per kind? Default: one table, with the body kind migrated in place.
5. **Panel slots in 7c:** only `overview`, or `settings` and capability slots from the start? Default: `overview` only.
6. **Generated images:** allow plans to ask Workers AI for images (a text-to-image model, stored as assets), or never? Default: never in this RFC; the generator uses the media library or leaves image slots empty.
