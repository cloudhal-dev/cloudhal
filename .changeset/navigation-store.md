---
"@cloudhal/core-ts": minor
"@cloudhal/api": patch
---

Navigation menus in the store (RFC-0003 §4).

- New Worker-safe subpath `@cloudhal/core-ts/menu` (also exported from the root): `MENU_LIMITS`, `MENU_DEFAULT_DEPTH`, `defaultMaxDepth`, `validateMenuTree`, `canonicalMenu`, `walkMenu`, `menuTargets`, `applyMenuOps` (add, remove, move, update; all or nothing, at most 50 operations), `buildMenuItems`, `menuDelta` (the approval-prompt delta, moves outside the longest common subsequence only), `resolveMenu` over a `MenuLookup` (per-item state, hidden reason, label and its source, href) and `menuStateChanges`.
- `SiteGraphStore` gains `createMenu`, `getMenu`, `getMenuByKey`, `listMenus`, `updateMenu` (whole tree, CAS on `rev`, key immutable), `deleteMenu`, `menuReferences` and `createMenuFromPages`. Each write is one statement whose guard checks that the targets it adds are nodes of the site (no retired terms); a target deleted concurrently fails with `unknown_target`.
- `InvariantError` codes `unknown_target`, `unknown_item`, `invalid_label`, `invalid_menu` and `key_taken`; menus also use `too_deep`, `too_large`, `cycle` and `immutable_field`.
- `@cloudhal/api` maps the new codes to HTTP statuses (`key_taken` 409, the others 422); the menu routes come later.
- `importSite` validates menu rows with `validateMenuTree` (targets are not checked: hidden items are legal).
