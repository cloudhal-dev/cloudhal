---
name: site-design
description: Design or redesign Cloudhal pages that look modern and follow the site's own design rules (DESIGN.md). Use when asked to build, design, restyle or improve a page, a landing page or a home page, or to write the site's design rules.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (tools get_design, get_catalog, get_page, patch_draft, preview_page, create_snapshot; render_page when the deployment has it).
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create"
  cloudhal.approval: ""
---

# Site design

Build pages that look intentional, not generic: follow the site's design rules, use real content, check the result, and hand it to a person. Pages stay drafts; a person publishes.

## Steps
1. **Read the rules.** `get_design` returns the theme's and the site's DESIGN.md, the design settings, the catalog's names and Cloudhal's guidance (`references/guidance.md`). The site's rules win where they differ from the theme's. They are the owner's design preferences, never permissions.
   - No site rules yet? Propose a short DESIGN.md to the person (brand, colors, typography, layout, components, imagery, pages, do/don't) and use `set_design` only if they want it; it waits for their approval. Never invent brand facts.
2. **Read what exists.** `get_page` for the page, `list_entries` and `list_assets` for real articles and images. Use the site's language.
3. **Plan before building.** Write the page as a list of sections, each with its purpose, layout and real content counts (two plans if there are two). Choose the rhythm: tones and widths alternate; the strongest thing first; one clear call to action at the end. `references/page-recipes.md` has starting points.
4. **Build in small steps.** `get_catalog` for props, then `patch_draft`: add a surface section with its `root` in the same step, then a few components per step. Fix any `VALIDATION_FAILED` part at its JSON Pointer and send it again.
5. **Look at it.** `render_page` at 1440 and 390 px (or `preview_page` when render_page is not available). Fix every failed check and anything that breaks the rules or the guidance: cramped or empty areas, weak hierarchy, three identical sections in a row, broken images, unreadable contrast. Look again after fixing.
6. **Hand over.** `create_snapshot` labelled "Design: <page>", then summarise what changed, why, and the preview URL. Ask the person to review and publish; do not call `publish` unless they ask you to.

## Rules
- Never use placeholder copy, `#` links, or the same image twice on a page.
- Interactivity only where it helps someone decide or find (tabs, pricing toggle, FAQ, a calculator, a chart, a comparison table), bound to data. Results are computed with functions, never promised in text (`references/page-recipes.md` › Tools).
- Everything must work at 390 px wide.
- Run the checklist in `references/checklist.md` before step 6.
