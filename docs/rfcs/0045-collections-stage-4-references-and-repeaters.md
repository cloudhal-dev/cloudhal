# RFC-0045: Collections stage 4: reference fields and repeaters

- Status: Draft (revised twice on 2026-11-10, after an independent review of PR #193 and a verification pass; the review log is at the end)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-11-10
- Related:
  - [#114](https://github.com/cloudhal-dev/cloudhal/issues/114) (this stage); #71 (the collections plan).
  - RFC-0040 / ADR-0042 (the registry), RFC-0041 / ADR-0043 (typed fields, field operations), RFC-0042 / ADR-0044 (§2 presets, §4 listings and `entry_list_values`, §6 "out: stage 4").
  - RFC-0004 §4.4 (`asset_refs`, the model for the reverse index), RFC-0008 §6 and §7 (releases and their dependency closure, holds, gates, the gate index), RFC-0010 (snapshot bundles), RFC-0015 / ADR-0030 (the props subset), RFC-0033 / ADR-0035 (one node per locale, translation groups, `localization.fallback`), RFC-0034 (language editions), RFC-0039 / ADR-0041 (archives).
  - Prior art (checked 2026-11-10; "unverified" where a primary page could not be read):
    - [Sanity reference type](https://www.sanity.io/docs/studio/reference-type):
      - a strong reference (the default) blocks deleting its target, and blocks publishing until the target is published;
      - `weak: true` may point at missing or draft documents and dereferences to `null`;
      - `to` is a static list of types, and `filter` narrows the picker only: it "does not guarantee" the target keeps matching.
    - [Payload relationship field](https://payloadcms.com/docs/fields/relationship):
      - `relationTo` names one or several collections; polymorphic values become `{relationTo, value}`;
      - `hasMany`, `minRows`/`maxRows`, `filterOptions`, and a per-field `maxDepth` for population;
      - reverse lookups need a separate Join field.
    - Contentful links: resolution up to 10 `include` levels, with unresolvable links reported separately (unverified: the concepts page answered 429).
    - Strict structured output:
      - [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs): types plus `anyOf`; no `allOf`/`not`/`if`; "Root objects must not be `anyOf`"; every property required, optional ones as a `null` union; up to 5,000 properties, 10 levels of nesting and 1,000 enum values; recursion allowed; `oneOf` not mentioned.
      - [Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): `anyOf`, and `$defs`/`$ref` without recursion; no `minimum`/`maximum`/`minLength`/`maxLength`; `minItems` only 0 or 1; per request at most 20 strict tools, 24 optional parameters, and 16 parameters with union types (`anyOf` or type arrays).

## Summary

Two new field types join RFC-0041's nine:
- A **`reference`** field points to entries of one to five declared collections of the same site, one target or up to fifty. It stores the target's **translation group id**, the same id in every site of a project. It always resolves to that group's member in this site and in the page's language.
- A **`repeater`** field is an ordered list of up to fifty items, each of up to ten flat sub-fields. A repeater cannot contain a repeater, so every agent-facing schema has a fixed depth and no recursion.

References are strong where it matters. A target cannot be deleted, moved, or taken out of its translation group while a published entry shows it, exactly as `resolveFields` would show it. References held by drafts, by entries in review, or by archived entries never lock anything.

A reverse index, `entry_refs`, holds one row per stored value, whatever the target's state. It is written in each entry's own batch, anchored on the entry's new content hash and on its collection's definitions *as planned*. Every guard filters it by site.

Archiving or unpublishing a target is always allowed. The renderer resolves only what the published snapshot shows *at that instant*, gates included, so an unresolved reference renders as nothing, and publish warns but never fails. Assets used inside repeaters count in `asset_refs`, like any field's assets.

Resolution is breadth-first, at most two levels deep, under a budget per page. A publish purges referrers' own pages, found through `entry_refs`, whenever a target group changes, becomes visible, or changes its cover. This needs no new cache tags and no theme code.

Studio gets an entry picker and nested repeater forms from new `@cloudhal/ui` blocks. The four field operations learn the new types.

Nothing goes live until the index, the guards, the renderer, the operations and Studio have all shipped. The two types stay refused on every write path (interactive writes, import, sync, push, pull and restore) until a final enabling step.

## Motivation

- **Today:**
  - An event's venue, a talk's speakers or a product's brand are typed as plain text (RFC-0042 §6: `organizer`, `performer` and `brand` "map from text"). The same venue, address included, is retyped on every event. Its page is not linked, and a change to its name does not reach the events.
  - A recipe's ingredients, an agenda's sessions or a job's benefits are multiline text, one item per line (RFC-0042 §2's `recipeIngredient`). There is no room for a second value: an ingredient's quantity, a session's speaker.
  - Agents write these as free text, which no theme, listing or JSON-LD preset can read back.
- **Who:** the collections #71 names (events with venues and speakers, team and projects, products and brands, docs and related docs, locations), the themes that render them, and the agents that fill them.
- **Why now:** stages 1 to 3 shipped (RFC-0040 to RFC-0042, released through 0.7.0). Every competitor in RFC-0041's prior art has references and lists of groups. RFC-0042's preset table already names the paths references fill: `location` as a `Place`, `performer`, `organizer`. §4 lets a preset read the venue's own address fields.

## Proposal

### 1. Contract

All additions are optional variants and `$defs` in `site.schema.json`. `content-entry.schema.json` changes only its `fields` description. There is no `schemaVersion` bump and no new root type.

Phase 8 adds one more variant, `ReferenceValueSource`, and the named enum `ReferenceValueProperty` to `StructuredDataSource`. That is a contract change of its own, listed with its diff in §4.

```jsonc
// site.schema.json $defs.FieldDefinition.oneOf (line 274): two variants appended after SelectField (line 542)
{
  "title": "ReferenceField",
  "type": "object",
  "description": "RFC-0045: entries of other (or this) collections of the same site, by translation group id (entry_…): the id of the group's original, which every language version and edition carries in translation.group.",
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
+ "… otherwise any JSON. An absent key means no value. A reference value is a translation group id or a list of them, a repeater value a list of flat objects (RFC-0045)."
```

- **Values:**

  | Type | Value | Checked on write |
  |---|---|---|
  | `reference` | a group id `"entry_…"`, or with `multiple` a list of them, no repeats, at most `maxItems` | see §2.1: the group has a member in this site in one of `collections`; it is not the entry's own group; it meets `where`. Checked for changed keys, and for every own value when the entry becomes published (§2.2). A member's id is canonicalized to its group id (`translation.group ?? id`), as `canonicalImageRefs` canonicalizes asset references. |
  | `repeater` | a list of at most `maxItems` objects. Each holds only sub-field keys, with RFC-0041 §2's values for its type. No empty item. | each item against the sub-fields. `requiredToPublish` sub-fields need a value in every item of an entry in review or published. Image and rich-text sub-values are checked and recorded as assets (§2.5). |

- **Why a group id.** `Translation.group` is "the original node's id … May cross sites in one project" (`common.schema.json:121-124`).
  - A language edition's entries carry their source site's group id (`editions.ts:121-125`; `checkTranslationLinks` requires a member's group to be its source's, `store/translations.ts:131`).
  - The group id is therefore the one identity that is the same for every language version in every site. "The original in this site" is undefined in an edition site, where no member is the group's node.
  - The group id is used as a *key*: it is never read as a node of another site. A reference resolves, and is guarded, only through members whose `site_id` is this site (§2, §3).
  - **A node's group can change.** `checkTranslationLinks` (`store/translations.ts:107-145`) accepts a new `translation.source`, and with it a new group, and `PUT …/entries/:id` (`api/routes/entries.ts:138-175`) passes the whole entry. A stored id therefore stays valid only because §2.2 guards group changes exactly like deletes: leaving a referenced group is leaving it.
  - It is a bare id, not `{collection, id}` as in Payload's polymorphic values: it keeps a reference what an image field already is, and the store checks the collection on every write.
- **Why flat items.** Repeater items are flat objects of scalars, which is exactly ADR-0030's `ArrayPropSchema` with `FlatObjectPropSchema` items (`blocks.ts:55-68`).
  - `fieldPropSchema` compiles a repeater into the subset, and `validateProps` checks it unchanged, eval-free (rule 6).
  - Excluded: `datetime` (an object), multiple selects and references (arrays). These would need a second level in the subset (open question 3).
  - `maxItems` ≤ 50 is `BLOCK_LIMITS.arrayItems` (`blocks.ts:113`).
- **Code rules beyond the schema** (`checkFieldDefinitions`, `definitions.ts:177`):
  - every `collections` entry is a declared or inferred collection (`reference_target_unknown`);
  - `where` only with one target collection, on its `listFields`, without `now` (`invalid_query`);
  - `maxItems` only with `multiple`;
  - sub-field keys unique in their repeater and not reserved (the same list as fields);
  - `itemLabel` names a text, select or reference sub-field;
  - at most 100 *leaves* per collection (fields plus sub-fields);
  - sub-fields count toward the per-site cap of 200 (`FIELD_LIMITS`, `types.ts:32`);
  - at most 100 reference values per entry, across fields and items (`too_many_references`).

- **The gate.** Until the enabling step (§9 step 7), both types are refused (`fields_unsupported`) on every path that writes a site node:
  - **Interactive writes.** `checkFieldDefinitions`, called from `store/site-fields.ts:87` and `fields-operations/state.ts:94`.
  - **Rows.** `checkBundle` (`sync-checks.ts:254-271`) gains `assertFieldTypes(siteId, bundle, support)` beside `assertGates`. That one function covers `importSite`, `pull`, `push`, `cloudhal import --replace` and `--revert`, and snapshot restores, all of which go through `importSite` (`sync-restore.ts:4`). Today `checkBundle` validates the schema only (`assertValidRows`, `:130-158`), which accepts the new variants as soon as phase 1 runs `pnpm gen`.

  `support` is the same capability object for both:
  - the shared suites' store option (`SiteGraphStoreOptions.fieldTypes`);
  - after step 7, the site Worker's `fields: 2`, through the `GateSupport` pattern (`availability.ts:235-237`).

  A server at phases 1 to 6 therefore refuses the types from Studio, MCP, the API and every bundle alike, so no value can exist without index rows.
- **Adding a reference or repeater field is a free edit**, except over a key some entry already holds (`field_key_in_use`, one `json_type` count). The count races with entry writes in that collection; the definitions anchor of §2.1 closes the race.
- **Rule 2 holds:**
  - `oneOf` with inline variants and the one-value `type` discriminator (ADR-0043);
  - no `default`;
  - `additionalProperties: false`;
  - cross-file `$ref` only to `common.schema.json#/$defs/*`;
  - no recursion: `SubFieldDefinition` has no repeater variant.
- **Generation impact:**
  - **TypeScript:** `FieldDefinition` gains `ReferenceField | RepeaterField`, and a new `SubFieldDefinition` union of nine `*SubField` interfaces. `FieldType` (`types.ts:7`) derives from the contract, so every total dispatch table over it stops type-checking until it handles the two types. Phase 1 gives each an explicit entry: an "unsupported" stub where its real code comes later.
    - `COMPILE` (`props.ts:46`) and `EMIT` (`json-schema.ts:49`): real entries in phase 1.
    - `CONTROLS` (`EntryFieldsForm.tsx:329`): a read-only "needs a newer Studio" stub until phase 6.
    - `FIELD_QUERY_OPS` (`fields/query.ts:53`): `[]` until phase 8, so the type is not listable.
    - `FIELD` (`structured-data/values.ts:154`): "no value" until phase 8.
    - `archive-reassemble.ts`'s `FIELD_CHECKS`/`FIELD_WORDS` key the archive manifest's own types, not field types, and are unaffected.
    - `TYPE_RULES` and `EXTRA` are `Partial` and need no change. The compiler lists anything else.
  - **Rust:** cargo-typify emits `#[serde(tag = "type", deny_unknown_fields)] enum FieldDefinition` with two more variants, a second tagged enum `SubFieldDefinition`, and the extended `fromType` enum. Values stay `serde_json::Value`.
  - **Names:** the sub-field variants carry their own titles (`TextSubField`, not `TextField`). Both generators name types from `title`, and RFC-0042 §1 found that cargo-typify 0.8.0 keeps only the first of two equal names.
  - **Not run on this branch:** this is a docs-only PR, written while the owner's machine ran a test-heavy session. Phase 1 runs `contract-change` first, with these fixtures:
    - `valid/site/collection-stage4.json`: an `events` collection with `venue` (a reference to `places`), `speakers` (a repeater with reference, select, image and text sub-fields) and a migration marker with `sub`;
    - `invalid/site/`:
      - a reference without `collections`;
      - six target collections;
      - `maxItems` 51;
      - a repeater sub-field of type `repeater`;
      - a sub-field of type `datetime`;
      - a sub-field with `localized`;
      - eleven sub-fields;
      - `fromType` `blocks`.

### 2. Cross-node integrity

```sql
-- packages/storage/migrations/0033_entry_refs.ts (new; DDL only: no value can exist before §9 step 7, on any path, §1)
CREATE TABLE entry_refs (
  site_id TEXT NOT NULL,
  target_id TEXT NOT NULL,          -- the referenced translation group id, as stored
  source_id TEXT NOT NULL,          -- the node holding the value
  source_collection TEXT NOT NULL,
  field TEXT NOT NULL,              -- "venue", or "speakers.person" inside a repeater
  root_key TEXT NOT NULL,           -- the top-level field key ("speakers")
  shared INTEGER NOT NULL,          -- who else shows the value (below): 0 nobody, 1 every inheriting member, 2 inheriting members without their own value
  source_status TEXT NOT NULL,      -- the holding node's own status
  PRIMARY KEY (source_id, field, target_id)
);
CREATE INDEX entry_refs_target ON entry_refs (site_id, target_id, source_status);
```

**Invariant (the index).** `entry_refs` holds exactly one row per `(node, field path, stored group id)`, whatever the target's state: present, missing, archived or foreign. Rows depend only on the holder's own body, so nothing re-creates or deletes them except a write of the holder, its deletion, or a rebuild.
- **No cross-tenant pinning.** Every guard and lookup filters `r.site_id` (the holder's site) and `n.site_id` (the member's site). A row naming another tenant's id pins nothing there and never resolves.
- **Repeats.** A target named in two repeater items (a host who also gives a talk) is one row: the writer deduplicates `(field, target)` pairs, and the `INSERT` is `INSERT OR IGNORE`.
- **`shared`** mirrors `resolveFields` (`fields/resolve.ts:37-65`). Only the group's same-site original, the node whose `id` is the group id, passes values on, and only to members of that group in the same site whose own `translation.source` is not in another site (`readsOriginal`). Hence:
  - `shared = 1`: the holder is that original and the field is `localized: false`;
  - `shared = 2`: the holder is that original and the field is `localized: true` (members without their own value fall back to it, `fromOriginal`);
  - `shared = 0`: everything else. That covers a translation's own value, and any node of an edition site whose group lives in another site: `originalOf` returns nothing there (`store/entry-fields.ts:54-62`), so no edition member inherits (open question 12).

**"Shown by a published entry"** is one SQL fragment. The guards, the live `referencedBy` and the purge planner all use it, so they mean the same as the snapshot's resolved values:

```sql
-- rows of site S naming group G that a published entry shows
SELECT r.* FROM entry_refs r WHERE r.site_id = ? AND r.target_id = ?
  AND (r.source_status = 'published' OR (r.shared > 0 AND EXISTS (
    SELECT 1 FROM nodes m WHERE m.site_id = r.site_id AND m.kind = 'contentEntry'
      AND json_extract(m.body, '$.translation.group') = r.source_id AND m.id <> r.source_id
      AND json_extract(m.body, '$.translation.source.siteId') IS NULL
      AND json_extract(m.body, '$.status') = 'published'
      AND (r.shared = 1 OR json_type(m.body, '$.fields.' || r.root_key) IS NULL))))
```

The member probe uses `nodes_translation_locale` (migration 0025: `site_id, kind, json_extract(body, '$.translation.group')`; its partial `WHERE … IS NOT NULL` is implied by the equality).

**1. Writing a referrer** (`EntryEngine.write`, `store/entries.ts:30`). `planEntryFields` returns three more parts:
- **The target guard**, ANDed into the entry's CAS (`entries.ts:104`), for changed reference keys, and for every own reference value when the entry becomes published (point 2). Every named group must have a member in this site, in one of the field's allowed collections, that is not archived (for a newly chosen group). It is one count over a JSON list of `{t: group, c: [collections]}` pairs, like the asset guard (`entry-fields.ts:163`):
  ```sql
  (SELECT count(*) FROM json_each(?) p WHERE EXISTS (
     SELECT 1 FROM nodes n WHERE n.site_id = ? AND n.kind = 'contentEntry'
       AND (n.id = json_extract(p.value, '$.t') OR json_extract(n.body, '$.translation.group') = json_extract(p.value, '$.t'))
       AND json_extract(n.body, '$.collection') IN (SELECT value FROM json_each(json_extract(p.value, '$.c'))))) = ?
  ```
- **The definitions anchor**, on every entry write that changes `fields` or `collection`. The writer binds its collection's definitions *as planned*: the canonical JSON of `site.collections[c].fields` from the very `Site` object it planned with (`entries.ts:39-41`), so there is no second read and no gap.
  ```sql
  json((SELECT json_extract(body, ?) FROM nodes WHERE id = ? AND kind = 'site')) IS json(?)
  ```
  The path is `$.collections."<key>".fields`, and both sides are normalized by `json()`. `NULL IS NULL` holds for a collection without definitions. A unit test round-trips every fixture definition through the stored form (fractional bounds included), so text equality is exact.

  The anchor conflicts only when that collection's definitions change, never on other site edits. The loser retries under the new definitions, where `field_key_in_use` then sees its value. This is RFC-0042's rule that list-value rows are valid only "under the fingerprint they were built with" (`list-values/fingerprint.ts`), applied to writes.
- **The rows**, anchored on the entry's new hash: `DELETE FROM entry_refs WHERE source_id = ? AND <anchor>`, then one `INSERT OR IGNORE … SELECT … FROM json_each(?) WHERE <anchor>`, appended to `own` (`entries.ts:110`). Every write of the holder rewrites all its rows, so `source_status` and `shared` stay current.

A target deleted or moved between check and batch fails the guard, and `diagnose()` names it (`unknown_entry`, `reference_target_moved`). One bound parameter carries the whole list (D1 allows 100 parameters), and 100 group ids stay far below 100 KB per statement.

**2. Who can lock what: delete, move, leaving a group, publishing.**
- **The policy.** A reference blocks only while a *published* entry shows it, as `resolveFields` would show it: its own value, or one inherited from its same-site original (the fragment above).
  - Drafts, entries in review and archived entries never lock anything.
  - A contributor (`content:draft:own`, `roles.ts`) cannot publish, so nothing a contributor writes locks on its own. A value it holds locks only once someone with publish rights publishes an entry that shows it, such as a translation inheriting it. That person's publish is the decision.
  - An author pins only through what published entries show, which the live site really depends on.
  - An editor can always unpublish to release a lock.
- **Writes that make a group lose a member in this site.** That is a delete, a move to a collection no blocking field allows, or a change of `translation.group` (including dropping `translation`, `store/translations.ts:107-145`). Each such write of member X of group G carries:
  - `NOT EXISTS (<blocking rows of G>) OR EXISTS (<another member of G in S, id <> X, not archived, in a collection every blocking row's field allows>)`. The allowed set is the intersection of those fields' `collections`, computed from the site as planned.
  - **The site anchor**, `EXISTS (SELECT 1 FROM nodes WHERE id = ? AND kind = 'site' AND hash = ?)`, with the hash of the `Site` object the write planned with. The allowed collections come from *referrer* collections' definitions, so anchoring only the target's own collection (the first draft) left a race (R4).

    These writes are rare, so whole-site anchoring costs nothing in practice. It is added only when the plan saw blocking rows. Without them, the write carries only `NOT EXISTS (<blocking rows of G>)`, which is safe on its own: at worst it over-refuses.
  - A refusal answers `409 entry_referenced`, with up to 20 published referrers (id, title, collection, field) and the total. For a group change, it also names the group.
  - Deleting a translation, or an original that still has another usable member, never blocks. References keep resolving to the remaining members (§3).
- **Moving a member** from C to D additionally refuses while a blocking row's field allows C but not D, and no other usable member remains (`409 reference_target_moved`). During a field operation, the pairs include the marker's `fromKey`.
- **Publishing a referrer.** A write that makes an entry published runs the target guard over *every* own reference value. A dangling id is refused (`unknown_entry`: remove or replace it), so a draft that lost its target cannot go live pointing at nothing.
  - Inherited values are not the translation's to fix. A translation that goes live while its original holds a dangling id gets a warning, and the reference renders as nothing (R8).
- **Archiving and unpublishing** a target are allowed, and write nothing to `entry_refs`. The picker hides archived entries.
- Members of a group may sit in different collections, as today (`checkTranslationLinks` has no collection rule). Resolution, the guards and `referenceIssues` count only members in the field's `collections`.

**3. Races.** Every interleaving that could leave a published reference stranded, and the guard that catches it. "Second" is whichever batch commits later; it fails and retries or refuses.

| # | Interleaving | Caught by |
|---|---|---|
| R1 | referrer write ↔ deleting the target's last usable member | the referrer's target guard (members at batch time), or the delete's `NOT EXISTS <blocking rows>` (rows at batch time) |
| R2 | referrer write ↔ moving the target to a disallowed collection | the target guard (collection at batch time), or the move's blocking-row check |
| R3 | referrer write ↔ adding a reference field over its key, or removing an allowed collection | the definitions anchor, bound as planned (point 1). `field_key_in_use` counts committed values. The collection refusal counts values whose group has a member in the removed collection. |
| R4 | moving a member ↔ narrowing a referrer field's `collections` | the move's site anchor. The narrowing's count sees the member once it has moved. |
| R5 | delete ↔ any change to the definitions a blocking row's field depends on | the delete's site anchor |
| R6 | changing a member's group ↔ referrer write | the group change carries the delete guard and site anchor for its old group; the referrer's target guard checks membership at batch time |
| R7 | a referrer becoming published ↔ deleting its target | the publish re-checks all own values with the target guard. The delete sees the referrer's new `source_status`, because its rows are rewritten in the same batch. |
| R8 | publishing a translation that *inherits* the value ↔ deleting the target | when the publish is first, the delete's fragment reads member status at batch time. When the delete is first, nothing published showed the value at that moment. **Accepted:** the translation goes live with a warning and renders nothing; no guard can refuse a write the translator cannot fix. |
| R9 | field-operation phase B ↔ deleting a target | the target guard ANDed into each rewritten entry's CAS (point 6) |
| R10 | import, restore or sync ↔ anything | one atomic batch with the index rebuilt in it (point 4) |
| R11 | a member reappearing (a new translation or edition member) | rows are kept whatever the membership (the invariant), so nothing needs re-creating |

**4. Rebuilds** run in the same batch as the node set: `importSite`/`pull`/`push` (`sync-plan.ts:308`), `cloudhal import --replace` and `--revert`, and snapshot restores.
- `entryRefsRebuild(siteId, rows)` builds the rows from the bodies, with the site's definitions from the site row, as `refsRebuild` does (`media/refs-rebuild.ts:12-37`), and `DELETE`s and `INSERT`s them under `site_id = ?`.
- There is no membership join: the invariant keeps rows for every stored value, and the site filters keep them harmless.
- The `INSERT` is chunked so each statement stays below 90 KB, inside the one atomic batch.
- **Step 7** also runs a one-time, budgeted, resumable `entryRefsRebuild` per site as an admin job, the pattern of `lists.backfill`. It is idempotent, and is a safety net: the gate (§1) means it should find nothing.

**5. Assets inside repeaters.** Each of these needs its own change, because none follows from the others:
- **`fieldAssetRefs`** (`media/field-refs.ts:17-36`) reads only top-level string values (`if (typeof value !== "string") continue;`). It gains a walk over items. It records `fields.<key>.<sub>` in `asset_refs.field` (no index: the row is per asset and field), and returns each use's item path (`fields/<key>/<i>/<sub>`) beside it.
- **`fieldAssetIssues`** (`field-refs.ts:87-91`) maps definitions by top-level key (`types = new Map(defs.map(d => [d.key, d.type]))`). It gains a lookup of `<key>.<sub>` to the sub-field's type, so the image-kind check applies (a PDF in an image sub-field is refused). It reports issues at the item path, so Studio maps them to controls (§5), and its `skip` set uses item paths too.
- **`refsRebuild`** and field-operation rewrites (`fields-operations/rewrite.ts:150-158`) call `fieldAssetRefs`, so they follow the walk.
- **The purge planner's asset rule** (`cache-purge.ts:205-232`) uses `assetRefsOf` (`media/refs.ts:113`), which knows neither field images nor item images. **This is an existing gap for top-level image fields too.** It gains `fieldAssetRefs` with the target snapshot's site definitions. Entries it reaches also bring their referrers through the referrer rule (Purges, below), so a target's changed cover purges the cards that show it.
- Editions copy item assets already: `assetIdsOf` (`cross-site.ts:17`) scans the whole node.
- **A prerequisite, decided, not optional:** before phase 2 widens what feeds `asset_refs`, a small PR scopes it by site.
  - `deleteAsset`'s guard (`assets.ts:867`) becomes `NOT EXISTS (SELECT 1 FROM asset_refs WHERE site_id = ? AND asset_id = ?)`.
  - `refsRebuild` inserts only rows whose asset is a node of the same site, via a join.
  - The rebuild's `INSERT` is chunked below 90 KB.
  - Its tests: an archive in site X naming site Y's asset does not block Y's delete; a large rebuild stays under the statement limit.

**6. Field operations** (`fields-operations/rewrite.ts:150`). From phase 2, `statementsOf` emits each rewritten entry's `entry_refs` rows next to its asset rows. It ANDs the target guard into the entry's CAS whenever the entry's reference values change, so a target deleted between plan and batch skips the entry for the next pass, like a concurrent edit (R9). Operations that *name* a reference or repeater field are refused (`field_operation_unsupported`) until phase 4 (§7).

**7. Releases** (RFC-0008 §6). Today's dependency extractor treats every string matching `NODE_REF` at any depth as a dependency (`schedules/src/release.ts:268-289`), and core-ts passes it as `depsOf` (`core-ts/src/releases.ts:566`).
- Without a change, group ids in field values would be pulled into a release's closure and locked (`assertUnlocked`). An edition's foreign group id would also fail the run as `dependency_missing` (`release.ts:416`).
- **Decision: references are not release dependencies.** Phase 2 replaces `depsOf` with a kind-aware extractor that drops reference values (top-level and inside items, by the site's definitions as pinned) before `referencedNodeIds`.
- A scheduled event whose venue is not live renders without it, as after a publish, and the release's approval text carries `referenceIssues`.
- Rationale: closure dependencies are hard (they lock and fail), while references are soft at render.

**8. Definition changes** (`fieldDefinitionChanges`, `definitions.ts:135`) add these refusals:
- removing a collection from `collections` while a value's group has a member in it (an `entry_refs` join on members);
- turning `multiple` off;
- removing or retyping a sub-field that holds values.

Each refusal names the operation to use (§7).

**9. Site deletion.** `entry_refs` joins `SITE_TABLES` (`site-delete.ts:16`) in phase 2. The existing test fails on a `site_id` table missing from that list.

**The invariant restated.**
- No write lets a group lose its last usable member in a site while a published entry there shows a reference to it.
- No write stores a new own reference to a group without such a member.
- The index always matches the stored values.

R8 is the one accepted exception, and it is warned. Dangling ids can still exist, and every reader treats them as unresolved without throwing:
- in drafts whose target went;
- in hand-made or foreign archives;
- in publish snapshots composed with holds, which leave out a held node that is not live (`store/snapshots.ts:29-37`);
- after a release removes a target.

**Snapshots, publish and rollback:**
- A snapshot is the whole working copy at one read (`snapshots.ts:23`). Rollback moves the pointer to an ancestor (`store.ts:1127`), which is just as consistent, and restores rebuild the index (point 4).
- **Visibility decides.** `Loaded.reachable` is the published entries *before gates* (`astro-renderer/src/source.ts:147-155`); the gated set exists only per view instant (`#current()`, `source.ts:409-431`). The renderer resolves through the view (§4).
  - A target resolves only when its member is published and its gates are open at that instant. An `unlist`ed target (RFC-0042 §3) still resolves.
  - A draft, archived, embargoed, `hide`-expired or missing target resolves to nothing.
- **Publish warns, never fails.** `referenceIssues(snapshot, now)`, pure and in `@cloudhal/core-ts/fields`, lists published entries whose references will not resolve. It appears in Studio's publish dialog, the MCP `publish` tool's approval text and `cloudhal snapshot --publish` output. A publish never fails on it: "a published snapshot must keep rendering" (RFC-0042 §4).
- **Gates.** Every published entry's instants are in the snapshot's gate index already (`Loaded.gates`), so a referrer's cached page expires when its target's embargo opens or its `hide` expiry passes.

**Purges** (`cache-purge.ts`). There are no new tags. Referrer pages already carry their own node tag (`cloudhal-node-<id>`), set by the theme for the entry a response renders and for the entries an archive lists (`cache-tags.ts:6-8`). The planner reaches them through the index.
- **The referrer rule.** Groups touched by the diff are collected from the before and after bodies (`translation.group ?? id`):
  - every changed, added or removed entry;
  - the entries the asset rule reaches;
  - a changed group, which counts both its old and its new group.

  For those groups, the planner adds the node tags of:
  - their referrers in the index that the fragment above shows as published, plus the inheriting members it names;
  - the release's held referrers, read from the live snapshot, which the index may not match.

  Lookup is one `entry_refs` probe per group, run through a new `SnapshotReader.referrersOf(siteId, groups)`. The store implements it, and so does the release planner's virtual reader (`releases.ts:607`), on the same index.
- **What it covers.** Retitled, unpublished, archived and *newly visible* targets: a draft venue published, a new Turkish member, an embargo opening at a publish. Also changed covers, in every language and with any theme.
- **Costs and limits.**
  - A group referenced by thousands of pages exceeds `maxTags` (300) and falls back to purging everything, as any large diff does today.
  - `isCloudhalCacheTag` (`cache-tags.ts:48`) and the site Worker's purge endpoint (`cloudflare-entry.ts:312-325`) are unchanged, so an older site Worker accepts every purge.
  - No ids of unresolved targets reach any header.
- The first draft's `cloudhal-ref-<group>` tags are dropped. Existing themes build their own tag lists (`starters/blog/src/pages/[...path].astro:261-321`), so they would never have emitted them. The new prefixes would also have made older site Workers answer 400 and fall back to a full purge on every publish. And their privacy relied on unverified header stripping.

**Archives (RFC-0039).** An archive holds every node of the site, so references stay complete, and import rebuilds the index in its node batch (point 4). Dangling or foreign ids are reported, not refused (RFC-0041 open question 8): `cloudhal import --dry-run` adds `referenceIssues`. Until step 7, an archive *with* reference or repeater definitions is refused (`fields_unsupported`, §1).

### 3. The locale rule

A reference names a translation group (§1). In this site, the candidates are the group's members (`id = G` or `translation.group = G`) whose collection is in the field's `collections`. Resolution picks, among those the view shows:

1. the member whose `locale` is the page's locale;
2. otherwise, when `Site.localization.fallback` is `default-with-notice` (RFC-0033 §2), the member in the site's default locale, flagged `fromFallbackLocale` so themes set `lang` on it;
3. otherwise, nothing.

The renderer, Studio's preview of a translation and `referenceIssues` ("Main hall has no Turkish version") share this one function, `pickMember`.

- **`localized: false` is the default** that Studio pre-sets for references. The group's same-site original holds the ids, and every same-site translation resolves them in its own language (RFC-0041 §5). A translator never re-picks targets, and a venue's Turkish version appears on the Turkish event without any write.
- **`localized: true`** is for real differences between languages, such as a regional partner. Each version holds its own group ids, and an empty value falls back to the original's (`fromOriginal`).
- **Language editions** (RFC-0034; an original in another site of the project). Non-localized values are copied when the edition is made (RFC-0041 §5, through `forEdition`, `cross-site.ts:115`). Group ids are shared across sites, so a copied id stays the same id.
  - `forEdition` keeps an id when the edition site has a member of that group in a collection the edition's own field allows. Otherwise the id is dropped and reported ("2 references not carried: Main hall has no edition in site B yet").
  - A repeater item left with no value once its references are dropped is dropped too, and reported, as `remove_field` with `sub` does (§7), so the edition write never fails on "no empty item". A `requiredToPublish` field emptied this way is fine: the copy is a draft.
  - **Inside an edition site,** the edition node's own translations do not inherit its non-localized values. This is RFC-0041's existing rule: `originalOf` looks for the group's node in the same site (`store/entry-fields.ts:54-62`; search does the same, `search-rows.ts:299`), and the group's node is in another site. Each such member holds its own references, and their rows get `shared = 0` (§2). Changing that rule for every field type is open question 12.
  - A reference never resolves across sites: it reads only members with this site's `site_id`.
  - This lands in phase 2 with the guard, because without it making an edition would be refused (`unknown_entry`) as soon as references exist.
- **Repeaters are localized as a whole.**
  - With `localized: true`, each version has its own list, and while its own is absent it reads the original's.
  - With `localized: false`, the list lives on the original only, and text sub-fields show the original's words on every version. Studio says so: "Not translated: this list is shared by every language". Per-sub-field localization is open question 2.
- **Machine translation** (phase 5):
  - `get_translation_source` returns a localized repeater's `text`/`richText` sub-values at their paths (`speakers/1/talk`);
  - `save_translation` writes them back only into a list of the original's length (`translation_shape_mismatch` otherwise), copying the other sub-values;
  - reference values are never sent for translation.

  Until phase 5, a localized repeater is translated by hand. The tools ignore it, as they ignore every non-text field today.

### 4. Render cost

`resolveFields` (`fields/resolve.ts:68`) stays pure. A reference resolves to its group ids, and a repeater to its items, each sub-value checked as a field is. It also skips definitions of a type it does not know, so a future type is safe on an older renderer. Loading targets is the renderer's job, in `entryFields` (`astro-renderer/src/fields.ts:172`).

```ts
// @cloudhal/astro-renderer (additive)
export interface ReferencedEntry {
  groupId: string; id: string; collection: string; locale: string; slug: string;
  title: string; summary?: string; url: string; image?: FieldImage;   // the member's cover image
  fromFallbackLocale: boolean;
  /** Present only when depth 2 was asked for: the member's own fields, its references as cards without fields. */
  fields?: RenderedFields;
}
interface RenderedField {                  // existing interface, two optional additions
  references?: ReferencedEntry[];          // reference: resolved members, in stored order (unresolved ones left out)
  items?: RenderedFields[];                // repeater: each item's sub-fields, rendered like fields
}
interface EntryFieldsOptions { /* existing */ depth?: 1 | 2; }   // default 1
interface GraphSource {
  /** The members of these groups that this view shows, in this site (one call per resolution level). */
  groupMembers?(groupIds: readonly string[]): Promise<Map<string, ContentEntry[]>>;
  /** "Who references me": entries this view shows whose resolved value names the group, newest first, at most 100. */
  referencedBy?(groupId: string, q?: { collection?: string; field?: string; locale?: string; limit?: number }): Promise<ContentEntry[]>;
}
```

- **Gated, per view.** The snapshot source builds two gate-independent indexes once per snapshot and isolate, beside `assetIndex`:
  - `members: Map<groupId, ContentEntry[]>` over every published entry;
  - a lazy reverse map from resolved values.

  Every lookup then filters through the *view's* gate state at its instant: the `isAvailable` test and derived gates that `splitEntries` applies (`source.ts:423`), and the view's `assetIndex` for cover images. The snapshot caches only gate-independent card parts: title, slug, URL path and cover asset id per member. The member choice, the fallback and the picture are decided per view, so a Turkish member that opens replaces the fallback at its instant, and one that hides disappears.
- **Depth: 1 by default, 2 at most.** Depth 1 yields cards (title, summary, URL, cover image), which is what a venue link or a speaker list draws. Depth 2 adds each member's own fields, with *its* references as cards. Cycles (A→B→A) cost nothing: resolution is breadth-first over a visited set of group ids. Payload's per-field `maxDepth` and Contentful's `include` levels are the same idea.
- **Fan-out:**
  - per field and per repeater: 50 (contract);
  - per entry: 100 reference values (code, §1);
  - per render: **200 resolved targets**, shared by every `entryFields` call of one request (`MediaContext.budget` already carries per-request budgets).

  Over budget, the remaining targets resolve to nothing with one `console.warn`, never an error. Purges do not depend on what rendered: they go through the index (§2, Purges). A listing of 20 events at depth 1 costs 20.
- **Batching.**
  - The snapshot source does no store reads: every lookup is in memory, and bundles (RFC-0010) need nothing new.
  - The live source (`cloudhal dev`, previews) makes one store read per level: `getGroupMembers(siteId, ids)`, a `json_each` IN list over `nodes_translation_locale`, plus the original by id.
- **`referencedBy` equals the resolved values.** A row sits on the node holding the value.
  - The live source reads `entry_refs` by `(site_id, target_id)`. It keeps the holder when the holder is in the requested locale, and expands a row only through §2's `shared` rule: `shared = 1` adds every inheriting member, `shared = 2` adds those without their own value of `root_key`, and `shared = 0` adds nobody. It then filters by the view.
  - The snapshot's reverse map is built from `resolveFields` output, which applies the same rule.
  - The test plan compares the two on the same snapshot of the working copy, edition chains and localized values held by translations included.
- **Listings** (RFC-0042 §4):
  - **Filter by a reference: yes.** A `reference` field may be a list field, with ops `eq`, `ne`, `in`, `set` and `unset` on group ids: "events at this venue", "talks by this speaker". Its `entry_list_values` rows hold the group id in `text` (≤ 48 characters, below the 100-unit limit). A multiple reference writes one row per id with `has = 2`, like a multiple select (migration 0029).
  - **Sort by a reference, or filter by a referenced entry's field** ("events whose venue is in Istanbul"): **no.** Either needs denormalized target values that every target edit would invalidate. Agents and themes do it in two steps: `places` by `city eq istanbul`, then `venue in [...]` (at most 20 values).
  - **Repeaters** cannot be list fields (`list_field_type`).
- **Structured data** (RFC-0042 §2), phase 8. A fifth source kind, `ReferenceValueSource`:
  ```jsonc
  { "title": "ReferenceValueSource", "type": "object", "additionalProperties": false, "required": ["kind", "field"],
    "properties": { "kind": { "type": "string", "enum": ["reference"] },
                    "field": { "$ref": "#/$defs/FieldKey" },                       // a single reference field with one target collection
                    "property": { "$ref": "#/$defs/ReferenceValueProperty" },     // title | url | summary
                    "targetField": { "$ref": "#/$defs/FieldKey" } } }             // or a field of the target collection
  ```
  - Exactly one of `property` and `targetField` is given (checked in code).
  - `targetField` is checked against the target collection's definitions with the preset table's type rules. So `location.address.streetAddress` can come from the venue's `street` field, and the motivation's "address retyped on every event" is solved, not just `location.name`.
  - **The data path.** `structuredDataFor` stays pure (`structured-data/values.ts:26-40`). Its `StructuredDataContext` gains `references?: ReadonlyMap<FieldKey, { member: ContentEntry; fields: ResolvedFields }>`, one entry per reference field a preset source names.
    - `withStructuredData`, the async renderer export that already loads the original and assets (RFC-0042 §2), fills the map: for each such field, `pickMember` through the view (gated), then `resolveFields(site, member, memberOriginal)`, so a translation member's non-localized `street` comes from its original.
    - This is one member per field, independent of the card depth: cards stay depth 1.
    - A missing member or value emits nothing for the path, and a missing *required* value drops the preset document, as RFC-0042 §2 does for any required value.
  - `ReferenceValueProperty` is a named `$defs` enum, as RFC-0042 §1 requires for Rust.

### 5. Studio

All new UI follows `kumo-design`, `studio-ui` and DESIGN.md "Fields", imports only from `@cloudhal/ui`, and puts its words in the lazy `fields` namespace.

| New block (`packages/ui/src/blocks`) | Built from (Kumo) | What it does |
|---|---|---|
| `EntryPicker` | `Dialog`, `Input` (search), `Combobox` list semantics, `Badge`, `Checkbox`, `Empty`, `Loader` | Search a site's entries in the allowed collections: title, collection badge, status badge, locale. Single or multiple choice, at most the remaining `maxItems`. Takes a `search(q)` prop, so the block makes no API calls. |
| `ReferenceList` | `InsetPanel` rows (existing block), `Button`, `Badge`, `DropdownMenu`, `Link` | The chosen targets in order: open, remove, move up/down. A "Draft" or "Archived" badge with "Will not show until published"; "Not found" for dangling ids. |
| `RepeaterField` | `Collapsible`, `Button`, `DropdownMenu`, `Text`, `Empty` | Items with "Add item", a count ("3 of 20"), and move/duplicate/remove per item. Sub-field controls come through a `renderControl` prop. |
| `FieldControl` | (extracted) | One control per type, taken out of `EntryFieldsForm.tsx` (already 424 lines, over the soft 400). `EntryFieldsForm` and `RepeaterField` both use it, so neither file grows. |
| `UsedByList` | `Table` / the `resource-list` Kumo block, `Badge`, `Link` | The entry editor's "Used by" card and the delete dialog's referrers. |

- **Entry editor.**
  - `EntryFieldsForm` gains `renderReference?: (slot: FieldReferenceSlot) => ReactNode`, the pattern of `renderImage` (`EntryFieldsForm.tsx:61-69, 97`). Studio's `FieldReference` (`apps/studio/src/components/fields/`) composes `ReferenceList` and `EntryPicker` around `api.entries.pick`.
  - Repeaters render inside the form with `RepeaterField`. Image sub-fields reuse `FieldImage`.
  - On a translation, a non-localized reference or repeater is read-only, with "From the original" and a link. A localized one shows the original's value as a placeholder.
  - **"Used by":** a `SectionCard` with every referrer (`GET …/entries/:id/references`), published ones first.
  - **The delete dialog:** it disables Delete only while a *published* referrer exists and this is the group's last member ("Unpublish or edit these 2 published entries first"). It lists draft referrers as "Will show nothing for this field" and lets the delete go ahead.
- **Fields builder** (`FieldDialog.tsx`):
  - **reference:** target collections (a multi-select of declared collections), "Several" (`multiple`), the maximum, and conditions when one collection is chosen;
  - **repeater:** a nested sub-field list (rows like `FieldRow`, with up/down and ⋯), the maximum and the item label;
  - the ⋯ menu's operations gain the sub-field forms and the new `change_field_type` inputs (§7).
- **API** (site-scoped, under the `/sites/:siteId` membership check):
  - `GET /sites/:siteId/entries/pick?collections=a,b&q=&locale=&limit=` answers at most 20 `{groupId, id, title, collection, status, locale}` per page, never archived ones. It needs `content:read`. `q` is at most 100 characters, matched as a case-folded substring on titles and slugs (`includes`, no regex: rule 13), under a per-member window of the existing `rate_limits` counters (`packages/api/src/rate-limits.ts`, migration 0030).
  - `GET /sites/:siteId/entries/:id/references` answers the referrers from `entry_refs`, expanded to members, paged.
- **Accessibility:**
  - Each repeater item is a `fieldset` whose `legend` is its label ("Speaker 2: Ada Lovelace"), an ICU `selectordinal`/`plural` message, never concatenated.
  - Moving is done with buttons ("Move Speaker 2 up"), never by dragging only.
  - After "Add item", focus moves to the new item's first control. After "Remove", it moves to the next item's legend, or to "Add item"; an undo toast follows.
  - `EntryPicker` labels its search field, announces the result count in a polite live region, supports arrow keys and Enter in the list, and returns focus to its trigger.
  - Errors map to their controls by path (`fields/speakers/2/person`) and are listed above the form when they sit in collapsed items, which open on submit.
- **Mobile (390 px):**
  - item actions fold into one `DropdownMenu` (⋯);
  - sub-fields stack;
  - `EntryPicker` takes the full width;
  - `ReferenceList` rows wrap their badges under the title.

  `pnpm design:shots` at 1440 and 390 shows no sideways scroll, and `design:lint` passes, `rtl-logical` included.
- **Bundle:** the blocks load with `EntryFieldsForm`, which loads only for collections with fields and is already lazy. The initial bundle grows by +0 kB (`bundle-budget.ts`).

### 6. MCP and the JSON Schema agents receive

- **Tools.**
  - `list_collections` returns the new definitions and their schemas.
  - `create_entry`/`update_entry` precheck the reference and repeater rules with the store's checker.
  - Approval prompts name targets readably: `venue → "Main hall" (entry_…, Places)`, `speakers: 2 items → 3 items (added "Ada Lovelace", Speaker)`, with values quoted and truncated (`quote()`).
  - `delete_entry` refuses in precheck with `entry_referenced` and the published referrers.
  - New, read-only: `list_references { siteId, entryId, direction: "to" | "from" }` (`content:read`).
  - `list_entries` with `where: [{field: "venue", op: "eq", value: "entry_…"}]` works once the field is listed.
- **`update_collection`'s input.**
  - MCP tool calls stay non-strict, as RFC-0041 open question 3 decided, so the input keeps the contract's `oneOf`. The first draft proposed rewriting it to `anyOf` for strict modes. That is dropped: the variants' optional properties, `uniqueItems` and numeric bounds fail strict modes anyway.
  - The real bug fixed here: `FIELD_DEFINITIONS_INPUT` hard-codes its `$defs` (`mcp-server/src/collection-fields.ts:22-39`), and the new variants `$ref` `SubFieldDefinition` and `FieldCondition`. Phase 1 replaces the list with `defsClosure(SiteSchema, "FieldDefinition")`, a transitive walk over `$ref`s (`hoistDefs` in `schema-transforms.ts:10` only hoists nested `$defs`, and finds no missing ones).
  - A test asserts that every `$ref` in every tool's input and output schema resolves.
  - The input lists only the *enabled* types, so agents see the new variants from the enabling step on, not before.
- **`fieldsSchema`** (`fieldsJsonSchema`, `json-schema.ts:145`), the default and open profile:
  - `reference` is `{type: "string", pattern: "^entry_[A-Za-z0-9]{6,32}$"}`, or an array of them;
  - `repeater` is `{type: "array", items: {type: "object", properties: …, additionalProperties: false}}`;
  - the root is always `type: "object"`, never `oneOf` or `anyOf`;
  - there is no `$ref`, `$defs` or recursion, and depth is at most 4 (fields → list → item → value) against OpenAI's 10;
  - limits are written into `description`, because Anthropic drops `minimum`/`maxLength` and takes `minItems` only as 0 or 1.

  `JSON_SCHEMA_KEYWORDS` (`json-schema.ts:29`) is unchanged.
- **The strict profile and what `null` means.** OpenAI's strict mode needs every property required, with optional ones as a `null` union. Today's tools give `null` other meanings: `update_entry`'s merge patch deletes the key (`mergeFields`, `mcp-server/src/entry-fields.ts:45-53`), and `create_entry`'s checker refuses `null` as a value (`value-checks.ts:137-138`). Fed into `fields`, strict output would therefore delete untouched fields on update and be refused on create. So strict output gets its own input:
  - `create_entry` and `update_entry` gain **`fieldsStrict`**, which excludes `fields` (`invalid` when both are given). In it, `null` means **"leave as it is"**: on create that is no value, and on update the stored value stays.
  - A `null` sub-value inside a repeater item is stripped before checking: that sub-field is unset in that item.
  - A given reference or repeater value replaces the whole value.
  - Removals go in a separate **`clearFields: FieldKey[]`**, which works with either input.
  - **Edge cases**, decided:
    - A key absent from `fieldsStrict` also means unchanged. The input accepts any subset of keys, which is what makes splitting a schema work.
    - An item whose sub-values are all `null` becomes `{}` once stripped. It is dropped from the list, and the result reports it (`droppedItems`), so the "no empty item" rule never fires on strict output.
    - A key that is non-null in `fieldsStrict` and also listed in `clearFields` is refused in precheck (`invalid`, "set or clear, not both").
    - An unknown key in `clearFields` is `unknown_field`.
    - `clearFields` on create is `invalid`, since there is nothing to clear.
  - `fieldsJsonSchema(defs, locale, defaultLocale, { strict: true })` emits that meaning: every property required, `type: [T, "null"]`, and `enum` with `null` for selects. `list_collections` returns it as `fieldsSchemaStrict`, with `strictCost: { properties, depth, enumValues, unions }` counted by `strictSchemaCost`.
  - **Over a provider's limit** (Anthropic: 16 unions per request), a caller builds a smaller schema from a subset of `fieldsSchemaStrict.properties`. Each property's schema stands alone, with no `$ref`, and splitting is safe precisely because `null` leaves other keys alone.
  - Phase 5 tests the round trip:
    - strict output that changes only `venue` leaves `startsAt` and `speakers` untouched;
    - a create with nulls stores no value;
    - nulls inside items are stripped, and all-null items are dropped and reported;
    - a subset of keys leaves the others alone;
    - set-and-clear of one key is refused.
- **Example.** An `events` collection with `startsAt` (datetime), `venue` (a reference to `places`) and `speakers` (a repeater: `person` → `people`, `role` select, `talk` text):

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
        "description": "An entry in Places (places) of this site, by the groupId list_entries returns (an entry's own id is replaced by its group's). Set on the original only; every language version shows the venue in its own language."
      },
      "speakers": {
        "type": "array",
        "title": "Speakers",
        "description": "An ordered list of at most 20 items. Set on the original only.",
        "items": {
          "type": "object",
          "properties": {
            "person": { "type": "string", "pattern": "^entry_[A-Za-z0-9]{6,32}$", "title": "Person", "description": "An entry in People (people), by groupId. Needed to publish." },
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

  In the strict profile, every object lists all its properties in `required`.
  - `venue`, `person`, `role` and `talk` read `"type": ["string", "null"]`, and `role`'s `enum` gains `null`.
  - `startsAt` reads `["object", "null"]`, and `speakers` reads `["array", "null"]`.
  - `strictCost` is `{ properties: 8, depth: 4, enumValues: 4, unions: 6 }` (`startsAt`, `venue`, `speakers`, `person`, `role`, `talk`), within both providers' limits.
  - `list_entries` and the pick route return `groupId` for this reason.

### 7. Field operations (`fields-operations/`)

The four operations, their phases, budgets and revert stay as RFC-0041 §6 built them (`fields-operations/types.ts:22-50`). Phase 2 already makes every rewrite carry its `entry_refs` rows and the target guard (§2.6). Phase 4 adds the new types:

- **`sub`.** A repeater's sub-field is addressed with a new optional `sub` parameter (`rename_field {from: "speakers", sub: "name", to: "fullName"}`), and the marker records it (`FieldMigration.sub`, §1).
- **`change_field_type` gains the inputs the new definitions require** (`FieldOperation` in `types.ts:36-46`, the MCP tool and `cloudhal fields retype`):
  - `collections?: string[]` (required to a reference);
  - `maxItems?: number`;
  - `subFields?: SubFieldDefinition[]` and `itemLabel?: FieldKey` (required to a repeater);
  - `options` and `multiple` as today.

  The CLI takes `--collections a,b`, `--max-items 20` and `--sub-fields <file.json>`. The dry run refuses a target definition that would not pass `checkFieldDefinitions`.

| Operation | Reference | Repeater |
|---|---|---|
| `rename_field` | moves the key; rows' `field` follow each rewritten entry; list fields and sections follow as today (`fields-operations/references.ts`) | moves the key, or with `sub` the sub-key in every item; rows (`speakers.person`) and asset rows (`fields.speakers.photo`) follow |
| `change_field_type` | see below | see below; with `sub`, a sub-field converts by RFC-0041's table among sub-field types |
| `set_field_localized` | true→false keeps the original's ids and deletes translations' copies and their rows; false→true writes nothing | the same, for whole lists |
| `remove_field` | deletes values and their rows; refused while list fields or presets use it (`list_field_in_use`) | deletes the list, or with `sub` the sub-value in every item (an item left empty is dropped) |

New rows of the closed table (`conversions.ts:38`):

| from → to | conversion | unconvertible |
|---|---|---|
| reference single ↔ multiple | as select: one id ↔ a list of one; an empty list is no value | multiple → single with more than one id |
| text → reference | the one group among the allowed collections with a member whose slug, or default-locale title, equals the text exactly (case-folded) | no match, or more than one |
| reference → text | the group's default-locale member's title (a list: comma separated) | a group with no member in the site |
| text (multiline) → repeater | one item per non-empty line into the repeater's single `text` sub-field (RFC-0042's ingredient lines) | a line over the sub-field's `maxLength`; more lines than `maxItems` |
| repeater → text | a repeater with a single `text`/`richText` sub-field: items joined by line breaks (multiline) | other sub-field shapes |
| reference (multiple) ↔ repeater | a repeater with a single `reference` sub-field: one item per id, and back | a repeater with other sub-fields |

- **Where the graph reads happen.** The table is pure and synchronous (`conversions.ts:1-3`, `ConvertContext` at `:26-31`). The two text ↔ reference rows need entries, so `ConvertContext` gains an optional, prefetched `entries?: { byText: ReadonlyMap<string, string[]>; titles: ReadonlyMap<string, string> }` (case-folded slug or title → group ids; group id → default-locale title). Who builds it:
  - each operation pass (dry run, phase B pass, revert pass), from one read of the target collections, before the pass;
  - the store's `EntryEngine.write`, which is async, before it calls `normalizeEntryFields` (`entry-fields.ts:69-78`), only while a marker with such a conversion is active;
  - the snapshot source, from its in-memory entries, lazily and only while the snapshot carries such a marker;
  - the live source, which is async like the store: it builds the maps from the working copy, the same graph phase B reads, before resolving an entry whose collection carries such a marker.

  Every converter therefore has the maps. Writers, phase B and the live source read the working copy, so they convert identically, and RFC-0041 §6's "a person's edit and the operation converge" holds.

  The snapshot source converts against the snapshot's own entries. That is the graph it renders, and it may legitimately differ from the working copy, as every other value does. The test plan compares the two sources only on a snapshot of the current working copy, where both read the same entries.
- **Phase B writes references only under the target guard** (§2.6). A missed guard skips the entry for the next pass, so a conversion can never write a deleted target.
- **Revert** (`fields-operations/revert.ts`) restores earlier values under the same guard. A restored reference whose group has no member left in the site is dropped and reported in a new `FieldRevertResult.dropped: { entryId, field, targetId }[]`.
- **Free definition edits:**
  - add or reorder sub-fields;
  - change labels, help, `itemLabel` or `where`;
  - widen `maxItems` or `collections`;
  - narrow `maxItems`: values are checked on their next write (RFC-0041 §6).

### 8. Threat model

| Threat | Mitigation | Test |
|---|---|---|
| **A draft, archived, embargoed or hidden target leaks through a published referrer** (the snapshot holds drafts, and `Loaded` holds published entries before gates) | Resolution filters through the view's gates at its instant (§4); only gate-independent card parts are cached. A card carries only the member's public title, summary, URL and cover image, the image through the view's asset gates. Unresolved values render nothing: no id, no `data-` attribute, no empty link. JSON-LD's `reference` source uses the same cards. | RFC-0008's route sweep (extended by RFC-0042) gains a published referrer pointing at a draft, an archived, an embargoed and a `hide`-expired target, before and after their instants. No id, slug, title or asset of a hidden target may appear in HTML, JSON-LD, feeds, the sitemap, search, `llms.txt`, status pages or response headers. Purges go through the index, so no header carries target ids (§2). |
| **IDOR in the picker and on write** | Pick and references routes run under the `/sites/:siteId` membership check and query by `site_id`. The target guard requires a member with `n.site_id = ?` (§2.1). An id of another site gets the same `unknown_entry` as an id that does not exist. Editions copy only ids the edition site can resolve (§3). | A shared-suite case: another site's entry or group id in `create_entry`, `update_entry`, the API and `push` is refused identically; the pick route with another site's id answers 404. |
| **An imported or pushed archive pins another tenant's entries or assets** | Rows are site-scoped, and every guard filters both the row's `site_id` and the member's (§2). `asset_refs` gets the same filter as a phase-2 prerequisite (§2.5). | An archive referencing site Y's entry or asset, imported into site X, must not block Y's delete or move, and must not list X's titles to Y. |
| **Lock-out by low-privilege actors** (`content:draft:own`, `content:write:own`) | Only what a published entry shows blocks, by the `shared` rule (§2): a translation's own value is never inherited. Contributors cannot publish; drafts, review and archived entries never lock. | Policy-suite cases that must *not* block: a contributor's draft; an author's review entry; a draft translation's `localized: true` value while its original is published; an edition member's value. Cases that must block: an author's published entry; a published translation inheriting its original's `localized: false` value. |
| **Fan-out DoS on render** | Caps of 50 per field, 50 items and 10 sub-fields (contract); 100 reference values per entry (code); depth ≤ 2 with a visited set; 200 targets per page; ≤ 2 live reads per page, 0 for snapshots; `referencedBy` ≤ 100. | A property test: random graphs with cycles and 10× the caps resolve within budget, never throw, and cost at most `depth` live reads. |
| **Write amplification and slow guards** | Each guard is one indexed probe on `(site_id, target_id)` or one `json_each` count; members are found through `nodes_translation_locale`. Delete, move and group change cost one probe each, plus the site anchor when rows exist. The purge planner adds one probe per touched group. Rebuilds are chunked inside one batch. | RFC-0042's benchmark (#105), extended to 10,000 events × 3 references on Miniflare D1, reports the write, delete and move guard costs. |
| **Picker search abuse** | `q` ≤ 100 characters, a substring match with no regex (rule 13), ≤ 20 results, and a per-member rate window. | A 100k-character `q` is refused before it is read. |
| **Prompt injection through target titles** | Titles are data, quoted and truncated in approval prompts (`quote()`, 60 characters); `list_references` marks them as content. | Approval-prompt tests gain reference cases. |
| **An older site Worker crashes on the new types** (`COMPILE[def.type]`, `props.ts:46`, has no entry) | `GET /__cloudhal/features` adds `{ "fields": 2 }`. Every write path refuses the new types with `409 fields_unsupported` until it is reported: interactive writes and `checkBundle` for import, sync, push, pull and restore (§1), as `gates: 2` guards `expiry` (`availability.ts:243`, `cloudflare/src/features.ts`). `resolveFields` skips unknown types from phase 1. | The site Worker features test; an import, a push and a restore of a bundle with a reference definition are refused before step 7; a renderer test with an unknown field type. |
| **Assets in repeaters deleted while used** | `fieldAssetRefs` walks items, `fieldAssetIssues` resolves sub-field types, and the purge planner's asset rule reads field and item assets (§2.5). | An asset used only in a repeater item cannot be deleted; the rebuild keeps its row; a retired, foreign or non-image asset in an image sub-field is refused at its item path; a changed item image purges its page. |
| **A group change strands references** (`translation.group` is writable) | Leaving a group is guarded like a delete, with the site anchor (§2.2, R6). | Relinking a referenced untranslated original as a translation, and dropping `translation`, are both refused while a published entry shows the reference; a draft referrer does not block. |

**Policy.** No new scopes.
- Field definitions stay site settings: `site:settings`; for agents, `site:write` plus a person's approval, person-classed as today (`field-tools.ts:264-267`).
- Values are content: `content:write`, with the `:own` limits.
- Reading targets in the picker and `list_references` needs `content:read`, which every role already holds (`roles.ts` `READ`).
- Referencing an entry never writes it. Only what a published entry shows can stop its delete, its move or its leaving the group (§2.2).

### 9. Rollout (one PR each; the types stay refused on every write path until step 7)

0. **Prerequisite: `asset_refs` by site** (§2.5).
   - `deleteAsset`'s guard filters by site;
   - `refsRebuild` joins same-site assets and chunks its `INSERT`;
   - the purge planner's asset rule reads field assets.

   It is independent of this RFC's types, and fixes three existing gaps.
1. **Contract and pure core:**
   - the §1 diff, fixtures and `pnpm gen` through `contract-change`;
   - the gate: `checkFieldDefinitions` **and** `checkBundle`'s `assertFieldTypes` refuse both types (`fields_unsupported`), so a phase-1 server takes no such definition from Studio, MCP, the API, import, sync, push, pull or restore;
   - `fieldPropSchema`, value checks, `resolveFields` (skipping unknown types);
   - `fieldsJsonSchema` (open and strict) with `strictSchemaCost`, `referenceIssues`, `pickMember`;
   - the dispatch-table entries of §1;
   - `defsClosure` and the resolving-`$ref`s test for every tool schema, with the new variants filtered out of `update_collection`.

   No behaviour change.
2. **Store and integrity:**
   - migration 0033, with `entry_refs` in `SITE_TABLES`;
   - the target guard, the definitions anchor bound as planned, and the rows with `shared`/`root_key`;
   - the delete, move, group-change and publish rules, with the site anchor and the policy (§2.2), and the races R1 to R11 as cases;
   - chunked `entryRefsRebuild` in import, sync and restore, and `referenceIssues` in `import --dry-run`;
   - the item walk in `fieldAssetRefs`, and `fieldAssetIssues` with sub-field types and item paths;
   - rows and the target guard in field-operation rewrites, with operations naming the new types refused;
   - the kind-aware release `depsOf`;
   - edition id mapping in `forEdition`, emptied items dropped;
   - the `fields: 2` capability in the gate;
   - the API: entry routes, `pick` and `references`.

   The shared suites enable the types with a store option (`SiteGraphStoreOptions.fieldTypes`); production keeps refusing them.
3. **Renderer and purges:**
   - cards, depth and budget, gated per view;
   - `groupMembers` and `referencedBy` on both sources, with the `shared` rule;
   - `EntryFields.astro` (links for references, a nested `<dl>` per item);
   - the conversion maps in the live and snapshot sources;
   - the purge planner's referrer rule and `SnapshotReader.referrersOf` (no new tags);
   - features `fields: 2`;
   - the route sweep extension;
   - a frozen theme copy for `old-theme-compat.test.ts`.
4. **Field operations:** `sub`, the new `change_field_type` inputs, the conversion rows with the prefetched context, revert `dropped`, and the CLI flags.
5. **MCP:**
   - `list_collections` (`fieldsSchema`, `fieldsSchemaStrict`, `strictCost`);
   - `fieldsStrict` and `clearFields` with the edge cases of §6;
   - prechecks, `delete_entry`'s refusal and `list_references`;
   - the translation tools' repeater paths;
   - the operation tools' new inputs;
   - regenerated tool docs (`node scripts/mcp-tools-doc.ts`).
6. **Studio:** the five blocks, `FieldReference`, the builder, "Used by", the delete dialog and the publish warnings; `design:shots`; the `fields` namespace and `pnpm i18n:import`.
7. **Enable** (small):
   - the gate accepts the two types where the site Worker reports `fields: 2`, on every path;
   - `update_collection`'s input lists them;
   - the one-time per-site `entryRefsRebuild` job (§2.4);
   - `docs/guides/fields.md`.

   It needs steps 0 and 2 to 6 released.
8. **Listings and structured data:** reference list fields (rows, `checkFieldQuery`, the property suite), and `ReferenceValueSource` with `targetField` (its own `contract-change`, §4).

**Test plan.** Store behaviour goes into the shared suites (`packages/core-ts/src/testing-*.ts`), on SQLite, Miniflare D1 and Durable Object SQLite.
- `testing-references.ts` (new):
  - writes, and canonicalizing a member's id to its group;
  - refusing a missing, cross-site, wrong-collection, own-group or archived new target;
  - **every race R1 to R11 of §2.3**, as two interleaved batches each: the definitions anchor bound as planned (with a definitions change between `getSite` and the batch), and the move and delete site anchors;
  - delete: the last member versus a remaining member in an allowed or a disallowed collection, and a published versus a draft referrer;
  - moves of an original and of a translation;
  - group changes: relinking a referenced original, and dropping `translation`;
  - publish re-checks;
  - the `shared` rule:
    - a draft translation's `localized: true` value does not block;
    - a published translation inheriting a `localized: false` value does;
    - edition members never inherit;
  - the same target in two items;
  - an edition site referencing a cross-site group;
  - rows kept for a missing target, and still blocking once a member reappears;
  - rows after every write, delete, import, restore and operation phase;
  - a foreign-tenant archive;
  - site deletion removing the rows.
- `testing-gates.ts`, beside its bundle-gate cases: a bundle with reference or repeater definitions is refused by import, push, pull and restore before step 7, and accepted with the capability.
- `testing-fields.ts`: repeater values, `requiredToPublish` per item, the leaf and reference caps, assets in items.
- `testing-assets.ts`:
  - an asset used only in a repeater is not deletable, and its row survives a rebuild;
  - a non-image in an image sub-field is refused at its item path;
  - another site's archive does not block an asset's delete.
- `testing-field-operations.ts`: every new conversion row, `sub`, a target deleted during phase B, resume, revert with a deleted target.
- `testing-releases.ts` (today on SQLite and D1): a scheduled referrer of a non-live target is not held and renders without it, and an edition's group id never fails the run.
- `testing-translations.ts`: edition mapping, drops and emptied items reported.
- `testing-list-values*.ts`: reference list fields, the seeded SQL-versus-evaluator comparison included.
- **Pure tests:**
  - the emitter's keywords and depth, root `object`, no recursion, `strictCost`;
  - the strict round trip and its edge cases (phase 5);
  - `referenceIssues` and `pickMember`;
  - the definitions anchor's text equality for every fixture definition;
  - budget and cycles, property-based.
- **Renderer:**
  - identical cards and `referencedBy` on the snapshot and live sources, for a snapshot of the working copy;
  - gate instants;
  - purge plans for a target retitled, unpublished, newly published, newly translated and with a changed cover, with a theme that emits no new tags.
- **Studio:** block tests (keyboard, focus after add and remove, live region), `design:shots` at both widths, `design:lint`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Store a per-site anchor member's id instead of the group id | No foreign ids in values | Editions need an id rewrite per site; the anchor changes when the original is deleted; every lookup maps member → anchor | The group id is project-stable and already indexed (§1) |
| Anchor every entry write on the site hash | Simple | Any site edit (theme, menus) conflicts every concurrent entry write | Anchor on the collection's definitions only (§2.1) |
| Every reference locks, drafts included (Sanity's strong default) | Strictest | Contributors pin others' entries; abandoned drafts pin forever | Only what a published entry shows locks, by the `shared` rule (§2.2) |
| Weak references (no locking at all) | No refusals | Live pages silently lose venues on delete; "used by" still needs the index | Lock where the live site depends |
| Cascade or "unlink and delete" | One click | Rewrites other people's entries as a side effect | Refuse and list; open question 1 |
| Block publish or fail the build on unresolved references | Strict | Publish is a site snapshot; one draft venue blocks every fix | Warn (§2) |
| References as release dependencies (today's generic extractor) | A scheduled event takes its venue live with it | Locks every member of the target until the run; edition group ids fail runs; hard, where render is soft | Kind-aware `depsOf` drops them (§2.7) |
| `cloudhal-ref-<group>` cache tags on referrer responses (first revision) | Purges by group | Themes build tags themselves, so existing themes would never emit them; older site Workers answer 400 to new prefixes and every publish purges everything; ids in headers rest on unverified stripping; header budget | The purge planner adds referrers' existing node tags through `entry_refs` (§2, Purges) |
| Store something immutable (a new `refId` per entry) instead of the group id | Survives group changes | A new identity on every entry, its own index, migrations and editions mapping; translations still need group resolution | Group ids, with group changes guarded like deletes (§2.2) |
| Rewrite referrers when a target changes group | Group changes always succeed | Rewrites other people's published entries as a side effect of a translation link | Refuse while shown by a published entry (§2.2) |
| Keep rows only while the target has a member (first revision) | Smaller table | Nothing re-creates rows when a member reappears; cleanup on last-member delete is fiddly | Rows for every stored value; the site filter is the isolation (§2) |
| `null` in strict output means "remove", as in `fields` | One input | Following the schema deletes every untouched field | `fieldsStrict` with `null` = unchanged, plus `clearFields` |
| `anyOf` in `update_collection`'s input for strict modes | Looks strict-friendly | Optional properties and bounds still fail strict modes | Inputs stay non-strict; `$defs` fixed instead |
| Reverse lookups by scanning `json_extract` over `nodes` | No table | Every delete and move scans the site | `entry_refs`, the `asset_refs` pattern |
| `blocks` (a heterogeneous list) | ACF flexible content, Payload blocks | A union per item (Anthropic: 16 per request); a second form engine; overlaps body directives, surfaces and sections | Repeaters only |
| Nested repeaters | Richer models | Recursion or a second subset level; strict limits multiply | Depth fixed at 1 |
| Per-sub-field localization in a shared list | Shared structure, translated words | Stable item keys and a merge by key on every read | Repeater-level `localized`; open question 2 |
| Sort or filter by a referenced entry's field | One query | Denormalization invalidated by every target edit | Two-step queries (§4) |
| Drop the text ↔ reference conversions | A purely pure table | Loses the main migration path (organizer text → a reference) | A prefetched conversion context (§7) |

## Compatibility & migration

- **Contract:** two new variants, a new `$defs` and one optional marker property. Existing sites, snapshots, bundles and archives stay valid, and there is no `schemaVersion` bump.
  - An admin Worker before phase 1 refuses the new definitions by schema. One at phases 1 to 6 refuses them by the gate, on every write path, bundles included (§1). Servers upgrade first.
  - An older site Worker is covered by `fields: 2`.
  - The purge endpoint and `isCloudhalCacheTag` are unchanged, so mixed admin and site Worker versions purge normally (§2).
- **Data:** none to migrate. The types are refused on every write path until step 7, so migration 0033 is DDL only. Step 7's one-time per-site rebuild is the safety net, and the definitions anchor keeps `field_key_in_use` honest.
- **Themes:** additive. `entry.fields` keeps meaning what is stored: group ids and item objects.
  - Themes from v0.5.0 on render fields through the renderer's `entryFields` and `EntryFields.astro`, so they draw references and repeaters after a renderer upgrade.
  - Older copies show nothing for them.
  - Either way, no theme code is needed for correct purges, because referrers are purged through their own node tags (§2).
- **Releases:** the kind-aware `depsOf` changes nothing for existing content, because no field value can be a group id before step 7.
- **Rollback:**
  - A snapshot restores the site node and entries, and the index is rebuilt in its batch.
  - An operation reverts through its `before` snapshot, dropping deleted targets.
  - `remove_field` removes values and rows.
  - Downgrading below this RFC restores a snapshot from before the first reference or repeater definition; `entry_refs` is then unused.

## Security & policy impact

§8 is the threat model and the policy.
- No new scopes and no new approval points.
- Every statement filters on `site_id`, every guard re-checks it, and nothing resolves across sites.
- New refusals, each with a hint in `field-hints.ts`: `entry_referenced`, `reference_target_moved`, `unknown_entry`, `too_many_references`, `field_key_in_use`, `fields_unsupported`, `field_operation_unsupported`, `translation_shape_mismatch`.

## Open questions (each with a recommended answer)

1. **Deleting a referenced entry:** refuse while a published referrer exists and this is the group's last member in the site; no cascade. *Recommended.* Add an explicit `unlink_entry` operation (dry run, approval, snapshot, revert) if people ask for it.
2. **Per-sub-field localization in a shared repeater:** not in stage 4. *Recommended.* Revisit with stable item keys (`_key`, which cannot collide with a `FieldKey`).
3. **`datetime`, multiple selects and references inside repeaters** (an agenda's session times): not in stage 4, because ADR-0030's array items are flat scalars. *Recommended:* the first follow-up, allowing a flat object one level below an item for `datetime` only (an ADR-0030 amendment), at a strict depth of 5 of 10.
4. **The locale rule under `fallback: none`:** no version in the page's language resolves to nothing, and `referenceIssues` reports it. *Recommended*, because it is how pages behave under `none`.
5. **Archived targets:** existing values keep pointing at an archived group, which renders nothing; a *new* choice needs a member that is not archived. *Recommended.*
6. **`where` on references:** checked when a value is newly chosen only (Sanity's `filter` model). *Recommended.*
7. **Default render depth:** 1, with 2 as the ceiling. *Recommended.*
8. **`fieldsSchemaStrict` beside `fieldsSchema`**, with `strictCost`, and no automatic splitting into groups. *Recommended.*
9. **Publish warnings as a gate:** never; warnings only. *Recommended.* A site setting could later make them a person-approval point for agents' publishes, like RFC-0042 §3.5's expiry rule.
10. **Review referrers:** they do not lock, like drafts. *Recommended*, so that a contributor's review request never pins an entry. The alternative, locking from review, protects content about to go live, but it reopens the contributor lock-out.
11. ~~`asset_refs` follow-ups~~ **Decided** in the second revision: §9 step 0 is a prerequisite of phase 2 (§2.5).
12. **Edition chains and non-localized values:** inside an edition site, the edition node's translations do not inherit its non-localized values of any type, as RFC-0041 behaves today (`originalOf`). References follow that rule (`shared = 0`). *Recommended:* keep it in stage 4, and fix it for every field type in its own change, defining the in-site root as the member with no same-site source.
13. **R8** (a translation published just after its inherited target was deleted): accept it with a warning. *Recommended*, because refusing would block a translator over a value they cannot edit. The alternative is to refuse the publish until the original's value is fixed.

## Review log (2026-11-10, PR #193)

An independent multi-agent review upheld 28 findings and split two. Each one, with the decision taken. Section numbers in this first table refer to commit fe8ac929; the second round renumbered §2 (§2.4 rebuilds, §2.5 assets, §2.6 field operations, §2.7 releases).

| # | Finding | Decision |
|---|---|---|
| U1, U18 | Repeater image and rich-text sub-fields are missing from `asset_refs` | `fieldAssetRefs` walks items under `fields.<key>.<sub>` (§2.4, phase 2, tests) |
| U2, U14, U20 | "The original in this site" is undefined for editions; lookup keys mismatch | Values store the group id; members are resolved and guarded in-site (§1, §2.1, §3, §4) |
| U3 | Entry writes are not anchored on the definitions | Definitions anchor on every entry write that changes fields (§2.1); races in the test plan |
| U4 | Group members may sit in other collections | Resolution and `referenceIssues` filter by `collections`; the move guard covers any member (§2.2, §3) |
| U5 | Reference conversions need reads; the table is pure | A prefetched `ConvertContext.entries`; who builds it is stated (§7) |
| U6, U27 | Phase B writes references unguarded | Target guard in every rewrite that changes references (§2.5, §7) |
| U7 | `referencedBy` misses inheriting translations | `source_group` column and expansion; the snapshot map is built from resolved values (§2, §4) |
| U8, U28 | Guards cannot use the index | `site_id` in every guard (§2) |
| U9, U15 | Resolution on the gate-free `Loaded` | Gated per view; only gate-independent parts cached (§2, §4, §8) |
| U10, U19 | Strict `null` contradicts the tools | `fieldsStrict` (`null` = unchanged) plus `clearFields`; round-trip tests (§6) |
| U11, U23 | Tag arithmetic; no purge on newly visible targets | `cloudhal-ref-<group>` for every value read, a 4 KB budget with a site-level fallback tag, group purges (§2) |
| U12 | Rebuilds pin foreign tenants | Rebuild joins same-site members; `site_id` filters; `asset_refs` follow-up (§2.3, OQ 11) |
| U13 | Lock-out by `:own` actors | Only published referrers lock (§2.2, §8, OQ 10) |
| U16 | Phase 1 accepts values before the index exists | Types refused until step 7; the store option for suites; the dispatch tables listed (§1, §9). `archive-reassemble.ts`'s tables key manifest types and are not affected. |
| U17, S1 | Dangling `$defs`; `anyOf` is not strict anyway | `defsClosure` plus a `$ref` test in phase 1; the `anyOf` plan is dropped; the input stays non-strict (§6) |
| U21 | Edition mapping and repeater MT in no phase | Edition mapping in phase 2, repeater MT in phase 5 (§3, §9) |
| U22 | Operations leave `entry_refs` stale until phase 4 | Rows in rewrites from phase 2; operations on new types refused until phase 4 (§2.5) |
| U24 | Primary-key collision across items | Pairs deduplicated, `INSERT OR IGNORE` (§2) |
| U25 | The Event address cannot come from a Place | `ReferenceValueSource.targetField` (§4) |
| U26 | `change_field_type` lacks inputs | `collections`, `maxItems`, `subFields`, `itemLabel`, and CLI flags (§7) |
| S2 | The release closure treats ids as dependencies | Kind-aware `depsOf` drops references; a `testing-releases` case (§2.6) |

### Second round (2026-11-10, verification of fe8ac929)

Three verifiers found 34 earlier findings resolved. The unresolved ones and the new issues, with the decisions:

| Finding | Decision |
|---|---|
| Group ids change (`translation.group` is writable), so stored ids escape the guards (blocking, two verifiers) | Leaving a group is guarded like a delete, with the site anchor, and refused while a published entry shows the reference (§1, §2.2, R6, tests). Rewriting referrers and a new immutable id are both rejected (Alternatives). |
| Import, push, pull and restore bypass the gate (blocking, two verifiers) | `checkBundle` gains `assertFieldTypes`, covering every row path through `importSite`, with one capability shared with interactive writes (§1). Step 7 runs a one-time per-site rebuild (§2.4, §9). |
| The blocking expansion treats every row as inherited (blocking, three verifiers) | Rows carry `shared` and `root_key`, mirroring `resolveFields`. One SQL fragment serves the guards, the live `referencedBy` and the purge planner, so live equals snapshot. The policy is stated explicitly (§2, §4, §8). |
| The definitions anchor is read separately from the planned `Site` (blocking) | The anchor binds the definitions of the very `Site` object the write planned with, compared with `json(...) IS json(?)` (§2.1). |
| The move guard anchors the wrong collection, and the delete exception ignores allowed collections | Moves, deletes and group changes anchor on the hash of the planned site when rows exist. The exception counts only usable members in collections every blocking field allows (§2.2, R4, R5). |
| No emission path for `cloudhal-ref-` tags; old Workers refuse new prefixes; budget; privacy (blocking) | Tags dropped. The purge planner adds referrers' own node tags through `entry_refs`, covering newly visible targets and changed covers. No new prefix, no header ids, no theme code (§2, Purges). |
| Rows depend on membership and are not re-created | Rows are kept for every stored value; the site filter is the isolation (§2 invariant, R11). |
| `entry_refs` is missing from `SITE_TABLES` | Added in phase 2 (§2.9). |
| `fieldAssetIssues` and the purge planner do not follow | Both are specified: sub-field types, item paths, and `fieldAssetRefs` in the asset rule, which also fixes top-level image fields (§2.5). |
| The `asset_refs` cross-tenant fix was only recommended | Decided as rollout step 0, a prerequisite of phase 2 (§2.5, §9, OQ 11). |
| Edition chains have no original; mapping can empty an item | Edition members do not inherit (RFC-0041's rule, `shared = 0`; OQ 12). Emptied items are dropped and reported (§3). |
| The conversion-context claims contradict each other | The live source prefetches from the working copy. The snapshot source converts against its own entries. The comparison test runs on a snapshot of the working copy (§7). |
| `fieldsStrict` edge cases | Absent keys mean unchanged; all-null items are dropped and reported; set-and-clear is refused; an unknown key to clear is refused; clearing on create is refused (§6). |
| The Event address data path was undefined, and the phase-8 contract was unlisted | `StructuredDataContext.references`, filled by `withStructuredData` through `pickMember` and `resolveFields`, independent of card depth. The phase-8 contract change is listed in §1 (§4). |
| Move and delete races | Listed as R1 to R11 with their guards; R8 accepted and warned (§2.3, OQ 13). |

