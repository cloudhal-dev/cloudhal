---
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
---

Navigation menus on the public site (RFC-0003 §7).

- `@cloudhal/astro-renderer`: `GraphSource` gains `menu(key)` and `navigation(key, locale?, { collectionIndex? })` (live and snapshot). New subpath `@cloudhal/astro-renderer/navigation`: `menuLookup`, `navigationFor`, `toNavigation`, `derivedNavigation` (today's `navLinks` + `categoryNavLinks` in the `Navigation` shape), `activeItem` (exact → longest prefix → context: the entry's primary category, its nearest ancestor in the menu, then its collection), `markActive`, `markCurrent` (the derived header's current rule), `breadcrumbs`, `neighbours` and `navigationCacheTags`. Items whose page or entry is missing, unpublished or in another locale, whose term is retired or has no served archive, or whose collection has no index are hidden with their subtree. A collection's index comes from the theme hook, else the first published page listing the collection.
- Blog starter (`cloudhal init`): the header renders the `primary` menu (children as `<details>` disclosures, up to three levels; external links with `rel="noopener noreferrer"`, `target="_blank"` only for `newTab`), and the derived header without one, byte for byte as before. A `footer` menu replaces the footer's RSS link. `theme.ts` exports a `collectionIndex` hook. Pages that render a menu carry `cloudhal-node-<menuId>` and the term tags of the term items they show.
