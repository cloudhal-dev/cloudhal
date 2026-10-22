# RFC-0040: First-class collections

- Status: Accepted (2026-10-22, by Halil; ADR-0042). Open questions decided as recommended.
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-22
- Related:
  - #71 (research and staging: first-class collections, then typed custom fields).
  - RFC-0038 / ADR-0040 (`Site.collections.<key>.permalink`, `set_collection_permalink`, `approverScopes`).
  - RFC-0002 (taxonomies; `Taxonomy.collections` already says which collections a taxonomy applies to), RFC-0007 §4.5 (comment settings per collection, kept outside the graph), RFC-0033 (locales), RFC-0008 (schedules, for stage 3).
  - Prior art (from #71):
    - [WordPress `register_post_type`](https://developer.wordpress.org/reference/functions/register_post_type/) (labels, `menu_icon`, `has_archive`, `supports`, `taxonomies`) and ACF;
    - Webflow CMS and Framer CMS (collections created in the UI; Webflow's MCP server creates collections and items);
    - Wix CMS (512 KB per item);
    - [Payload](https://payloadcms.com/docs/configuration/localization) (`localized: true` per field), Sanity (schema-aware Agent Actions), Strapi (content-type builder; data lost on field rename);
    - [Ghost's open request for custom post types](https://forum.ghost.org/t/allow-configuration-of-custom-post-types/13293), the platform without them.

## Summary

A collection is only a string on an entry today. Studio shows only `posts`, and an agent's `events` entries exist but nobody sees them. This RFC makes collections a registry on the site: `Site.collections.<key>` gains per-locale labels, an icon and a few settings (feed, sitemap, default sort, next to the existing permalink). Studio gets one list screen per collection and a "New collection" flow. MCP gets `list_collections` and `create_collection` behind a person's approval, and agents can no longer start a collection by writing an entry into it.

Existing sites keep working without a data migration: a collection that has entries counts as part of the registry ("inferred") until someone declares it. Stage 2 (typed custom fields) and stage 3 (JSON-LD presets, date-expiry automations, reference fields) are sketched here and get their own RFCs.

## Motivation

- **Who:** anyone with content that is not a blog post: events, team, portfolio, jobs, products, docs, changelogs, testimonials, FAQs, locations (#71). Agents already make these collections; people cannot see or manage them.
- **Today:**
  - `ArticlesPage`, `SiteShell`, `SiteOverviewPage`, `CommentsPage`, `useSitePalette` and `LanguageSettings` hard-code `posts`.
  - `create_entry` accepts any collection slug (default `posts`), so a typo or a guess starts a new collection silently.
  - Per-collection settings are scattered:
    - the permalink lives on `Site.collections` (RFC-0038);
    - taxonomies on `Taxonomy.collections` (RFC-0002);
    - comments in the `comment_settings` row (RFC-0007, outside the graph on purpose);
    - feed, sitemap and sort have no per-collection setting. The site feed and the sitemap take every collection.
- **RFC-0038's gap:** the overlap checks run when a permalink changes and when a page or taxonomy moves. Nothing checks the first entry of a new collection. With `posts` at `/blog/{slug}`, the first entry in a new `blog` collection takes the default `/blog/{slug}`: two collections then answer the same URLs, and `entryAt` picks one silently.
- **Why now:** permalinks gave `Site.collections` a home, and stage 2 (fields) needs a registry to hang definitions on. Every competitor in #71 except Ghost has typed collections.

## Proposal (stage 1)

### 1. Contract (`site.schema.json`)

`Site.collections` keeps its shape: a map keyed by collection slug. Each value gains optional fields; nothing is renamed.

```jsonc
// Site.properties.collections (changed: description, maxProperties)
"collections": {
  "type": "object",
  "description": "RFC-0038, RFC-0040: the site's declared collections and their settings, keyed by collection (ContentEntry.collection). A key here declares the collection, even with no settings ({}).",
  "propertyNames": { "$ref": "common.schema.json#/$defs/Slug" },
  "maxProperties": 50,
  "additionalProperties": { "$ref": "#/$defs/CollectionSettings" }
}

// $defs.CollectionSettings (new optional properties; permalink unchanged)
"CollectionSettings": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "permalink": { /* RFC-0038, unchanged */ },
    "labels": {
      "type": "object",
      "description": "Display names per locale (Studio, agents, themes). Absent or missing a locale: the default locale's, then the key.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": { "$ref": "#/$defs/CollectionLabel" }
    },
    "icon": {
      "type": "string",
      "description": "A name from Studio's closed icon set (e.g. calendar, briefcase, users). Unknown names show the default icon. Never a URL or markup.",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "maxLength": 40
    },
    "feed": {
      "type": "boolean",
      "description": "Entries appear in the site's RSS feeds. Absent: true."
    },
    "sitemap": {
      "type": "boolean",
      "description": "Published entries appear in sitemap.xml. Absent: true."
    },
    "sort": {
      "type": "string",
      "description": "Default order where no order is given: Studio's list, entry queries without sort, MCP list_entries. Absent: newest.",
      "enum": ["newest", "oldest", "title"]
    }
  }
},

// $defs.CollectionLabel (new; the same shape as taxonomy.schema.json's TaxonomyLabel, which cannot be $ref'd across files under rule 2)
"CollectionLabel": {
  "type": "object",
  "additionalProperties": false,
  "required": ["singular", "plural"],
  "properties": {
    "singular": { "type": "string", "minLength": 1, "maxLength": 100 },
    "plural": { "type": "string", "minLength": 1, "maxLength": 100 },
    "description": { "type": "string", "maxLength": 1000 }
  }
}
```

- No `schemaVersion` bump. All new fields are optional, and every absent value means today's behaviour.
- `sort` uses the same enum as `contentList.sort`.
- **Taxonomies and comments are not duplicated here.**
  - `Taxonomy.collections` stays the source of truth for which taxonomies apply. The collection screen edits it there.
  - Comment settings stay in `comment_settings.collections`. They are outside the graph so that a rollback never reopens comments (RFC-0007 §4.5).
  - Two copies of either would drift. The collection screen shows all three settings in one place, and each save goes to its own store.
- Checked: with this diff applied, `pnpm gen` succeeds for TypeScript and Rust (cargo-typify 0.8.0 emits `CollectionLabel` and the new optional fields).
- Fixtures:
  - `valid/site/`: a declared `{}`; full labels with icon, feed, sitemap and sort.
  - `invalid/site/`: a label without `plural`; `icon: "https://…"`; `sort: "random"`; 51 collections.

### 2. The registry: declared and inferred

```ts
// @cloudhal/core-ts/collections (new subpath, Worker-safe)
export interface CollectionInfo {
  key: string;
  /** Has a key in Site.collections. False: inferred from existing entries (or the built-in `posts`). */
  declared: boolean;
  settings: CollectionSettings;           // {} when inferred
  /** Entries per status, every locale. */
  counts: Partial<Record<ContentEntry["status"], number>>;
}
/** The labels for `locale`: that locale, then the default locale, then { singular: key, plural: key }. */
export function collectionLabel(site: Site, key: string, locale: string): CollectionLabel;
/** feed / sitemap / sort with the defaults filled in. Pure; usable by themes. */
export function collectionSettings(site: Site, key: string): Required<Pick<CollectionSettings, "feed" | "sitemap" | "sort">> & CollectionSettings;
```

`SiteGraphStore.listCollections(siteId)` returns the union, declared first and in key order:
- the declared keys;
- every collection with at least one entry (one grouped query over content-entry nodes);
- `posts`, which every starter and the default of `create_entry` assume.

It replaces the two ad-hoc `SELECT DISTINCT json_extract(body,'$.collection')` queries (`store/site-permalinks.ts`, `taxonomy.ts`) and Studio's client-side `collectionKeys`.

**Decision: inferred, not migrated.** No migration rewrites site nodes. A rewrite would have to go through the site CAS for every site, bump `rev`, change the content hash (and so make every site look modified against its published snapshot), and handle bundles imported later from older versions.

Instead:
1. A collection with entries is in the registry from the first read. Studio shows it with its key as its name and a "Name this collection" prompt.
2. It becomes declared when a person saves any of its settings in Studio, or when `create_collection` declares it.
3. `set_collection_permalink` and Studio's permalink section stop deleting the key when the last setting is removed: resetting a permalink no longer undeclares a collection. This is the only behaviour change to an existing write.
4. Snapshots, `push`/`pull` and archive import (RFC-0039) carry `Site.collections` with the site node, as they already do.

### 3. Store invariants

1. **Keys are immutable.** A declared key is never renamed through `updateSite`: renaming is changing every entry's natural key, and it waits for stage 2's explicit migration operations.
2. **Undeclaring requires no entries.** `updateSite` refuses to drop a key that still has entries (`collection_in_use`). It also refuses when a taxonomy names it only through `Taxonomy.collections`, so a taxonomy is never left pointing at nothing (the person removes it from the taxonomy first).
3. **New collection prefixes are checked (closes RFC-0038's gap).** Creating an entry in a collection with no entries and no configured permalink claims the default prefix `/<collection>`. The entry write is refused with `path_conflict` when that prefix overlaps:
   - another collection's configured permalink prefix;
   - a taxonomy archive's `basePath`;
   - a reserved path (`/search`, media URLs, a site locale prefix such as `/tr`).

   Pages under a default prefix still win, as RFC-0038 decided.
   - The check uses `pathsOverlap`/`checkReservedPath`.
   - Its race guard is the existing `configuredPrefixFree` SQL guard plus an archive guard, joined to the entry's batch (rule 4: no transactions).
   - A guard miss at the same rev re-runs the check for the message.
   - The same check runs when a collection is declared (`create_collection`, Studio) with its permalink or its default prefix.
4. **Store writes do not require a declaration.** `push`, archive import, `seedStarterSite` and old scripts write entries into collections the bundle never declared, and must keep working. Declaration is enforced where a decision is made: the API's create route and the MCP policy (§5).

### 4. Studio

- **Sidebar:** a "Content" group lists `listCollections` in order:
  - each item shows its plural label (in Studio's language, then the site's default locale, then the key) and its icon (default `files`);
  - "New collection" is the last row.

  `posts` keeps the "Articles" wording only while it is inferred and unnamed.
- **Routes:**
  - `/collections/$collection` and `/collections/$collection/$entryId`;
  - `/articles` and `/articles/$entryId` redirect to `posts`, so bookmarks keep working;
  - screens get the collection from the route, never a constant.
- **List screen:** `ArticlesPage` becomes `CollectionPage`, with the same table, filters, bulk actions and primary-term column.
  - The term column shows only taxonomies whose `collections` include this one.
  - The order is the collection's `sort`.
  - The editor (`ArticleEditorPage` → `EntryEditorPage`) takes the collection from the route. Its "New" button creates in that collection.
- **Collection settings** (a tab on the list screen, `SectionCard`s):
  - labels per site locale, with icon and description;
  - URL: the permalink section moves here, and Site settings › Collections keeps a table linking to each collection;
  - taxonomies: a checkbox per taxonomy, saved to `Taxonomy.collections`;
  - comments: on/off and close-after, saved to `comment_settings`;
  - feed, sitemap and default sort.
- **New collection** (a dialog):
  - plural and singular label in the default locale;
  - the key, derived from the plural label and editable until saved, with a note that it never changes;
  - an icon from the closed set;
  - the URL prefix, with a live preview and the §3 overlap check through the API's dry run.
- **Other hard-coded `posts`:**
  - Overview and the command palette (`useSitePalette`) list across collections;
  - the comments filter (`CommentsPage`, `lib/comment-settings.ts` `DEFAULT_COLLECTION`), `LanguageSettings`' reviewable kinds (`localization.review.required`), `page-editor/sections.ts` and `lib/taxonomy-settings.ts` read the registry.
- **Bundle:** the collection screen reuses the Articles chunk, which is already lazy. The sidebar change is a query and a list. The new-collection dialog and settings tab are lazy. The target is under +1.5 kB gzip on the initial bundle (budget 420 kB, today about 416.6 kB). If it does not fit, the sidebar query moves into the shell's existing site query.
- **i18n:** new keys go in `en.ts` (a `collections` lazy namespace for the settings and dialog). Other locales get drafts through the `translate` skill. Labels come from the site, so they are content, not UI strings.

### 5. API and MCP

- **API:**
  - `GET /sites/:id/collections` returns `CollectionInfo[]`.
  - `PUT /sites/:id/collections/:key` declares or updates a collection, with `?dryRun=1` for the plan. It needs `site:settings`, like Site settings. It is a site update, so it runs the CAS and §3.
  - `POST` entry creation in a collection that is not in the registry fails with `collection_undeclared` (422). Studio only creates entries in listed collections.
- **`list_collections`** (`content:read`, read-only): key, declared, labels, icon, the effective permalink, settings with defaults, entry counts, the taxonomies that apply, and whether comments are on. Agents call it before writing entries. Its description in `server-instructions.ts` says so.
- **`create_collection`** (`site:write`, `requiresApproval`, `approverScopes: ["site:settings"]`, `classify: dryRun ? "read" : "person"`, `dryRun`): `{ siteId, key, labels, icon?, permalink?, feed?, sitemap?, sort? }`.
  - `labels` must include the site's default locale.
  - It refuses an existing declared key (`collection_exists`) and runs §3's overlap check in `precheck`, so a conflicting call never reaches a person.
  - The approval text names the key, labels and URL prefix, and says that the key cannot be renamed later.
  - It declares an inferred collection too, which is how an agent names one it already filled.
- **`update_collection`** (same policy as `create_collection`): labels, icon, feed, sitemap, sort. The permalink stays with `set_collection_permalink`, whose redirect preview it needs. Taxonomies and comments keep their own tools.
- **Policy: entries only in registered collections.** `create_entry` refuses a collection missing from `listCollections`, and so does every tool that creates a new entry (not translations of an existing one). The refusal names the existing collections and says to call `create_collection` first. The `posts` default stays.
  - Existing sites keep working, because every collection with entries is inferred. The refusal only stops new collections that nobody approved.
  - `bypass` mode does not skip it: it is a precheck, not an approval.
- The MCP tool reference in `packages/mcp-server/README.md` is regenerated (`node scripts/mcp-tools-doc.ts`).

### 6. Renderer and themes

- `sitemapUrls` leaves out entries of collections with `sitemap: false`. The site feed helpers (`localeFeedXml`, the starter's `rss.xml.ts`) leave out `feed: false`. The defaults are true, so a site without settings renders byte-identical.
- New exports only: `collectionLabel` and `collectionSettings` from `@cloudhal/core-ts/collections`, re-exported from the renderer. No existing export changes meaning ("Theme-facing API stability"), and the frozen v0.3.10 theme test (`old-theme-compat.test.ts`) must stay green.
- A per-collection feed at `<prefix>/rss.xml` and a collection index page are left for later (they need starter routes, which old themes lack).

### 7. Rollout (one PR each, as in RFC-0038)

1. Contract, fixtures and `pnpm gen`; `@cloudhal/core-ts/collections` and `listCollections`. No behaviour change.
2. Store §3 invariants (the new-collection overlap check, `collection_in_use`, keep-the-key on permalink reset); API routes; renderer `feed`/`sitemap`.
3. Studio: sidebar, `CollectionPage`, settings tab, New collection, the remaining `posts` constants; screenshots; translations.
4. MCP: `list_collections`, `create_collection`, `update_collection`, the `create_entry` refusal, regenerated tool docs; starter README.

Step 4's refusal ships after step 3, so people can already create collections when agents are first refused.

## Stage 2 (sketch, own RFC): typed custom fields

- **Definitions:** `CollectionSettings.fields`, an ordered list of `{ key, type, labels, localized, requiredToPublish?, options? }`.
  - Types (about 8): `text`, `richText`, `number`, `boolean`, `date`, `datetime`, `url`, `image` (an asset id), `select` (closed options).
  - All fields are optional in the contract. `requiredToPublish` is checked at review and publish, like `Taxonomy.required`.
- **Values:** in the existing `ContentEntry.fields` object ("collection-specific values; any JSON"), so there is no entry contract change and no new table. A size cap per entry (Wix uses 512 KB) is checked in the store.
- **Validation:** the precompiled validators check the definitions (they are part of `site.schema.json`). Values are checked by a small hand-written checker per closed field type, because Workers forbid compiling a JSON Schema at runtime (rule 6). The checker's output doubles as the JSON Schema shown to agents.
- **Studio:** forms are generated from the definitions, one Kumo control per type. A fields builder lives in the collection's settings tab.
- **MCP:** `list_collections` returns each collection's field schema. `create_entry`/`update_entry` validate `fields` in `precheck`, so the person approving sees typed values and invalid output never reaches them.
- **Localization, decided up front:** entries are already one per locale, linked by `translation`.
  - A `localized: true` field is stored on each locale's entry.
  - A `localized: false` field is stored only on the source entry, and translations read it from there (Payload's model).
  - Changing `localized` later is a migration operation.
- **Changes to definitions:**
  - Adding a field is free.
  - Renaming, changing a type, or removing a field with values are explicit operations (`rename_field`, `change_field_type`, `remove_field`). They get a snapshot, a preview, and approval. They are never inferred from a diff of the definitions, which is how Strapi's builder loses data.
- **Open for stage 2:** whether definitions grow the site node too much, and should move to a `Collection` node kind. The key and the settings shape would stay.

## Stage 3 and later (sketch)

- **JSON-LD presets:** a collection can map its fields to `Event`, `JobPosting`, `FAQPage`, `Product` or `Recipe`. The renderer emits the JSON-LD.
- **Date-expiry automations:** hide an event after `endDate`, close a job at `validThrough`, as RFC-0008 schedules.
- **Listings filtered and sorted by a field**, with an index only on those fields.
- **A generic field renderer and named slots** for themes that do not know a collection's fields.
- **Reference fields**, then repeaters and blocks.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| A one-time migration declaring every collection with entries (a `cloudhal migrate` step like `tags-migration.ts`: resumable, snapshotted) | The registry is all explicit at once | Rewrites every site node: rev and hash change, every site looks modified against its published snapshot, old bundles imported later are undeclared again anyway | Inferred collections give the same view with no writes; the migration can still be offered as an explicit "declare all" (open question 8) |
| Declare on first use (the store adds the key when the first entry arrives) | No separate step | An entry write also writes the site node, which needs a composite CAS and bumps the site's rev under people editing settings; agents could still create collections without approval | The registry exists so that a person decides on new collections |
| Store refuses every undeclared collection | One rule everywhere | Breaks `push`, archive import, the seed and old scripts | Enforce where decisions are made (API, MCP); the store checks paths |
| A `Collection` node kind now | Room for field definitions; own rev | New node kind, tables, sync, snapshot and MCP plumbing for a handful of settings | `Site.collections` already exists and snapshots with the site; revisit in stage 2 |
| Copy taxonomy and comment settings onto the collection | One object to read | Two sources of truth; comments would start rolling back with content (RFC-0007 forbids it) | The collection screen gathers them; each stays where it is stored |
| Collections in theme config (`cloudhal.json`) | No contract change | Not in snapshots; agents and Studio cannot change them; they differ per theme | Collections are content, like permalinks |
| Free-form icon (URL or SVG) | Any icon | Markup injection in Studio, remote fetches | A closed name set; unknown names fall back |

## Compatibility & migration

- **Contract:** optional fields, so old sites, snapshots and bundles stay valid. The new `maxProperties: 50` is far above any known site.
- **Rust mirror:** generated by `pnpm gen`.
- **Data:** no migration (§2).
- **Behaviour changes:**
  - entries that would overlap another collection's URLs are refused (they were silently shadowed before);
  - agents and the create-entry API can no longer start an unregistered collection;
  - resetting a permalink keeps the declaration.
- **Themes:** additive exports only. Default feed and sitemap output is unchanged, and the old-theme test stays in CI.
- **Studio:** `/articles` links redirect.
- **Rollback:** a snapshot restores the site node with its `collections`. Entries are untouched by declarations, so going back to a version without this RFC shows the same `posts`-only Studio as before, with no data lost.

## Security & policy impact

- **No new scopes.**
  - Declaring and updating collections is a site settings change: `site:settings` in Studio and the API, `site:write` for the agent, plus a person holding `site:settings` to approve (`approverScopes`, as for permalinks).
  - Listing needs `content:read`.
- **New refusal points:**
  - `collection_undeclared` in MCP `precheck` and the API, so an agent cannot widen the site's structure through `create_entry`;
  - `path_conflict` for a new collection's prefix, so an agent cannot take over another collection's or an archive's URLs by inventing a collection.
- **Content risk:**
  - labels are plain text, escaped everywhere they are shown;
  - icons are names from a closed set, never URLs or markup;
  - keys are slugs, and reserved paths are refused;
  - 50 collections per site at most.
- **Tenant isolation:** unchanged; everything is per site.

## Open questions (recommended defaults)

1. **Inferred vs migrated registry:** inferred (§2). *Recommended.*
2. **`posts` is always in the registry**, even on an empty site, so the starter and `create_entry`'s default keep working. *Recommended.*
3. **`update_collection` in stage 1:** yes, for labels, icon, feed, sitemap and sort. Without it, an agent that names a collection cannot fix a typo. *Recommended.*
4. **Deleting a collection:** stage 1 allows undeclaring only an empty collection. Deleting a collection with its entries is a later, separately approved operation. *Recommended.*
5. **Limit:** 50 collections per site (Taxonomy.collections also allows 50; comments allow 100). *Recommended.*
6. **Where the permalink is edited:** in the collection's settings tab, with Site settings › Collections reduced to a table of links. *Recommended*; the alternative is to keep it in both places.
7. **Per-collection feed URL** (`<prefix>/rss.xml`): later, with the collection index page (RFC-0038 "Later"). *Recommended.*
8. **An explicit "declare all" step** (a `cloudhal migrate` operation like `migrateTagsToTerms`, and a Studio button): not in stage 1. It is cosmetic while inferred collections behave the same. *Recommended*; add it if inferred rows confuse people.
9. **Menus:** `CollectionMenuItem.labels` stays required (old menus and themes rely on it). Studio pre-fills it from the collection's plural labels. *Recommended.*
