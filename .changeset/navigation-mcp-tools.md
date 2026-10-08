---
"@cloudhal/mcp-server": minor
"@cloudhal/agent-runtime": patch
---

Navigation menu tools (RFC-0003 §6).

- `@cloudhal/mcp-server`: `list_menus` and `get_menu` (`site:read`; per-item state, hidden reason, label and its source, href) and `update_menu` (operations; `create: {}` creates the menu), `set_menu` (whole tree; items keep their ids) and `delete_menu` (`site:write`, always approved by a person except in local `bypass`). Targets are given by id or handle (`/about`, `posts/hello-world`, `category:news`) and resolved before anyone is asked; a call that cannot succeed is refused before approval. Prompts show the delta (`+`, `−`, `↕`, `↳`, `~`, `!`, external hosts); each write takes one snapshot (`cloudhal.tool`, `cloudhal.menu`) and audits `input.effect.menu` (item ids, no labels). The publish prompt summarises changed menus (`~ menu "primary" (+2 −1)`) and the items other changes hide or show again. `create_page` and `create_entry` results carry a `hint` when the site has a `primary` menu that does not link the new node; `delete_page` and `delete_entry` prompts name the menu items that will be hidden.
- `@cloudhal/agent-runtime`: the `auto`-mode structure reason reads "it changes pages, menus, site settings, taxonomies or redirects".
