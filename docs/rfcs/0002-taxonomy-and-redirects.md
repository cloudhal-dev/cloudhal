# RFC-0002: Taxonomy (categories, tags) and redirects
- Status: Accepted (2026-10-08, Halil — including the recommended answers below)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-08
- Related: RFC-0001 (open question "redirects … as first-class nodes"), ADR-0001, ADR-0002, ADR-0004, ADR-0009, ADR-0011, ADR-0012, ADR-0014, ADR-0015
- Contracts on this branch: `taxonomy.schema.json`, `term.schema.json`, `redirect.schema.json`, and the diffs in §2 (all generated and tested; §2.8 is the one diff that waits for code)

## Summary
Categories, tags and custom taxonomies become graph nodes: a **Taxonomy** holds the rules (hierarchy, who may add terms, archive and feed settings), a **Term** is one concept with per-locale names and synonyms, and content points at terms **by id** with an explicit primary term per taxonomy. Renames, merges and retirements are single-batch, single-snapshot, approval-gated operations that leave **Redirect** nodes behind, and a published entry's slug change does the same. Archives are SEO-safe by default (self-canonical pagination, `noindex` below a threshold, real 404s), and one small filter language serves the API, MCP, `ContentList` sections and feeds.

## Motivation
Today a tag is a slug in `ContentEntry.tags` (≤ 50, unique). There is no name, description, SEO, hierarchy, primary term or category, and no archive, feed or sitemap. Agents cannot list the vocabulary, so near-duplicates (`ai`, `a-i`, `llms`, `llm`) are inevitable, and renaming a tag across N posts means N `update_entry` calls and N snapshots. Changing a published slug breaks its URL with no redirect. The policy layer cannot tell a retag from any other article edit, so `auto` mode can publish 20 retagged articles without a person.

Who is affected: publishers (no category navigation, thin or missing archives), agents (no vocabulary, no add/remove operations), and the people approving their work (a tag change is an opaque "article changed").

Why now: taxonomy and redirects are P0 for the publisher alpha, and any new node kind needs an explicit kind discriminator first. The store tells kinds apart by duck typing (`packages/core-ts/src/store.ts` L71–85: `"pageIds" in node` → site, `"path" in node` → page, anything else → entry), so a Term would be stored as a `contentEntry` today without any error.

## Proposal

### 1. Model
```
Site ──1:n──▶ Taxonomy (key: category | tag | series …)
  │              ▲ taxonomyId
  ├──1:n──▶ Term ─parentId─▶ Term          (hierarchical taxonomies only)
  │              ▲ ids, primary
  ├──1:n──▶ ContentEntry.terms { [taxonomyKey]: { ids: Id[], primary?: Id } }
  └──1:n──▶ Redirect (from → to, 301|302, exact|prefix, source node)
```
- Taxonomy (`tax_`), Term (`term_`) and Redirect (`redir_`) are site-scoped nodes in the `nodes` table with `rev`, CAS and snapshots, like pages and entries.
- An entry references terms by id, so the assignment does not depend on locale (Contentful's "concept assignment is not localized"). A term rename changes **one** node, not N entries.
- The primary term is a field, never derived from order. This avoids Ghost's trap: there, if the first tag is internal, the post silently has no primary tag.
- Post URLs stay `/<collection>/<slug>`. Category permalinks are a later, opt-in pattern and out of scope.
- **Authors are not in this RFC.** A follow-up RFC adds Author nodes and a byline `authors: Id[]`, separate from the acting `author: Actor` ("who wrote it" and "who changed it" are different questions).

Default taxonomies, created by the starter seed and by `createDefaultTaxonomies(site)` (the schema has no defaults, ADR-0001):

| | `category` | `tag` |
|---|---|---|
| hierarchical | true | false |
| allowNewTerms | `none` (people only) | `propose` |
| required | true (review/published entries need one, with a primary) | false |
| maxPerEntry | 3 | 10 |
| archive | `/category`, enabled | `/tag`, enabled |
| feed | true | true |
| minEntriesToIndex | 3 | 3 |

Custom taxonomies (`series`, `region`, …) use the same mechanism.

### 2. Contracts
All shapes stay inside the AGENTS.md subset: no `default`, `additionalProperties: false` except the declared maps, cross-file refs only to `common.schema.json#/$defs/*` or another root's top level. Both generators and both validators accept them (§2.10).

#### 2.1 `common.schema.json` (diff)
`Seo` moves here from `page.schema.json` so that pages and term archives share it, and gains `ogImage`. `Path` is the route-path rule, used here by `Taxonomy.archive.basePath`; `Page.path` can adopt it in a later clean-up.
```diff
+    "Path": {
+      "type": "string",
+      "description": "Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.",
+      "pattern": "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
+      "maxLength": 1024
+    },
+    "Seo": {
+      "type": "object",
+      "description": "Search and social metadata of a routable node (page, term archive).",
+      "additionalProperties": false,
+      "properties": {
+        "title": { "type": "string", "maxLength": 300 },
+        "description": { "type": "string", "maxLength": 500 },
+        "noindex": { "type": "boolean" },
+        "canonical": { "type": "string", "maxLength": 2048 },
+        "ogImage": { "$ref": "#/$defs/ImageRef" }
+      }
+    },
```

#### 2.2 `taxonomy.schema.json` (new root)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/taxonomy.schema.json",
  "title": "Taxonomy",
  "description": "A classification scheme of a site (e.g. 'category', 'tag', 'series') and its rules: hierarchy, who may create terms, how many terms an entry takes, and how its archives are published. Terms are separate nodes (term.schema.json) that point here by id (RFC-0002).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "key",
    "labels",
    "hierarchical",
    "allowNewTerms",
    "required",
    "archive",
    "feed",
    "minEntriesToIndex",
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
      "description": "Stable name of the taxonomy, unique per site and immutable once created. ContentEntry.terms and filter expressions use it (e.g. 'category:news')."
    },
    "labels": {
      "type": "object",
      "description": "Display names per locale. Must contain the site's default locale.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": { "$ref": "#/$defs/TaxonomyLabel" }
    },
    "hierarchical": {
      "type": "boolean",
      "description": "Terms may have a parent term (categories). Flat when false (tags)."
    },
    "allowNewTerms": {
      "type": "string",
      "description": "Who may add terms. none: people only. propose: agents may create terms with status 'proposed' that wait for a person. free: agents may create active terms.",
      "enum": ["none", "propose", "free"]
    },
    "required": {
      "type": "boolean",
      "description": "An entry in review or published status must have at least one term of this taxonomy and an explicit primary term."
    },
    "maxPerEntry": {
      "type": "integer",
      "description": "Most terms of this taxonomy one entry may carry. Absent: the contract limit of 50.",
      "minimum": 1,
      "maximum": 50
    },
    "collections": {
      "type": "array",
      "description": "Collections this taxonomy applies to. Absent: every collection.",
      "items": { "$ref": "common.schema.json#/$defs/Slug" },
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true
    },
    "archive": { "$ref": "#/$defs/TaxonomyArchive" },
    "feed": {
      "type": "boolean",
      "description": "Publish an RSS feed per term at <archive.basePath>/<slug>/rss.xml. Requires archive.enabled."
    },
    "minEntriesToIndex": {
      "type": "integer",
      "description": "Archives listing fewer published entries than this are served with robots 'noindex, follow' and left out of the sitemap.",
      "minimum": 0,
      "maximum": 1000
    },
    "rev": { "$ref": "common.schema.json#/$defs/Revision" },
    "createdAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "updatedAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "metadata": { "$ref": "common.schema.json#/$defs/Metadata" }
  },
  "$defs": {
    "TaxonomyLabel": {
      "type": "object",
      "additionalProperties": false,
      "required": ["singular", "plural"],
      "properties": {
        "singular": { "type": "string", "minLength": 1, "maxLength": 100 },
        "plural": { "type": "string", "minLength": 1, "maxLength": 100 },
        "description": { "type": "string", "maxLength": 1000 }
      }
    },
    "TaxonomyArchive": {
      "type": "object",
      "description": "Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.",
      "additionalProperties": false,
      "required": ["enabled", "basePath"],
      "properties": {
        "enabled": { "type": "boolean" },
        "basePath": { "$ref": "common.schema.json#/$defs/Path" }
      }
    }
  }
}
```

#### 2.3 `term.schema.json` (new root)
Names, synonyms, the archive intro and SEO are per locale, inside `labels[locale]`, because they are text in a language. The image is shared across locales. Labels must include the site's default locale.
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/term.schema.json",
  "title": "Term",
  "description": "One concept in a taxonomy (a category, a tag, a series). Content refers to terms by id, independent of locale; names, synonyms, archive intro and SEO are per locale. Renames, merges and retirements keep the id and leave redirects behind; `proposedBy` records the actor that proposed it (RFC-0002).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "taxonomyId",
    "slug",
    "status",
    "visibility",
    "labels",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": { "$ref": "common.schema.json#/$defs/SchemaVersion" },
    "id": { "$ref": "common.schema.json#/$defs/Id" },
    "siteId": { "$ref": "common.schema.json#/$defs/Id" },
    "taxonomyId": { "$ref": "common.schema.json#/$defs/Id" },
    "slug": {
      "$ref": "common.schema.json#/$defs/Slug",
      "description": "URL segment of the term's archive; unique within its taxonomy, together with every slug in any term's slugHistory."
    },
    "status": {
      "type": "string",
      "description": "active: usable and public (subject to visibility). proposed: created by an agent, waiting for a person; assignable but never public. retired: no new assignments, no archive.",
      "enum": ["active", "proposed", "retired"]
    },
    "visibility": {
      "type": "string",
      "description": "internal terms have no archive, feed or sitemap entry and are not shown on entries; themes and filters may still use them.",
      "enum": ["public", "internal"]
    },
    "labels": {
      "type": "object",
      "description": "Names per locale. Must contain the site's default locale.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": { "$ref": "#/$defs/TermLabel" }
    },
    "parentId": {
      "$ref": "common.schema.json#/$defs/Id",
      "description": "Parent term in the same taxonomy; only in hierarchical taxonomies. No cycles."
    },
    "image": { "$ref": "common.schema.json#/$defs/ImageRef" },
    "slugHistory": {
      "type": "array",
      "description": "Earlier slugs, oldest first. Old slugs stay reserved in the taxonomy and still resolve when an agent assigns by slug.",
      "items": { "$ref": "common.schema.json#/$defs/Slug" },
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true
    },
    "mergedInto": {
      "$ref": "common.schema.json#/$defs/Id",
      "description": "Set when this term was merged into another active term of the same taxonomy; status is then 'retired'."
    },
    "proposedBy": { "$ref": "common.schema.json#/$defs/Actor" },
    "rev": { "$ref": "common.schema.json#/$defs/Revision" },
    "createdAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "updatedAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "metadata": { "$ref": "common.schema.json#/$defs/Metadata" }
  },
  "$defs": {
    "TermLabel": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 200 },
        "altNames": {
          "type": "array",
          "description": "Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.",
          "items": { "type": "string", "minLength": 1, "maxLength": 200 },
          "minItems": 1,
          "maxItems": 50,
          "uniqueItems": true
        },
        "description": {
          "type": "string",
          "description": "Markdown introduction shown at the top of the archive.",
          "maxLength": 20000
        },
        "seo": { "$ref": "common.schema.json#/$defs/Seo" }
      }
    }
  }
}
```

#### 2.4 `redirect.schema.json` (new root)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/redirect.schema.json",
  "title": "Redirect",
  "description": "An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "from",
    "to",
    "status",
    "match",
    "reason",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": { "$ref": "common.schema.json#/$defs/SchemaVersion" },
    "id": { "$ref": "common.schema.json#/$defs/Id" },
    "siteId": { "$ref": "common.schema.json#/$defs/Id" },
    "from": {
      "type": "string",
      "description": "Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site; never a path the site currently serves.",
      "pattern": "^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$",
      "maxLength": 1024
    },
    "to": {
      "type": "string",
      "description": "Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected.",
      "pattern": "^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$",
      "maxLength": 2048
    },
    "status": {
      "type": "integer",
      "description": "301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects.",
      "enum": [301, 302]
    },
    "match": {
      "type": "string",
      "description": "exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2).",
      "enum": ["exact", "prefix"]
    },
    "reason": {
      "type": "string",
      "enum": ["slug-change", "merge", "retire", "manual"]
    },
    "source": { "$ref": "#/$defs/RedirectSource" },
    "note": { "type": "string", "maxLength": 500 },
    "rev": { "$ref": "common.schema.json#/$defs/Revision" },
    "createdAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "updatedAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "metadata": { "$ref": "common.schema.json#/$defs/Metadata" }
  },
  "$defs": {
    "RedirectSource": {
      "type": "object",
      "description": "The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.",
      "additionalProperties": false,
      "required": ["kind", "id"],
      "properties": {
        "kind": { "type": "string", "enum": ["page", "contentEntry", "term"] },
        "id": { "$ref": "common.schema.json#/$defs/Id" }
      }
    }
  }
}
```

#### 2.5 `content-entry.schema.json` (diff)
```diff
     "tags": {
       "type": "array",
+      "description": "Deprecated by RFC-0002: use `terms.tag`. Still accepted on input for one release and translated into terms; the store then writes []. Removed in schemaVersion 2.",
+      "deprecated": true,
       "items": { "$ref": "common.schema.json#/$defs/Slug" },
       "uniqueItems": true,
       "maxItems": 50
     },
+    "terms": {
+      "type": "object",
+      "description": "Term assignments by taxonomy key (e.g. 'category', 'tag'). Terms are referenced by id, independent of locale. A taxonomy without terms is omitted, never an empty object.",
+      "propertyNames": { "$ref": "common.schema.json#/$defs/Slug" },
+      "minProperties": 1,
+      "maxProperties": 10,
+      "additionalProperties": { "$ref": "#/$defs/TermAssignment" }
+    },
   …
   "$defs": {
+    "TermAssignment": {
+      "type": "object",
+      "description": "Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.",
+      "additionalProperties": false,
+      "required": ["ids"],
+      "properties": {
+        "ids": {
+          "type": "array",
+          "items": { "$ref": "common.schema.json#/$defs/Id" },
+          "minItems": 1,
+          "maxItems": 50,
+          "uniqueItems": true
+        },
+        "primary": {
+          "$ref": "common.schema.json#/$defs/Id",
+          "description": "The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."
+        }
+      }
+    },
```
`tags` stays **required** during the deprecation release, and the store writes `[]`. Making it optional instead would change the TypeScript type to `string[] | undefined` and break existing readers (for example `apps/studio/src/routes/ArticleEditorPage.tsx` L55). It cannot mirror `terms` either, because then a rename would rewrite every entry again. `schemaVersion: 2` removes the field.

#### 2.6 `section.schema.json` (diff: `ContentListSection`)
```diff
-        "sort": { "type": "string", "enum": ["newest", "oldest", "title"] }
+        "sort": { "type": "string", "enum": ["newest", "oldest", "title"] },
+        "filter": {
+          "type": "string",
+          "description": "Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.",
+          "minLength": 1,
+          "maxLength": 512
+        }
```

#### 2.7 `page.schema.json` (diff)
```diff
-    "seo": { "$ref": "#/$defs/Seo" },
+    "seo": { "$ref": "common.schema.json#/$defs/Seo" },
   …
-  "$defs": { "Seo": { … title, description, noindex, canonical … } }
```
The generated `Page` type changes only by the new optional `seo.ogImage`.

#### 2.8 `snapshot.schema.json` (diff; lands with the store change)
```diff
-        "kind": { "type": "string", "enum": ["site", "page", "contentEntry"] },
+        "kind": { "type": "string", "enum": ["site", "page", "contentEntry", "taxonomy", "term", "redirect"] },
```
This diff was tried on the branch. Both generators accept it, but the repo typecheck then fails in two places, so it ships in the same PR as the code that handles the new kinds:
- `apps/studio/src/lib/diff.ts` L16: `KIND_ORDER: Record<NodeRef["kind"], number>` needs entries for the new kinds (order: site, taxonomy, term, page, contentEntry, redirect).
- `apps/studio/src/components/SnapshotDiffDialog.tsx` L238: needs the `diff.kinds.{taxonomy,term,redirect}` keys in `en.ts` and `tr.ts`, plus title resolution for the new kinds (the term name in the default locale; the redirect as `from → to`).
- `packages/mcp-server/src/tools.ts` L118–125 (`describeChanges`): titles and labels for the new kinds (it compiles today, but would print raw ids).

#### 2.9 `site.schema.json`
No change. Taxonomies are found by kind and site, so they need no ordered id list like `pageIds`. Archive base paths live on the taxonomy.

#### 2.10 What the generators taught us (recorded so later contracts follow it)
- **No empty optional containers.** typify serialises some optional arrays as `#[serde(default, skip_serializing_if = "Vec::is_empty")]`, so a stored `[]` would not round-trip. Every optional array or map therefore has `minItems`/`minProperties: 1`: absent is the only empty form. This also gives one canonical body per meaning, which keeps content hashes stable.
- **Locale- and key-indexed maps** (`propertyNames: {$ref: Locale|Slug}` + `additionalProperties: {$ref}`) generate `HashMap<Locale, TermLabel>` in Rust and an index signature in TypeScript. Both validators check the keys.
- **Integer enums** (`status: 301|302`) become a validated newtype in Rust and a literal union in TypeScript.
- **`$ref` with a sibling `description`** makes json-schema-to-typescript emit a duplicate type (`Actor1`) for object targets. It is harmless for string targets (they inline as `string`, as `Site.publishedSnapshotId` already does). So `proposedBy` carries no sibling description.
- **`deprecated: true`** is accepted by Ajv (strict mode) and typify, and json-schema-to-typescript emits a `@deprecated` JSDoc tag for it.
- Cross-field rules (primary ∈ ids, `mergedInto` ⇒ retired, …) cannot be written in the subset (no `if/then`, no `$data`), so core-ts enforces them (§3).

### 3. Invariants
1. **One primary per taxonomy.** `terms[k].primary`, when present, is one of `terms[k].ids`.
2. **Required taxonomies.** If taxonomy `k` is `required` and applies to the entry's collection, an entry in status `review` or `published` has `terms[k]` with a `primary`. Drafts may be incomplete.
3. **Terms belong to their taxonomy.** Every id in `terms[k].ids` is a Term of the same site whose taxonomy has key `k` and whose `collections` (if set) include the entry's collection.
4. **Assignable status.** Only `active` or `proposed` terms can be assigned. No entry references a `retired` term, so a merged term (`mergedInto`) has no assignments.
5. **Limits.** `terms[k].ids.length ≤ maxPerEntry` (or 50), with at most 10 taxonomies per entry. The total stays within D1's 100 bound parameters for guard statements, and core-ts caps it at 60 ids per entry.
6. **Canonical form.** There are no empty `terms`, `ids`, `altNames`, `slugHistory` or `collections`. Once an entry has been written by RFC-0002 code, `tags` is `[]`.
7. **Taxonomy key.** Keys are unique per site and immutable. `primary`, `collection`, `locale`, `status` and `id` are reserved (filter grammar).
8. **Slug uniqueness.** A term's `slug` is unique within its taxonomy, and so is every slug in any term's `slugHistory` (old slugs stay reserved). `reclaim: true`, available to people only, frees an old slug and deletes its redirect in the same batch.
9. **Hierarchy.** `parentId` is allowed only in hierarchical taxonomies. It points to a non-retired term of the same taxonomy, there are no cycles, and the depth is at most 5.
10. **Merge.** If `mergedInto` is set, then `status` is `retired`, and the target is an `active` term in the same taxonomy that is not itself merged (there are no merge chains; merging into a term that later merges re-points the earlier ones).
11. **Proposed terms** exist only in taxonomies with `allowNewTerms` = `propose` or `free`, and are never public: no archive, feed or sitemap entry, and they are not shown on entries.
12. **Labels** contain the site's default locale. An `altNames` value, case- and diacritic-folded, does not equal another term's name, alternative name or slug in the same taxonomy.
13. **Archive paths.** No page path equals an enabled `archive.basePath` or lies under it, the base path is not a collection prefix (`/<collection>`), and no two taxonomies share a base path. `feed` requires `archive.enabled`.
14. **Redirects.** `from` is unique per site, never equals a path the site currently serves, and `from ≠ to`. There are no chains: when a node moves again, existing redirects to its old path are re-pointed to the new one in the same batch. There are no loops. Automatic redirects are `301`; `302` is only for manual redirects.
15. **Node kinds are explicit and exclusive.** Every row's `kind` column decides its schema, and no document is valid under two node schemas (tested on this branch: `node schemas are mutually exclusive`).
16. **Governance operations are atomic.** Rename, merge, retire, move and review are each one `batch()` and one snapshot. They either apply completely or not at all.

Where each invariant is enforced:

| # | Schema | core-ts (batch-guarded CAS) | Policy engine / MCP |
|---|---|---|---|
| 1, 2, 3, 4, 5 | shape, `maxItems`, `uniqueItems` | on every entry write; the entry `UPDATE` carries a guard that every referenced term exists with an assignable status | – |
| 6 | `minItems`/`minProperties` | the store normalises (`tags: []`, drops empty taxonomies) | – |
| 7 | `Slug` pattern | uniqueness key `<key>`; the key is never in an update; reserved words | – |
| 8 | `Slug` pattern | uniqueness key `<taxonomyId>:<slug>` + `NOT EXISTS` guard over `json_each(slugHistory)` | `reclaim` for people only |
| 9 | – | ancestor walk at write time; the batch asserts that the ancestors' hashes are unchanged, so two concurrent moves cannot build a cycle | `set_term_parent` is approval-gated |
| 10 | – | merge batch (§4.3) | approval-gated |
| 11 | `status` enum | the store refuses `proposed` when `allowNewTerms` is `none` | `propose_term`; agents never create `active` terms unless `allowNewTerms` is `free` |
| 12 | `minProperties: 1` | at write time | – |
| 13 | `Path` pattern | at taxonomy and page writes (`NOT EXISTS` guards) | taxonomy tools are approval-gated |
| 14 | `from`/`to` patterns (no `//`, no `\`, https only), `status` enum | uniqueness key `<from>`; chain collapse and loop check in the same batch | external `to` only by people |
| 15 | mutual exclusivity (contracts test) | explicit `kind` everywhere (§4.1); `sync` validates rows by their kind | – |
| 16 | – | assertion statement (§4.3) | approval binds to the state hash (ADR-0014) |

### 4. Store (`packages/core-ts`)

#### 4.1 Explicit node kinds
The duck-typed `kindOf`, `uniquenessKey` and `siteIdOf` (store.ts L71–85) are replaced by a registry, and every call site passes the kind it already knows:
```ts
export const NODE_KINDS = ["site", "page", "contentEntry", "taxonomy", "term", "redirect"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];          // === NodeRef["kind"] after §2.8
export interface NodeTypes { site: Site; page: Page; contentEntry: ContentEntry;
                             taxonomy: Taxonomy; term: Term; redirect: Redirect }
export type SiteNode = NodeTypes[NodeKind];

interface NodeSpec<K extends NodeKind> {
  schema: RootSchemaName;                 // "site" | "page" | "content-entry" | "taxonomy" | "term" | "redirect"
  prefix: string;                         // site | page | entry | tax | term | redir
  key(node: NodeTypes[K]): string;        // "site" | "<locale>:<path>" | "<collection>:<locale>:<slug>"
                                          // | "<key>" | "<taxonomyId>:<slug>" | "<from>"
  siteId(node: NodeTypes[K]): string;
}
export const NODE_SPEC: { [K in NodeKind]: NodeSpec<K> };
export function uniquenessKey<K extends NodeKind>(kind: K, node: NodeTypes[K]): string;
export function siteIdOf<K extends NodeKind>(kind: K, node: NodeTypes[K]): string;
```
- `#insertNodeStatement(kind, node, ts)` and `#casUpdateStatement(kind, next, rev)` take the kind. `kindOf` is removed.
- `sync.ts` replaces `SCHEMA_OF` (L17–21) with `NODE_SPEC[row.kind].schema`. It validates the body against that schema and recomputes `key` and `siteId` with `row.kind`. Because the schemas are mutually exclusive (invariant 15), a row cannot claim a kind its body does not have.
- `ID_PREFIX` gains `taxonomy: "tax"`, `term: "term"` and `redirect: "redir"`.
- `SnapshotSource.#load` (`packages/astro-renderer/src/source.ts` L98–121) reads the new kinds and ignores kinds it does not know (forward compatibility for renderers).
- `pendingChanges`, `diffNodeRefs` and `stateHash` need no change: they are kind-agnostic.

#### 4.2 New and changed methods
```ts
// taxonomies (people; structural)
createTaxonomy(input: Creatable<Taxonomy>): Promise<Taxonomy>
createDefaultTaxonomies(site: Site): Promise<Taxonomy[]>          // category + tag (§1 table)
getTaxonomy(id) · getTaxonomyByKey(siteId, key) · listTaxonomies(siteId)
updateTaxonomy(t: Taxonomy): Promise<Taxonomy>                   // key immutable; base path guards

// terms
createTerm(input: Creatable<Term>, opts?: { reclaim?: boolean }): Promise<Term>
getTerm(id) · getTermBySlug(siteId, key, slug)                   // follows slugHistory
listTerms(siteId, q?: { taxonomy?: string; status?: Term["status"][]; parentId?: string | null })
updateTerm(t: Term): Promise<Term>        // labels, image, seo; never slug, status, parentId, visibility, mergedInto
termUsage(siteId, key?): Promise<Map<string, { total: number; published: number; lastUsedAt?: string }>>
resolveTerms(siteId, key, inputs: string[]): Promise<Resolution[]>   // §6.3

// governance (each = one batch; the caller takes one snapshot)
renameTerm(t: Term, slug: string, opts?: { reclaim?: boolean }): Promise<GovernanceResult>
mergeTerms(sources: Term[], target: Term): Promise<GovernanceResult>
retireTerm(t: Term, opts?: { redirectTo?: Term }): Promise<GovernanceResult>
setTermParent(t: Term, parentId: string | null): Promise<GovernanceResult>
setTermVisibility(t: Term, v: Term["visibility"]): Promise<GovernanceResult>
reviewTerm(t: Term, d: { approve: true } | { reject: true } | { mergeInto: Term }): Promise<GovernanceResult>
interface GovernanceResult { opId: string; terms: Term[]; entries: number; redirects: Redirect[] }

// entries (changed)
listContentEntries(siteId, q?: string | { collection?: string; filter?: string; locale?: string; status?: PublishStatus[] })
createContentEntry / updateContentEntry   // invariants 1–6; `tags` input translated; slug change → redirect (§4.5)

// redirects
createRedirect(input) · updateRedirect(r) · deleteRedirect(r) · listRedirects(siteId) · redirectFor(siteId, path)

// migration (§Compatibility)
migrateTagsToTerms(siteId, actor, opts?: { dryRun?: boolean }) · revertTagsToTerms(siteId, migrationId)
```
Snapshots stay a caller concern, as today: the MCP tool or API route calls `createSnapshot` once after a store operation (label `<op> by <actor>`). A governance operation therefore yields exactly one snapshot, however many entries it touched.

#### 4.3 Governance operations as one batch
D1 has no interactive transactions (ADR-0002), and a CAS `UPDATE` that matches no row is not an error, so a plain batch could apply half of a merge. Each governance batch therefore ends with **assertion statements** that turn any missed CAS into a constraint failure, which rolls the whole batch back on D1 and in the better-sqlite3 adapter (its batch is a transaction):
```sql
-- migration 0011
CREATE TABLE op_guards (op_id TEXT NOT NULL, seq INTEGER NOT NULL, ok INTEGER NOT NULL,
                        created_at TEXT NOT NULL, PRIMARY KEY (op_id, seq));
-- last statement(s) of the batch, ≤ 45 (id, hash) pairs each (100-parameter limit)
INSERT INTO op_guards (op_id, seq, ok, created_at)
SELECT ?, ?, CASE WHEN (SELECT count(*) FROM nodes
                        WHERE site_id = ? AND (id, hash) IN (VALUES (?, ?), (?, ?) …)) = ? THEN 1 END, ?;
```
`ok` is `NULL` unless every node reached its expected new hash, so the `NOT NULL` violation aborts the batch. The `(op_id, seq)` key also makes a retried operation fail fast instead of applying twice. Rows are swept after 30 days.

A **merge** of sources S into target T is one batch:
1. CAS each S: `status: "retired"`, `mergedInto: T.id`. The first S is the anchor, and every later statement also carries `EXISTS (SELECT 1 FROM nodes WHERE id = <anchor> AND hash = <anchor's new hash>)`, per AGENTS.md rule 4.
2. CAS T: add each S's names (per locale) to `altNames`, and S's slug and slug history to `slugHistory`, so that old names and slugs still resolve.
3. CAS every entry that references any S: replace S with T, de-duplicate keeping the first position, and re-point `primary`.
4. Insert one `301` `prefix` redirect per S (`/tag/llms → /tag/llm`, reason `merge`), re-point existing redirects whose `to` is under S's path, and delete any redirect whose `from` is T's path.
5. Assertion statements over every node written in steps 1–3.

**Rename** touches the term (slug, with the old slug appended to `slugHistory`) and redirects only: there is one redirect per enabled archive, and no entry changes. **Retire** removes the term from every entry (as in step 3, but without a replacement) and may add a redirect to `redirectTo` or, in hierarchical taxonomies, to the parent. A term with no redirect then returns 404. **Review** either approves (`proposed` → `active`), rejects (a retire), or merges into an existing term.

**Size limit.** D1 caps a batch at 1,000 statements. An operation that would touch more than **400 entries** is refused with `too_large` and lists the count, and Studio explains the limit. Open question 3 covers large sites.

#### 4.4 Entry writes
- Assignments are validated against invariants 1–5. The entry's CAS `UPDATE` carries one guard for all referenced terms: `(SELECT count(*) FROM nodes WHERE kind = 'term' AND site_id = ? AND id IN (…) AND json_extract(body, '$.status') IN ('active','proposed')) = ?`. A concurrent retire or merge therefore makes the entry write conflict instead of leaving a dangling assignment. The reverse case, an entry write landing between a merge's read and its batch, fails the merge's assertion.
- **Deprecated `tags` input.** A non-empty `tags` (from an old client, or REST `PUT` of a full document) is resolved against the `tag` taxonomy with the rules of §6.3. Unknown slugs become `proposed` terms when the actor is an agent and `allowNewTerms` is `propose`, or `active` terms when the actor is a person. The store then writes `tags: []`.

#### 4.5 Automatic redirects
- **Entry slug change.** If the entry is published (`status: "published"` or `publishedAt` set) and in the site's default locale (the only routed locale today), one batch updates the entry, inserts `/<collection>/<old> → /<collection>/<new>` (`301`, `exact`, reason `slug-change`, source = the entry), re-points older redirects to the old path, and deletes a redirect whose `from` is the new path (renaming back).
- **Term rename, merge, retire:** as in §4.3. Archive redirects use `prefix`, so pagination and feeds follow (`/tag/old/page/2`, `/tag/old/rss.xml`).
- Redirects are nodes, so they go live with the same publish as the change that caused them, and roll back with it.

#### 4.6 Queries and counts
Filters and counts compile to SQL over the JSON bodies with `json_each`, which both D1 and SQLite provide, for example `… FROM nodes, json_each(nodes.body, '$.terms.tag.ids') AS t WHERE nodes.kind = 'contentEntry' AND t.value IN (…)`. This removes today's load-everything-then-filter in `listContentEntries` (store.ts L370–377). If profiling demands it, a derived `node_terms(site_id, entry_id, taxonomy_key, term_id, is_primary)` index, written in the same batch as the entry, can follow without a contract change.

### 5. Filter grammar
One parser in a dependency-free, Worker-safe module (`@cloudhal/core-ts/filter`: `parseFilter`, `resolveFilter`, `matches`, `toSql`) serves the REST API, MCP `list_entries`, `ContentListSection.filter` and feeds, and later channels.
```
filter  = clause *( "+" clause )                 ; "+" = AND
clause  = [ "-" ] field ":" values               ; "-" = NOT (none of the values)
field   = taxonomy-key / "primary:" taxonomy-key / "collection"
values  = value / "[" value *( "," value ) "]"   ; brackets = OR
value   = ( slug / id ) [ ">*" ]                 ; ">*" = the term or any descendant
```
| Example | Means |
|---|---|
| `category:news+tag:ai` | primary or secondary category `news` AND tag `ai` |
| `category:news>*` | `news` or any of its sub-categories |
| `tag:[ai,llm]+-tag:sponsored` | tag `ai` or `llm`, and not `sponsored` |
| `primary:category:news` | the entry's primary category is `news` |
| `collection:posts+tag:term_01HZX8K3Q9LL` | by id (ids contain `_`, slugs never do) |

- Values resolve through the current slug, then `slugHistory`, so old links keep working. An unknown value is an error (`unknown_term`, with suggestions) in the API, in MCP and when a section is saved. A renderer that meets one in a published snapshot treats it as matching nothing and logs it.
- `>*` on a flat taxonomy is an error. Internal and proposed terms are filterable (themes use internal terms), but never produce public URLs.
- Limits: 512 characters, 8 clauses, 20 values per clause, and a `>*` expansion of at most 500 terms. SQL uses bound parameters only.
- In query strings `+` must be sent as `%2B` (form encoding turns `+` into a space). The API's error message says so.
- Not in v1 (additive later): OR across clauses, parentheses, and non-taxonomy fields such as status, dates or `featured`.

### 6. API, MCP and policy

#### 6.1 REST (people; agents keep using MCP)
`GET/POST /api/sites/:siteId/taxonomies`, `PUT /taxonomies/:id`; `GET/POST /terms?taxonomy=&status=&q=`, `PUT /terms/:id`, `POST /terms/:id/{rename,merge,retire,parent,visibility,review}`; `GET /entries?filter=`; `GET/POST/PUT/DELETE /redirects`; `POST /migrations/tags-to-terms` with `{ dryRun }` and `/revert`. Each mutation answers with the changed nodes and the snapshot it created.

#### 6.2 MCP tools
| Tool | Scopes | Read-only | Approval | Notes |
|---|---|---|---|---|
| `list_taxonomies` | site:read | yes | – | Keys, labels and rules (`allowNewTerms`, `required`, `maxPerEntry`, `collections`), so an agent knows the constraints before writing. |
| `list_terms` | content:read | yes | – | `{siteId, taxonomy, query?, status?, parentId?, cursor?}` → names per locale, `altNames`, `slugHistory`, parent, status, visibility and usage (`published`, `total`, `lastUsedAt`). |
| `resolve_terms` | content:read | yes | – | Inputs (id, slug or name) → match `{termId, via}` or `unmatched` with up to 5 suggestions. Never creates anything. |
| `list_entries` | content:read | yes | – | New `filter` argument (§5). |
| `create_entry` / `update_entry` | content:write | no | – (publish gates) | New `terms: { [taxonomy]: { set?, add?, remove?, primary? } }`; values by id, slug or name (§6.3). The tool input schema now carries the slug pattern and limits. `tags` remains a deprecated alias for `terms.tag.add`. |
| `propose_term` | content:write | no | – | `{taxonomy, name, locale?, slug?, altNames?, parentId?, reason}`. Under `propose`: a `proposed` term with `proposedBy`. Under `free`: an `active` term. Under `none`: denied ("ask a person"). If a term already matches (§6.3), returns it with `existing: true` (idempotent). |
| `update_term` | content:write | no | – | Text only: names, `altNames`, description, SEO, image of `active`/`proposed` terms. |
| `rename_term` | site:write | no | **yes** | Slug change; preview lists the redirects. |
| `merge_terms` | site:write | no | **yes** | Preview lists entries touched and redirects. |
| `retire_term` | site:write | no (destructive) | **yes** | Removes the term from entries; optional `redirectTo`. |
| `set_term_parent` | site:write | no | **yes** | Hierarchical taxonomies only. |
| `set_term_visibility` | site:write | no | **yes** | public ↔ internal (adds or removes public URLs). |
| `review_term` | site:write | no | **yes** | approve / reject / `mergeInto`. People normally do this in Studio. |
| `taxonomy_report` | content:read | yes | – | Hygiene: single-use terms, near-duplicates (edit distance ≤ 2 and synonym collisions), empty or oversized categories, proposed backlog. |
| `list_redirects` | site:read | yes | – | |
| `create_redirect` / `delete_redirect` | site:write | no | **yes** | Agents: site paths only; external `to` is refused for agents. |
| `create_taxonomy` / `update_taxonomy` | site:write | no | **yes** | |

No new scope is introduced. Structural tools need `site:write`, which no default agent key and no `scopesForMode` set includes today (`packages/agent-runtime/src/modes.ts` L24–28, `policy.ts` `defaultScopes`). An owner must grant it, and each call still waits for a person.

#### 6.3 Assignment by id, slug or name
Resolution order within one taxonomy: id → current slug → `slugHistory` → name in any locale → `altNames` → plural folding (en: `-s`/`-es`; tr: `-lar`/`-ler`). Comparison uses NFKC, locale-aware lower-casing (Turkish `İ/ı`), and folding of diacritics and punctuation (`A.I.` → `ai`). Exactly one match wins. An ambiguous or missing match is an error with suggestions, never an implicit create. `"JS"` resolves to `JavaScript` if `JS` is an `altName`.

#### 6.4 Policy
- **`auto` mode.** Any pending taxonomy, term or redirect node makes the publish a `"structure"` change that waits for a person. `checkAutoPublish` (modes.ts L69–91) already does this, because every kind other than `contentEntry` counts as structure. Only its wording changes: "it changes pages, site settings, taxonomies or redirects". Entry edits that only change assignments to existing terms remain article changes.
- **Approval prompts** (`describeChanges`) name the new kinds and show assignment deltas per entry, for example `~ article "…" (+tag ai, −tag llms, primary category → News)`. Governance prompts list the entry count and every redirect.
- `maxPerEntry`, `required` and slug rules are data invariants in core-ts, not policy. Who may create terms (`allowNewTerms`) and external redirect targets are agent-layer rules (MCP handlers and the PolicyEngine). Studio users are people and may create terms directly.
- **Audit.** Each governance operation writes one audit row (`opId`, counts, redirects). Assignment deltas go into the `update_entry` audit detail.

### 7. Renderer and SEO
`GraphSource` (both live and snapshot) gains:
```ts
taxonomies(): Promise<Taxonomy[]>
terms(key: string): Promise<Term[]>                       // snapshot mode: active + public only
termBySlug(key: string, slug: string): Promise<Term | undefined>
archive(key: string, slug: string, o: { page: number; perPage: number; locale?: string })
  : Promise<{ term: Term; entries: ContentEntry[]; total: number; pages: number; indexable: boolean } | undefined>
entriesByFilter(filter: string, o?: { locale?: string; limit?: number }): Promise<ContentEntry[]>
redirectFor(path: string): Promise<Redirect | undefined>
```
Starters own the routes (ADR-0009). The blog starter's catch-all resolves, in order: page → archive (`<basePath>/<slug>[/page/<n>]`, `<basePath>/<slug>/rss.xml`) → redirect → 404. The site Worker applies redirects before rendering a 404.

| Request | Response |
|---|---|
| Active, public term with ≥ `minEntriesToIndex` published entries in the locale | 200, indexable, in sitemap |
| Active, public term with 1 … `minEntriesToIndex − 1` entries, or `seo.noindex` | 200 with `robots: noindex, follow`; not in sitemap |
| Term with 0 published entries | **404** (a real 404, not a soft 404) |
| Proposed or internal term, archive disabled, retired term without a redirect | 404 |
| Old slug, merged or redirected retired term | 301 via the Redirect node |
| `…/page/1` | 301 to the archive root |
| `…/page/n` beyond the last page | 404 |

- **Archive contents.** Entries assigned to the term in the request locale, newest first. In hierarchical taxonomies this includes descendants (`>*`), and counts use the same set.
- **Pagination.** Real `<a href>` links. Every page is self-canonical (page 2 is canonical to page 2, not to page 1). The title gets a localized "Page n" suffix, and the description and intro appear on page 1 only. `perPage` is theme config (starter: 10).
- **JSON-LD.** Archives get `CollectionPage` with `about: DefinedTerm` (`inDefinedTermSet` → the taxonomy as `DefinedTermSet`), `mainEntity: ItemList` of `ListItem {position, url}`, and a `BreadcrumbList` (Home › ancestors › term). Posts add `articleSection` (the primary category's name), `keywords` (public tag names) and `about` (primary category as `DefinedTerm`) to `BlogPosting`, next to a `BreadcrumbList`. Google uses breadcrumbs for display; the rest is semantic markup.
- **Feeds.** RSS per term at `<basePath>/<slug>/rss.xml` when `feed` is true, the term is indexable or has ≥ 1 entry, and it is public and active.
- **Sitemap.** Indexable archives (page 1 only), with `lastmod` = the later of the newest listed entry's `updatedAt` and the term's `updatedAt`.
- **Cache purging per term.** Responses carry `Cache-Tag`s for the site (as today) and for every node they render (`n:<id>`: the page, the listed entries, the shown terms). After a publish, the purge covers the tags of nodes that changed between the old and new live snapshots, plus the terms whose assignments changed on those entries. When the diff adds or removes URLs (new or removed nodes, slug changes, redirects), the purge falls back to purging everything (today's behaviour in `cloudflare-entry.ts`), because cached 404s for new URLs carry no tag. A term description edit therefore purges its archive and the entries that show it, not the site.

### 8. Studio (brief)
- **"Categories & tags"** in the site sidebar. It has a tab per taxonomy (a tree for categories), filters for public, internal and proposed terms, and columns for entries, last used and index status. Proposed terms can be approved, rejected or merged.
- **Term editor.** Names and synonyms per locale, intro (markdown), image, SEO with a social preview, index status ("indexed from 3 articles"), and slug history with redirects.
- **Rename, merge and retire** dialogs preview the affected entries and the redirects, then apply as one operation and one snapshot.
- **Article editor.** A required category picker with a primary marker. A tag `Autocomplete` (reserved in DESIGN.md) offers existing terms first and matches synonyms; "propose" or "create" appears according to permissions. Cover image and SEO panel.
- **Articles list.** Category and tag columns and a filter built on §5. **Snapshot diff:** the new kinds, plus assignment deltas.
- **Redirects** under Settings, with the source node and reason, and manual redirects (people only).

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Ghost-style flat tags; primary = first public tag; `#internal` prefix | One concept; small | No hierarchy (Ghost started one in 2018 and stopped in 2019); primary derived from order fails silently when the first tag is internal; a prefix trick instead of a field; no merge, synonyms or slug redirects; any tag edit purges the whole cache | The "category" expectation in Turkish publishing is strong, and the primary must be explicit |
| WordPress-style shared terms (one term row across taxonomies) | Saves rows | WordPress had to split shared terms in 4.2 because edits leaked across taxonomies; ids then change under plugins | Terms belong to exactly one taxonomy from day one |
| Embed taxonomies and terms in the Site node | No new kinds; one CAS | Every term edit rewrites the site node (contention, huge diffs); no per-term history or lock; site changes already count as structure | Terms need their own `rev` and snapshot entry like pages |
| Keep `tags: Slug[]` plus a per-site term registry keyed by slug | Smallest change | A rename still rewrites N entries; locale-dependent; no stable identity for merges | Fails "rename = one change" |
| SKOS polyhierarchy now (`broader: Id[]`, `related`, `hiddenLabel`) | Standards-complete; imports from thesaurus tools | Archive breadcrumbs and "category > sub-category" UX need one parent; cycle checks get harder; few publishers need it | `parentId` is single now. A later `broaderIds` is additive, and `altNames` already covers SKOS altLabel |
| Lazy merges (entries keep the old id; readers follow `mergedInto`) | O(1) merge on any site size | Every reader, filter and count must resolve chains; "retired term has no assignments" no longer holds | Kept only as a possible fallback for very large sites (open question 3) |
| Redirects as a `Site.redirects[]` array | Simple | Site-node contention; no per-redirect history; conflicts with "site change = structure" for every slug fix | Redirects are nodes |

## Compatibility & migration
- **`schemaVersion` stays `1`.** Every change is additive: new roots, new optional fields (`terms`, `filter`, `ogImage`), a `deprecated` annotation and new enum values in `NodeRef.kind`. Existing documents and fixtures stay valid, and the generated TypeScript and Rust types only gain members. Readers with exhaustive maps over `NodeRef["kind"]` must add the new kinds (§2.8). `schemaVersion: 2` later removes `ContentEntry.tags`, with a migration function and both versions' fixtures, as RFC-0001 requires.
- **Storage.** No change to `nodes`: `kind` is free text, and the new uniqueness keys fit `(site_id, kind, key)`. Migration `0011` adds `op_guards` (§4.3). Everything is a `batch()`; there are no interactive transactions (ADR-0002).
- **Data migration `tags → terms`** (`cloudhal migrate tags-to-terms [--site] [--dry-run]`, also offered once as a Studio banner):
  1. Take a `manual` snapshot labelled `before tags-to-terms`, and record its id in the migration's metadata.
  2. Create the default taxonomies if they are missing. On existing sites `category.required` starts as **false** (no entry has a category yet), and Studio shows "N articles have no category". New sites from the starter get `true`.
  3. One batch creates an `active`, public `tag` term per distinct slug. The name is the humanised slug (`machine-learning` → "Machine learning") in the default locale, with `metadata["cloudhal.migration"] = "0002-tags"`. Existing terms with that slug are reused.
  4. Rewrite entries in batches of ≤ 200: `terms.tag.ids` in the old order, no primary, `tags: []`. The rewrite is idempotent (it only touches entries whose `tags` are non-empty), so an interrupted run can be resumed. During the run, readers accept both forms, because the renderer falls back to `tags` when an entry has no `terms`.
  5. Take a `manual` snapshot labelled `tags-to-terms`. Nothing goes live until a person publishes; term nodes in the diff make it "structure" even in `auto` mode.
- **Rollback.** `--revert` restores `tags` from the before-snapshot for entries whose hash is still the migrated one, and reports entries edited since then (left untouched). It then deletes migration-created terms that are now unassigned, and the taxonomies if they are empty. A code downgrade below this RFC requires the revert first: older binaries would write snapshots with unknown node kinds and fail validation. Published snapshots are immutable and keep rendering; renderers ignore kinds they do not know.
- **Rollout.** (1) contracts (this branch); (2) explicit node kinds + §2.8 + Studio diff labels (one PR); (3) taxonomy, term and redirect store APIs, migration 0011 and the filter module, with the behavioural suite on SQLite and Miniflare D1; (4) MCP tools and policy wording; (5) renderer and starter: archives, feeds, sitemap, redirects, cache tags; (6) Studio screens; (7) migration command and starter seed; (8) the deprecation release notes. The following release stops accepting `tags` on input, and the next `schemaVersion` removes it.
- **Acceptance.** Behavioural tests prove invariants 1–16 on both backends, including a concurrent merge vs. entry write and two concurrent `set_term_parent` calls. A rename yields exactly one snapshot with one changed term and one added redirect. The `auto`-mode publish of a term change waits for a person. Archives below the threshold carry `noindex, follow`, and empty or proposed ones return 404.

## Security & policy impact
- **Tenant isolation.** The new nodes are site-scoped and every query is keyed by `site_id`. Ids are opaque handles re-authorised per call (ADR-0004). `sync` validates every row against the schema of its declared kind (invariant 15).
- **Open redirects.** The schema rejects protocol-relative (`//host`), backslash (`/\host`), non-https and script targets (fixtures on this branch). Agents cannot create external redirects at all. People can, with an approval prompt that shows the full target host. Loops and chains are refused in core-ts.
- **Spam and doorway pages.** Agents cannot create public archives without a person (`propose`; categories `none`). Proposed and internal terms have no public URL. Thin archives are `noindex`, and empty ones return 404. `taxonomy_report` surfaces sprawl.
- **Injection through labels.** Term names, synonyms and descriptions are agent-controlled text. Approval prompts quote and truncate them (the existing `quote()` rule), descriptions go through the existing markdown sanitiser (raw HTML escaped), and JSON-LD is serialised, never concatenated.
- **Synonym hijacking.** An `altName` cannot equal another term's name, synonym or slug (invariant 12). Resolution prefers exact slug and name matches over synonyms, and ambiguity is an error.
- **Scopes and approvals.** No new scope. Structural changes need `site:write` plus a person's approval (ADR-0014: single use, bound to the call and content state). Agents cannot approve their own proposed terms. `review_term` is approval-gated and Studio is the normal path.
- **Resource limits.** Filters are bounded (§5). Governance operations are capped at 400 entries. Every SQL statement uses bound parameters.

## Open questions
1. **Per-locale description and SEO.** This draft puts them inside `labels[locale]` (§2.3), where §4.1 of the approved design shows them at term level. Is per-locale right?
2. **Localized slugs** (`/kategori/haberler` on a Turkish site). v1 has one slug per term. This needs locale routing first.
3. **Very large governance operations** (> 400 entries): refuse (this draft), a resumable staged job, or lazy `mergedInto` resolution?
4. Should a slug-change redirect created by a published entry's rename count as "structure" in `auto` mode (this draft: yes, a person approves URL changes)?
5. Should a published **page**'s path change also create a redirect automatically? (`RedirectSource.kind` already allows `page`.)
6. Should archives without an intro text also be `noindex` (suggested in the research), or only the entry threshold?
7. Should the structural tools use a dedicated `taxonomy:manage` scope instead of `site:write`?
8. Should retired terms without a redirect return 404 (this draft) or 410 Gone?
9. Should category archives include sub-category entries by default (this draft: yes, as WordPress does)?
10. Migration on existing sites: should `category.required` start false (this draft), or should every entry get an "Uncategorized"/"Genel" category?
11. Should the migration snapshot use reason `manual` + label (this draft), or a new `migration` reason?
12. Sibling order of categories for menus: should terms get a `position` now, or wait for the navigation editor?
13. Should terms get SKOS `hiddenLabel` (searchable misspellings that are never shown) next to `altNames`?

## Recommended answers (Claude, 2026-10-08 — pending Halil's acceptance)
1. **Per-locale description and SEO: yes.** An archive's intro text and meta description are prose; a Turkish archive needs Turkish prose. Keep them in `labels[locale]` as drafted.
2. **Localized slugs: no, not in v1.** One slug per term until locale routing exists; then add `labels[locale].slug` with redirects.
3. **> 400 entries: refuse in v1** with a clear message ("split it, or ask for the staged job"). Add a resumable staged job only when a real site hits the cap.
4. **Published slug-change redirect is "structure": yes.** URL changes wait for a person, even in `auto`.
5. **Page path changes create redirects too: yes**, same rule as entries (`RedirectSource.kind = page`).
6. **No-intro archives `noindex`: no by default.** The entry threshold alone decides; an intro text is encouraged by `taxonomy_report`, not enforced.
7. **Dedicated scope: no.** Keep `site:write`; it is already not granted by default and every structural call waits for a person. Revisit if roles need finer splits.
8. **Retired terms without a redirect: 410 Gone.** It tells crawlers the archive was removed on purpose; merged terms keep 301.
9. **Category archives include sub-categories: yes** (`category:x>*`), as drafted.
10. **Existing sites: `category.required = false`** and no "Uncategorized"/"Genel" term (an empty catch-all becomes a thin archive). Studio nudges "N articles have no category".
11. **Migration snapshot reason: `manual` + label**, as drafted; no new enum value for a one-off.
12. **`position` on terms: yes, optional integer now** (cheap, additive), so category menus and sidebars have a stable order before the navigation editor lands.
13. **SKOS `hiddenLabel`: later.** `altNames` covers synonyms; add hidden labels when site search exists.

## Implementation notes (core, rollout steps 2, 3 and 7)
Where the code had to choose, it took the safer reading. Each point is covered by the behavioural suite (`packages/core-ts/src/testing-taxonomy.ts`, on SQLite and Miniflare D1).

- **Retired terms give their slug back to the index.** A term's uniqueness key is `<taxonomyId>:<slug>` while it is live and `<taxonomyId>:~<id>` once retired. The slug stays reserved by the slug guards (a retired term's own slug unless it was merged — the target's `slugHistory` holds it then — and every `slugHistory`); this is what lets `reclaim` reuse a merged or retired slug.
- **Retire never breaks invariant 2.** If a review or published entry would lose the primary term of a required taxonomy, `retireTerm` (and `reviewTerm({reject})`) refuses with `required_term` and lists the entries; merge instead, or reassign them first. Children of a retired term move up to its parent; terms merged into it follow `redirectTo` (or lose `mergedInto` without one). Without `redirectTo`, a hierarchical taxonomy redirects to a public, active parent.
- **Merge details.** Children of a source move under the target; merging into a descendant of a source is refused (`cycle`), and a move that would exceed depth 5 is refused (`too_deep`). Names from locales the target has no label for join its default-locale `altNames`; a name that would collide with another live term (invariant 12) is dropped rather than failing the merge. `altNames` and `slugHistory` keep at most 50 values (the oldest go).
- **Redirects only for URLs that existed.** Rename, merge and retire write an archive redirect only when the term was active and public and its taxonomy's archive is enabled; otherwise they only re-point redirects that targeted its path. Becoming public (`setTermVisibility`, `reviewTerm({approve})`) and `reclaim` delete redirects from the archive path. Moving an enabled `archive.basePath` (`updateTaxonomy`) leaves one prefix redirect (`slug-change`, no source).
- **Entries and pages.** A slug (or collection) change redirects only for an entry published before, in the site's default locale, staying in that locale; the same rule applies to page paths (answer 5). A published entry or page frees its path from a redirect (`from` = its path). An entry collection whose prefix overlaps an enabled archive base path is refused (invariant 13).
- **Deprecated `tags`.** Translated only when the site has a `tag` taxonomy; a site without taxonomies keeps `tags` until it is migrated. An agent's unknown tag becomes `proposed` under `propose`, `active` under `free`, and is refused under `none`; a person's becomes `active`.
- **Manual redirects.** `from` must not be served (a page in any locale, a published default-locale entry, the archive of an active public term). The target is collapsed through existing redirects, redirects pointing at `from` follow the new target, and a target that leads back to `from` is a loop. `updateRedirect` cannot change `from` (delete and create instead).
- **Assertion rows.** The `op_guards` statements compare `id || ':' || hash` against one JSON-array parameter (200 pairs per statement) instead of `VALUES` pairs; they also assert that deleted nodes are gone, that no entry still references a merged or retired term, and that no live term still has it as parent. That last pair is what makes "an entry write between the merge's read and its batch" fail the merge. Cycles under concurrent `setTermParent` are prevented by asserting the new parent's ancestors; the depth limit is checked at write time only. `createPage` is now an operation batch too (site CAS, archive-path-guarded insert, assertion).
- **API shapes.** `redirectFor` returns `{ redirect, location }` (the location includes the rest of a prefix match). `resolveTerms` returns `{ matched: true, termId, via }` or `{ matched: false, reason: "none" | "ambiguous", candidates, suggestions }`. `revertTagsToTerms` takes an optional `{ actor }`. `createSnapshot` takes `metadata`. Errors are `InvariantError` with a `code` (`too_large`, `required_term`, `slug_taken`, …) and `FilterError` with a `code` (`unknown_term` with suggestions, …).
- **Migration bookkeeping.** The migration id is the `before tags-to-terms` snapshot id. Snapshots carry `cloudhal.migration = 0002-tags`, `cloudhal.migration.phase` (`before` / `after` / `reverted`) and `cloudhal.migration.id`; created taxonomies and terms carry the same id, so a revert removes only what that run created. A run that finds a `before` without an `after` resumes it. When the migration creates the `tag` taxonomy, `maxPerEntry` is raised to the largest tag count (≤ 50); entries over an existing taxonomy's limit, or with tags of retired unmerged terms, are skipped and reported.
- **Renderer interim.** Until the renderer reads `terms` (step 5), `GraphSource` shows an entry's public tag slugs in the deprecated `tags` when it has none, so SEO keywords and RSS categories keep their output.

## Implementation notes (agent side, rollout step 4)
`packages/mcp-server` (`terms.ts`, `taxonomy-tools.ts`, `common.ts`) and `packages/agent-runtime/src/taxonomy.ts`; tests in `packages/mcp-server/test/taxonomy.test.ts`.

- **Assignment input.** For each taxonomy, `set` replaces the list, then `add` and `remove` apply. `primary` adds its term when missing; removing the primary term clears it. Every value of every taxonomy is resolved before anything is written, so one error lists all unknown (`unknown_term`) or ambiguous (`ambiguous_term`) values, each with suggestions and the next step (`propose_term`, or "only a person adds a category" under `none`). The deprecated `tags` is an alias for `terms.tag.add` only on sites with a `tag` taxonomy. A site that has not been migrated keeps plain `tags`. This keeps "never create implicitly" on the agent path; the store's own `tags` translation (§4.4) still serves other clients.
- **Agent-layer rules run before approval.** Who may create terms, external redirect targets, `reclaim` (people only) and approving one's own proposal are checked by a tool `precheck` after the scope check and before anyone is asked. A call that cannot succeed never waits for a person, and the refusal is audited as `deny`. `propose_term` returns an existing match (by name, slug or synonym, any rule of §6.3) even under `none`, since nothing is created. It records the reason in `metadata["cloudhal.reason"]`, which Studio and `taxonomy_report` show.
- **Error codes.** `InvariantError` codes pass through as `ToolError` codes (`required_term`, `too_many_terms`, `slug_taken`, …) with the next step appended. `FilterError` becomes `unknown_term`, `unknown_taxonomy` or `invalid_filter` (the message repeats the grammar), and a duplicate article slug becomes `conflict`. The mapping is central in `runTool`, so every tool gets it.
- **Prompts.** Governance prompts predict the redirects from the current state: new ones, re-pointed ones (no chains) and ones removed because their path is served again. The approval is bound to that state (ADR-0014), so the prediction is what runs. `update_entry` also has a prompt (manual mode) with the same deltas as `publish`.
- **One snapshot, one audit row.** Each mutating call takes exactly one snapshot. Governance snapshots carry `metadata["cloudhal.opId"]`. The audit table has no detail column, so the effect lands in the row's `input.effect`: `{operation: {opId, terms, entries, redirects}}` for governance, and `{terms: {<key>: {added, removed, primary}}}` (slugs) for entry writes. This needs no migration.
- **Deliberate deviations from §6.2.** `delete_redirect` is annotated `destructiveHint: true`, like the other deletes; the table only marks `retire_term`. Approval is required either way. `list_terms` defaults to `active` and `proposed` terms (pass `status` for retired ones) and pages with an offset cursor (100 per page, at most 200). Governance tools take term ids; `resolve_terms` turns names into ids.
- **`taxonomy_report` thresholds** are returned with the report:
  - near-duplicates: edit distance ≤ 2 and below half the shorter name, compared without hyphens; singular/plural forms; synonym collisions;
  - oversized categories: ≥ 50 % of the filed articles and ≥ 20 articles, without sub-categories;
  - at most 50 findings per kind (the counts are complete).

  It also reports archives without an intro text (recommended answer 6) and articles without a required primary term (answer 10).
- **Left for Studio.** `apps/studio/src/lib/activity.ts` `KNOWN_TOOLS` and the `tools.*` i18n keys do not name the new tools yet, so Activity shows their raw names.

- **Renderer interim.** Until the renderer reads `terms` (step 5), `GraphSource` shows an entry's public tag slugs in the deprecated `tags` when it has none, so SEO keywords and RSS categories keep their output. (Removed in step 5, below.)

## Implementation notes (renderer and starter, rollout step 5)
`@cloudhal/astro-renderer` holds the rules as pure, tested functions (`taxonomy.ts`, `archive.ts`, `routing.ts`, `seo.ts`, `feeds.ts`, `cache-tags.ts`); the blog starter only owns the routes and the markup (ADR-0009). Unit tests: `packages/astro-renderer/test/taxonomy-archive.test.ts`; end to end: `packages/cli/test/e2e.test.ts` (static build) and `cloudflare.test.ts` (Site Worker on workerd), over the shared fixture `packages/cli/test/taxonomy-fixture.ts`.

- **Terms, not tags.** The `withLegacyTags` shim is gone; sources return entries as stored. `entryTaxonomy(index, entry)` gives the shown terms (active + public only, names from the label in the locale, archive links), the section (the primary term of `category`, else of the first hierarchical taxonomy), its breadcrumb trail and the keywords. An entry without `terms.tag` keeps its deprecated `tags` as keywords (`article:tag`, JSON-LD `keywords`, RSS `<category>`), so un-migrated sites render as before. `GraphSource` gains `vocabulary(key?)` (every term in any status — routes need retired ones to answer 410) and `redirects()`.
- **Routes.** `resolveRoute(source, path, { perPage, search })` resolves page → entry → archive (`<basePath>/<slug>`, `/page/<n>`, `/rss.xml`) → redirect → 410 → 404, with the status rules of §7 in `archiveState`. Archives count entries with `entriesByTerm(key, termId, { descendants: hierarchical })`. Feeds are served for every served archive of a taxonomy with `feed: true`; a retired term's feed is 410 too. Page numbers must be canonical (`/page/02` is a 404).
- **Page size 20**, a starter constant (`ARCHIVE_PAGE_SIZE` in `starters/blog/src/theme.ts`), not the 10 §7 suggested. **Page 2+** drops the description, the intro and the JSON-LD altogether (not only the description), and gets the localized "Page n" title suffix.
- **JSON-LD.** Archives: `CollectionPage` (`about` → `DefinedTerm` in the taxonomy's `DefinedTermSet`, `mainEntity` → `ItemList` with absolute positions) and `BreadcrumbList` through the public ancestors. Posts: `articleSection` and `about` from the section, `keywords` as `DefinedTerm`s for public tags (a comma-separated string for legacy tags), and the breadcrumb `Home › ancestors › category › post`.
- **Sitemap.** `sitemapUrls(site, pages, entries, origin, archives)`, where `archives = archiveSummaries(index, publishedEntries)`; indexable archives only, page 1 only, `lastmod` = the later of the newest listed entry's `updatedAt` and the term's (as §7 says).
- **Redirects, SSR.** The Site Worker answers redirects from the route itself: a real 301/302 with `Location` = `redirectFor(path).location` plus the request's query string (merged before a fragment; a preview token is never forwarded to an external target). Non-200 answers stay `no-store` at the edge, so redirects follow publishes without a purge of their own.
- **Redirects, static builds.** Astro cannot answer a prerendered path with a status code. `staticPaths()` lists every redirect `from`, `…/page/1`, and for prefix redirects the old twin of each served path under the target (`/tag/old/page/2`); Astro writes those as meta-refresh pages with `rel=canonical` and `noindex`. The integration's `astro:build:done` also writes `dist/_redirects` (exact lines first, then `from` + `from/*` splats, longest prefix first), which Cloudflare Workers/Pages static assets and Netlify turn into real 301s — including feeds, which get no meta-refresh page (HTML cannot stand in for XML). A 410 cannot be expressed in a static build: retired and other 404 archives are simply not built.
- **Cache tags.** Next to `cloudhal-site-<siteId>`, responses carry `cloudhal-node-<id>` for the page or entry they render and the entries an archive lists, and `cloudhal-term-<id>` for the archive's term, its ancestors, the terms an entry shows and the header categories (names differ from §7's `n:<id>`). Publish and rollback still purge everything; `POST /__cloudhal/purge` additionally accepts `{ "tags": [...] }` (Cloudhal tags only) for a targeted purge, which the admin Worker does not use yet — purging by the old/new snapshot diff (§7) is left to a follow-up (done since: see the follow-up notes below).
- **Starter.** Archives show the term name, kind, post count, feed link, and on page 1 the image and the markdown intro (safe renderer); pagination uses real `<a rel="prev|next">` links. Posts show category and tag chips (`rel="tag"`), a breadcrumb through the primary category and up to `RELATED_POSTS = 3` related posts (`relatedEntries`: primary category 2 points, every other shared term or legacy tag 1, published and same locale only). `NAV_CATEGORIES = true` appends served top-level categories to the header by `position`; set it to `false` for a pages-only menu. A `ContentList` section with a `filter` lists `entriesByFilter("collection:<c>+<filter>")`; an invalid filter in a published snapshot renders an empty list and logs.
- **Dev parity.** `staticPaths()` counts the entries the source shows, so `cloudhal dev` (live, drafts included) routes the same archives `resolveRoute` serves. Proposed and internal terms stay 404 even in a live preview.
- **`getSource` (Node)** caches one source per data directory, site and `CLOUDHAL_SOURCE`, so a second build in the same process renders its own snapshot. Astro itself still caches the prerender entry (and its `getStaticPaths` results) per process, which is why the e2e test runs its second build through the bin.

## Implementation notes (follow-ups after rollout step 6)
- **One hygiene report.** `taxonomyReport()` in core-ts is the only implementation; MCP `taxonomy_report` words its result (details with the next step, at most 50 findings per kind, complete counts) and Studio's "Vocabulary health" card renders it from the REST responses (taxonomies, terms with usage, every entry). The MCP-only checks moved into the core: `noIntro` (public, active terms whose archive is indexed — published entries in the sub-tree ≥ `minEntriesToIndex` — without an intro in the default locale), `missingPrimary` (required taxonomies) and the new `unfiled` (answer 10's nudge: entries without any term of a hierarchical taxonomy that is not required; MCP kind `unfiled`). Where the two differed, the core now follows the thresholds written above: empty categories count *published* entries in the sub-tree (their archive is a 404), oversized categories compare with the *filed* entries and skip categories with sub-categories, near-duplicates compare names without hyphens (`a-i` = `ai`), need fewer edits than half the shorter name and, unless identical, at least four characters (`ai` / `ui` stay apart); pairs are only compared under the same parent. `unused` is for flat taxonomies (categories report as empty). Near-duplicates name the term to merge away first (`source`, `target`). `packages/api/test/taxonomy-report-parity.test.ts` triggers every finding kind on three taxonomies and checks that both surfaces report the same findings.
- **Targeted purge.** `SiteGraphStore.onPublished(site, { from, to })` now says where the pointer moved, and `planCachePurge` (`cache-purge.ts`) turns the diff of the two snapshots into tags; the admin Worker sends them through `purgeSiteCache` (`@cloudhal/cloudflare/purge`) in batches of 100 — Cloudflare's tag limit per purge request, with Workers Cache always on the Free-tier rate limit (5 requests per minute, bursts of 25) — and purges everything above three batches, without a previous snapshot, when a snapshot or node cannot be read (or reading would take more than 2,000 node reads), or when a tag purge fails. A fourth tag kind joins the three above: `cloudhal-list-<termId>` on a term's archive pages and feed and `cloudhal-list-<siteId>` on the site feed, the sitemap and pages with a `ContentList` — a new or re-filed entry changes these lists without changing any node they carry a tag for (and cached 404s do not exist: non-200s are `no-store`). Entry pages also carry the node tags of their related posts. The rules: an entry → its node tag, the site's list tag and the list tags of every term it was or is filed under with their ancestors; a public term's text (names, intro, image, SEO) → its term tag and its ancestors', plus the site's list tag (sitemap `lastmod`, feed categories); the site tag for any page, taxonomy or redirect change, a site-node change other than the publish pointer, a public term added, removed, renamed, moved, re-ordered, retired or made internal, and an entry change that gives a top-level category of a hierarchical taxonomy its first, or takes its last, published default-locale entry (the header menu on every page). Terms public in neither snapshot change nothing. Known limit: an article's related posts on *other* articles are refreshed only when those articles are purged; a new article can therefore take a while to appear there (links never break: a removed or retitled article purges every page that links it). `notifyPublished(site, previous)` (push `--replace`) plans the same way. Tested on workerd against a model of the edge cache (`cloudflare.test.ts`): editing one article purges it, its archives (all pages and the feed), the home page, the site feed and the sitemap, while `/about`, other articles and other archives stay cached; a page edit purges the site.
- **Studio: taxonomy settings.** "New taxonomy" and each taxonomy's settings are one dialog (`TaxonomySettingsDialog`, DESIGN.md §2p) over the existing REST routes (`POST` / `PUT /api/sites/:siteId/taxonomies`). It validates what core-ts would refuse before sending: the key (Slug pattern, unique, the filter grammar's reserved words imported from `@cloudhal/core-ts/filter`, immutable once created), labels in the default locale (other locales in pairs), the archive base path against invariant 13 (root, other taxonomies, pages under an enabled archive, collection prefixes), the per-article maximum and the indexing threshold ranges, and — when editing — turning a tree flat while terms have parents or choosing "people only" while proposals wait. Moving an enabled archive shows the prefix redirect `updateTaxonomy` leaves and the redirects that follow it; switching archives off warns that their addresses answer 404 (no redirect), and the feed switch needs archives. One save, one snapshot, as before.
- **Studio: term archive preview.** The term editor now has the editors' preview column; unlike page and article previews it renders the unsaved draft. `renderArchivePreview` (`@cloudhal/astro-renderer/preview`) mirrors the starter's archive markup and `archiveHead`, renders whatever the archive's state, and reports `archiveState` with a reason (`indexed`, `thin`, `noindex`, `empty`, `proposed`, `internal`, `retired`, `archiveOff`), shown next to the preview title. `GET /api/sites/:siteId/terms/:termId/preview` serves the saved version (sandboxed like the others); `POST` takes only the presentation fields (labels, image — never slug, status, visibility or parent) and answers `{ html, archive }`. Studio swaps that HTML into the same `sandbox=""` frame through `srcdoc`, so every preview document now repeats the preview CSP in a meta tag.
