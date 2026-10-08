# RFC-0003: Navigation (menus)
- Status: Accepted (2026-10-08, Halil — including the recommended answers to the open questions)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-08
- Related: RFC-0001 (open question "navigation menus … as first-class nodes"), RFC-0002 (node registry, `op_guards`, term archives, redirects), ADR-0001, ADR-0002, ADR-0004, ADR-0009, ADR-0011, ADR-0014, ADR-0015, ADR-0017
- Contracts on this branch: `menu.schema.json` with fixtures, generated and tested in both languages (§2). The `NodeRef.kind` diff in §2.3 waits for the store code, as RFC-0002 §2.8 did.

## Summary
A site gets named **menus** (`primary`, `footer`, later `sidebar` for docs), each a **Menu** node with `rev`, CAS and snapshots, holding an ordered tree of items. Items point at pages, entries and term archives **by id**, at a collection index, or at an external https URL, and label-only groups hold children. Labels are per locale and fall back to the target's title. Renames and slug changes never break a menu, and an item whose target is gone, retired or unpublished is hidden on the site and flagged in Studio, never rendered as a dead link. Menu changes are site-wide, so every agent write waits for a person, and `auto` mode treats them as structure. Sites without a menu keep today's derived header.

## Motivation
The header today is derived: `navLinks` (`packages/astro-renderer/src/routing.ts`) lists the top-level pages of the default locale in `Site.pageIds` order, and the blog starter appends served top-level categories when `NAV_CATEGORIES` is true. Nobody can add an external link, a category below the top level, a collection index or a dropdown, rename a menu label without renaming the page, hide a page from the header, or set a footer. Ghost has two editable menus (primary and secondary); our publisher gap analysis ranks a navigation editor P0. Docs sites need a sidebar tree that differs from the URL structure (group headings, external links, cross-section links), and the research recommends one primitive for both.

Ghost's own model is the trap to avoid: its menus store `{label, url}` strings, so a slug change or a deleted page leaves a dead link that nothing reports. Cloudhal already has stable ids, redirects and snapshots, so menus can reference nodes and degrade safely.

Who is affected: publishers and docs authors (no menu control), agents (no tool to put a new page in the navigation), and approvers (a header change today is invisible: it happens as a side effect of creating a top-level page).

Why now: the RFC-0001 open question, a P0 publisher gap, and the docs starter (Sprint 13–14 in the research plan) needs the same tree.

## Proposal

### 1. Model
```
Site ──1:n──▶ Menu (key: primary | footer | sidebar | …, unique per site)
                └─ items: MenuItem[]  (ordered tree, embedded)
                      page ─────────▶ Page.id
                      contentEntry ─▶ ContentEntry.id
                      term ─────────▶ Term.id      (its archive)
                      collection ───▶ "<collection>" (its index, wherever the theme serves it)
                      url ──────────▶ https://…    (external)
                      group ────────▶ (no link; holds children)
```
- **One Menu node per key** (`menu_` ids, uniqueness key `<key>` within `(site, kind)`), like a Page: it is the unit of locking, snapshotting, diffing and approval. Items are embedded, as Sections are in a Page; they have ids for stable diffs and operations but no `rev`.
- **The tree is nested arrays.** Order is array order (no `position` fields to renumber), and every item has exactly one parent by construction, so cycles cannot be written.
- **Targets are ids**, never URLs, except for external links. The href is computed at render time from the target's current path or slug, so renames and RFC-0002 slug changes need no menu write and no redirect hop.
- **Missing menu ≠ empty menu.** No `primary` node means "use the theme's derived default" (today's behaviour). A node with `items: []` means "show nothing here".
- **Locales.** One tree serves every locale; labels are per locale. Pages and entries are per-locale nodes today and only the default locale is routed (RFC-0002 §4.5), so a page or entry item shows only in its own locale. Locale routing with translation links will let such items resolve to the translation (open question 4).

### 2. Contracts
All shapes stay inside the AGENTS.md subset (inline `oneOf` with a single-value `kind`, no `default`, `additionalProperties: false` except the declared maps, refs only to `common.schema.json#/$defs/*`). `common.schema.json` is unchanged: every new def is local to the Menu root, which keeps this branch from conflicting with the parallel RFC-0004 and RFC-0005 drafts.

#### 2.1 `menu.schema.json` (new root)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/menu.schema.json",
  "title": "Menu",
  "description": "A named navigation menu of a site (e.g. 'primary', 'footer', 'sidebar'): an ordered tree of items. Items point at pages, entries and terms by id, so renames and slug changes never break them; an item whose target is gone, retired or unpublished is hidden by the renderer, never rendered as a dead link (RFC-0003).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "key",
    "maxDepth",
    "items",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": { "$ref": "common.schema.json#/$defs/SchemaVersion" },
    "id": { "$ref": "common.schema.json#/$defs/Id" },
    "siteId": { "$ref": "common.schema.json#/$defs/Id" },
    "key": {
      "$ref": "common.schema.json#/$defs/Slug",
      "description": "Where themes place the menu ('primary', 'footer', 'sidebar', …). Unique per site and immutable once created."
    },
    "maxDepth": {
      "type": "integer",
      "description": "Deepest level an item may sit at; top-level items are level 1. The store refuses deeper trees.",
      "minimum": 1,
      "maximum": 6
    },
    "items": {
      "type": "array",
      "description": "Top-level items in display order. Empty means the site deliberately shows no items here (a missing menu means the theme's derived default).",
      "items": { "$ref": "#/$defs/MenuItem" },
      "maxItems": 100
    },
    "rev": { "$ref": "common.schema.json#/$defs/Revision" },
    "createdAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "updatedAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "metadata": { "$ref": "common.schema.json#/$defs/Metadata" }
  },
  "$defs": {
    "MenuLabels": {
      "type": "object",
      "description": "Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100,
        "pattern": "^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"
      }
    },
    "MenuItem": {
      "description": "One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.",
      "oneOf": [
        {
          "type": "object",
          "title": "PageMenuItem",
          "description": "Links to a page by id; the label falls back to the page title.",
          "additionalProperties": false,
          "required": ["id", "kind", "pageId"],
          "properties": {
            "id": { "$ref": "common.schema.json#/$defs/Id" },
            "kind": { "type": "string", "enum": ["page"] },
            "pageId": { "$ref": "common.schema.json#/$defs/Id" },
            "labels": { "$ref": "#/$defs/MenuLabels" },
            "children": {
              "type": "array",
              "items": { "$ref": "#/$defs/MenuItem" },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "EntryMenuItem",
          "description": "Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.",
          "additionalProperties": false,
          "required": ["id", "kind", "entryId"],
          "properties": {
            "id": { "$ref": "common.schema.json#/$defs/Id" },
            "kind": { "type": "string", "enum": ["contentEntry"] },
            "entryId": { "$ref": "common.schema.json#/$defs/Id" },
            "labels": { "$ref": "#/$defs/MenuLabels" },
            "children": {
              "type": "array",
              "items": { "$ref": "#/$defs/MenuItem" },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "TermMenuItem",
          "description": "Links to a term's archive by term id; the label falls back to the term name in the locale.",
          "additionalProperties": false,
          "required": ["id", "kind", "termId"],
          "properties": {
            "id": { "$ref": "common.schema.json#/$defs/Id" },
            "kind": { "type": "string", "enum": ["term"] },
            "termId": { "$ref": "common.schema.json#/$defs/Id" },
            "labels": { "$ref": "#/$defs/MenuLabels" },
            "children": {
              "type": "array",
              "items": { "$ref": "#/$defs/MenuItem" },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "CollectionMenuItem",
          "description": "Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.",
          "additionalProperties": false,
          "required": ["id", "kind", "collection", "labels"],
          "properties": {
            "id": { "$ref": "common.schema.json#/$defs/Id" },
            "kind": { "type": "string", "enum": ["collection"] },
            "collection": { "$ref": "common.schema.json#/$defs/Slug" },
            "labels": { "$ref": "#/$defs/MenuLabels" },
            "children": {
              "type": "array",
              "items": { "$ref": "#/$defs/MenuItem" },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "UrlMenuItem",
          "description": "Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.",
          "additionalProperties": false,
          "required": ["id", "kind", "href", "labels"],
          "properties": {
            "id": { "$ref": "common.schema.json#/$defs/Id" },
            "kind": { "type": "string", "enum": ["url"] },
            "href": {
              "type": "string",
              "pattern": "^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$",
              "maxLength": 2048
            },
            "newTab": {
              "type": "boolean",
              "description": "Open in a new tab (rendered with rel=\"noopener noreferrer\")."
            },
            "labels": { "$ref": "#/$defs/MenuLabels" },
            "children": {
              "type": "array",
              "items": { "$ref": "#/$defs/MenuItem" },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "GroupMenuItem",
          "description": "A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.",
          "additionalProperties": false,
          "required": ["id", "kind", "labels", "children"],
          "properties": {
            "id": { "$ref": "common.schema.json#/$defs/Id" },
            "kind": { "type": "string", "enum": ["group"] },
            "labels": { "$ref": "#/$defs/MenuLabels" },
            "children": {
              "type": "array",
              "items": { "$ref": "#/$defs/MenuItem" },
              "minItems": 1,
              "maxItems": 100
            }
          }
        }
      ]
    }
  }
}
```

Generated types: TypeScript `Menu`, `MenuItem = PageMenuItem | EntryMenuItem | TermMenuItem | CollectionMenuItem | UrlMenuItem | GroupMenuItem` and `MenuLabels`; Rust `Menu` and an internally tagged `enum MenuItem` (`#[serde(tag = "kind")]`) whose variants hold `children: Vec<MenuItem>`.

#### 2.2 Fixtures
- `fixtures/valid/menu/`: `primary.json` (page with and without labels, collection, group → term → sub-term, entry, external link with `newTab`, three levels); `footer-flat.json` (depth 1, a URL with port, query and fragment, an IDN host in punycode, metadata); `empty.json` (`items: []`); `docs-sidebar.json` (groups and pages four levels deep, `maxDepth: 6`).
- `fixtures/invalid/menu/` (33 files), each failing for its stated reason: `javascript:`, `data:`, `http:`, protocol-relative, user-info (`https://bank.example@evil.example`), a Cyrillic look-alike host, a backslash, whitespace and a site path as `href`; URL, collection and group items without labels; a group without or with empty children; empty `children` on a page item; `href` or `newTab` on internal items; an unknown item kind; a missing item id; a non-id target; empty labels, an empty label, a newline in a label (prompt forgery), a leading space, 101 characters, a non-locale key; a non-slug key; `maxDepth` 0 and 7; missing `items` or `maxDepth`; an unknown property.
- The contracts test `node schemas are mutually exclusive` now includes `menu`: no menu fixture is a valid site, page, entry, taxonomy, term or redirect, and the reverse.

#### 2.3 `snapshot.schema.json` (diff; lands with the store change)
```diff
-        "kind": { "type": "string", "enum": ["site", "page", "contentEntry", "taxonomy", "term", "redirect"] },
+        "kind": { "type": "string", "enum": ["site", "page", "contentEntry", "taxonomy", "term", "redirect", "menu"] },
```
Tried on this branch with a snapshot fixture holding a `menu` ref: both generators and both validators accept it, but the repo typecheck then fails, by design, in:
- `packages/core-ts/src/nodes.ts` L32–33: the `Same<NodeKind, NodeRef["kind"]>` guard demands a registry entry (`NODE_KINDS`, `NodeTypes`, `NODE_SPEC.menu = { schema: "menu", prefix: "menu", key: n => n.key, siteId }`, `ID_PREFIX.menu`). Registering the kind makes `sync` accept menu rows, which is store behaviour, so it ships with the store.
- `apps/studio/src/lib/diff.ts` L16 `KIND_ORDER` (order: site, menu, taxonomy, term, page, contentEntry, redirect) and `diff.kinds.menu` in `en.ts`/`tr.ts` ("Menu"/"Menü"), plus title resolution in `SnapshotDiffDialog.tsx` (the menu key, e.g. "Header (primary)").
- `packages/mcp-server/src/tools.ts` `describeChanges` (compiles, but would print raw ids) and the `structure` wording in `packages/agent-runtime/src/modes.ts`.

Parallel RFCs that add kinds (assets) edit the same enum line; whichever lands second rebases one line.

#### 2.4 What the generators decided
- **Item kinds are variants, not a `target` sub-object.** A `{ target: oneOf[…], labels? }` item would have needed an optional target for groups and could not require labels where there is no title to fall back to. Inline variants let the schema require `labels` on `collection`, `url` and `group`, and `children` on `group`; typify turns them into one internally tagged enum.
- **Depth is not in the schema.** A recursive `$ref` cannot count levels. Per-level types (`MenuItemL1` … `L3`) would bound it, but generate a different type per level in both languages and need another schema for deeper sidebars. `maxDepth` (1–6) is data; the store enforces it (invariant 4).
- **Recursion works in both generators**: `children` refers back to `#/$defs/MenuItem`; TypeScript gets a recursive union, Rust a `Vec<MenuItem>` (no `Box` needed).
- **No empty optional containers** (RFC-0002 §2.10): `children` and `labels` have `minItems`/`minProperties: 1`, because typify skips empty vectors on output. In TypeScript, `children` is a non-empty tuple `[MenuItem, ...MenuItem[]]`; code that builds items omits it rather than writing `[]`. `items` is required, so an empty menu round-trips as `[]`.
- **`$ref` with a sibling `description`** is used only for string targets (`key`), which inline as `string` in TypeScript, as `Taxonomy.key` does.
- **Patterns.** Control-character classes (`\x00-\x1F\x7F`) and `\s` behave the same in Ajv (`u` flag), the Rust `regress` crate used by typify, and the `jsonschema` crate (the invalid fixtures prove it). No lookbehind.
- Cross-field and cross-node rules (unique item ids, total size, target existence) cannot be written in the subset; core-ts enforces them (§3).

### 3. Invariants
1. **Key.** `key` is a slug, unique per site and immutable. The well-known keys are `primary` (header), `footer` and, with the docs starter, `sidebar`; other keys are allowed.
2. **Item ids** are prefixed ids (`item_…`), unique within the menu, and stable: operations never re-id an item, so diffs show moves and edits instead of remove-and-add.
3. **Tree.** Every item has exactly one parent and the tree has no cycles (nested arrays). Order is array order.
4. **Depth.** No item sits deeper than `maxDepth` (top level = 1), and `maxDepth` ≤ 6. Lowering `maxDepth` below the current depth is refused.
5. **Size.** At most 100 items per level and 500 items per menu.
6. **Canonical form.** No empty `labels` or `children`; labels are trimmed plain text without control characters, 1–100 characters.
7. **Labels.** Label locales that a write adds are locales of the site (labels of a locale the site later drops are kept and ignored). `collection`, `url` and `group` items carry labels, including one for the site's default locale. Fallback when rendering locale L: `labels[L]` → `labels[defaultLocale]` → the target's title (page or entry title, term name in L via `termName`).
8. **External links** are `https://` with an ASCII host (IDN in punycode), no user-info, no whitespace, backslash or control characters, at most 2,048 characters. Nothing else is a URL item: site paths are linked by id.
9. **Target integrity at write time.** Every target that a write adds or changes names a node of the expected kind (`page`, `contentEntry`, `term`) in the same site, and a term target is not `retired`. Drafts are allowed (the item stays hidden until the target is published). Targets the write leaves unchanged are not re-checked.
10. **No writes on behalf of targets.** Deleting a page or entry, unpublishing it, retiring or merging a term, or changing a slug or path never writes a menu. Resolution happens at render time (invariant 11), so the operations of RFC-0002 stay single-node where they were.
11. **No dead links.** A rendered menu links only to URLs the site serves: published pages and entries of the requested locale, archives that answer 200 (`archiveState`), collection indexes the theme serves, and external URLs. An unresolved item is hidden together with its subtree; a group with no shown child is hidden.
12. **One write, one snapshot.** Every menu change, whether a whole-tree replace or a list of operations, is one CAS on one node and one snapshot.
13. **Node kinds stay exclusive** (RFC-0002 invariant 15): no document is valid under two node schemas.

Where each invariant is enforced:

| # | Schema | core-ts | Renderer | Policy engine / MCP / Studio |
|---|---|---|---|---|
| 1 | `Slug` pattern | uniqueness key `<key>`; the key is never in an update | – | – |
| 2 | `Id` pattern | `validateMenuTree` on every write and on `sync` import | item ids as stable keys | operations address items by id |
| 3 | nested `children` | – | – | – |
| 4 | `maxDepth` 1–6 | `validateMenuTree` | renders at most the theme's depth | Studio blocks deeper drops; MCP returns `too_deep` |
| 5 | `maxItems: 100` per level | 500 in total (`too_large`) | – | – |
| 6 | `minItems`/`minProperties`, label pattern | the store trims labels before validating | text is escaped | `quote()` in prompts |
| 7 | `required: labels` on three kinds; locale `propertyNames` | default-locale label; added keys ∈ `Site.locales` | fallback chain | Studio shows the fallback as a placeholder |
| 8 | `href` pattern | – | `rel="noopener noreferrer"` with `newTab` | prompts print the host |
| 9 | `Id` pattern | one guard in the CAS statement (§4.2) | – | targets resolved before approval |
| 10 | – | no menu statement in page, entry or term operations | – | delete and retire prompts name affected items |
| 11 | – | `resolveMenu` (pure, shared) | hides unresolved items | Studio and `get_menu` flag them with a reason |
| 12 | – | single-statement CAS | – | the tool takes one snapshot |
| 13 | mutual exclusivity (contracts test) | `sync` validates rows by their kind | – | – |

### 4. Store (`packages/core-ts`)

#### 4.1 Pure module `@cloudhal/core-ts/menu`
Worker-safe and dependency-free, shared by the store, the API, MCP, the renderer and Studio:
```ts
export const MENU_LIMITS = { maxDepth: 6, perLevel: 100, total: 500, labelLength: 100 } as const;
export const MENU_DEFAULT_DEPTH: Record<string, number> = { primary: 3, footer: 2, sidebar: 6 }; // others: 3

validateMenuTree(menu: Menu, site: Site): void            // invariants 2, 4, 5, 7; throws InvariantError
walkMenu(items, visit: (item, depth, parent?) => void): void
menuTargets(menu: Menu): TargetRef[]                       // { kind: "page" | "contentEntry" | "term"; id }
applyMenuOps(menu: Menu, ops: MenuOp[], newId: () => string): Menu   // atomic: all or nothing (§6.2)
menuDelta(before: Menu | undefined, after: Menu): MenuDelta          // §6.3
resolveMenu(menu: Menu, lookup: MenuLookup, locale: string): ResolvedMenu   // §7.1

interface MenuLookup {
  page(id: string): { path: string; title: string; locale: string; served: boolean } | undefined;
  entry(id: string): { path: string; title: string; locale: string; served: boolean } | undefined;
  term(id: string, locale: string): { path: string; name: string; state: 200 | 404 | 410 } | undefined;
  collectionIndex(collection: string, locale: string): string | undefined;   // path, or not served
}
```
`archiveState` moves from `@cloudhal/astro-renderer` (`archive.ts`) into core-ts so that the renderer and the API compute "is this archive served" with one rule.

#### 4.2 Store methods
```ts
createMenu(input: Creatable<Menu>): Promise<Menu>              // maxDepth from the caller (MENU_DEFAULT_DEPTH in tools)
getMenu(id) · getMenuByKey(siteId, key) · listMenus(siteId)
updateMenu(menu: Menu): Promise<Menu>                          // whole tree; CAS on rev; key immutable
deleteMenu(menu: Menu): Promise<void>                          // CAS delete; the site falls back to its derived default
menuReferences(siteId, target: TargetRef): Promise<{ menu: Menu; itemIds: string[] }[]>
createMenuFromPages(site: Site, key: string, opts?: { categories?: boolean }): Promise<Menu>   // §8
```
A write is **one statement**, so it needs no `op_guards` batch: the `INSERT … SELECT … WHERE` (create) or the CAS `UPDATE … WHERE id = ? AND rev = ?` (update) carries invariant 9 as one guard over the targets the write adds or changes:
```sql
AND (SELECT count(*) FROM nodes
     WHERE site_id = ? AND kind || ':' || id IN (SELECT value FROM json_each(?))
       AND NOT (kind = 'term' AND json_extract(body, '$.status') = 'retired')) = ?
```
One JSON parameter carries any number of targets (D1's 100-parameter limit does not bind). A concurrent delete of a target makes the write match no row; the store then re-reads, and reports `ConflictError` if `rev` moved, else `InvariantError("unknown_target", [ids])`. `sync` import validates menu rows against the schema of their kind and runs `validateMenuTree`; it does not check targets, because hidden items are a legal state (invariant 10).

Page, entry and term operations are unchanged. Snapshots stay a caller concern: the API route or MCP tool calls `createSnapshot` once after a menu write.

### 5. REST API (people)
`GET/POST /api/sites/:siteId/menus`; `GET/PUT/DELETE /api/sites/:siteId/menus/:menuId` (`PUT` = whole tree with `rev`); `POST /menus/:menuId/ops` (`{ rev, ops, dryRun? }`); `GET /menus/:menuId/resolve?locale=` (per-item state for Studio); `POST /menus/from-pages` (`{ key, categories?, dryRun? }`). Mutations answer with the menu, its `menuDelta` and the snapshot they created. Errors: `conflict` (409, with the current menu), `unknown_target`, `too_deep`, `too_large`, `invalid_label`, `key_taken`.

### 6. MCP and policy

#### 6.1 Tools
| Tool | Scopes | Read-only | Approval | Notes |
|---|---|---|---|---|
| `list_menus` | site:read | yes | – | Keys, ids, `rev`, `maxDepth`, item counts and hidden-item counts, so an agent knows what exists and its limits. |
| `get_menu` | site:read | yes | – | `{siteId, key, locale?}` → the stored tree plus, per item, `state: "shown" \| "hidden"`, `reason`, the label shown and where it came from (`item`, `default-locale`, `target`), and the href. |
| `update_menu` | site:write | no | **yes** | Operations (§6.2) with `rev`. Creates the menu when `create: { maxDepth? }` is given and the key is free. |
| `set_menu` | site:write | no | **yes** | Whole tree with `rev` (absent only when creating). Items that keep their `id` keep their identity; items without one get new ids. |
| `delete_menu` | site:write | no (destructive) | **yes** | The site falls back to the theme's derived default for that key. |

The brief and the research call the read and edit tools `get_nav` and `update_nav`; this RFC names them after the node (`get_menu`, `update_menu`), like `list_terms`/`update_term` (open question 1).

- **Targets are resolved before anyone is asked.** Inputs accept an id or a human handle: `{kind:"page", ref:"page_…" | "/about"}`, `{kind:"contentEntry", ref:"entry_…" | "posts/hello-world"}`, `{kind:"term", ref:"term_…" | "category:news"}` (RFC-0002 §6.3 resolution). The tool `precheck` resolves them, applies the operations, validates the tree and computes the delta; a call that cannot succeed fails before approval (audited as `deny`), and the person approves the resolved ids. The stored menu holds ids only.
- **One snapshot per call** (`metadata["cloudhal.tool"]`), one audit row with `input.effect = { menu: { key, added, removed, moved, changed } }` (counts and item ids, no labels).
- **Agent-facing hints.** `create_page` and `create_entry` results say when the site has a `primary` menu that does not contain the new node ("not in any menu; use `update_menu` to add it"), because after a site adopts a menu, new pages no longer join the header on their own. `delete_page`, `delete_entry`, `retire_term` and `merge_terms` prompts list the menu items that will be hidden.

#### 6.2 Operations (`update_menu`, `POST …/ops`, `applyMenuOps`)
```ts
type MenuOp =
  | { op: "add"; item: ItemInput; parent?: string | null; index?: number }   // parent: item id; null/absent = top level; index: 0-based, absent = append
  | { op: "remove"; itemId: string }                                         // removes the subtree
  | { op: "move"; itemId: string; parent?: string | null; index?: number }
  | { op: "update"; itemId: string; labels?: Record<string, string | null>;  // null deletes a locale's label
      target?: TargetInput; newTab?: boolean | null };
type ItemInput = { target: TargetInput | { kind: "group" }; labels?: Record<string, string>;
                   newTab?: boolean; children?: ItemInput[] };
type TargetInput =
  | { kind: "page" | "contentEntry" | "term"; ref: string }
  | { kind: "collection"; collection: string }
  | { kind: "url"; href: string };
```
Operations apply in order to a copy; the first failing one (unknown item, move into its own subtree, depth, size, missing default-locale label) fails the call with its index, and nothing is written. Changing an item's target changes its variant and keeps its id, labels and children (a group cannot keep a target, a URL item must keep labels). 1–50 operations per call.

#### 6.3 Approval prompt: the delta format
`menuDelta(before, after)` matches items by id. Sibling order changes count as moves only for items outside the longest common subsequence of the old and new sibling orders, so inserting one item does not report its siblings as moved. Labels are shown in the default locale (or the fallback, marked "title"), quoted and truncated by the existing `quote()` rule; external links print their host.
```
Change menu "primary" (Header): 8 changes, 14 → 11 items
+ "Pricing" → /pricing (page), top level, position 3
+ "Status" → https://status.example.com/… (external: status.example.com, new tab), under "Help"
− "Old blog" → /blog (collection posts)
− "Resources" and 3 items below it
↕ "Contact": position 5 → 2
↳ "API" moved under "Docs" (was top level)
~ "About": label [tr] "Hakkında" → "Hakkımızda"
~ "World": target term "News" → term "World"
! "Careers" stays hidden: its page is a draft
```
The `publish` prompt summarises each changed menu in one line (`~ menu "primary" (+2 −1 ↕1)`) and also reports **menu effects of other changes**: items that become hidden or shown because a page was deleted, an entry unpublished or a term retired (`! menu "primary": "About" hidden (page deleted)`), computed by resolving each menu against the live and the new snapshot.

#### 6.4 Policy
- **Every agent write waits for a person.** `update_menu`, `set_menu` and `delete_menu` are `requiresApproval` in every mode (the local stdio `bypass` mode excepted, as for every approval-gated tool). The approval binds to the call and the content state (ADR-0014), so a menu that changed after the request invalidates it.
- **Scope.** `site:write`, like the RFC-0002 structural tools; no default agent key and no `scopesForMode` set includes it (open question 2).
- **`auto` mode.** A pending `menu` node makes a publish `"structure"`; `checkAutoPublish` already counts every kind other than `contentEntry` as structure. Only the wording changes: "it changes pages, menus, site settings, taxonomies or redirects".
- `maxDepth`, size and label rules are data invariants in core-ts, not policy. Studio users are people and save menus directly (one snapshot per save).

### 7. Renderer (`@cloudhal/astro-renderer`) and starter

#### 7.1 Resolution
`GraphSource` (live and snapshot) gains:
```ts
/** The menu stored under `key`, if the site has one (raw node). */
menu(key: string): Promise<Menu | undefined>;
/** The menu resolved for a locale: only shown items, with labels and hrefs. Undefined: no menu under `key`. */
navigation(key: string, locale?: string): Promise<Navigation | undefined>;

interface Navigation { key: string; menuId?: string; locale: string; items: NavItem[] }   // menuId absent: derived
interface NavItem {
  id: string;                         // item id
  kind: MenuItem["kind"];
  label: string;
  href?: string;                      // absent for groups
  external: boolean;
  newTab: boolean;
  target?: { kind: "page" | "contentEntry" | "term"; id: string } | { kind: "collection"; collection: string };
  children: NavItem[];                // shown children only
}
```
`navigation` is `resolveMenu` (§4.1) over a lookup built from the source:

| Item | Shown when | href | Label fallback | Hidden reason |
|---|---|---|---|---|
| `page` | the page exists, is published (live dev: not archived) and is in the locale | `page.path` | page title | `missing`, `unpublished`, `other-locale` |
| `contentEntry` | the same rules | `/<collection>/<slug>` | entry title | `missing`, `unpublished`, `other-locale` |
| `term` | `archiveState` is 200 for the locale | the archive root | term name in the locale | `missing`, `not-served` (404: internal, proposed, archive off or empty), `retired` (410) |
| `collection` | the theme serves an index for it | the theme's path | – (labels required) | `no-index` |
| `url` | always | `href` | – (labels required) | – |
| `group` | at least one child is shown | – | – (labels required) | `empty-group` |

A hidden item hides its subtree (open question 3). The snapshot source reads `menu` refs like the other kinds and keeps ignoring kinds it does not know (forward compatibility).

**Collection indexes.** There is no collection route today (posts live at `/<collection>/<slug>`, and the home page lists them through a `contentList` section). The starter's `cloudhal()` config gains `collectionIndex?: (collection, locale) => string | undefined` (starters own routes, ADR-0009). Without it, or when it returns nothing, the index is the first published page in `Site.pageIds` order of that locale whose sections include an unfiltered `contentList` of that collection; failing that, the item is hidden with `no-index` (open question 5).

#### 7.2 Active item, breadcrumbs and sidebars
Pure functions next to `navLinks` (`navigation.ts`):
```ts
activeItem(nav: Navigation, route: { path: string; entry?: ContentEntry; archiveTermId?: string },
           ancestors: (termId: string) => string[]): Active | undefined
interface Active { itemId: string; match: "exact" | "prefix" | "context"; trail: NavItem[] }  // trail: root → item
markActive(nav: Navigation, active?: Active): ActiveNavItem[]
interface ActiveNavItem extends NavItem { current?: "page" | "true"; inTrail: boolean; children: ActiveNavItem[] }
neighbours(nav: Navigation, active?: Active): { prev?: NavItem; next?: NavItem }   // depth-first order of linked items
derivedNavigation(site: Site, pages: Page[], categories: ArchiveSummary[], locale: string): Navigation
```
Matching, on the request path without query, fragment or trailing slash:
1. **Exact**: an item whose href equals the path.
2. **Prefix**: the longest href that the path starts with, followed by `/` (never `/` itself), so `/category/news/page/2` activates "News" and `/docs/deploy/workers` activates "Deploy".
3. **Context**: for an entry, the item for its primary `category` term, then that term's nearest ancestor in the menu, then the entry's collection; for an archive, the nearest ancestor term in the menu.

The first rule with a match wins, and ties go to the first item in depth-first order. The match gets `aria-current="page"` when exact and `aria-current="true"` otherwise; its ancestors are `inTrail` (sidebars expand them). The trail is the breadcrumb for docs pages and the sidebar's expanded path. Entry breadcrumbs and their JSON-LD keep RFC-0002's category trail. `neighbours` gives a docs sidebar its previous/next links.

#### 7.3 Starter
```ts
const header = (await source.navigation("primary", locale))
  ?? derivedNavigation(site, await source.pages(), NAV_CATEGORIES ? categories : [], locale);
const footer = await source.navigation("footer", locale);   // undefined: today's footer
```
- `derivedNavigation` returns exactly today's `navLinks` + `categoryNavLinks` result in the `Navigation` shape, so a site without a menu renders byte-for-byte the same header (an e2e assertion).
- `Base.astro` renders `NavItem`s: top-level links in the header, children in a disclosure (`<details>`) up to three levels, external links with `rel="noopener noreferrer"` and `target="_blank"` only when `newTab`. A footer menu replaces the footer's link row when present.
- Cache tags: pages that render a menu carry `cloudhal-node-<menuId>` and `cloudhal-term-<id>` for the term items they show. Publish still purges everything; the tags serve the targeted purge that RFC-0002 left as a follow-up.

### 8. Studio (brief)
- **"Navigation"** in the site sidebar's Settings group: a `PageLayout` (resource detail template) with one tab per menu: "Header" (`primary`), "Footer" (`footer`), then custom keys. A key without a menu shows the derived menu read-only, with the primary "Create menu from current pages" (a dialog previews the items, with a checkbox "Include top-level categories (n)") and a secondary "Start empty".
- **Tree editor**, a new `MenuTree` block in `packages/ui/src/blocks` inside a `SectionCard` (Kumo 2.14 has no tree or sortable list; AGENTS.md rule 7): rows with a drag handle, the label (a fallback title is shown muted, "from page title"), a target chip ("Page /about", "Category News", "External status.example.com ↗", "Group"), and a state badge for hidden items with the reason ("Hidden: draft", "Hidden: page deleted", "Hidden: archive empty"). Keyboard first, per the WAI-ARIA tree pattern: arrow keys move focus, `Alt+↑/↓` reorder, `Alt+→/←` indent and outdent, and a live region announces every move. Pointer drag shows drop indicators and refuses drops beyond `maxDepth` or 500 items.
- **Add/edit item** dialog: a target picker (`Combobox` over pages, articles, categories and tags, collections; "External link" with the URL validated like the schema; "Group"), labels per site locale with the fallback as placeholder, and "Open in a new tab" for external links.
- **Save** is one `PUT` with `rev` → one snapshot ("One change, one snapshot. It goes live with the next publish."). A 409 keeps the edits and offers to reload. The preview pane renders the header with the unsaved tree.
- **Elsewhere:** the pages list shows an "In menu" badge; the page delete dialog names the items that will be hidden; the snapshot diff and Approvals show the §6.3 delta. DESIGN.md gets a §2q at implementation (the change loads `kumo-design` and `studio-ui`), and strings go through `useT()` in `en.ts` and `tr.ts`.

### 9. Not in this RFC: doc blocks
The research planned "navigation and doc blocks" as one RFC-0003. This RFC covers only the navigation tree. The doc blocks (`code`, `callout`, `tabs`, optionally `steps` and `cards`, and GFM alerts in markdown) are new Section kinds that come in a later RFC together with `starters/docs`, as the research plan schedules them (Sprint 13–14), so that their shapes are designed against a real docs theme. The `sidebar` key, `neighbours` and the active trail in §7.2 are what that starter needs from this RFC.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| A field on Site (`Site.navigation: { primary: Link[], … }`, the research's first idea) | No new kind; one read | Every menu edit bumps `Site.rev`, which `createPage` and `deletePage` also CAS, so menu edits and page creation conflict; menus hide inside "site settings" diffs; no per-menu history; a large docs sidebar bloats the site node | Menus need their own `rev` and snapshot entry, as terms did in RFC-0002 |
| One Navigation node per site holding every menu | One node, one read | A header edit and a sidebar edit contend; a small header change diffs a large sidebar; per-menu approval is coarser | The menu is the editing and approval unit, as the Page is |
| Ghost-style `{label, url}` items (reuse `common.Link`) | Smallest; familiar | A slug change or deleted page leaves a dead link nothing reports; labels must be copied from titles; no locale fallback | Fails "renames never break menus" |
| Flat items with `parentId` + `position` | Moves are field edits; easy SQL over items | Cycles and orphans become possible and must be checked; positions need renumbering; two encodings of order | Nested arrays make invariant 3 structural |
| Depth in the schema (`MenuItemL1` … `L3`) | Schema-enforced depth | A type per level in TypeScript and Rust; sidebars need another schema | `maxDepth` as data (§2.4) |
| Item = `{ target: oneOf[…], labels? }` | Target swaps leave the item shape intact; target union reusable | Groups need an optional target; label requirements become core-ts rules | Variants let the schema require labels and children (§2.4) |
| Derive menus from pages (`Page.parentId`, `navTitle`, `hideInNav`, as Hugo or autogenerated Docusaurus sidebars do) | No new node | Cannot hold external links, terms, collections or groups; ties navigation to URL structure, which docs sidebars break | Kept only as the derived default for sites without a menu |
| Menus in `theme.config` (free JSON) | No contract work | Not validated, not typed, inside the Site node again | Same as the first row, minus the types |
| Rewrite menus when targets change (cascade on delete or retire) | The stored menu is always "clean" | Page deletes and term retirements become multi-node operations and menu edits ("structure") in disguise; rollback of one restores a stale menu | Resolve at render time and flag (invariant 10) |

## Compatibility & migration
- **`schemaVersion` stays `1`.** A new root and, with the store, one new `NodeRef.kind` value; no existing field changes. Generated types only gain members. Readers with exhaustive maps over `NodeRef["kind"]` add `menu` (§2.3).
- **Storage.** No migration: `nodes.kind` is free text and the uniqueness key `<key>` fits `(site_id, kind, key)`. No new tables; menu writes are single statements.
- **Data.** Existing sites get no menu node, so derived behaviour continues unchanged, and so do new sites from the starter seed until someone creates a menu. Studio offers "Create menu from current pages" (`createMenuFromPages`): page items without labels in `Site.pageIds` order, the same pages `navLinks` shows today, plus top-level categories on request. Leaving labels empty keeps later page renames flowing into the menu. The result is pending like any change and goes live with the next publish, which a person approves (structure).
- **Behaviour change once a menu exists:** a new top-level page no longer joins the header by itself. Studio's "New page" dialog gains "Add to Header", and MCP results say so (§6.1).
- **Rollback.** Menus are nodes, so a snapshot rollback restores them with the rest of the site. Deleting a menu returns that key to the derived default. A code downgrade below this RFC needs the menus deleted first: older binaries reject `menu` refs when they write snapshots. Published snapshots are immutable and keep rendering, since renderers ignore kinds they do not know.
- **Rollout.** (1) Contracts (this branch). (2) `NodeRef.kind` + registry + Studio diff labels + `@cloudhal/core-ts/menu` + store methods, with the behavioural suite on SQLite and Miniflare D1. (3) REST, MCP tools, `describeChanges`, policy wording. (4) Renderer (`navigation`, `activeItem`, `derivedNavigation`) and starter. (5) Studio editor and DESIGN.md §2q. (6) On acceptance: ADR-0018.
- **Acceptance.** Behavioural tests prove invariants 1–13 on both backends, including a page deleted between a menu write's read and its statement (`unknown_target`), two concurrent menu writes (one conflicts), and a menu write with 300 new targets in one statement. Renderer tests cover each hidden reason, the label fallback chain, the three matching rules and the derived default's unchanged output. An agent's `update_menu` waits for a person in every remote mode, and an `auto` publish containing a menu change waits too.

## Security & policy impact
- **External URLs.** The schema accepts only `https://` with an ASCII host and no user-info, so `javascript:`, `data:`, `http:`, protocol-relative (`//host`), backslash tricks, `https://bank.example@evil.example` and look-alike Unicode hosts are rejected before any code runs (fixtures on this branch). Prompts and Studio show the host separately from the label. `newTab` links get `rel="noopener noreferrer"`.
- **Label injection.** Labels are agent-controlled text. The schema forbids control characters and surrounding whitespace, so a label cannot forge a new line in an approval prompt ("About\n+ Approved by owner" is an invalid fixture). Prompts quote and truncate labels (`quote()`), the renderer escapes them as text, and they never enter HTML, markdown or JSON-LD unescaped.
- **Tenant isolation.** Menus are site-scoped and every query is keyed by `site_id`. Target ids are re-authorised per call (ADR-0004), and the write guard checks that each new target is a node of the same site (invariant 9), so an id from another site cannot be linked.
- **Scopes and approvals.** No new scope. Every agent write needs `site:write` and a person's approval bound to the content state (ADR-0014). Agents cannot approve their own requests. External link items are allowed for agents, unlike external redirects (RFC-0002), because a menu link is visible on the page, shown with its host in the prompt, and changes no existing URL (open question 10).
- **Spam and SEO.** Agents cannot add a link to the site's navigation without a person. Hidden items never render, so menus produce no links to 404s or soft 404s.
- **Information exposure.** `get_menu` reports the titles and states of draft targets, which `site:read` already exposes through `get_page`; the public site never renders unpublished targets.
- **Resource limits.** 500 items, depth 6, 100 per level, 100-character labels, 2,048-character URLs and 50 operations per call bound the work of validation, resolution and prompts. Every SQL statement uses bound parameters.

## Open questions
Each has a recommended answer (Claude, 2026-10-08), pending Halil's acceptance.

1. **Tool names:** `get_nav`/`update_nav` (research, brief) or `get_menu`/`update_menu`? **Recommended: `get_menu`/`update_menu`**, one noun shared with the node, the store and the REST routes (`list_menus` and `set_menu` already use it).
2. **Scope:** `site:write` + approval, or `content:write` + approval so default agent keys can at least propose menu changes? **Recommended: `site:write`**, as RFC-0002 answer 7 did for structural tools. Revisit with RFC-0005 (roles), which may split a narrower navigation scope.
3. **A hidden item with shown children:** hide the subtree, promote the children, or render the item as a label-only group? **Recommended: hide the subtree** (predictable, never a half-menu), with Studio flagging it. Docs sidebars use `group` parents, which a deleted page cannot break.
4. **Per-locale menus** (a different tree per locale) or one tree with per-locale labels? **Recommended: one tree now.** When locale routing and translation links exist, page and entry items resolve to the translation. If a site needs locale-only items, add an optional `locales` list to items (additive).
5. **Collection index resolution:** a theme hook only, or the hook plus the "first page listing the collection" rule? **Recommended: hook first, then the page rule, else hidden.** The blog starter today serves posts from the home page, and the page rule makes "Blog → /" work without new routes.
6. **Anchors** (`#pricing` on one-page sites)? **Recommended: later**, as an optional `fragment` on page items (additive) when a theme needs it. A URL item cannot stand in, because site paths are linked by id.
7. **`mailto:` and `tel:` in footers?** **Recommended: not in v1.** Add an `email` item kind if publishers ask; it keeps the https-only rule for `url` simple.
8. **The `group` kind** goes beyond the five targets in the brief. **Recommended: keep it.** Dropdown parents and sidebar headings need it, and a page or URL item cannot stand in without a fake link.
9. **Should deleting a page that a menu links be refused?** **Recommended: no.** Warn in the prompt and the dialog, hide the item, and let Studio flag it; blocking would make every page delete depend on menus.
10. **External links by agents:** allowed with approval, or people only as for external redirects? **Recommended: allowed with approval**, host printed in the prompt (see Security).
11. **Default `maxDepth`:** primary 3, footer 2, sidebar 6, others 3, hard cap 6? **Recommended: yes.** The blog starter renders three levels; the cap covers deep docs trees.
12. **How Studio learns which keys and depths a theme renders.** **Recommended: well-known keys now** (`primary`, `footer`; `sidebar` with the docs theme), and a theme manifest (`menus: { key: { maxDepth } }`) in the later theme-settings work, after which Studio warns when a menu is deeper than the theme shows.
13. **Per-call approval in `edits` mode** (the brief) or free edits with the publish as the only gate (the research's first sketch)? **Recommended: per-call approval, as drafted.** Menus are site-wide; revisit only if approvals become noise in practice.
14. **Hero CTAs and the `Link` def** still use href strings. **Recommended: a later RFC** moves the menu target variants to `common.schema.json` as a `LinkTarget` and lets `HeroSection.cta` use them, with the same render-time resolution.

## Implementation notes (store, MCP, renderer and starter; rollout steps 2–4)
Contracts, store, MCP and the public site are in; REST routes and Studio come after the RFC-0005 route table. Tests: `packages/core-ts/src/testing-menu.ts` (behavioural, on SQLite and Miniflare D1) and `test/menu.test.ts`; `packages/mcp-server/test/menu.test.ts`; `packages/astro-renderer/test/navigation.test.ts`; `packages/cli/test/e2e.test.ts` (static build) and `cloudflare.test.ts` (Site Worker on workerd) over `packages/cli/test/menu-fixture.ts`.

- **Shared lookup lives in the renderer.** `archiveState` stays in `@cloudhal/astro-renderer/archive` instead of moving to core-ts: the pure `resolveMenu` in `@cloudhal/core-ts/menu` takes a `MenuLookup`, and `menuLookup(data)` in `@cloudhal/astro-renderer/navigation` builds it from a site's nodes with `archiveState`. MCP uses the same builder (it already depends on the renderer, as does `@cloudhal/api`), so the site, `get_menu` and the publish prompt apply one rule. `MenuLookup` also carries `defaultLocale`, and `term()` returns `path` only when the taxonomy publishes archives.
- **API details.** `validateMenuTree(menu, site, before?)`: label locales are checked only where the write adds them relative to `before`; `importSite` passes the menu itself, so labels of a dropped locale survive a sync. `applyMenuOps(menu, ops, newId, site?)` validates after every operation when given the site, so depth, size and label errors name their operation (`details.opIndex`); an empty group is allowed between operations. `menuDelta` reports added and removed subtrees once (with their size). Extra exports: `buildMenuItems`, `canonicalMenu`, `addedTargets`, `indexMenu`, `isMenuHref`, `menuStateChanges`, `MENU_MAX_OPS`. `createMenuFromPages(site, key, { categories?, maxDepth?, dryRun? })` also lists draft top-level pages (hidden until published, as in the live dev header).
- **Error codes.** Besides `unknown_target`, `too_deep`, `too_large`, `invalid_label` and `key_taken`: `unknown_item` (an operation names a missing item), `invalid_menu` (malformed or duplicate item ids, an empty group, `newTab` off a URL item, a bad external link), `cycle` (a move into its own subtree) and `immutable_field` (a key change). `@cloudhal/api` maps them already (`key_taken` 409, the others 422).
- **Hidden reasons** add `parent-hidden` (an item under a hidden one, answer 3), so Studio and `get_menu` can tell the cause from its consequence; `menuStateChanges` reports a hidden subtree once, at its root.
- **Collection index hook.** It is `collectionIndex` in the starter's `theme.ts`, passed as `source.navigation(key, locale, { collectionIndex })`, not a `cloudhal()` option: the integration's config reaches pages as serialised JSON (`virtual:cloudhal/config`), which cannot hold a function.
- **Derived header, byte for byte.** `derivedNavigation` returns today's items, and the starter marks them with `markCurrent` (today's rule: exact or prefix → `aria-current="page"`, no context match). Menus use `activeItem` + `markActive` (`page` for exact, `true` for prefix and context). Both e2e tests compare the derived header and footer with the pre-RFC markup, before any menu exists and again after the menus are deleted.
- **Starter.** `Base.astro` takes `nav` and `footer` as `ActiveNavItem[]`; `NavLink.astro` and `NavMenu.astro` render links and `<details>` disclosures (three levels, the active trail open below the top level, no JavaScript). External links always get `rel="noopener noreferrer"`; `target="_blank"` only with `newTab`. A `footer` menu replaces the RSS link and keeps "Built with Cloudhal". With a `primary` menu the route no longer loads entries for header categories.
- **Cache tags.** Pages rendering a menu add `cloudhal-node-<menuId>` and `cloudhal-term-<id>` for its shown term items. Publish still purges the site tag; whoever plans targeted purges from the snapshot diff should map any `menu` node change to the site tag (every page renders the header).
- **MCP.** `get_menu` on a key without a menu is `not_found` with the next step (the derived default is not returned as data); `list_menus` adds `derived` (well-known keys without a menu) and `limits`. `set_menu` without `rev` on an existing menu is a `conflict` ("send its rev"). Prompts quote labels with `quote()` and mark a title fallback `(title)`; hidden items the write adds or edits get an `!` line. The audit effect lists item ids per change kind (no labels). The publish prompt's own menu summary is `~ menu "primary" (+n −n ↕n ~n)`; menu effects are computed only for menus that are live and still exist, so publishes of sites without menus read nothing extra. `create_page`/`create_entry` results gain an optional `hint`; `delete_page`/`delete_entry` prompts name the hidden items.
- **Left for later.** `retire_term`/`merge_terms` prompts do not name menu items yet (`taxonomy-tools.ts` is being changed in parallel); the publish prompt shows the effect. REST (§5): every menu route must be declared in RFC-0005's `ROUTE_SCOPES` (`packages/api/src/scopes.ts`, default-deny) — reads `site:read`, writes `site:write` (Editor and above, ADR-0019) — and can reuse `menuLookup`/`resolveMenu` for `/resolve`; the error codes are already mapped. Studio (§8), including the menu title in `SnapshotDiffDialog` (rows show the "Menu" badge but no title yet) and `KNOWN_TOOLS`/`tools.*` labels for the five tools in Activity.

## Implementation notes (REST and Studio; rollout step 5)
- **REST** (`packages/api/src/routes/menus.ts`, every route in `ROUTE_SCOPES`): reads are `site:read`, writes `site:write`. Besides §5: `GET /menus` adds `derived` (well-known keys without a menu, with the derived header from published pages and served top-level categories), `limits` and `defaultDepth`; `POST /menus/preview` resolves up to four menus (unsaved `items`, else the stored menu, else the derived default) for a locale and marks the active item for a `path` with the renderer's `activeItem` (Studio's live preview and hidden badges); `GET /menus/references?kind=&id=` names the items that link to a node ("In menus", delete warnings). `PUT` takes `{ rev, items, maxDepth? }` and fills missing item ids; the from-pages dry run always looks at categories so it can report how many it would add. Snapshot labels are `create_menu`, `set_menu` (PUT), `update_menu` (ops) and `delete_menu` `by <actor>`. Tests: `packages/api/src/testing-menus.ts` on SQLite and Miniflare D1, role cases in `testing-roles.ts`.
- **Studio** (DESIGN.md §2q): `routes/NavigationPage.tsx` under Settings, the `MenuTree` and `NavigationPreview` blocks in `@cloudhal/ui`, the grouped target picker, per-locale labels with the fallback as placeholder, depth and size limits, hidden badges with a fix, the §6.3 delta before the one `PUT`, "Create menu from current pages", "In menus" on the page, article and term editors, an "In menu" badge in the pages list, menu warnings in page and article delete dialogs, menu rows in the snapshot diff and Activity labels for the five tools. Writes are gated on the `structure.write` ability from `/api/me` (a local `useStructureWrite`; switch to the shared `useCan` once RFC-0005's Studio work lands).
- **Not yet**: "Add to Header" in the New page dialog (§8), and the retire/merge prompts naming menu items (MCP).
