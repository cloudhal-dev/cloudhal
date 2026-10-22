# RFC-0038: Collection permalinks

- Status: Accepted (2026-10-22, by Halil; ADR-0040). Open questions decided as recommended. Revised before acceptance after a comparison with WordPress, Ghost, Hugo, Webflow, Eleventy and the headless CMSs (see Prior art).
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-21
- Related:
  - #50 (found while building cloudhal.com: the blog at `/blog` while the starter's collection is `posts`).
  - RFC-0002 §7 (route order), RFC-0003 (menus, `collectionIndex`), RFC-0033 §4 (locale prefixes).
  - Precedent: `Taxonomy.archive.basePath`, whose change emits prefix redirects through `RedirectPlan` (`packages/core-ts/src/taxonomy.ts`).
  - Prior art:
    - [Ghost routes](https://docs.ghost.org/themes/routing/) (`permalink: /blog/{slug}/`);
    - [Hugo permalinks](https://gohugo.io/configuration/permalinks/) (per section and per language);
    - [WordPress](https://developer.wordpress.org/reference/functions/register_post_type/) (`rewrite.slug`, [old-slug redirects](https://developer.wordpress.org/reference/functions/wp_old_slug_redirect/));
    - [Eleventy](https://www.11ty.dev/docs/permalinks/) (fails on duplicate URLs);
    - [Sanity's resolver](https://www.sanity.io/docs/visual-editing/presentation-resolver-api) (path → document).

## Summary

A content entry's URL is `/<collection>/<slug>`, so moving where a collection lives means renaming it, which changes the key every template, filter and agent uses. This RFC adds an optional permalink template per collection (`Site.collections.<key>.permalink`, default `/<collection>/{slug}`), computes entry paths in one place both ways (entry → path, path → entry), and redirects old URLs when the template changes. Version 1 accepts only a fixed prefix followed by `{slug}`. The field and its closed token set are designed so date tokens and per-locale templates can follow without renaming anything.

## Motivation

- **Who:** anyone whose URLs are not the collection's internal name: `/blog` for `posts`, `/news` for `articles`, `/docs/guides` for `guides`. Moving a site from WordPress or Ghost usually means keeping its URLs.
- **Today:** cloudhal.com renamed its `posts` collection to `blog`. That worked thanks to the store's automatic 301s, but it changed the key that themes, filters (`collection:posts`), skills and agents' prompts refer to. `collectionIndex` only changes menu links, not where entries live.
- **Code:** the path is built inline in about 15 places (`routing.ts` `entryPath`, `navigation.ts`, `ContentList.astro`, `locales.ts`, `preview.ts`, `surfaces/tree.ts`, `search-rows.ts`, `site-search.ts`, `automations.ts`, `store/entries.ts`, `api` assets and menus, `cli` analytics, `mcp-server` schedules). Any change to URLs means changing all of them, and they can drift.
- **What others learned:**
  - Every server-rendering platform ends up offering a template with tokens, not just a prefix. WordPress, Ghost and Hugo all do.
  - None of them reliably redirects when the template itself changes. Per-item old-URL tracking (WordPress old slugs, Hugo aliases) works better than hand-written rules (Ghost `redirects.yaml`, Webflow).
  - Date tokens change URLs when an editable date changes.

  Naming the field after a prefix (`basePath`) would force a rename the day tokens arrive.

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
    "permalink": {
      "type": "string",
      "description": "Where the collection's entries live, as a template. Version 1: one or more fixed lower-case path segments followed by /{slug}, e.g. /blog/{slug}. Default: /<collection>/{slug}.",
      "pattern": "^(/[a-z0-9]+(?:-[a-z0-9]+)*)+/\\{slug\\}$"
    }
  }
}
```

Optional, no `schemaVersion` bump. Absent means `/<collection>/{slug}`, so every existing site keeps its URLs.

**The token set is closed.** Version 1 has only `{slug}`. Later versions widen the schema pattern; there is no expression language, so an agent cannot write a template the store cannot check.

### 2. One function each way (`@cloudhal/core-ts`)

```ts
/** `/blog/hello-world`: the collection's permalink with the entry's values filled in. */
export function entryPath(
  site: Pick<Site, "collections">,
  entry: Pick<ContentEntry, "collection" | "slug">,
): string;

/** The collection and slug a path matches, or undefined. The longest fixed prefix wins. */
export function entryAt(
  site: Pick<Site, "collections">,
  path: string,
): { collection: string; slug: string } | undefined;
```

- All the inline copies listed above call `entryPath`. The renderer's `resolvePath`, the overlap checks and the redirect planner use `entryAt`.
- Locale prefixes (RFC-0033 §4) still wrap the result, as they do today.

### 3. Changing a permalink

`updateSite` compares each collection's old and new template. When one changes, it adds a redirect to the same batch, as `updateTaxonomy` does for `archive.basePath`. While templates are a fixed prefix plus `{slug}`, one `RedirectPlan.move(oldPrefix, newPrefix, { match: "prefix", reason: "slug-change" })` covers every entry in the collection.

When tokens other than `{slug}` arrive, a prefix no longer describes the change. The store then compares `entryPath` before and after for each published entry of the collection and writes one redirect per entry, the model of WordPress old slugs and Hugo aliases. The MCP tool's preview shows that list before anything is written.

### 4. Invariants

1. A template never overlaps another collection's template, a taxonomy archive's `basePath`, a page path, or a reserved path (`checkReservedPath`, `pathsOverlap`, and `entryAt` for the reverse check). A conflicting `updateSite` fails with `path_conflict`, the way Eleventy refuses duplicate URLs.
2. The default is `/<collection>/{slug}`: a site without `collections` renders exactly as before.
3. The collection key is never derived from the URL. Filters, templates, MCP tools and `ContentEntry.collection` keep using the key.
4. Changing a template never breaks a published URL: the old URL answers with a 301 to the new one.
5. Snapshots carry the setting (it is part of the site node), so a rollback restores the old template. Its redirect stays, since redirects are not removed on rollback.
6. The token set is closed and every template is checked when it is written, never when a page is rendered.

### 5. Surfaces

- **Studio:** Site settings gets a "Collections" section next to General, Domains and Previews: one row per collection with its URL (an `Input` showing the fixed part before `/{slug}`, with a preview of a real entry's address). Saving goes through the existing site update.
- **MCP:** `get_site` returns the setting. No tool changes site settings today, so this adds `set_collection_permalink` (`site:write`). It moves public URLs, so it goes through approval like a publish, and its preview lists the old and new address of a few entries.
- **Starter:** the `collectionIndex` hook defaults to the template's fixed prefix, so a menu item for a collection links there without theme code.

## Later (decided, not in v1)

- **Date tokens** (`{year}`, `{month}`, `{day}`): taken from a stored first-publication date that never changes, not from an editable date, to avoid the date-change trap. Redirects per entry (§3).
- **Per-locale templates:** a map, `permalink: { en: "/blog/{slug}", tr: "/yazilar/{slug}" }`, as Hugo allows per language.
- **Entries at the root** (`/{slug}`): allowed only once the collision check of invariant 1 also runs when a page is created or moved.
- **The collection index page:** an explicit `indexPath` setting (Hugo's section page, WordPress `has_archive`), not implied by the template.
- **`{category}`:** only once an entry can name one primary term (Ghost's `primary_tag`). Without it, a post in two categories has two candidate URLs.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Rename the collection (today) | No new field | Changes the key that filters, skills and agents use; rewrites every entry | The key is an identity, not a URL |
| A fixed `basePath` field (the first draft) | Simplest | Must be renamed or doubled when tokens arrive | `permalink` with v1 limited to `/<prefix>/{slug}` costs the same now |
| A free-form template language | Full freedom | Unchecked routes, collisions found only at render time, agents can write anything | A closed token set gives the useful templates and stays checkable |
| A `Collection` node kind | Room for labels, schemas, per-collection feeds | New node kind, store tables, sync, snapshots, MCP tools | Too big for one setting; `Site.collections` can move into a node later if collections grow |
| Templates in theme config (`cloudhal.json` / `theme.ts`) | No contract change | Not in snapshots or the graph; agents and Studio cannot change them; the API's paths would disagree with the renderer's | URLs are content, not theme |
| Hand-written redirect files (Ghost, Webflow) | Explicit | Forgotten when URLs move; drift | Redirects are derived from the change itself |

## Compatibility & migration

- Optional field: old sites, old snapshots and old bundles are valid and render the same.
- Rust mirror: generated from the schema (`pnpm gen`). Fixtures go under `fixtures/{valid,invalid}/site/`: a valid `/blog/{slug}`, and invalid templates with a trailing slash, an unknown token, or no `{slug}`.
- Rollout, one PR each:
  1. The contract plus `entryPath`/`entryAt`, with every caller moved and no behaviour change.
  2. `updateSite` redirects and overlap checks.
  3. Studio, the MCP tool and descriptions.
  4. The starter README.
- Rollback: removing the setting returns to `/<collection>/{slug}`; the redirect from step 2 keeps old links working.

## Security & policy impact

No new scopes: changing a template is a site update (`site:write`). In Studio a person makes it; through MCP the new tool waits for a person's approval, because it moves public URLs. Redirects are same-site paths only (`RedirectPlan`), never external URLs.

## Open questions (decided as recommended)

1. **Per-locale templates:** not in v1; one template for all locales, with locale prefixes as today. They come later as a map (see Later).
2. **`/` as a base:** not in v1; allowed later once page writes also run the collision check.
3. **The collection index page:** not part of this RFC; it stays a page the site owner creates, and `collectionIndex` links to it. An explicit `indexPath` comes later.
