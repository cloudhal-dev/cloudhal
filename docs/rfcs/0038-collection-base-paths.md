# RFC-0038: Collection base paths

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-21
- Related:
  - #50 (found while building cloudhal.com: the blog at `/blog` while the starter's collection is `posts`).
  - RFC-0002 §7 (route order), RFC-0003 (menus, `collectionIndex`), RFC-0033 §4 (locale prefixes).
  - Precedent: `Taxonomy.archive.basePath`, whose change emits prefix redirects through `RedirectPlan` (`packages/core-ts/src/taxonomy.ts`).

## Summary

A content entry's URL is `/<collection>/<slug>`, so changing where a collection lives means renaming it, which rewrites every entry. This RFC adds an optional base path per collection in the site (`Site.collections.<key>.basePath`, default `/<key>`), computes entry paths in one place, and redirects the old prefix when the base path changes, as taxonomy archives already do. The collection key stays the stable name that templates, filters and agents use.

## Motivation

- **Who:** anyone whose URLs are not the collection's internal name: `/blog` for `posts`, `/news` for `articles`, `/docs/guides` for `guides`, a localized `/haberler` on a Turkish site. Moving a site from WordPress or Ghost usually means keeping existing URLs.
- **Today:** cloudhal.com renamed its `posts` collection to `blog`. That worked thanks to the store's automatic 301s, but it changed the key that themes, filters (`collection:posts`), skills and agents' prompts refer to. `collectionIndex` only changes menu links, not where entries live.
- **Code:** the path is built inline in about 15 places (`routing.ts` `entryPath`, `navigation.ts`, `ContentList.astro`, `locales.ts`, `preview.ts`, `surfaces/tree.ts`, `search-rows.ts`, `site-search.ts`, `automations.ts`, `store/entries.ts`, `api` assets and menus, `cli` analytics, `mcp-server` schedules). Any change to URLs today means changing all of them, and they can drift.
- **Why now:** the first real site needed it, and the starter's README has nothing to say.

## Proposal

### 1. Contract (`site.schema.json`)

```jsonc
// Site.properties
"collections": {
  "type": "object",
  "description": "Per-collection settings, keyed by collection (ContentEntry.collection). A collection without an entry here uses the defaults.",
  "propertyNames": { "$ref": "common.schema.json#/$defs/Slug" },
  "additionalProperties": { "$ref": "#/$defs/CollectionSettings" }
}

// $defs
"CollectionSettings": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "basePath": {
      "type": "string",
      "description": "Where the collection's entries live: <basePath>/<slug>. Leading slash, no trailing slash, one or more path segments. Default: /<collection>.",
      "pattern": "^(/[a-z0-9]+(?:-[a-z0-9]+)*)+$"
    }
  }
}
```

Optional, no `schemaVersion` bump. Absent means `/<collection>`, so every existing site keeps its URLs.

### 2. One function for entry paths (`@cloudhal/core-ts`)

```ts
/** `/blog/hello-world`: the collection's base path (default `/<collection>`) and the slug. */
export function entryPath(
  site: Pick<Site, "collections">,
  entry: Pick<ContentEntry, "collection" | "slug">,
): string;

/** The collection a path's prefix belongs to, and the rest, or undefined. Longest base wins. */
export function collectionAt(
  site: Pick<Site, "collections">,
  path: string,
): { collection: string; slug: string } | undefined;
```

All the inline copies listed above call `entryPath`; the renderer's `resolvePath` uses `collectionAt`. Locale prefixes (RFC-0033 §4) still wrap the result, as they do today.

### 3. Changing a base path

`updateSite` compares each collection's old and new base path. When one changes, it adds a `RedirectPlan.move(old, new, { match: "prefix", reason: "slug-change" })` to the same batch, as `updateTaxonomy` does for `archive.basePath`. One redirect row covers the whole collection, not one row per entry.

### 4. Invariants

1. A base path never overlaps another collection's base path, a taxonomy archive's `basePath`, a page path, or a reserved path (`checkReservedPath`, `pathsOverlap`); a conflicting `updateSite` fails with `path_conflict`.
2. The default is `/<collection>`: a site without `collections` renders exactly as before.
3. The collection key is never derived from the URL; filters, templates, MCP tools and `ContentEntry.collection` keep using the key.
4. Changing a base path never breaks a published URL: the old prefix answers with a 301 to the new one.
5. Snapshots carry the setting (it is part of the site node), so a rollback restores the old base path. Its redirect stays, since redirects are not removed on rollback.

### 5. Surfaces

- **Studio:** Site settings gets a "Collections" section next to General, Domains and Previews: one row per collection with its base path (an `Input` with the URL preview). Saving goes through the existing site update.
- **MCP:** `get_site` returns the setting. No tool changes site settings today, so this adds `set_collection_path` (`site:write`). It moves public URLs, so it goes through approval like a publish.
- **Starter:** the `collectionIndex` hook defaults to `entryPath`'s prefix, so a menu item for a collection links to its base path without theme code.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Rename the collection (today) | No new field | Changes the key that filters, skills and agents use; rewrites every entry | The key is an identity, not a URL |
| A `Collection` node kind | Room for labels, schemas, per-collection feeds | New node kind, store tables, sync, snapshots, MCP tools | Too big for one setting; `Site.collections` can move into a node later if collections grow |
| Base path in theme config (`cloudhal.json` / `theme.ts`) | No contract change | Not in snapshots or the graph; agents and Studio cannot change it; the API's paths would disagree with the renderer's | URLs are content, not theme |
| Per-entry `path` override | Full freedom | Thousands of paths to keep consistent; no single redirect on change | Solves a different problem; can come later on top |

## Compatibility & migration

- Optional field: old sites, old snapshots and old bundles are valid and render the same.
- Rust mirror: generated from the schema (`pnpm gen`); fixtures added under `fixtures/{valid,invalid}/site/` (overlapping pattern, trailing slash).
- Rollout: (a) contract and `entryPath`/`collectionAt` with every caller moved, with no behaviour change; (b) `updateSite` redirects and overlap checks; (c) Studio and MCP descriptions; (d) starter README. Each step is one PR.
- Rollback: removing the setting returns to `/<collection>`; the redirect from (b) keeps old links working.

## Security & policy impact

No new scopes: changing a base path is a site update (`site:write`). In Studio a person makes it; through MCP the new tool waits for a person's approval, because it moves public URLs. Redirects are same-site paths only (`RedirectPlan`), never external URLs.

## Open questions

1. Should a collection's base path be per locale (`/blog` in English, `/yazilar` in Turkish), like term slugs? **[default: not in v1; one base path for all locales, locale prefixes as today]**
2. Allow `/` as a base path (entries at the root, like pages)? **[default: no; entries and pages would compete for the same paths]**
3. Should the collection index page (`/blog` itself) be part of this RFC? **[default: no; it stays a page the site owner creates, and `collectionIndex` links to it]**
