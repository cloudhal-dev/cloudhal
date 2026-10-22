# ADR-0042: First-class collections: an inferred registry on `Site.collections`, created by people or approved agents
- Status: Accepted
- Date: 2026-10-22 (decided by Halil)
- Related: RFC-0040, RFC-0038 / ADR-0040, RFC-0002, RFC-0007, #71
- Sources: [WordPress `register_post_type`](https://developer.wordpress.org/reference/functions/register_post_type/) · [Payload localization](https://payloadcms.com/docs/configuration/localization) · [Ghost: custom post types request](https://forum.ghost.org/t/allow-configuration-of-custom-post-types/13293) · Webflow, Framer, Wix, Sanity and Strapi research in #71

## Context
A collection was only a string on an entry. Studio showed only `posts`, and agents could start any collection through `create_entry`.

Per-collection settings were scattered:
- the permalink on `Site.collections`;
- taxonomies on `Taxonomy.collections`;
- comments in `comment_settings`.

The first entry of a new collection could also take another collection's URLs, because no overlap check ran on it.

## Decision
1. **`Site.collections` is the registry.** Each `CollectionSettings` gains optional fields:
   - `labels`: per locale, singular and plural;
   - `icon`: a name from a closed set;
   - `feed` and `sitemap`: absent means true;
   - `sort`: absent means newest.

   A site has at most 50 collections, and there is no `schemaVersion` bump.
2. **Inferred, not migrated.** `listCollections` returns the declared keys, every collection with entries, and `posts`. A collection becomes declared when a person saves its settings or when `create_collection` runs. No site node is rewritten.
3. **No copies.** Taxonomies stay on `Taxonomy.collections` and comments in `comment_settings`. The collection screen edits each one where it is stored.
4. **Store invariants:**
   - keys are immutable;
   - a key with entries cannot be undeclared;
   - resetting a permalink keeps the declaration;
   - the first entry of a new collection gets its default prefix checked for overlaps (`path_conflict`).

   The store does not require a declaration, so push, import and seed keep working.
5. **Decisions are enforced where they are made:**
   - The API's create-entry route refuses a collection outside the registry (`collection_undeclared`).
   - MCP `create_entry` refuses one too, in its precheck and in every mode.
   - `create_collection` and `update_collection` need `site:write` and wait for a person. That person must hold `site:settings` (`approverScopes`).
   - `list_collections` needs `content:read`.
6. **Themes:** additive exports only (`collectionLabel`, `collectionSettings`). With default settings, feed and sitemap output is unchanged.
7. **Later, already decided:**
   - Typed custom fields (stage 2): values go in `ContentEntry.fields` and are checked by an eval-free checker. Localization is chosen per field up front. Renames, type changes and removals are explicit migration operations.
   - After that: JSON-LD presets, expiry automations and reference fields.

## Consequences
- Positive:
  - Every collection is visible and named in Studio.
  - Agents cannot widen a site's structure without a person.
  - ADR-0040's overlap gap is closed.
  - Stage 2 has a place for field definitions.
- Negative:
  - The site node grows with labels.
  - "Inferred" collections are a second state that Studio has to explain.
  - One collection's settings live in three stores.
- Risks: a tool that creates entries but skips the registry check would reopen the side door. The check therefore lives in one shared precheck that every entry-creating tool uses.
