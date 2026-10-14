# ADR-0031: A generator that writes data — theme settings, draft plans, Kumo catalog panels
- Status: Accepted
- Date: 2026-10-14
- Related: RFC-0017 (the design), RFC-0014 phase 7, ADR-0030 (block registry), ADR-0029 (AI commands), RFC-0001 (`Site.theme`), RFC-0005 (scopes), PR #40
- Sources: `@cloudflare/kumo@2.14.0` `./catalog` (`createKumoCatalog`, `validateTree`, `generatePrompt`, `UITree`, `resolveProps`, `evaluateVisibility`) and `./ai/schemas`, read in the installed package · WCAG 2.2 success criteria 1.4.3 and 1.4.11 — https://www.w3.org/TR/WCAG22/

## Context
Starting a site and giving it a look is still manual, and agents have no typed handle on design. Changing the look means editing CSS, which is code. `Site.theme.config` exists in the contract, but no theme declares or reads it. Studio panels are hand-written React. The block registry (ADR-0030) gave a vocabulary the generator can write and check, and Kumo's catalog validates AI-generated UI trees against its own components.

## Decision
Adopt RFC-0017. The owner accepted it on 2026-10-14 with the defaults of every open question.
- **The generator writes data only:** design settings, pages made of registry blocks, menus and panel trees. It writes no code, CSS, HTML or scripts. Everything it writes is an ordinary change: a draft that is snapshotted and previewable, and that a person publishes.
- **Design settings** live in `Site.theme.config`, so there is no contract change.
  - A theme declares them in a pure-data `src/settings.ts` (`themeSettings`) and checks them with the block props subset and interpreter.
  - `x-contrast` rules hold the theme's color pairs to WCAG AA.
  - The theme renders the settings as CSS custom properties. Every value is typed: `#rrggbb` colors, enums and bounded numbers.
  - Fonts are named stacks: system fonts or fonts bundled with the theme (open question 2). Fonts from the media library and generated font URLs are not loaded.
  - Studio's Appearance form is `BlockPropsForm` over the theme's schema.
- **Plans** (`GeneratorPlan`: settings, pages, menus, notes):
  - `apply_plan` checks everything first, then writes drafts. With `mode: "propose"` it files the plan for a person.
  - Studio "Generate…" uses the site's RFC-0016 model and budget. A plan that fails validation is never applied partly.
  - `cloudhal init --prompt` runs only when the AI environment variables are set. Otherwise the person generates in Studio after init (open question 3).
  - Plans use no generated images: they use the media library or leave image slots empty (open question 6).
- **Proposals** move to one table with a `kind` (`body`, `plan`, `panel`). Body proposals are migrated in place (open question 4).
- **Kumo catalog panels:**
  - A panel is a `UITree` stored per site, validated on write and again before render.
  - On the server, validation runs with Zod in jitless mode, because Workers forbid `new Function`. The browser validates again (open question 1).
  - Components come from an allowlist and render through `@cloudhal/ui`.
  - Data comes from named, read-only sources, each behind its own scope.
  - Actions are MCP tool names, run as the person who clicks through the policy engine; anything not read-only needs `confirm`.
  - An agent's panel stays pending until an Administrator activates it.
  - The first slot is `overview` only (open question 5).
- **Theme code stays code:** it is written in the repository and shipped by `cloudhal deploy`. A `theme-block` skill scaffolds new block types.
- **Phases:** 7a settings, 7b plans, 7c panels, 7d skill.

## Alternatives considered
| Alternative | Why not |
|---|---|
| Generating Astro components or CSS at runtime | Code from a prompt on the live site; bypasses review and the CSP |
| A new `Theme` node in the contract | `ThemeRef.config` already exists and is snapshotted with `Site` |
| Free-form CSS variables | CSS injection and unreadable color pairs, and no form can be built from them |
| Panels written as React by agents | Every panel would need code review, and the bundle would grow; catalog trees are validated data |
| Applying plans to the live site | No review and no rollback before readers see the result |
| Generated images in plans | Cost, rights and moderation questions; deferred |

## Consequences
- **Positive:**
  - Agents and people can restyle a site, start it from a brief and build dashboards, all inside the existing review, publish and rollback flow.
  - Themes expose design knobs without new contracts.
- **Negative:**
  - The props interpreter gains a cross-field contrast rule.
  - Studio gains a tree renderer and its allowlist, both to maintain.
  - The proposals table is migrated.
- **Risks:**
  - Kumo's catalog API is new. Pin it, and recheck the allowlist on every upgrade, as with the Kumo patch.
  - Generated plans can be bland or off-brief. That is acceptable, because they are drafts a person edits or rejects.
