# ADR-0019: Menus are Menu nodes holding a tree of id-referenced items
- Status: Accepted
- Date: 2026-10-08
- Related: RFC-0003 (the design), RFC-0001 (open question on menus), ADR-0017 (terms, redirects), ADR-0018 (roles: menus are Editor and above)
- Sources: Ghost primary/secondary navigation (https://ghost.org/help/changing-the-navigation/); docs-sidebar needs from the docs research (Starlight, Docusaurus, Nimbus)

## Context
The header was derived from top-level pages. There was no editor, no footer menu, and no tree that a docs sidebar could reuse. Links typed as URLs break when slugs change.

## Decision
Adopt RFC-0003 with its recommended answers:
- **Menu nodes.** Each named menu (`primary`, `footer`, later `sidebar`, or custom) is a **Menu node** (`menu_`) with `rev`, CAS and snapshots. It holds an ordered tree of items as nested arrays, so cycles are impossible.
- **Items.** Item kinds are `page`, `contentEntry` and `term` (all by id), plus `collection`, `url` (https only) and `group`. Labels are per locale and fall back to the target's title.
- **Missing targets.** Items whose target is gone, unpublished, retired or empty are hidden with their subtree on the site and flagged in Studio. The menu itself is never rewritten.
- **Depth.** Default `maxDepth` is primary 3, footer 2 and sidebar 6, with a hard cap of 6. core-ts enforces it, because a recursive schema cannot count levels.
- **Agent writes.** `update_menu`, `set_menu` and `delete_menu` need `site:write` (Editor and above) and a person's approval in every mode. A menu change makes a publish "structure" in `auto` mode, and approval prompts show the delta.
- **Rendering.** The renderer resolves links at render time, picks the active item, and derives breadcrumbs and prev/next from the same tree. Sites without a menu keep today's derived header exactly.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| A `navigation` field on Site | One node | Every menu edit rewrites the site; noisy diffs, CAS conflicts with settings | Separate nodes, like terms |
| Links as URLs | Simple | Break on slug changes and redirects | Ids survive renames |
| Parent pointers per item node | Fine-grained | Cycles possible; many tiny nodes | Nested arrays in one node |

## Consequences
- **Positive.** Menus survive renames, docs sidebars reuse the same primitive, and menu changes are reviewable and reversible.
- **Negative.** Another node kind across the store, sync, renderer, MCP and Studio. Kumo has no tree component, so Studio needs a `MenuTree` block.
- **Risk.** Hidden items can go unnoticed. Studio flags them, and the publish prompt lists menu effects.
