# RFC-0045: Collections stage 4: reference fields and repeaters

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-11-10
- Related:
  - [#114](https://github.com/cloudhal-dev/cloudhal/issues/114) (this stage); #71 (the collections plan).
  - RFC-0040 / ADR-0042 (the registry), RFC-0041 / ADR-0043 (typed fields, field operations), RFC-0042 / ADR-0044 (§2 presets, §4 listings and `entry_list_values`, §6 "out: stage 4").
  - RFC-0004 §4.4 (`asset_refs`, the model for the reverse index), RFC-0008 §6.2 and §7 (holds, gates, the gate index), RFC-0010 (snapshot bundles), RFC-0015 / ADR-0030 (the props subset), RFC-0033 / ADR-0035 (one node per locale, translation groups, `localization.fallback`), RFC-0034 (language editions), RFC-0039 / ADR-0041 (archives).
  - Prior art (checked 2026-11-10; "unverified" where a primary page could not be read):
    - [Sanity reference type](https://www.sanity.io/docs/studio/reference-type): a strong reference (the default) blocks deleting its target and blocks publishing until the target is published; `weak: true` may point at missing or draft documents and dereferences to `null`. `to` is a static list of types; `filter` narrows the picker only and "does not guarantee" the target keeps matching.
    - [Payload relationship field](https://payloadcms.com/docs/fields/relationship): `relationTo` one or several collections (polymorphic values become `{relationTo, value}`), `hasMany`, `minRows`/`maxRows`, `filterOptions`, per-field `maxDepth` for population; reverse lookups need a separate Join field.
    - Contentful links: resolution up to 10 `include` levels and unresolvable links reported separately (unverified: the concepts page answered 429).
    - Strict structured output: [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) (types plus `anyOf`, no `allOf`/`not`/`if`; "Root objects must not be `anyOf`"; every property required, optional as a `null` union; up to 5,000 properties, 10 levels of nesting, 1,000 enum values; recursion allowed; `oneOf` not mentioned). [Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (`anyOf`, `$defs`/`$ref` without recursion; no `minimum`/`maximum`/`minLength`/`maxLength`; `minItems` only 0 or 1; across a request at most 20 strict tools, 24 optional parameters and 16 parameters with union types, `anyOf` or type arrays).

## Summary

Two new field types join RFC-0041's nine. A `reference` field points to entries of one to five declared collections of the same site, one or up to fifty, and stores bare entry ids, like an `image` field stores asset ids. A `repeater` field is an ordered list of up to fifty items of up to ten flat sub-fields. A repeater cannot contain a repeater, so every agent-facing schema has a fixed depth and no recursion.

References are strong. A reverse index, `entry_refs`, is written in each entry's own batch, anchored on its new content hash like `asset_refs`. It refuses to delete a referenced entry, and refuses to move one out of the collections its referrers allow. Archiving or unpublishing a target is allowed: the renderer resolves references only against what the published snapshot shows, so a dangling reference renders as nothing and publish warns but never fails. A reference names the target's translation group and resolves to the version in the page's language. Resolution is breadth-first over in-memory snapshot indexes, at most two levels deep, under a budget per page. Studio gets an entry picker and nested repeater forms from new `@cloudhal/ui` blocks, and the four field operations learn the new types.

## Motivation

- **Today:**
  - An event's venue, a talk's speakers or a product's brand are typed as plain text (RFC-0042 §6: `organizer`, `performer` and `brand` "map from text"). The same venue is retyped on every event. Its address, map and page are not linked, and a change to the venue's name does not reach the events.
  - A recipe's ingredients, an agenda's sessions or a job's benefits are multiline text, one item per line (RFC-0042 §2's `recipeIngredient`). There is no second column: an ingredient's quantity, a session's speaker.
  - Agents write these as free text, which no theme, listing or JSON-LD preset can read back.
- **Who:** the collections #71 names (events with venues and speakers, team and projects, products and brands, docs and related docs, locations), the themes that render them, and the agents that fill them.
- **Why now:** stages 1–3 shipped (RFC-0040 to RFC-0042, released through 0.7.0). Every competitor in RFC-0041's prior art has references and lists of groups. RFC-0042's preset table already names the paths references fill (`location` as a `Place`, `performer`, `organizer`).

## Proposal

### 1. Contract

All additions are optional variants and `$defs` in `site.schema.json`. `content-entry.schema.json` changes only its `fields` description. No `schemaVersion` bump, no new root type.

```jsonc
// site.schema.json $defs.FieldDefinition.oneOf (line 274): two variants appended after SelectField (line 542)
{
  "title": "ReferenceField",
  "type": "object",
  "description": "RFC-0045: entries of other (or this) collections of the same site, by the id of their translation group's original (entry_…).",
  "additionalProperties": false,
  "required": ["key", "type", "labels", "localized", "collections"],
  "properties": {
    "key": { "$ref": "#/$defs/FieldKey" },
    "type": { "type": "string", "enum": ["reference"] },
    "labels": { "$ref": "#/$defs/FieldLabels" },
    "localized": { "type": "boolean", "description": "true: each language version picks its own targets; false: only the translation group's original holds them, and every version resolves them in its own language." },
    "requiredToPublish": { "type": "boolean", "description": "An entry in review or published needs at least one target. Absent: false." },
    "migration": { "$ref": "#/$defs/FieldMigration" },
    "collections": {
      "type": "array",
      "description": "The collections a target may belong to: declared collections of this site (checked in code).",
      "minItems": 1, "maxItems": 5, "uniqueItems": true,
      "items": { "$ref": "common.schema.json#/$defs/Slug" }
    },
    "multiple": { "type": "boolean", "description": "The value is an ordered list of targets. Absent: false." },
    "maxItems": { "type": "integer", "minimum": 1, "maximum": 50, "description": "With multiple: at most this many targets. Absent: 20." },
    "where": {
      "type": "array",
      "description": "Only with one target collection: conditions on its list fields that a newly chosen target must meet (no `now`; checked in code). Narrows the picker; not re-checked when the target changes later.",
      "minItems": 1, "maxItems": 4,
      "items": { "$ref": "common.schema.json#/$defs/FieldCondition" }
    }
  }
},
{
  "title": "RepeaterField",
  "type": "object",
  "description": "RFC-0045: an ordered list of items, each a flat object of sub-fields. A repeater cannot contain a repeater.",
  "additionalProperties": false,
  "required": ["key", "type", "labels", "localized", "fields"],
  "properties": {
    "key": { "$ref": "#/$defs/FieldKey" },
    "type": { "type": "string", "enum": ["repeater"] },
    "labels": { "$ref": "#/$defs/FieldLabels" },
    "localized": { "type": "boolean", "description": "true: each language version has its own list (missing reads the original's); false: only the original holds the list." },
    "requiredToPublish": { "type": "boolean", "description": "An entry in review or published needs at least one item. Absent: false." },
    "migration": { "$ref": "#/$defs/FieldMigration" },
    "fields": {
      "type": "array",
      "description": "The sub-fields of every item, in form order. Unique keys (checked in code).",
      "minItems": 1, "maxItems": 10,
      "items": { "$ref": "#/$defs/SubFieldDefinition" }
    },
    "maxItems": { "type": "integer", "minimum": 1, "maximum": 50, "description": "At most this many items. Absent: 20." },
    "itemLabel": { "$ref": "#/$defs/FieldKey", "description": "The text, select or reference sub-field that names an item in Studio and approval prompts. Absent: the first such sub-field." }
  }
}

// site.schema.json $defs (new). Every variant: key, type, labels, then its own; no localized, no migration (the repeater's apply).
"SubFieldDefinition": {
  "description": "RFC-0045: one sub-field of a repeater item, discriminated by `type`. Only types whose value is a scalar: no datetime, no multiple select or reference, no repeater.",
  "oneOf": [
    { "title": "TextSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["text"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" }, "maxLength": { "type": "integer", "minimum": 1, "maximum": 5000 }, "multiline": { "type": "boolean" } } },
    { "title": "RichTextSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["richText"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" } } },
    { "title": "NumberSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["number"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" }, "integer": { "type": "boolean" }, "minimum": { "type": "number" }, "maximum": { "type": "number" } } },
    { "title": "BooleanSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["boolean"] }, "labels": { "$ref": "#/$defs/FieldLabels" } } },
    { "title": "DateSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["date"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" } } },
    { "title": "UrlSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["url"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" } } },
    { "title": "ImageSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["image"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" } } },
    { "title": "SelectSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels", "options"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["select"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" },
                      "options": { "type": "array", "minItems": 1, "maxItems": 50, "items": { "$ref": "#/$defs/FieldOption" } } } },
    { "title": "ReferenceSubField", "type": "object", "additionalProperties": false, "required": ["key", "type", "labels", "collections"],
      "properties": { "key": { "$ref": "#/$defs/FieldKey" }, "type": { "type": "string", "enum": ["reference"] }, "labels": { "$ref": "#/$defs/FieldLabels" },
                      "requiredToPublish": { "type": "boolean" },
                      "collections": { "type": "array", "minItems": 1, "maxItems": 5, "uniqueItems": true, "items": { "$ref": "common.schema.json#/$defs/Slug" } } } }
  ]
}

// site.schema.json $defs.FieldMigration (line 641), changed
"properties": {
  "id": { … unchanged },
  "fromKey": { … unchanged },
  "fromType": { "type": "string", "enum": ["text", "richText", "number", "boolean", "date", "datetime", "url", "image", "select",
-   ] },
+   "reference", "repeater"] },
  "fromLocalized": { … unchanged },
+ "sub": { "$ref": "#/$defs/FieldKey", "description": "RFC-0045: the repeater's sub-field the operation rewrites (its key once the operation is done); fromKey and fromType then describe the sub-field." }
}

// content-entry.schema.json properties.fields.description (line 38), changed
- "… otherwise any JSON. An absent key means no value."
+ "… otherwise any JSON. An absent key means no value. A reference value is an entry id or a list of them, a repeater value a list of flat objects (RFC-0045)."
```

- **Values:**

  | Type | Value | Checked on write |
  |---|---|---|
  | `reference` | `"entry_…"`, or with `multiple` a list of them, no repeats, ≤ `maxItems` | each id is an entry of this site in one of `collections`, is its translation group's original in this site (a same-site translation's id is canonicalized to the original's, as `canonicalImageRefs` does for assets), is not the entry itself, and meets `where`; checked for changed keys only (RFC-0041 §3) |
  | `repeater` | a list of ≤ `maxItems` objects; each holds only sub-field keys, with RFC-0041 §2's values for its type; no empty item | each item against the sub-fields; `requiredToPublish` sub-fields need a value in every item of an entry in review or published |

- **Why these shapes.**
  - A bare id (not `{collection, id}`, as Payload's polymorphic values) keeps a reference what an image field already is. The id names its node and so its collection, and the store re-checks the collection on every write.
  - Repeater items are flat objects of scalars, which is exactly ADR-0030's `ArrayPropSchema` with `FlatObjectPropSchema` items (`packages/core-ts/src/blocks.ts:55-68`). `fieldPropSchema` compiles a repeater into the subset, and `validateProps` checks it unchanged, eval-free (rule 6).
  - Excluded from sub-fields: `datetime` (an object) and multiple selects and references (arrays). These would need a second nesting level in the subset (open question 3).
  - `maxItems` ≤ 50 is `BLOCK_LIMITS.arrayItems` (`blocks.ts:113`).
- **Code rules beyond the schema** (`checkFieldDefinitions`, `definitions.ts:177`):
  - every `collections` entry is a declared or inferred collection (`reference_target_unknown`);
  - `where` only with one target collection, on its `listFields`, without `now` (`invalid_query`);
  - `maxItems` only with `multiple`;
  - sub-field keys unique in their repeater and not reserved, with the same list as fields;
  - `itemLabel` names a text, select or reference sub-field;
  - at most 100 *leaves* per collection (fields plus sub-fields);
  - sub-fields count toward the per-site 200 (`FIELD_LIMITS`, `types.ts:32`);
  - at most 100 reference values per entry across fields and items (`too_many_references`).
- **Adding a reference or repeater field is a free edit**, except over a key some entry already holds (`field_key_in_use`, one `json_type` count). This guarantees that every reference value in the working graph was written through §2's checks and has its index rows.
- **Rule 2 holds:**
  - `oneOf` with inline variants and the one-value `type` discriminator (ADR-0043);
  - no `default`;
  - `additionalProperties: false` everywhere;
  - cross-file `$ref` only to `common.schema.json#/$defs/*`;
  - no recursion: `SubFieldDefinition` has no repeater variant, so depth is fixed by the contract.
- **Generation impact:**
  - **TypeScript:** `FieldDefinition` gains `ReferenceField | RepeaterField`, and a new `SubFieldDefinition` union of nine `*SubField` interfaces. `FieldType` (`types.ts:7`) is derived from the contract, so every total dispatch table over it stops type-checking until it handles the two types (`COMPILE`, `props.ts:45`; `EMIT`, `json-schema.ts:49`). The compiler lists the work.
  - **Rust:** cargo-typify emits `#[serde(tag = "type", deny_unknown_fields)] enum FieldDefinition` with two more variants, a second tagged enum `SubFieldDefinition`, and the extended `fromType` enum. Values stay `serde_json::Value`.
  - **Naming:** the sub-field variants carry their own titles (`TextSubField`, not `TextField`). Both generators name types from `title`, and RFC-0042 §1 found that cargo-typify 0.8.0 keeps only the first of two equal names.
  - **Not run on this branch.** This is a docs-only PR, written while the owner's machine ran a test-heavy session. Phase 1 (§9) runs `contract-change` first, with these fixtures:
    - `valid/site/collection-stage4.json`: an `events` collection with `venue` (reference to `places`), `speakers` (repeater with a reference, a select and a text sub-field) and a migration marker with `sub`;
    - `invalid/site/`:
      - reference without `collections`;
      - six target collections;
      - `maxItems` 51;
      - a repeater sub-field of type `repeater`;
      - one of type `datetime`;
      - a sub-field with `localized`;
      - eleven sub-fields;
      - `fromType` `blocks`.

### 2. Cross-node integrity: the reverse index

```sql
-- packages/storage/migrations/0033_entry_refs.ts (new; DDL only, nothing to backfill: no reference values exist yet)
CREATE TABLE entry_refs (
  site_id TEXT NOT NULL,
  target_id TEXT NOT NULL,          -- the referenced entry: its group's original in this site
  source_id TEXT NOT NULL,          -- the referring entry node (any locale)
  source_collection TEXT NOT NULL,
  field TEXT NOT NULL,              -- "venue", or "speakers.person" inside a repeater
  source_status TEXT NOT NULL,      -- the referrer's status, for "used by published entries"
  PRIMARY KEY (source_id, field, target_id)
);
CREATE INDEX entry_refs_target ON entry_refs (site_id, target_id, source_status);
```

Each statement below follows a pattern that already exists. The rows of an entry are `asset_refs`'s fields rows (`store/entry-fields.ts:119-144`) with another table.

1. **Writing a referrer** (`EntryEngine.write`, `store/entries.ts:30`). `planEntryFields` returns two more parts.
   - A **guard**, ANDed into the entry's CAS (`entries.ts:104`): every target exists, in this site, is a `contentEntry`, and is in the field's allowed collections at write time. It is one count over a JSON list of `{t: id, c: [collections]}` pairs, like the asset guard (`entry-fields.ts:163`):
     ```sql
     (SELECT count(*) FROM json_each(?) p JOIN nodes n ON n.id = json_extract(p.value, '$.t')
       WHERE n.site_id = ? AND n.kind = 'contentEntry'
         AND json_extract(n.body, '$.collection') IN (SELECT value FROM json_each(json_extract(p.value, '$.c')))) = ?
     ```
   - **Statements** anchored on the entry's new hash: `DELETE FROM entry_refs WHERE source_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)`, then one `INSERT … SELECT … FROM json_each(?) WHERE <same anchor>`. They run only if the entry's own write did (rule 4), and are appended to `own` in `entries.ts:110`.

   A target deleted or moved between the check and the batch fails the guard; `diagnose()` then names it (`unknown_entry`, `reference_target_moved`). One bound parameter carries the whole list, so D1's 100-parameter limit does not apply. 100 ids of at most 48 characters stay far below its 100 KB per statement.
2. **Deleting a target** (`EntryEngine.delete`, `entries.ts:162`). The node's `DELETE` gains `AND NOT EXISTS (SELECT 1 FROM entry_refs WHERE target_id = ? AND source_id <> ?)`, as an asset's delete guards on `asset_refs` (`assets.ts:867`). A refused delete answers `409 entry_referenced`, with up to 20 referrers (id, title, collection, field) and the total.
   - Only a group's original can be a target, so deleting a translation is never blocked.
   - The referrer's own rows go with its delete: `DELETE FROM entry_refs WHERE source_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = ?)`, as `dropRefsStatement` (`assets.ts:1015`).
3. **Moving a target to another collection** (`entersCollection`, `entries.ts:101`). The write computes, from the site node it read, every `"<collection>.<field>"` pair whose allowed collections include the new one. It is guarded with:
   - `NOT EXISTS (SELECT 1 FROM entry_refs WHERE target_id = ? AND source_collection || '.' || field NOT IN (SELECT value FROM json_each(?)))`;
   - the site's hash as read (`EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)`), so a concurrent change to the definitions cannot slip between.

   Refused: `409 reference_target_moved`, naming the referring fields. During a field operation, the pairs include the marker's `fromKey` as well as the new key.
4. **Archiving and unpublishing a target** are allowed and write nothing to `entry_refs`. An archived target stays pickable for existing values only. The picker hides archived entries, and the write check refuses a *newly* chosen archived target (`retired`-asset rule, `assets.ts` `planRefs`).
5. **Rebuilds** follow `refsRebuild` (`media/refs-rebuild.ts:12`) in the same batch as the node set: `importSite`/`pull`/`push` (`sync-plan.ts:308`), `cloudhal import --replace` and `--revert`, and snapshot restores. `entryRefsRebuild(siteId, rows)` chunks its `INSERT` so each statement stays below 90 KB, still inside the one atomic batch. `asset_refs`'s rebuild needs the same chunking, which is a separate fix (follow-ups).
6. **Field definition changes** (`fieldDefinitionChanges`, `definitions.ts:135`) add these refusals:
   - removing a collection from `collections` while a value points into it (an `entry_refs` join count);
   - turning `multiple` off;
   - removing or retyping a sub-field that holds values.

   Each refusal names the operation to use (§7).

**Invariant.** The store never *creates* a dangling reference: deleting a target, moving it, and writing a reference to a missing target are all guarded in the same batch. Dangling references can still *exist*:
- in archives and bundles written by hand or by another version;
- in publish snapshots composed with holds, which leave out a held node that is not live (`store/snapshots.ts:29-37`);
- after a release applies `nodes(L) − ids + targets`.

Every reader therefore treats a missing target as unresolved and never throws.

**Snapshots, publish and rollback:**

- **A snapshot is the whole working copy at one read** (`snapshots.ts:23`), so referrers and targets are taken together. Rollback moves the pointer to an ancestor snapshot (`store.ts:1127`), which is just as consistent. Restores and `import --revert` rebuild the index (point 5).
- **Visibility decides, not existence.** A snapshot holds drafts and archived entries too, so the renderer resolves only against entries the snapshot *shows* at that instant: `Loaded.reachable` (`astro-renderer/src/source.ts:147`): published, gates open, not `hide`-expired.
  - An `unlist`ed target (RFC-0042 §3) still resolves: its page exists.
  - A draft, archived, gated or missing target resolves to nothing. `EntryFields.astro` then shows the field only if other targets remain.
- **Publish warns, never fails.** `referenceIssues(snapshotNodes)` (pure, `@cloudhal/core-ts/fields`) lists published entries whose references will not resolve: target missing, draft, archived, gated, or no version in a needed locale. It appears in:
  - Studio's publish dialog ("3 published entries point to entries that are not published");
  - the MCP `publish` tool's approval text;
  - the output of `cloudhal snapshot --publish`.

  A build or publish never fails on it, for the same reason as RFC-0042 §4: "a published snapshot must keep rendering". Sanity's strong references block publishing per document, but Cloudhal publishes a site snapshot. A warning keeps a person in charge without making an unrelated fix wait for a venue page.
- **The gate index already covers targets.** It holds every instant at which a published entry's gate changes (`source.ts` `Loaded.gates`), so a referrer's page expires from the edge cache when its target's embargo opens or its `hide` expiry passes, with no new mechanism.
- **Purges.** A referrer's response adds `cloudhal-node-<targetId>` for every target it rendered, as it already does for "the related entries an article links to" (`astro-renderer/src/cache-tags.ts:6-8`). A publish that changes a target's title therefore purges its referrers' pages. The per-page budget (§4) keeps the tags far below the 8 KB header cap.

**Archives (RFC-0039).**
- An archive holds every node of the site, so references stay complete. Import rebuilds the index in its node batch.
- Dangling references are reported, not refused, as RFC-0041 open question 8 decided for invalid values: `cloudhal import --dry-run` adds `referenceIssues` per collection, and Studio lists them on the collection screen.
- Language editions (RFC-0034) never share ids across sites (§3).

### 3. The locale rule

**A reference names a translation group, not an entry-locale.** The stored id is the group's original in this site (§1). Resolution then picks the group member in the page's language:

1. the member of group `G` with `locale === page locale` that the snapshot shows;
2. otherwise, when `Site.localization.fallback` is `default-with-notice` (RFC-0033 §2), the member in the site's default locale, flagged `fromFallbackLocale`, so themes can set `lang` on it;
3. otherwise, nothing.

The same rule serves all three readers: the renderer, Studio's preview of a translation, and `referenceIssues`, which reports "Main hall has no Turkish version".

- **`localized: false` is the default** that Studio pre-sets for references. The original holds the ids, and every translation resolves them in its own language (RFC-0041 §5). A translator never re-picks targets, and a venue's Turkish version appears on the Turkish event without any write.
- **`localized: true`** is for real per-language differences, such as a regional partner. Each version holds its own ids, still group ids, and an empty value falls back to the original's (`fromOriginal`).
- **Repeaters are localized as a whole.** With `localized: true`, each version has its own list, and the original's is read while its own is absent. With `localized: false`, the list lives on the original only. Text sub-fields then show the original's words on every version, and Studio says so ("Not translated: this list is shared by every language").
  - Per-sub-field localization inside a shared list would need stable item keys. It is open question 2.
- **Machine translation:**
  - `get_translation_source` returns a localized repeater's `text`/`richText` sub-values at their paths (`speakers/1/talk`);
  - `save_translation` writes them back only if the list has the original's length (`translation_shape_mismatch` otherwise), copying the other sub-values;
  - reference values are never sent for translation.
- **Language editions** (an original in another site of the project). Non-localized values are copied when the edition is made (RFC-0041 §5). Each referenced id is mapped to the edition site's member of the same translation group. Ids with no such member are dropped, and the result reports them ("2 references not carried: Main hall has no edition in site B yet"). A reference never crosses sites.

### 4. Render cost

`resolveFields` (`fields/resolve.ts:68`) stays pure. A reference resolves to its id or ids, and a repeater to its items, each sub-value checked as a field is (an invalid one is `undefined` with an issue). Loading targets is the renderer's job, in `entryFields` (`astro-renderer/src/fields.ts:172`).

```ts
// @cloudhal/astro-renderer (additive)
export interface ReferencedEntry {
  id: string; groupId: string; collection: string; locale: string; slug: string;
  title: string; summary?: string; url: string; image?: FieldImage;   // the target's cover image
  fromFallbackLocale: boolean;
  /** Present only when depth 2 was asked for: the target's own fields, its references as cards without fields. */
  fields?: RenderedFields;
}
interface RenderedField {                  // existing interface, two optional additions
  references?: ReferencedEntry[];          // reference: resolved targets, in stored order (unresolved ones left out)
  items?: RenderedFields[];                // repeater: each item's sub-fields, rendered like fields
}
interface EntryFieldsOptions { /* existing */ depth?: 1 | 2; }   // default 1
interface GraphSource {
  /** Visible entries by group id in one locale (one call per resolution level). */
  entriesByGroups?(groupIds: readonly string[], locale: string): Promise<Map<string, ContentEntry>>;
  /** "Who references me": visible referrers of a group, newest first, at most 100. */
  referencedBy?(groupId: string, q?: { collection?: string; field?: string; locale?: string; limit?: number }): Promise<ContentEntry[]>;
}
```

- **Depth: 1 by default, 2 at most.** Depth 1 yields cards: title, summary, URL and cover image, which is what a venue link or a speaker list draws. Depth 2 adds each target's own fields, with *its* references as cards without fields. Nothing goes deeper, so cycles (A→B→A) cost nothing: resolution is breadth-first over a visited set of group ids. Payload's per-field `maxDepth` and Contentful's `include` levels are the same idea.
- **Fan-out:**
  - by contract: 50 per field and 50 items per repeater;
  - in code: 100 reference values per entry (§1);
  - per render: a page budget of **200 resolved targets**, shared by every `entryFields` call of one request (the `MediaContext.budget` object already carries per-request budgets).

  Over budget, remaining targets resolve to nothing with one `console.warn`, never an error. A listing of 20 events at depth 1 with one venue each costs 20.
- **Batching:**
  - **Snapshot source:** the loaded snapshot gains two indexes, built once per snapshot and isolate beside `assetIndex` (`source.ts:147`): `byGroup: Map<groupId, Map<locale, entry>>` over `reachable`, and a lazy reverse map for `referencedBy`. Every lookup is in memory, with no reads. Cards are cached per `(groupId, locale)` beside `Loaded.resolved` (the snapshot is immutable). Bundles (RFC-0010) need nothing new, because entries are already in them.
  - **Live source** (`cloudhal dev`, previews): one store read per level, `getContentEntriesByGroups(siteId, ids)` with a `json_each` IN list, plus one `entry_refs` probe for `referencedBy`. A depth-2 page therefore costs at most two reads, whatever its fan-out.
- **Listings** (RFC-0042 §4):
  - **Filter by a reference: yes.** A `reference` field may be a list field, with ops `eq`, `ne`, `in`, `set` and `unset` on target ids. It serves "events at this venue" and "talks by this speaker". Its `entry_list_values` rows put the id in `text` (an id is at most 48 characters, under the 100-unit limit). A multiple reference writes one row per id with `has = 2`, exactly like a multiple select's options (migration 0029's doc comment). `checkFieldQuery` and the property suite gain the type.
  - **Sort by a reference, or filter by a referenced entry's field** ("events whose venue is in Istanbul"): **no.** Either needs the target's values denormalized into the referrer's rows, which every target edit would invalidate across collections. Agents and themes do it in two steps: `queryEntries` on `places` for `city eq istanbul`, then `venue in [...]` (≤ 20 values).
  - **Repeaters** cannot be list fields (`list_field_type`).
  - **Theme-side "used by"** is `referencedBy`, not a query on the referring collection, so no list field is needed for it.
- **Structured data** (RFC-0042 §2), phase 7: a fifth source kind, `{ "kind": "reference", "field": "venue", "property": "title" | "url" | "summary" }`. It fills `location.name`, `performer.name`, `organizer.name`/`url` and `brand.name` from a depth-1 card. It is a new `StructuredDataSource` variant with its own named `property` enum, `ReferenceValueProperty`, as §1 of that RFC requires for Rust.

### 5. Studio

All new UI follows `kumo-design`, `studio-ui` and DESIGN.md "Fields", imports only from `@cloudhal/ui`, and puts its words in the lazy `fields` namespace.

**New blocks in `packages/ui/src/blocks`:**

| Block | Built from (Kumo) | What it does |
|---|---|---|
| `EntryPicker` | `Dialog`, `Input` (search), `Combobox` list semantics, `Badge`, `Checkbox`, `Empty`, `Loader` | Search a site's entries in the allowed collections: title, collection badge, status badge, locale. Single or multiple choice, at most the remaining `maxItems`. Takes a `search(q)` prop, so the block makes no API calls. |
| `ReferenceList` | `InsetPanel` rows (existing block), `Button`, `Badge`, `DropdownMenu`, `Link` | The chosen targets in order: open, remove, move up/down. A "Draft" or "Archived" badge with "Will not show until published", and "Not found" for dangling ids. |
| `RepeaterField` | `Collapsible`, `Button`, `DropdownMenu`, `Text`, `Empty` | The list of items with "Add item", a count ("3 of 20") and per-item move/duplicate/remove. Each item renders the sub-field controls through a `renderControl` prop. |
| `FieldControl` | (extracted) | One control per type, taken out of `EntryFieldsForm.tsx`, which is already over the soft 400-line limit at 424 lines. `EntryFieldsForm` and `RepeaterField` then share it, and neither file grows. |
| `UsedByList` | `Table` or the `resource-list` Kumo block, `Badge`, `Link` | The entry editor's "Used by" card and the delete dialog's list of referrers. |

- **Entry editor.**
  - `EntryFieldsForm` gains a `renderReference?: (slot: FieldReferenceSlot) => ReactNode`, the same pattern as `renderImage` (`EntryFieldsForm.tsx:61-69, 97`). Studio's `FieldReference` (in `apps/studio/src/components/fields/`) composes `ReferenceList` and `EntryPicker` around `api.entries.pick`.
  - Repeaters render inside the form with `RepeaterField`.
  - On a translation, a non-localized reference or repeater is read-only, with "From the original" and a link (RFC-0041 §7). A localized one shows the original's value as a placeholder until edited.
  - A new "Used by" `SectionCard` lists referrers (`GET …/entries/:id/references`).
  - The delete dialog lists them too and disables Delete while any exist ("Remove it from these 4 entries first").
- **Fields builder** (`FieldDialog.tsx`):
  - **reference:** target collections (multi-select of declared collections), "Several" (`multiple`), the maximum, and optional conditions when one collection is chosen;
  - **repeater:** a nested sub-field list (rows like `FieldRow` with up/down and ⋯), the maximum and the item label;
  - the ⋯ menu's operations gain the sub-field forms (§7).
- **API** (site-scoped, under the existing `/sites/:siteId` membership check):
  - `GET /sites/:siteId/entries/pick?collections=a,b&q=&locale=&limit=` returns at most 20 `{id, title, collection, status, locale}` per page, never archived ones. Scope `content:read`. `q` is at most 100 characters, matched as a case-folded substring (`includes`, no regex: rule 13) on titles and slugs.
  - `GET /sites/:siteId/entries/:id/references` returns the referrers from `entry_refs`, paged.
- **Accessibility:**
  - Each repeater item is a `fieldset` whose `legend` is its item label ("Speaker 2: Ada Lovelace"), as an ICU `selectordinal`/`plural` message, never concatenated.
  - Moving is done with buttons ("Move Speaker 2 up"), never drag only.
  - After "Add item", focus moves to the new item's first control. After "Remove", it moves to the next item's legend, or to "Add item" when none is left. A removal shows an undo toast.
  - `EntryPicker` labels its search field, announces the result count in a polite live region, supports arrow keys and Enter in the list, and returns focus to the trigger on close.
  - Errors map to their controls by path (`fields/speakers/2/person`) and are listed above the form when they sit in collapsed items. Those items open on submit.
- **Mobile (390 px):**
  - item actions fold into one `DropdownMenu` (⋯);
  - sub-fields stack one per row;
  - `EntryPicker` takes the full width;
  - `ReferenceList` rows wrap the badges under the title.

  `pnpm design:shots` at 1440 and 390 must show no sideways scroll, and `design:lint` (including `rtl-logical`) must pass.
- **Bundle:** the blocks load with `EntryFieldsForm`, which loads only for collections with fields and is already lazy. The initial bundle stays at +0 kB (`bundle-budget.ts`).

### 6. MCP and the JSON Schema agents receive

- **Tools.**
  - `list_collections` returns the new definitions and their schemas.
  - `create_entry`/`update_entry` precheck the reference and repeater rules with the store's checker, so a call the store would refuse never reaches a person.
  - Approval prompts name targets readably: `venue → "Main hall" (entry_…, Places)`, `speakers: 2 items → 3 items (added "Ada Lovelace", Speaker)`, values quoted and truncated (`quote()`).
  - `delete_entry` refuses in precheck with `entry_referenced` and the referrers.
  - New read-only `list_references { siteId, entryId, direction: "to" | "from" }` (`content:read`): "who references me" and "what I reference", for an agent about to archive or delete.
  - `list_entries` keeps working as the agent's picker, with `where: [{field: "venue", op: "eq", value: "entry_…"}]` once the field is listed.
- **`update_collection`'s input** embeds the contract's `FieldDefinition` `oneOf` inside `fields.items` (`mcp-server/src/collection-fields.ts:13-31`). OpenAI's strict mode does not document `oneOf`, so the MCP input schema emits the same variants as **`anyOf`**. Every variant has a distinct one-value `type` enum, so at most one can match and `anyOf` means exactly what `oneOf` does. The contract itself keeps `oneOf` (rule 2).
- **`fieldsSchema`** (`fieldsJsonSchema`, `json-schema.ts:145`) emits:
  - `reference` as `{type: "string", pattern: "^entry_[A-Za-z0-9]{6,32}$"}`, or an array of them, with the target collections and `maxItems` in words;
  - `repeater` as `{type: "array", items: {type: "object", properties: …, additionalProperties: false}}`.

  The constraints of the emitted schemas:
  - the root is always `type: "object"`, never `oneOf` or `anyOf`;
  - no `$ref`, `$defs` or recursion: depth is at most 4 (fields → list → item → value), against OpenAI's 10;
  - no unions in the default output;
  - limits are in `description`, as today, because Anthropic drops `minimum`/`maxLength` and accepts `minItems` only as 0 or 1.

  `JSON_SCHEMA_KEYWORDS` (`json-schema.ts:29`) is unchanged, and the test holding the emitter to it stays.
- **A strict profile.** OpenAI's strict mode needs every property `required`, with optional ones as a `null` union. Today's output leaves properties optional, which suits Anthropic and non-strict MCP calls. `fieldsJsonSchema(defs, locale, defaultLocale, { strict: true })` therefore emits every property as required with `type: [T, "null"]`, plus `enum` with `null` for selects. `null` already means "leave unset or remove" in `update_entry`'s merge patch (`mcp-server/src/entry-fields.ts:45`), so the two profiles mean the same thing.
  - `list_collections` returns `fieldsSchemaStrict` and `strictCost: { properties, depth, enumValues, unions }` beside it, counted by `strictSchemaCost(schema)`.
  - Anthropic allows 16 union-typed parameters per request, so a collection with more than 16 leaves cannot be written in one strict Anthropic call, today included. The caller splits `update_entry` by keys, as RFC-0041 open question 3 decided. MCP tool calls themselves stay non-strict.
- **Example.** An `events` collection with `startsAt` (datetime), `venue` (a reference to `places`) and `speakers` (a repeater of `person` → `people`, `role` select, `talk` text):

  ```json
  {
    "type": "object",
    "description": "Typed custom fields of this collection. Every field is optional; leave a key out to leave it unset.",
    "properties": {
      "startsAt": {
        "type": "object",
        "properties": {
          "at": { "type": "string", "format": "date-time", "description": "The instant in UTC, RFC 3339 ending in Z, e.g. 2026-11-05T16:30:00Z." },
          "timeZone": { "type": "string", "description": "The IANA time zone it happens in, e.g. Europe/Istanbul." }
        },
        "required": ["at", "timeZone"], "additionalProperties": false,
        "title": "Starts", "description": "A date and time with its time zone. Set on the original only; translations read it from there."
      },
      "venue": {
        "type": "string", "pattern": "^entry_[A-Za-z0-9]{6,32}$",
        "title": "Venue",
        "description": "The id of an entry in Places (places) of this site, as list_entries returns it; a translation's id is replaced by its original's. Set on the original only; every language version shows the venue in its own language."
      },
      "speakers": {
        "type": "array",
        "title": "Speakers",
        "description": "An ordered list of at most 20 items. Set on the original only.",
        "items": {
          "type": "object",
          "properties": {
            "person": { "type": "string", "pattern": "^entry_[A-Za-z0-9]{6,32}$", "title": "Person", "description": "The id of an entry in People (people). Needed to publish." },
            "role": { "type": "string", "enum": ["host", "speaker", "panelist"], "title": "Role", "description": "One of: host (Host), speaker (Speaker), panelist (Panelist)." },
            "talk": { "type": "string", "title": "Talk", "description": "Plain text, at most 200 characters. One line." }
          },
          "additionalProperties": false
        }
      }
    },
    "additionalProperties": false
  }
  ```

  In the strict profile, each property above is listed in its object's `required`, and `venue`, `role` and `talk` read `"type": ["string", "null"]` (`role`'s `enum` gains `null`). `startsAt` reads `["object", "null"]`, and `speakers` reads `["array", "null"]`. `strictCost` is `{ properties: 8, depth: 4, enumValues: 4, unions: 6 }`, within both providers' limits.

### 7. Field operations (`fields-operations/`)

The four operations, their phases, their budgets and their revert stay as RFC-0041 §6 built them (`fields-operations/types.ts:22-50`). Entry rewrites carry their `entry_refs` rows, anchored on the new hash, so the index follows every phase B batch with no separate pass. A repeater's sub-field is addressed with a new optional `sub` parameter (`rename_field {from: "speakers", sub: "name", to: "fullName"}`), and the marker records it (`FieldMigration.sub`, §1).

| Operation | Reference | Repeater |
|---|---|---|
| `rename_field` | moves the key; rows' `field` follow each rewritten entry; list fields and sections follow as today (`fields-operations/references.ts`) | moves the key, or with `sub` the sub-key in every item; rows `speakers.person` follow |
| `change_field_type` | see the table below | see the table below; with `sub`, a sub-field converts by RFC-0041's table among sub-field types |
| `set_field_localized` | true→false keeps the original's ids and deletes translations' copies (and their rows); false→true writes nothing | the same, for whole lists |
| `remove_field` | deletes values and their rows; refused while list fields or presets use it (`list_field_in_use`) | deletes the list, or with `sub` the sub-value in every item (an item left empty is dropped) |

New rows of the closed conversion table (`conversions.ts:38`, `FIELD_CONVERSIONS`):

| from → to | conversion | unconvertible |
|---|---|---|
| reference single ↔ multiple | as select: one id ↔ a list of one; an empty list is no value | multiple → single with more than one id |
| text → reference | the one entry of the allowed collections whose slug, or default-locale title, equals the text exactly (case-folded) | no match, or more than one |
| reference → text | the target original's title in the site's default locale (a list: comma separated) | a missing target |
| text (multiline) → repeater | one item per non-empty line into the repeater's single `text` sub-field (RFC-0042's ingredient lines) | a line over the sub-field's `maxLength`; more lines than `maxItems` |
| repeater → text | a repeater of one `text`/`richText` sub-field: items joined by line breaks (multiline) | other sub-field shapes |
| reference (multiple) ↔ repeater | a repeater of one `reference` sub-field: one item per id, and back | a repeater with other sub-fields |

Anything else is refused as today. Without `onInvalid: "clear"`, unconvertible values refuse the run, and the dry run counts and samples them first.

- **Revert** (`fields-operations/revert.ts`) restores each touched entry's earlier values. A restored reference whose target was deleted meanwhile is dropped from the restored value, and its id is reported in a new `FieldRevertResult.dropped: { entryId, field, targetId }[]`. The restore statement carries §2's target guard, so a target deleted during the revert fails that statement and is retried on the next pass. A remove can make a target deletable, and that deletion must not make the revert write a dangling id.
- **Free definition edits:**
  - add a sub-field;
  - reorder sub-fields;
  - change labels, help, `itemLabel` or `where`;
  - widen `maxItems` or `collections`;
  - narrow `maxItems`: existing values are checked on their next write, as RFC-0041 §6 already does for narrowed limits.

### 8. Threat model

| Threat | Mitigation | Test |
|---|---|---|
| **A draft, archived, gated or hidden target leaks through a published referrer** (the snapshot holds drafts, §2) | Resolution reads only `Loaded.reachable`. A card carries only the target's public title, summary, URL and cover image, and the image goes through the existing asset gates. Unresolved values render nothing: no id, no `data-` attribute, no empty link. JSON-LD's `reference` source (phase 7) uses the same cards. | RFC-0008's route sweep (extended by RFC-0042 for `hide`) is extended again: a published referrer pointing at a draft, an archived, an embargoed and a `hide`-expired target. No id, slug, title or asset of those targets may appear in HTML, JSON-LD, feeds, the sitemap, search, `llms.txt`, status pages or cache tags. |
| **IDOR in the entry picker and on write** | Pick and references routes run under the `/sites/:siteId` membership check and query by `site_id` only. The write guard requires `n.site_id = ?` (§2.1). An id from another site or tenant gets the same `unknown_entry` as an id that does not exist, so the answer reveals nothing. Language editions map ids and never read across sites (§3). | A shared-suite case: another site's entry id in `create_entry`, `update_entry`, the API and `push` is refused identically. The pick route with another site's id in the path answers 404. |
| **Fan-out DoS on render** | Contract caps (50 per field, 50 items, 10 sub-fields), the code cap (100 reference values per entry), depth ≤ 2, the visited set, and 200 targets per page. Live reads are ≤ 2 per page, snapshot reads 0. `referencedBy` is capped at 100. | A property test: random graphs with cycles and 10× the caps resolve within the budget, never throw, and cost at most `depth` store reads on the live source. |
| **Write amplification and slow guards** | Each guard is one indexed probe or one `json_each` count (`entry_refs_target`). Delete and move cost one probe. Rebuilds are chunked statements inside one batch (§2.5). | The benchmark of RFC-0042 #105, extended to 10,000 events × 3 references on Miniflare D1: write, delete and move guard costs are reported. |
| **Picker search abuse** | `q` ≤ 100 characters, a substring match with no regex (rule 13), at most 20 results per page, and a per-member window on the pick route through the existing `rate_limits` counters (`packages/api/src/rate-limits.ts`, migration 0030). | A 100k-character `q` is refused before it is read. |
| **Prompt injection through target titles** | Titles are data. Approval prompts quote and truncate them (`quote()`, 60 characters), and `list_references` marks them as content, never instructions. | Existing approval-prompt tests gain reference cases. |
| **A broken archive or push slips dangling ids in** | Import validates nodes (`assertValidRows`) and rebuilds the index. Dangling ids are reported, never resolved and never thrown on. | The archive round-trip test with a hand-edited dangling id. |
| **An older site Worker crashes on the new types** (`COMPILE[def.type]`, `props.ts:45`, has no entry) | `GET /__cloudhal/features` adds `{ "fields": 2 }`. Writers refuse reference and repeater definitions with `409 fields_unsupported` until the site Worker reports it, as `gates: 2` guards `expiry` (`availability.ts:243`, `cloudflare/src/features.ts`). Phase 1 also makes `resolveFields` skip unknown types, so later types are safe on older renderers. | The site Worker features test; a renderer test with an unknown field type. |

No new scopes. Field definitions remain site settings (`site:settings`; agents use `site:write` plus a person's approval, `person`-classed, as today, `field-tools.ts:264-267`). Values are content (`content:write`, with the `:own` limits). Reading targets in the picker and in `list_references` needs `content:read`, which every role already holds (`agent-runtime/src/roles.ts` `READ`). Referencing an entry never writes it.

### 9. Rollout (one PR each)

1. **Contract and pure core:**
   - the §1 diff, fixtures and `pnpm gen`, through the `contract-change` skill;
   - definition checks, `fieldPropSchema` for both types, value checks, `resolveFields` (and skipping unknown types);
   - `fieldsJsonSchema` with the strict profile and `strictSchemaCost`;
   - `referenceIssues`.

   No behaviour change.
2. **Storage and store:**
   - migration `0033_entry_refs`;
   - the write guard and rows, and the delete and move guards;
   - the definition-change refusals;
   - `entryRefsRebuild` in import, sync and restore (chunked), and `referenceIssues` in `import --dry-run`;
   - the `fields: 2` writer guard;
   - API: entry routes, `pick` and `references`.
3. **Renderer:**
   - `entryFields` cards, depth and budget;
   - `entriesByGroups`/`referencedBy` on both sources, and the snapshot indexes;
   - `EntryFields.astro` (links for references, a nested `<dl>` per item);
   - cache tags, and features `fields: 2`;
   - the route sweep extension;
   - a frozen theme copy for `old-theme-compat.test.ts`.
4. **Field operations:** `sub`, the conversion rows, revert `dropped`, and the CLI flags (`cloudhal fields rename|retype|localize|remove --sub`).
5. **MCP:**
   - `list_collections` (definitions, `fieldsSchema`, `fieldsSchemaStrict`, `strictCost`);
   - the entry prechecks, `delete_entry`'s refusal and `list_references`;
   - `anyOf` in `update_collection`'s input;
   - the operation tools' `sub`;
   - regenerated tool docs (`node scripts/mcp-tools-doc.ts`).
6. **Studio:** the five blocks, `FieldReference`, the builder, "Used by", the delete dialog and the publish warnings; `design:shots`; the `fields` namespace and `pnpm i18n:import`.
7. **Listings and structured data:** reference list fields (rows, `checkFieldQuery`, the property suite), the `reference` source kind for presets, and `docs/guides/fields.md`.

Phase 3 ships before phases 5 and 6, so no agent or person can define a type that the live site cannot render; the `fields: 2` guard enforces it anyway. Phase 7 is independent of 4 to 6.

**Test plan.** Every store-facing behaviour goes into the shared suites (`packages/core-ts/src/testing-*.ts`), which run on SQLite, Miniflare D1 and Durable Object SQLite:
- `testing-references.ts` (new):
  - writing, canonicalizing a translation's id to the original's;
  - refusing a missing, cross-site, wrong-collection, self or archived new target;
  - delete and move refusals, and the races of each guard against a concurrent write (two batches interleaved);
  - rows after every write, delete, import, restore and operation phase.
- `testing-fields.ts`: repeater values, `requiredToPublish` per item, the leaf and reference caps.
- `testing-field-operations.ts`: every new conversion row, `sub` operations, resume, and revert with a deleted target.
- `testing-list-values*.ts`: reference list fields, including the seeded random comparison of SQL and evaluator.
- **Pure tests:** the emitter against `JSON_SCHEMA_KEYWORDS`, depth ≤ 4, no recursion, root `object`, `strictCost`; `referenceIssues`; the locale rule; resolution budget and cycles (property-based).
- **Renderer:** snapshot and live sources give identical cards; the route sweep (§8); cache tags.
- **Studio:** block tests (keyboard, focus after add and remove, live region), `design:shots` at both widths, `design:lint`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Weak references by default (deletes allowed, dangling ids kept) | No refusals for people | Silent breakage; "who uses this" still needs the index; Sanity made strong the default | Strong by default; readers tolerate dangling anyway (§2) |
| Cascade or "unlink and delete" on target delete | One click | Rewrites other people's entries as a side effect of a delete; needs an operation, approval and a revert of its own | Refuse and list referrers; open question 1 |
| Block publish (or fail the build) on unresolved references | Strict | Publish is a site snapshot; one draft venue would hold back every unrelated fix; "a published snapshot must keep rendering" | Warn in Studio, MCP and CLI (§2) |
| Reference an entry-locale (a specific node) | Exact; no resolution step | Every translation re-picks targets; a new translation of the target never appears; non-localized references become impossible | Translation groups, resolved per page locale (§3) |
| Polymorphic `{collection, id}` values (Payload) | Explicit collection | The id already names its node; two values to keep consistent; larger strict schemas | Bare ids, collection checked on write |
| Reverse lookups by scanning `json_extract` over `nodes` | No table | Every delete and move scans the site's entries; repeater paths need `json_each` over every item | `entry_refs`, the `asset_refs` pattern |
| `blocks` (a heterogeneous list: each item picks one of several shapes) | ACF flexible content, Payload blocks | Each item needs a discriminated union: `anyOf` per item counts against Anthropic's 16 unions; a second Studio form engine; overlaps Cloudhal's own body directives, surfaces and page sections, which already compose varied content | Repeaters only; varied layouts stay in bodies and sections |
| Nested repeaters (depth 2+) | Richer models | Recursion or a second subset level; strict depth and property counts multiply; nested Studio forms on 390 px | Depth fixed at 1 by the contract |
| Per-sub-field localization in a shared list | Shared structure, translated words | Needs stable item keys and a merge by key on every read; two value shapes per field | Repeater-level `localized`; open question 2 |
| Sort or filter by a referenced entry's field | "Events by venue city" in one query | Denormalized values that every target edit invalidates across collections | Two-step queries (§4) |
| Unbounded resolution with a request timeout | Simple themes | Cost depends on content, not code; cycles | Depth ≤ 2, breadth-first, 200 per page |
| `oneOf` in the MCP input as in the contract | One source | OpenAI's strict mode does not document `oneOf` | `anyOf` over disjoint variants, identical meaning (§6) |

## Compatibility & migration

- **Contract:** two new variants, a new `$defs` and one optional marker property. Existing sites, snapshots, bundles and archives stay valid. No `schemaVersion` bump.
  - An older admin Worker refuses the new definitions (`additionalProperties: false` inside `oneOf`), so servers upgrade first, as with every addition.
  - An older site Worker is covered by `fields: 2` (§8).
- **Data:** none to migrate. Migration 0033 is DDL only, because no reference value can exist before phase 2: `field_key_in_use` refuses definitions over keys that already hold values.
- **Themes:** additive. `entry.fields` keeps meaning what is stored: ids and item objects. Old theme copies render the new types as nothing, since `EntryFields.astro` ships in the renderer package and shows them once updated. Themes opt into cards, depth and `referencedBy`.
- **Studio:** additive types in the builder and form.
- **Rollback:**
  - A snapshot restores the site node and entries, and the index is rebuilt in its batch.
  - A field operation reverts through its `before` snapshot, dropping deleted targets (§7).
  - Removing a reference or repeater field with `remove_field` removes its values and rows.
  - Downgrading below this RFC restores a snapshot from before the first reference or repeater definition, because the old validator refuses them. The `entry_refs` table is then unused and harmless.

## Security & policy impact

§8 is the threat model. In short:
- **No new scopes and no new approval points:**
  - definitions stay `site:settings` and person-classed;
  - values stay content;
  - `list_references` and the picker need `content:read`.
- **Tenant isolation:** every statement filters on `site_id`, every guard re-checks it, and nothing resolves across sites.
- **New refusals visible to agents:** `entry_referenced`, `reference_target_moved`, `unknown_entry`, `too_many_references`, `field_key_in_use`, `fields_unsupported` and `translation_shape_mismatch`, each with a hint in `field-hints.ts`.

## Open questions (each with a recommended answer)

1. **Deleting a referenced entry:** refuse and list the referrers; no cascade and no "unlink and delete" in stage 4. *Recommended.* If people ask for it, add an explicit `unlink_entry` operation (dry run, approval, snapshot, revert) rather than a delete flag.
2. **Per-sub-field localization in a non-localized repeater:** not in stage 4. Repeaters are localized as a whole, and Studio marks shared text "not translated". *Recommended.* Revisit with stable item keys (`_key`, which cannot collide with a `FieldKey`) when a real case needs shared structure with translated words.
3. **`datetime`, multiple selects and multiple references inside repeaters** (an agenda's session times): not in stage 4, because the props subset's array items are flat scalars (ADR-0030). *Recommended:* the first follow-up, by allowing ADR-0030's flat object one level below an array item for `datetime` only (an ADR-0030 amendment), measured against strict depth (5 of 10).
4. **The locale rule with `fallback: none`:** a target with no version in the page's language resolves to nothing, and `referenceIssues` reports it. *Recommended*, because it matches how pages behave under `none`. The alternative, linking the original in its own language with `lang`, could be a per-field option later.
5. **Strong references to archived targets:** an existing value keeps pointing at an archived target, which renders nothing; a *new* choice is refused. *Recommended.* The alternative is to refuse archiving while referenced, which makes retiring old venues painful.
6. **`where` on reference fields:** checked when a value is newly chosen only, never re-checked (Sanity's `filter` model). *Recommended.*
7. **Default depth for themes:** 1, with 2 as the ceiling. *Recommended.* Payload populates two levels by default, but a card is what themes draw.
8. **`fieldsSchemaStrict` beside `fieldsSchema`, or a `strict` argument on `list_collections`:** beside it, with `strictCost`. *Recommended:* it is small, and agents need not know their provider's mode in advance. Splitting a collection into strict-sized groups automatically is left out.
9. **Publish warnings as a gate:** never; a warning only. *Recommended.* A future site setting could turn them into a person-approval point for agents' publishes, like RFC-0042 §3.5's expiry rule.
10. **Structured data from references** (phase 7): the `reference` source kind in this RFC rather than a later one. *Recommended*, because RFC-0042 §6 named it as stage 4's starting point.
11. **The `asset_refs` rebuild chunking** (§2.5): fix it in its own small PR before phase 2, since import of large sites can hit D1's 100 KB statement limit today. *Recommended.*
