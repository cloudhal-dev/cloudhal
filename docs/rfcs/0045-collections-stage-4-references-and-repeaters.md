# RFC-0045: Collections stage 4: reference fields and repeaters

- Status: Accepted (2026-11-10, by Halil), with the three Owner decisions ratified; see "Decisions (2026-11-10)". ADR-0046 lands with rollout step 2a; step 2 is split into 2a (store and integrity) and 2b (its consumers), see PR #205.
  Drafted in PR #193 and revised six times after an independent review and five verification passes; the review log and the implementation watch list are at the end.
- Author: Halil (Madraka), drafted with Claude · Date: 2026-11-10
- Related:
  - [#114](https://github.com/cloudhal-dev/cloudhal/issues/114) (this stage); #71 (the collections plan); [#196](https://github.com/cloudhal-dev/cloudhal/issues/196) (the `unchanged`-import `asset_refs` overwrite, fixed by rollout step 0).
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

## Decisions (2026-11-10)

Ratified by the owner (Halil) on 2026-11-10, as the verification passes left them for him to decide:

1. **Snapshot-only purges.** Every publish path computes referrer purges from the immutable `from` and `to` bodies: one bundle plus the missing hashes (§2, Purges point 4). It is exact by construction. An index probe cannot see a referrer edited away or deleted after the snapshot, which is why the fifth revision departed from the project manager's index-mode request; the verifiers confirmed that departure, and the owner ratified it.
   - **Cost:** on a 5,000-entry site, about 25 shard reads and 21 MB per publish that touches references, adding roughly 0.5 to 1.5 s to the publish response.
   - **Short-circuit:** sites without reference definitions skip it entirely.
   - **Fallback:** without either bundle, or past the read, byte or node budgets, the publish purges the whole site cache. That is safe, but it spends a purge.
2. **Archiving the last member does not release a lock.** While a published entry shows a reference, the group's last member (not archived, in an allowed collection) cannot be deleted, moved away or relinked. Archiving it first is allowed but does not help. Unpublish or edit the referrers, as the delete dialog says (§2.2, §5).
3. **Phase-2 behaviour changes on existing sites** are accepted, before the types exist (Compatibility). They are listed in the phase-2 changeset:
   - `translation_group_in_use`;
   - the `readsOriginal`/`originalOf` tightening (OQ 14);
   - the group check on group-only changes;
   - canonical import bodies;
   - the always-on collections anchor.

## Summary

Two new field types join RFC-0041's nine:
- A **`reference`** field points to entries of one to five declared collections of the same site, one target or up to fifty. It stores the target's **translation group id**, the same id in every site of a project. It always resolves to that group's member in this site and in the page's language.
- A **`repeater`** field is an ordered list of up to fifty items, each of up to ten flat sub-fields. A repeater cannot contain a repeater, so every agent-facing schema has a fixed depth and no recursion.

References are strong where it matters. A target *group* cannot lose its last member in a site, whether by a delete, a move or a relink into another group, while a published entry shows a reference to it exactly as `resolveFields` would show it. The guard protects a member's *existence*, not its usability: archiving or unpublishing the last member is allowed and renders nothing. One language version's card can still go when that version is deleted, with a warning.

A reference locks only through an entry that is published and shows it. A draft's own references lock nothing until a published entry shows them; that happens only when a published translation inherits a draft original's value (§2.2). A node's group is one value everywhere: `COALESCE(translation.group, id)`.

A reverse index, `entry_refs`, holds one row per stored value, whatever the target's state. It is written in each entry's own batch, anchored on the entry's new content hash and on its collection's definitions *as planned*. Every guard filters it by site.

Archiving or unpublishing a target is always allowed. The renderer resolves only what the published snapshot shows *at that instant*, gates included, so an unresolved reference renders as nothing, and publish warns but never fails. Assets used inside repeaters count in `asset_refs`, like any field's assets.

Resolution is breadth-first, at most two levels deep, under a budget per page. A publish purges referrers' own pages, found from the published and the previous snapshot's bodies, whenever a target group changes, becomes visible, or changes its cover. This needs no new cache tags and no theme code.

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
  | `reference` | a group id `"entry_…"`, or with `multiple` a list of them, no repeats, at most `maxItems` | see §2.1: the group has a member in this site in one of `collections`; it is not the entry's own group; it meets `where`. Checked for changed keys, and for every own value when the entry becomes published (§2.2). A member's id is canonicalized to its group id, `COALESCE(translation.group, id)` (§2, "Membership"), as `canonicalImageRefs` canonicalizes asset references. |
  | `repeater` | a list of at most `maxItems` objects. Each holds only sub-field keys, with RFC-0041 §2's values for its type. No empty item. | each item against the sub-fields. `requiredToPublish` sub-fields need a value in every item of an entry in review or published. Image and rich-text sub-values are checked and recorded as assets (§2.5). |

- **Why a group id.** `Translation.group` is "the original node's id … May cross sites in one project" (`common.schema.json:121-124`).
  - A language edition's entries carry their source site's group id (`editions.ts:121-125`; `checkTranslationLinks` requires a member's group to be its source's, `store/translations.ts:131`).
  - The group id is therefore the one identity that is the same for every language version in every site. "The original in this site" is undefined in an edition site, where no member is the group's node.
  - The group id is used as a *key*: it is never read as a node of another site. A reference resolves, and is guarded, only through members whose `site_id` is this site (§2, §3).
  - **A node's group can change.** `checkTranslationLinks` (`store/translations.ts:107-145`) accepts a new `translation.source`, and with it a new group, and `PUT …/entries/:id` (`api/routes/entries.ts:138-175`) passes the whole entry. A stored id therefore stays valid only because §2.2 guards group changes exactly like deletes: leaving a referenced group is leaving it.
    - Membership is the node's *current* group, never its id alone, so a relinked node really leaves its old group.
    - A node whose id other same-site nodes use as their `translation.group` cannot relink or drop `translation` (`translation_group_in_use`). Its translations must move first, so a group never loses its original while members still inherit from it.
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

  `support` is the same capability object for both, and **when it is absent, the types are refused**. This is unlike `assertGates`, which skips its check without a `GateSupport` (`sync-checks.ts:56-58`). The CLI's pull and import pass none today. The capability comes from:
  - the shared suites: `SiteGraphStoreOptions.fieldTypes` for the store, and a new `CopySiteOptions.fieldTypes` for `importSite`, which takes a `StoragePair` and never sees store options;
  - after step 7, on Cloudflare: the site Worker's `fields: 2`, through the `GateSupport` pattern (`availability.ts:235-237`);
  - after step 7, on Node (`cloudhal dev`, `studio`, self-host): the in-process constant `FIELDS_SUPPORTED`, the twin of `GATES_ENFORCED` (`availability.ts:240`), passed by those callers.

  Without one of these, a store refuses. An older CLI's local store at phases 1 to 6, which has no `entry_refs`, therefore refuses a pull or a hand-made archive with the types.

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
  shared INTEGER NOT NULL,          -- from the definition: 1 localized: false (every inheriting member shows it), 2 localized: true (only those without their own value)
  source_status TEXT NOT NULL,      -- the holding node's own status
  PRIMARY KEY (source_id, field, target_id)
);
CREATE INDEX entry_refs_target ON entry_refs (site_id, target_id, source_status);
```

**Invariant (the index).** `entry_refs` holds exactly one row per `(node, field path, stored group id)`, whatever the target's state: present, missing, archived or foreign. Rows depend on the holder's body and on its collection's definitions (`localized` decides `shared`). Nothing changes them except a write of the holder, its deletion, a rebuild, or `set_field_localized`'s phase A (§7).
- **No cross-tenant pinning.** Every guard and lookup filters `r.site_id` (the holder's site) and `n.site_id` (the member's site). A row naming another tenant's id pins nothing there and never resolves.
- **Repeats.** A target named in two repeater items (a host who also gives a talk) is one row: the writer deduplicates `(field, target)` pairs *after* canonicalizing member ids to group ids, so two members of one group in two items are one pair. The writer's `INSERT` is a **plain** `INSERT`. The anchored `DELETE` runs first in the same batch, so no key conflict remains to ignore, and any constraint failure fails the batch.
- **`shared`** is a pure function of the definition: 1 for `localized: false`, 2 for `localized: true`. It no longer encodes the holder's role, which the first revision computed at write time and which went stale when a node changed group.
  - *Who* inherits is decided at batch time by the fragment below, exactly as `readsOriginal` decides it (`fields/resolve.ts:37-41`): members `m` of this site whose `translation.group` is the holder's id, who are not the holder, and whose own `translation.source` is not in another site.
  - A translation's own value, and any value held in an edition site (where no node has the group's id, `originalOf`, `store/entry-fields.ts:54-62`), therefore inherits to nobody, whatever its `shared` (open question 12).
- **Membership.** A node `n` is a member of group G exactly when `COALESCE(json_extract(n.body, '$.translation.group'), n.id) = G`. Every probe uses this definition: the target guard, the fragment, `pickMember`, `groupMembers`/`getGroupMembers`, `referenceIssues`, the guards of §2.2 and the purge rules. In SQL it is written so that the primary key and `nodes_translation_locale` still serve it:
  ```sql
  ((n.id = :G AND json_extract(n.body, '$.translation.group') IS NULL)
    OR json_extract(n.body, '$.translation.group') = :G)
  ```
  The first revision's `n.id = G OR translation.group = G` let a relinked node stay a member of its old group by its id, which defeated the group-change guard (R6).
  - The relink refusal of §1, with the group guard on every write that sets or changes `translation.group` (§2.2), keeps the inheritance side exact: a node with same-site dependants always has its own id as its group.
  - `readsOriginal` and `originalOf` additionally require the original's own group to be its id. Legacy data relinked before this RFC then inherits nothing rather than reading from a node of another group. This is an RFC-0041 behaviour change for that edge case only, and the fragment agrees with it.

**"Shown by a published entry"** is one SQL fragment. The guards, the live `referencedBy` and the purge planner all use it, so they mean the same as the snapshot's resolved values:

```sql
-- rows of site S naming group G that a published entry shows
SELECT r.* FROM entry_refs r WHERE r.site_id = ? AND r.target_id = ?
  AND (r.source_status = 'published' OR (EXISTS (
    SELECT 1 FROM nodes m WHERE m.site_id = r.site_id AND m.kind = 'contentEntry'
      AND json_extract(m.body, '$.translation.group') = r.source_id AND m.id <> r.source_id
      AND json_extract(m.body, '$.translation.source.siteId') IS NULL
      AND json_extract(m.body, '$.status') = 'published'
      AND (r.shared = 1 OR json_type(m.body, '$.fields.' || r.root_key) IS NULL))))
```

The member probe uses `nodes_translation_locale` (migration 0025: `site_id, kind, json_extract(body, '$.translation.group')`; its partial `WHERE … IS NOT NULL` is implied by the equality). For legacy relinked holders, where `readsOriginal` now inherits nothing, the fragment can only over-block, which is safe. During a `rename_field`, `resolveFields` also reads `migration.fromKey` while the fragment checks `root_key`, which again can only over-block.

**1. Writing a referrer** (`EntryEngine.write`, `store/entries.ts:30`). `planEntryFields` returns three more parts:
- **The target guard**, ANDed into the entry's CAS (`entries.ts:104`), for changed reference keys, and for every own reference value when the entry becomes published (point 2). Every named group must have a member in this site, by the membership rule, in one of the field's allowed collections; a newly chosen group's member must also not be archived. It is one count over a JSON list of `{t: group, c: [collections], f: fresh}` pairs, like the asset guard (`entry-fields.ts:163`):
  ```sql
  (SELECT count(*) FROM json_each(?) p WHERE EXISTS (
     SELECT 1 FROM nodes n WHERE n.site_id = ? AND n.kind = 'contentEntry'
       AND ((n.id = json_extract(p.value, '$.t') AND json_extract(n.body, '$.translation.group') IS NULL)
            OR json_extract(n.body, '$.translation.group') = json_extract(p.value, '$.t'))
       AND json_extract(n.body, '$.collection') IN (SELECT value FROM json_each(json_extract(p.value, '$.c')))
       AND (json_extract(p.value, '$.f') = 0 OR json_extract(n.body, '$.status') <> 'archived'))) = ?
  ```
- **The definitions anchor** (amended in 2a, PR #205). It is on **every** entry write in a site with reference fields: each such write rewrites its rows and may check targets under the planned definitions, a status-only publish included. Elsewhere it is on writes that change `fields` or `collection`, to keep `field_key_in_use` true.
  - *When the write is planned*, the writer reads the fragment's stored text with the same expression the batch runs: `SELECT rev, json_extract(body, ?) FROM nodes WHERE id = ? AND kind = 'site'`.
  - It parses that text and checks it (`sameJson`) against `site.collections[c].fields` of the very `Site` object it planned with (`entries.ts:39-41`). A mismatch means the site changed after the plan read it, and it is a `ConflictError` (retry).
  - *At batch time* it compares that exact text:
  ```sql
  (SELECT json_extract(body, ?) FROM nodes WHERE id = ? AND kind = 'site') IS ?
  ```
  The path is `$.collections."<key>".fields`. An absent fragment reads and binds SQL `NULL`, so `NULL IS NULL` holds for a collection without definitions.
  - What the batch compares is exactly what was read and validated, so there is no unseen second read.
  - Key order does not matter: a site row an older import stored verbatim anchors like any other.
  - A unit test runs every fixture site, stored canonically and with every key order reversed, fractional bounds included.

  `importSite` still stores `canonicalJson(JSON.parse(body))` for every row (the hash is over canonical JSON already, so it does not change), as hygiene only: no anchor depends on it. The first draft of this section compared `json(…) IS json(canonical)`. That needed canonical rows, and a site row stored verbatim would have made every write of the site conflict until it was rewritten.

  The anchor conflicts only when that collection's definitions change, never on other site edits. The loser retries under the new definitions, where `field_key_in_use` then sees its value. This is RFC-0042's rule that list-value rows are valid only "under the fingerprint they were built with" (`list-values/fingerprint.ts`), applied to writes.
- **The rows**, anchored on the entry's new hash: `DELETE FROM entry_refs WHERE source_id = ? AND <anchor>`, then one plain `INSERT … SELECT … FROM json_each(?) WHERE <anchor>`, appended to `own` (`entries.ts:110`). Every write of the holder rewrites all its rows, so `source_status` stays current.
  - **`shared` is never bound from the plan.** The same single `INSERT … SELECT` reads it from the site row *as it is when the batch runs*, so a status-only or title-only write that races `set_field_localized`'s phase A cannot write a stale value:
    ```sql
    INSERT INTO entry_refs (site_id, target_id, source_id, source_collection, field, root_key, shared, source_status)
    SELECT ?, json_extract(p.value, '$.t'), ?, ?, json_extract(p.value, '$.f'), json_extract(p.value, '$.k'),
           (SELECT CASE json_extract(d.value, '$.localized') WHEN 1 THEN 2 ELSE 1 END
              FROM nodes s, json_each(json_extract(s.body, ?)) d          -- ? = '$.collections."<key>".fields'
             WHERE s.id = ? AND s.kind = 'site'
               AND (json_extract(d.value, '$.key') = json_extract(p.value, '$.k')
                    OR json_extract(d.value, '$.migration.fromKey') = json_extract(p.value, '$.k'))
             ORDER BY json_extract(d.value, '$.key') = json_extract(p.value, '$.k') DESC LIMIT 1),
           ?
    FROM json_each(?) p WHERE <anchor>
    ```
  - Batches run one at a time, so the row reflects the site either before phase A, which phase A's `UPDATE` then corrects, or after it.
  - **During a rename.** `rename_field`'s phase A renames the definition and keeps the old key in `migration.fromKey` (`fields-operations/plan.ts:131-139`). A holder write planned before phase A, which changes no fields and so carries no definitions anchor, still finds its definition through `fromKey`. `rename_field` does not change `localized`, so the value is right.
    - A new field may reuse a running rename's old key once phase B has emptied it. Then both definitions match, and the exact key wins (`ORDER BY … DESC LIMIT 1`).
  - **A key with no definition at all** at batch time yields `NULL`. With a plain `INSERT`, the `NOT NULL` column then fails the whole batch, which the store maps to a `ConflictError`, and the caller retries under the current definitions.
    - The mapping matches only `NOT NULL constraint failed: entry_refs.shared`, by message, as `errors.ts:51` already matches `UNIQUE constraint failed`. Any other constraint failure still surfaces as an error, never as an endless 409 loop. (The fourth revision's `INSERT OR IGNORE` would have skipped the row silently: SQLite's conflict clause covers `NOT NULL` too. A verifier confirmed this in sqlite3.)

A target deleted or moved between check and batch fails the guard, and `diagnose()` names it (`unknown_entry`, `reference_target_moved`). One bound parameter carries the whole list (D1 allows 100 parameters), and 100 group ids stay far below 100 KB per statement.

**2. Who can lock what: delete, move, leaving a group, publishing.**
- **The policy.** A reference blocks only while a *published* entry shows it, as `resolveFields` would show it: its own value, or one inherited from its same-site original (the fragment above).
  - Drafts, entries in review and archived entries never lock anything *on their own*. Their values lock only through a published entry that shows them (a published translation inheriting a draft original's value).
  - A contributor (`content:draft:own`, `roles.ts`) cannot publish, so nothing a contributor writes locks on its own. A value it holds locks only once someone with publish rights publishes an entry that shows it, such as a translation inheriting it. That person's publish is the decision.
  - An author pins only through what published entries show, which the live site really depends on.
  - An editor can always unpublish to release a lock.
- **Writes that make a group lose a member in this site.** That is a delete, a move to a collection no blocking field allows, or a change of `translation.group` (including dropping `translation`, `store/translations.ts:107-145`). Each such write of member X of group G carries:
  - The batch-time condition. P is the JSON list of `"<collection>.<field>"` pairs of the blocking rows the plan saw, and A is the intersection of those fields' `collections`, from the site as planned:
    ```sql
    NOT EXISTS (<blocking rows of G>)
    OR ( EXISTS (<another member of G in S by the membership rule, id <> X, not archived, collection IN A>)
         AND NOT EXISTS (<blocking rows of G>
                         AND r.source_collection || '.' || r.field NOT IN (SELECT value FROM json_each(:P))) )
    ```
    The second `NOT EXISTS` makes a blocking row from a field the plan did not see, committed in between, fail the batch, so the write retries and re-plans with that field. The first revision's form let it through: `events.venue` allows `[places, halls]` and `talks.room` allows `[places]`; a talk published meanwhile with `room` = G is stranded once the last member in `places` goes.
  - **The collections anchor** (amended in 2a, PR #205) works like the definitions anchor, over `$.collections`:
    - when planned, the stored text of `json_extract(body, '$.collections')` is read and checked with `sameJson` against `site.collections` of the `Site` object the write planned with (a mismatch is a `ConflictError`);
    - at batch time, `(SELECT json_extract(body, '$.collections') FROM nodes WHERE id = ? AND kind = 'site') IS ?` compares that exact text;
    - a site without `collections` reads and binds SQL `NULL`, never the string `'null'`, so `NULL IS NULL` holds.
    - It holds every collection's definitions and every field-operation marker, so it covers the referrer fields whose allowed collections the guard used (R4) and the markers `field_operation_running` reads (R12).
    - Unlike the site hash used in the fourth revision, it ignores `publishedSnapshotId`, theme, menus and other settings, so a publish no longer makes concurrent deletes and moves answer 409.
    - It compares stored text read when the write was planned, so key order never makes it fail (§2.1).

    These writes are rare, so **every** delete, move and group change of a `contentEntry` carries the collections anchor, whether or not the plan saw blocking rows. The first revisions added it only when rows were seen. That left R12 open: during a text → reference conversion, the values that will become references have no rows yet, so a delete planned before the marker committed carried no anchor and went through. With the anchor always present, the batch fails once the marker lands in `collections`, the retry plans against the marker, and `field_operation_running` refuses it.
  - A refusal answers `409 entry_referenced`, with up to 20 published referrers (id, title, collection, field) and the total. For a group change, it also names the group.
  - Deleting a translation, or an original that still has another usable member, never blocks. The guard protects the group's **existence**, not each language's card.
    - The deleted member's locale then resolves to the fallback, or to nothing (§3).
    - The delete dialog and `referenceIssues` name the locales that will lose the card ("Turkish event pages will show no venue").
- **Moving a member** X from C to D: for each seen pair whose field does not allow D, the batch requires another usable member in a collection that field allows. Pairs whose field allows D are satisfied by X itself at D, unless X is archived. An archived X satisfies nothing, exactly as in the delete rule. The batch also carries the same `NOT EXISTS (<blocking rows> AND pair NOT IN :P)`, so an unseen field forces a retry. Refused: `409 reference_target_moved`. During a field operation, the pairs include the marker's `fromKey`.
- **Relinking a node with dependants** is refused (`409 translation_group_in_use`, §1). The write carries `NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.translation.group') = :X AND id <> :X)`.
  - **Every write that sets or changes `translation.group` or `translation.source`** carries a guard keyed on the *written* group X. This covers a new translation, a source change, and a group-only change, which today passes unchecked when the source stays the same (`store/translations.ts:107-113`). The guard is `NOT EXISTS (SELECT 1 FROM nodes WHERE id = :X AND site_id = ? AND json_extract(body, '$.translation.group') IS NOT NULL AND json_extract(body, '$.translation.group') <> :X)`: X's node, if it is in this site, still has its own id as its group.
    - It is **omitted when X is the written node's own id**: a translation becoming an original (`checkLocalizedNode` requires an original's group to be its id, `translations.ts:59-61`). There the guard would read the pre-update row and fail on every retry.
  - `checkTranslationLinks` runs its source-group check on the same condition, not only when `source` changes (`translations.ts:111-135`), and adds this guard to the write. Today it checks the source's group with a read only (`:131`).
- **While a field operation converts text into references** (`text → reference`, or a repeater gaining a reference sub-field from text), readers convert unconverted values on the fly (§7), so a published entry can show a group that has no row yet. Until phase C drops the marker, deletes, moves and group changes of entries in that field's target collections are refused (`409 field_operation_running`). The collections anchor carries the marker, so an operation started concurrently fails the batch.
- **Publishing a referrer.** A write that makes an entry published runs the target guard over *every* own reference value. A dangling id is refused (`unknown_entry`: remove or replace it), so a draft that lost its target cannot go live pointing at nothing.
  - Inherited values are not the translation's to fix. A translation that goes live while its original holds a dangling id gets a warning, and the reference renders as nothing (R8).
- **Archiving and unpublishing** a target are allowed, and write nothing to `entry_refs`. The picker hides archived entries.
- Members of a group may sit in different collections, as today (`checkTranslationLinks` has no collection rule). Resolution, the guards and `referenceIssues` count only members in the field's `collections`.

**3. Races.** Every interleaving that could leave a published reference stranded, and the guard that catches it. "Second" is whichever batch commits later; it fails and retries or refuses.

| # | Interleaving | Caught by |
|---|---|---|
| R1 | referrer write ↔ deleting the target's last usable member | the referrer's target guard (members at batch time, by the membership rule), or the delete's condition: blocking rows at batch time, with an unseen field forcing a retry |
| R2 | referrer write ↔ moving the target to a disallowed collection | the target guard (collection at batch time), or the move's per-pair condition plus the unseen-field check |
| R3 | referrer write ↔ adding a reference field over its key, or removing an allowed collection | the definitions anchor, bound as planned (point 1). `field_key_in_use` counts committed values. The collection refusal counts values whose group has a member in the removed collection. |
| R4 | moving a member ↔ narrowing a referrer field's `collections` | the move's collections anchor. The narrowing's count sees the member once it has moved. |
| R5 | delete ↔ any change to the definitions a blocking row's field depends on | the delete's collections anchor |
| R6 | changing a member's group ↔ referrer write | the group change carries the delete guard and collections anchor for its old group. The referrer's target guard checks membership at batch time, and a relinked node no longer matches its old group by id. A node with dependants cannot relink at all. |
| R7 | a referrer becoming published ↔ deleting its target | the publish re-checks all own values with the target guard. The delete sees the referrer's new `source_status`, because its rows are rewritten in the same batch. |
| R8 | publishing a translation that *inherits* the value ↔ deleting the target | when the publish is first, the delete's fragment reads member status at batch time. When the delete is first, nothing published showed the value at that moment. **Accepted:** the translation goes live with a warning and renders nothing; no guard can refuse a write the translator cannot fix. |
| R9 | field-operation phase B ↔ deleting a target | the target guard ANDed into each rewritten entry's CAS (point 6) |
| R10 | import, restore or sync ↔ anything | one atomic batch with the index rebuilt in it, *only* when that batch writes the node set. An `unchanged` import rebuilds nothing, so it cannot overwrite a concurrent writer's rows (point 4). |
| R17 | the step-7 job ↔ a referrer write | the job's per-node statements are anchored on each node's read hash, and a node that moved is skipped, because its writer already wrote fresh rows (point 4) |
| R11 | a member reappearing (a new translation or edition member) | rows are kept whatever the membership (the invariant), so nothing needs re-creating |
| R12 | a reference shown only through an in-flight text → reference conversion ↔ deleting its target, including a delete planned *before* phase A commits | `field_operation_running` refuses the delete until the marker is gone. The collections anchor, on every delete, move and group change, fails a batch planned before the marker. Purges of a snapshot carrying any marker purge everything (§2, Purges). |
| R13 | a blocking row from a field the plan did not see ↔ delete, move or group change | the unseen-field `NOT EXISTS` with the planned pairs `P` |
| R14 | a held node published at its live version (holds, `snapshots.ts:29-37`) whose working copy is a draft ↔ deleting its target | **Accepted**, like R8: holds are temporary, and the release's approval text and `referenceIssues` warn. Probing live versions of held nodes from the delete guard would need snapshot reads inside a write. |
| R15 | creating a translation of X, or setting any node's group to X ↔ relinking X | the written-group guard on the joining write, or the dependants guard on the relink |
| R16 | a status-only or title-only write of a holder ↔ `set_field_localized` or `rename_field` phase A | `shared` is read from the site row inside the plain `INSERT … SELECT` at batch time, matched by `key` or `migration.fromKey`. Phase A's `UPDATE` corrects rows written before it. A missing definition fails the batch (`ConflictError`, retry) instead of dropping rows (§2.1). |

**4. Rebuilds** run in the same batch as the node set: `importSite`/`pull`/`push` (`sync-plan.ts:308`), `cloudhal import --replace` and `--revert`, and snapshot restores.
- **Only when the batch writes the node set.** `nodeBatch` (`sync-plan.ts:295-308`) adds the node `DELETE`/`INSERT` only when `!changes.unchanged && !changes.conflict`. `entryRefsRebuild` is emitted under exactly that condition.
  - On an import planned `unchanged` it is skipped. Its rows would come from bodies read at plan time, and they could overwrite a writer's fresher rows that committed between plan and batch. The writers' own rows are already current there.
  - **`refsRebuild` for `asset_refs` has the same hole on main today**: it is pushed unconditionally at `sync-plan.ts:308`. Step 0 fixes it the same way ([#196](https://github.com/cloudhal-dev/cloudhal/issues/196)).
- `entryRefsRebuild(siteId, rows)` builds the rows from the bodies, with the site's definitions from the site row, as `refsRebuild` does (`media/refs-rebuild.ts:12-37`), and `DELETE`s and `INSERT`s them under `site_id = ?`.
  - It computes `shared` in JS from the same site row, so no `NULL` can arise.
  - It reads body keys through any `migration.fromKey` the site row carries, as `resolveFields` does. A bundle exported mid-operation then keeps rows for the entries that were not yet rewritten.
- There is no membership join: the invariant keeps rows for every stored value, and the site filters keep them harmless.
- The `INSERT` is chunked so each statement stays below 90 KB, inside the one atomic batch.
- **Statement budget.** The chunked `INSERT`s count against the import batch's 1,000-statement cap (`sync-plan.ts:311`), like every other statement there.
- **Step 7** also runs a one-time per-site rebuild as an admin job, the pattern of `lists.backfill`, whose chunks are guarded on the hash each row was computed from (`list-values/backfill.ts`).
  - It never does a site-wide `DELETE`. For each entry node read with hash *h*, it emits one pair, `DELETE FROM entry_refs WHERE source_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = :h)` and the node's `INSERT … WHERE EXISTS (… hash = :h)`, in chunks, resumable by cursor.
  - A node whose hash moved since the read matches nothing and is skipped: its writer has already rewritten its rows.
  - Rows of nodes that no longer exist go with `DELETE FROM entry_refs WHERE site_id = ? AND source_id NOT IN (SELECT id FROM nodes WHERE site_id = ?)`.
  - Its `shared` is computed in JS from the site row read with the chunk, and each chunk also carries the collections anchor, so a definitions change between read and batch fails the chunk, which is retried.
  - **No canonical-rows job** (amended in 2a, PR #205). Earlier revisions shipped an admin job in phase 2 that rewrote existing rows canonically, and ran it again at step 7, because the anchors compared canonical JSON.
    - The anchors now compare the stored text read when the write is planned (§2.1, §2.2), so verbatim rows work. The job is dropped, and step 7 does not run it.
    - Canonical import bodies stay as hygiene only.
  - It is a safety net: the gate (§1) means it should find nothing.

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
- No write lets a group lose its last member in a site (a member not archived, in a collection the field allows) while a published entry there shows a reference to it. Archiving that member stays allowed.
- No write stores a new own reference to a group without such a member.
- The index always matches the stored values.

R8 and R14 are the accepted exceptions, both warned (open question 13). Dangling ids can still exist, and every reader treats them as unresolved without throwing:
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

**Purges** (`cache-purge.ts`). There are no new tags. Pages already carry `cloudhal-node-<id>` tags, set by the theme for the entry a response renders and for the entries an archive lists (`cache-tags.ts:6-8`). The planner reaches every page that can show a changed card. Without a purge, a page stays cached for `MAX_EDGE_AGE`, one year (`availability.ts:87`). Its edge age is capped at the next gate instant (`availability.ts:94-95`), which covers time-based visibility with no purge at all.

1. **Seeds.** The groups touched by the diff, `COALESCE(translation.group, id)` of the before and after bodies:
   - every changed, added or removed entry;
   - the entries the asset rule reaches (with `fieldAssetRefs`, §2.5);
   - both the old and the new group of a node that changed group.
2. **Closure to the render depth.** Pages show cards up to depth 2 (§4), so the planner walks referrers in two hops:
   - hop 1: the referrers of the seed groups;
   - hop 2: the referrers of the groups of the hop-1 referrers.

   Each page reached adds the node tags of its referrer and of every member of that referrer's group, so all of its language versions go. The walk takes referrers from **both** snapshots' bodies, whatever their status: over-purging is cheap, and a page cached from `from` is reached even when `to` no longer shows the reference.
3. **"Used by" pages.** For every changed, added or removed entry, and every entry the asset rule reaches (its cover changed), the planner also adds the node tags of the members of every group its before *or* after **resolved** values name. Resolution uses `resolveFields` with the same-site original read from the same snapshot, so a translation that only inherits its original's `venue` counts too.
   - A venue page that renders `referencedBy` ("events here") is purged when an event naming it appears, disappears or changes, with no theme code, because the target's page carries its own node tag.
   - `referencedBy` results are drawn as cards: title, URL, summary and cover. Drawing *their* fields and references on the target page is outside the purge guarantee, and `docs/guides/fields.md` says so.
4. **One mode, exact by construction: the snapshots' own bodies.** The planner never consults the working copy or `entry_refs` for referrers.
   - Referrers, both hops, inheriting members (`COALESCE(translation.group, id)`) and "used by" are all computed from the immutable `from` and `to` entry bodies: each body's resolved reference values (`fieldsReferences(defs, body)`, through that snapshot's own definitions, with its same-site original for inheritance).
   - **Short-circuit.** When neither snapshot's site node defines a `reference` field, or a repeater with a `reference` sub-field, the referrer closure is skipped entirely. Sites without references keep today's purge cost, and phase 3 costs nothing anywhere until step 7 enables the types.
   - **One hash-keyed body cache over both snapshots.** The planner already keeps one: `bodies`, keyed by content hash (`cache-purge.ts:122-131`).
     - It loads **one** bundle: `to`'s when it exists, otherwise `from`'s (RFC-0010, 256 bodies per shard, `bundles.ts:65-114`).
     - It then reads only the hashes still missing, one node each. Those are typically the `before` bodies of the diff, which today's planner reads anyway. Only those reads count against `maxReads`.
     - Bundles are not guaranteed. A bundle is written only for reason `publish`, best effort (`snapshots.ts:104-107`). Release runs' `scheduled` snapshots get none (`release-apply.ts:224`). The `bundles/` prefix expires after 30 days (RFC-0010 Retention). A live snapshot regains one only when the site Worker reads through (`source.ts:390`).
     - The cache covers all of these. A release run costs the live snapshot's bundle plus its items, an approval of a manual snapshot costs `from`'s bundle plus the diff, and only a far rollback with neither bundle falls back.
   - **Streaming.** Shards are parsed one at a time. From each body the planner keeps only what the closure needs: id, group, collection, status, and the resolved reference values. The full body is dropped, except for the few the rest of the planner reads.
   - This covers every publish path alike: the default path, an older snapshot, an approved request (`approvals.ts:343-356`), a rollback, a release run, and a restore or import that moves the pointer. `PublishChange` stays `{from, to}`.
     - Release runs re-plan at run time: the executor calls `planCachePurge({ from: baseSnapshotId, to: snapshotId })` after `publishRelease` commits, instead of replaying the stored plan (`releases.ts:146-157`).
     - `RELEASE_EXECUTOR_COST` (`releases.ts:124`, 16 today) rises by the re-plan's statements: two `getSnapshot` reads plus its node reads, budgeted by `maxReads`. Its comment says so.
   - **Any field-operation marker on `from`'s or `to`'s site node purges everything.** That covers text → reference conversions in flight and renames. Operations are rare, so this is cheap, and it is obviously safe.
   - `entry_refs` stays the source for guards, Studio's "Used by", `list_references` and the live `referencedBy`, never for purges.
   - **Why not the index on the default path?** The PM's decision for the fifth round proposed index mode there, with a freshness check inside each hop's `SELECT`. It is not exact. A probe returns only rows that *still* name the target, so a referrer in `to` that was edited to stop naming it, or deleted, after the snapshot is never returned, and its hash cannot be compared. Detecting that needs a whole-site change check. The cheap ones are not sound: `count(*)` with `sum(rev)` and `max(rowid)` misses a delete of the newest row followed by an insert that reuses its rowid (`nodes` has no `AUTOINCREMENT`, migration 0001). Reading the bodies the snapshot already holds is both simpler and exact. The verification of d8a436cc confirmed this.
5. **Every path that changes visibility** purges by point 4: publish (any snapshot), rollback, release run, and an import or restore that moves the published pointer. Archive, delete and unpublish change only the working copy and go live through one of these.
   - Time-based visibility (an embargo opening, `availability.until`, a derived `hide`/`unlist` expiry) needs no purge: the gate-index TTL expires the page at that instant (`availability.ts:94-95`).
6. **Bounds and fallback.**
   - **Reads:** node reads beyond the one bundle count against `maxReads` (2,000), and so do bundle shard reads.
   - **Size:** a byte budget on the bodies loaded (`maxBodyBytes`, default 32 MB) and a node budget (`maxNodes`, default 50,000) are checked *before* each shard is parsed.
   - **Tags:** collection stops at `maxTags + 1` (300 tags).
   - **The fallback:** exceeding any budget purges everything, as any large diff does today (`cache-purge.ts`, "Falls back to purging everything").
   - **Why the size budgets exist.** The purge runs inside the awaited publish request (`admin-worker.ts:453-468`, `store.ts:1107`). An isolate that runs out of memory would never reach the planner's `catch` and would skip the purge silently. The budgets turn that into an explicit purge-everything.
   - **Cost on a realistic site** (5,000 entries, about 6,250 nodes, depth 2), as the verifier measured it:
     - about 25 shard reads for one bundle, 6 at a time (`BLOB_CONCURRENCY`), against about 207 node reads one after another today;
     - about 21 MB of JSON read;
     - roughly 0.5 to 1.5 s more on the publish response, and 100 to 200 ms of CPU.

     Purge-everything does not become the common case. As a side benefit, the asset rule, which today reads every entry, page and term body one by one (`cache-purge.ts:222-231`), now reads from the cache.
7. **Compatibility.** `isCloudhalCacheTag` (`cache-tags.ts:48`) and the site Worker's purge endpoint (`cloudflare-entry.ts:312-325`) are unchanged, so an older site Worker accepts every purge, and no id of an unresolved target reaches any header.
   - `SnapshotReader.readSnapshotBundle` is the one reader addition. The store has it already, and the release executor's run-time reader gets it too.
   - The first revision's `cloudhal-ref-<group>` tags are dropped. Existing themes build their own tag lists (`starters/blog/src/pages/[...path].astro:261-321`), new prefixes would make older site Workers answer 400, and ids in headers relied on unverified stripping.

**Archives (RFC-0039).** An archive holds every node of the site, so references stay complete, and import rebuilds the index in its node batch (point 4). Dangling or foreign ids are reported, not refused (RFC-0041 open question 8): `cloudhal import --dry-run` adds `referenceIssues`. Until step 7, an archive *with* reference or repeater definitions is refused (`fields_unsupported`, §1).

### 3. The locale rule

A reference names a translation group (§1). In this site, the candidates are the group's members by the membership rule (§2: `COALESCE(translation.group, id) = G`) whose collection is in the field's `collections`. Resolution picks, among those the view shows:

1. the member whose `locale` is the page's locale;
2. otherwise, when `Site.localization.fallback` is `default-with-notice` (RFC-0033 §2), the member in the site's default locale, flagged `fromFallbackLocale` so themes set `lang` on it;
3. otherwise, nothing.

The renderer, Studio's preview of a translation and `referenceIssues` ("Main hall has no Turkish version") share this one function, `pickMember`.

- **`localized: false` is the default** that Studio pre-sets for references. The group's same-site original holds the ids, and every same-site translation resolves them in its own language (RFC-0041 §5). A translator never re-picks targets, and a venue's Turkish version appears on the Turkish event without any write.
- **`localized: true`** is for real differences between languages, such as a regional partner. Each version holds its own group ids, and an empty value falls back to the original's (`fromOriginal`).
- **Language editions** (RFC-0034; an original in another site of the project). Non-localized values are copied when the edition is made (RFC-0041 §5, through `forEdition`, `cross-site.ts:115`). Group ids are shared across sites, so a copied id stays the same id.
  - `forEdition` keeps an id when the edition site has a member of that group in a collection the edition's own field allows. Otherwise the id is dropped and reported ("2 references not carried: Main hall has no edition in site B yet").
  - A repeater item left with no value once its references are dropped is dropped too, and reported, as `remove_field` with `sub` does (§7), so the edition write never fails on "no empty item". A `requiredToPublish` field emptied this way is fine: the copy is a draft.
  - **Inside an edition site,** the edition node's own translations do not inherit its non-localized values. This is RFC-0041's existing rule: `originalOf` looks for the group's node in the same site (`store/entry-fields.ts:54-62`; search does the same, `search-rows.ts:299`), and the group's node is in another site. Each such member holds its own references, and the fragment finds no inheriting member for them, because no node there has the group's id (§2). Changing that rule for every field type is open question 12.
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

  Over budget, the remaining targets resolve to nothing with one `console.warn`, never an error. Purges do not depend on what rendered: they read the snapshots' bodies (§2, Purges). A listing of 20 events at depth 1 costs 20.
- **Batching.**
  - The snapshot source does no store reads: every lookup is in memory, and bundles (RFC-0010) need nothing new.
  - The live source (`cloudhal dev`, previews) makes one store read per level: `getGroupMembers(siteId, ids)`, a `json_each` IN list with §2's membership form, served by `nodes_translation_locale` and the primary key.
- **`referencedBy` equals the resolved values.** A row sits on the node holding the value.
  - The live source reads `entry_refs` by `(site_id, target_id)`. It keeps the holder when the holder is in the requested locale, and expands a row only through §2's fragment. Inheriting members are those whose `translation.group` is the holder's id, with a same-site source. `shared = 1` adds them all, and `shared = 2` adds those without their own value of `root_key`. A translation's or an edition member's own row therefore adds nobody. It then filters by the view.
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
  - **The delete dialog:** it disables Delete only while a *published* referrer exists and this is the group's last member that is not archived, in an allowed collection ("Unpublish or edit these 2 published entries first"). Archiving that member first does not release the lock; the dialog and `docs/guides/fields.md` say so.
    - It lists draft referrers as "Will show nothing for this field" and lets the delete go ahead.
    - When other members remain, it names the locales that will lose the card ("Turkish event pages will show no venue").
    - The same rules apply to unlinking a translation, which leaves its group.
- **Fields builder** (`FieldDialog.tsx`):
  - **reference:** target collections (a multi-select of declared collections), "Several" (`multiple`), the maximum, and conditions when one collection is chosen;
  - **repeater:** a nested sub-field list (rows like `FieldRow`, with up/down and ⋯), the maximum and the item label;
  - the ⋯ menu's operations gain the sub-field forms and the new `change_field_type` inputs (§7).
- **API** (site-scoped, under the `/sites/:siteId` membership check):
  - `GET /sites/:siteId/entries/pick?collections=a,b&q=&locale=&limit=&cursor=` (amended in 2b, PR #206). It needs `content:read`.
    - The answer is `{entries, cursor?, truncated?}`: at most 20 `{groupId, id, title, collection, status, locale}`, never archived ones, in key order (collection, locale, slug).
    - Each allowed collection (and locale) is a key range of `nodes_site_kind_key`, read with a keyset cursor. A request reads at most 1,000 rows. When the budget ends before `limit` matches, the answer says `truncated: true` and carries the `cursor` to continue from, so any match can be found.
    - `q` is at most 100 characters. Both it and each row's title and slug are folded with `foldName` (case, diacritics, Turkish İ/ı) and matched as a substring with no pattern (rule 13). A `q` that folds to nothing matches nothing.
    - The existing `rate_limits` counters (`packages/api/src/rate-limits.ts`, migration 0030) give a per-member window.
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
  - A `null` sub-value inside a repeater item is stripped before checking: that sub-field is unset in that item. Inside an item, `null` means "unset", not "unchanged", because a given list replaces the whole list. The strict schema's item descriptions say so in words.
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
| `rename_field` | moves the key; rows' `field` and `root_key` follow each rewritten entry (until then the fragment checks the old `root_key`, which can only over-block, §2); list fields and sections follow as today (`fields-operations/references.ts`) | moves the key, or with `sub` the sub-key in every item; rows (`speakers.person`) and asset rows (`fields.speakers.photo`) follow |
| `change_field_type` | see below | see below; with `sub`, a sub-field converts by RFC-0041's table among sub-field types |
| `set_field_localized` | **phase A**, in the same batch as the site write and guarded on the site's new hash: `UPDATE entry_refs SET shared = <1 or 2> WHERE site_id = ? AND source_collection = ? AND root_key = ?`, so guards and purges follow `resolveFields` from that moment. **Phase B**, true→false: deletes translations' copies and their rows. false→true: no rewrite. | the same, for whole lists |
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
- **Between phase A and phase C** of a conversion *into* references, readers already show converted groups that have no rows. Deletes, moves and group changes in the target collections are refused meanwhile (`field_operation_running`, §2.2, R12). Rows appear entry by entry as phase B rewrites.
- **Revert** (`fields-operations/revert.ts`) restores earlier values under the same guard. A restored reference whose group has no member left in the site is dropped and reported in a new `FieldRevertResult.dropped: { entryId, field, targetId }[]`.
- **Free definition edits:**
  - add or reorder sub-fields;
  - change labels, help, `itemLabel` or `where`;
  - widen `maxItems` or `collections`;
  - narrow `maxItems`: values are checked on their next write (RFC-0041 §6).

### 8. Threat model

| Threat | Mitigation | Test |
|---|---|---|
| **A draft, archived, embargoed or hidden target leaks through a published referrer** (the snapshot holds drafts, and `Loaded` holds published entries before gates) | Resolution filters through the view's gates at its instant (§4); only gate-independent card parts are cached. A card carries only the member's public title, summary, URL and cover image, the image through the view's asset gates. Unresolved values render nothing: no id, no `data-` attribute, no empty link. JSON-LD's `reference` source uses the same cards. | RFC-0008's route sweep (extended by RFC-0042) gains a published referrer pointing at a draft, an archived, an embargoed and a `hide`-expired target, before and after their instants. No id, slug, title or asset of a hidden target may appear in HTML, JSON-LD, feeds, the sitemap, search, `llms.txt`, status pages or response headers. Purges read snapshot bodies and add only existing node tags, so no header carries target ids (§2). |
| **IDOR in the picker and on write** | Pick and references routes run under the `/sites/:siteId` membership check and query by `site_id`. The target guard requires a member with `n.site_id = ?` (§2.1). An id of another site gets the same `unknown_entry` as an id that does not exist. Editions copy only ids the edition site can resolve (§3). | A shared-suite case: another site's entry or group id in `create_entry`, `update_entry`, the API and `push` is refused identically; the pick route with another site's id answers 404. |
| **An imported or pushed archive pins another tenant's entries or assets** | Rows are site-scoped, and every guard filters both the row's `site_id` and the member's (§2). `asset_refs` gets the same filter as a phase-2 prerequisite (§2.5). | An archive referencing site Y's entry or asset, imported into site X, must not block Y's delete or move, and must not list X's titles to Y. |
| **Lock-out by low-privilege actors** (`content:draft:own`, `content:write:own`) | Only what a published entry shows blocks, by the `shared` rule (§2): a translation's own value is never inherited. Contributors cannot publish; drafts, review and archived entries never lock on their own. | Policy-suite cases that must *not* block: a contributor's draft; an author's review entry; a draft translation's `localized: true` value while its original is published; a draft edition member whose edition translations are published (edition translations never inherit). Cases that must block: an author's published entry, an edition member's included; a published translation inheriting its original's `localized: false` value. |
| **Fan-out DoS on render** | Caps of 50 per field, 50 items and 10 sub-fields (contract); 100 reference values per entry (code); depth ≤ 2 with a visited set; 200 targets per page; ≤ 2 live reads per page, 0 for snapshots; `referencedBy` ≤ 100. | A property test: random graphs with cycles and 10× the caps resolve within budget, never throw, and cost at most `depth` live reads. |
| **Write amplification and slow guards** | Each guard is one indexed probe on `(site_id, target_id)` or one `json_each` count; members are found through `nodes_translation_locale`. Delete, move and group change cost one probe each, plus the collections anchor, always. The purge planner reads the two snapshots' bundles. Rebuilds are chunked inside one batch. | RFC-0042's benchmark (#105), extended to 10,000 events × 3 references on Miniflare D1, reports the write, delete and move guard costs. |
| **Picker search abuse** | `q` ≤ 100 characters, a substring match with no regex (rule 13), ≤ 20 results, and a per-member rate window. | A 100k-character `q` is refused before it is read. |
| **Prompt injection through target titles** | Titles are data, quoted and truncated in approval prompts (`quote()`, 60 characters); `list_references` marks them as content. | Approval-prompt tests gain reference cases. |
| **An older site Worker crashes on the new types** (`COMPILE[def.type]`, `props.ts:46`, has no entry) | `GET /__cloudhal/features` adds `{ "fields": 2 }`. Every write path refuses the new types with `409 fields_unsupported` until it is reported: interactive writes and `checkBundle` for import, sync, push, pull and restore (§1), as `gates: 2` guards `expiry` (`availability.ts:243`, `cloudflare/src/features.ts`). `resolveFields` skips unknown types from phase 1. | The site Worker features test; an import, a push and a restore of a bundle with a reference definition are refused before step 7; a renderer test with an unknown field type. |
| **Assets in repeaters deleted while used** | `fieldAssetRefs` walks items, `fieldAssetIssues` resolves sub-field types, and the purge planner's asset rule reads field and item assets (§2.5). | An asset used only in a repeater item cannot be deleted; the rebuild keeps its row; a retired, foreign or non-image asset in an image sub-field is refused at its item path; a changed item image purges its page. |
| **A group change strands references** (`translation.group` is writable) | Membership is the current group, `COALESCE(translation.group, id)`, everywhere. Leaving a group is guarded like a delete, with the collections anchor. A node with dependants cannot relink (§1, §2.2, R6, R15). | Relinking a referenced untranslated original as a translation, and dropping `translation`, are both refused while a published entry shows the reference; a draft referrer does not block. |

**Policy.** No new scopes.
- Field definitions stay site settings: `site:settings`; for agents, `site:write` plus a person's approval, person-classed as today (`field-tools.ts:264-267`).
- Values are content: `content:write`, with the `:own` limits.
- Reading targets in the picker and `list_references` needs `content:read`, which every role already holds (`roles.ts` `READ`).
- Referencing an entry never writes it. Only what a published entry shows can stop its delete, its move or its leaving the group (§2.2).

### 9. Rollout (one PR each; the types stay refused on every write path until step 7)

0. **Prerequisite: `asset_refs` by site** (§2.5; fixes [#196](https://github.com/cloudhal-dev/cloudhal/issues/196)).
   - `deleteAsset`'s guard filters by site;
   - `refsRebuild` joins same-site assets, chunks its `INSERT`, and is emitted only when its import batch writes the node set, which closes the existing hole where an `unchanged` push overwrites fresh `asset_refs` rows (`sync-plan.ts:308`; [#196](https://github.com/cloudhal-dev/cloudhal/issues/196));
   - the purge planner's asset rule reads field assets;
   - the `unused` asset listing filter (`assets.ts:322`) filters by site, since a foreign archive can hide an asset from its own site's list today;
   - size ratchet (rule 12): the asset rule moves out of `planCachePurge` (a baselined 233-line function) into `core-ts/src/cache-purge-assets.ts`. The edits to `assets.ts` (1,370 lines) and `store.ts` (1,212), both baselined, add no net lines.

   It is independent of this RFC's types, and fixes four existing gaps: the unscoped guard, the unscoped rebuild, field assets missing from purges, and the `unchanged`-import overwrite.
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
   - the delete, move, group-change and publish rules, with the collections anchor and the policy (§2.2), and the races R1 to R16 as cases;
   - chunked `entryRefsRebuild` in import, sync and restore, and `referenceIssues` in `import --dry-run`;
   - the item walk in `fieldAssetRefs`, and `fieldAssetIssues` with sub-field types and item paths. The `skip` set built in `planEntryFields` (`entry-fields.ts:107`, `slice(0, 2)`) and the skip filter in `fieldAssetIssues` (`field-refs.ts:81`, which compares `r.field.replace('.', '/')`) both switch to item paths, with a **prefix** match: a ref is skipped when any skip path (`fields/speakers`, `fields/speakers/2`) is a prefix of its item path. That keeps today's top-level behaviour too;
   - the membership rule everywhere, the relink refusal (`translation_group_in_use`) with the written-group guard on every group or source change (exempt when the group is the node's own id), and the RFC-0041 `readsOriginal`/`originalOf` tightening;
   - `field_operation_running` for references shown through an in-flight conversion;
   - canonical bodies in `importSite`, and `CopySiteOptions.fieldTypes`;
   - rows and the target guard in field-operation rewrites, with operations naming the new types refused;
   - the kind-aware release `depsOf`;
   - edition id mapping in `forEdition`, emptied items dropped;
   - new modules, to respect the size ratchet (rule 12): `core-ts/src/references/` holds the guards, the fragment, membership and the rebuild, and `core-ts/src/release-deps.ts` the kind-aware `depsOf`, so `releases.ts` (996 lines, in `scripts/size-baseline.json`) only imports them;
   - the `fields: 2` capability in the gate;
   - the API: entry routes, `pick` and `references`.

   The shared suites enable the types with a store option (`SiteGraphStoreOptions.fieldTypes`); production keeps refusing them.
3. **Renderer and purges:**
   - cards, depth and budget, gated per view;
   - `groupMembers` and `referencedBy` on both sources, with the `shared` rule;
   - `EntryFields.astro` (links for references, a nested `<dl>` per item);
   - the conversion maps in the live and snapshot sources;
   - the purge planner's referrer closure (two hops, "used by" by resolved values, read from the `from`/`to` bundles, purge-everything under any marker) and `SnapshotReader.readSnapshotBundle` (no new tags), in `core-ts/src/references/purge.ts`;
   - the release executor's run-time referrer plan, in `core-ts/src/references/release-purge.ts`, so `releases.ts` (996, baselined) only calls it;
   - new renderer modules, `astro-renderer/src/references.ts` (members and reverse maps, `groupMembers`, `referencedBy`) and `reference-conversions.ts`, so `source.ts` (616 lines) does not approach 800;
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
  - **every race R1 to R16 of §2.3**, as two interleaved batches each: the definitions anchor bound as planned (with a definitions change between `getSite` and the batch), and the move and delete collections anchors;
  - delete: the last member versus a remaining member in an allowed or a disallowed collection, and a published versus a draft referrer;
  - moves of an original and of a translation;
  - group changes: relinking a referenced original, and dropping `translation`;
  - **relink with a draft referrer, then publish the referrer (refused: the old id has no member), then delete**;
  - relinking an original that has translations (refused, `translation_group_in_use`), and the concurrent translation-creation race (R15);
  - the unseen-field interleaving (R13): `events.venue` allows `[places, halls]`, `talks.room` allows `[places]`, and a talk is published between plan and batch;
  - `shared` after `set_field_localized`'s phase A, both directions;
  - `field_operation_running` during a text → reference conversion, including a delete planned before phase A commits and batched after it (R12);
  - a status-only holder write planned before `rename_field` phase A and batched after it keeps its rows, through `migration.fromKey`; a key with no definition fails the batch instead of dropping rows (R16);
  - a publish concurrent with a delete or move does not make it answer 409 (the collections anchor ignores `publishedSnapshotId`);
  - a translation becoming its own original is not refused by the written-group guard;
  - a referrer write landing between an `unchanged` push's plan and its batch keeps its rows: no rebuild runs (R10);
  - the step-7 job racing a referrer write: the moved node is skipped, and its fresh rows stay (R17);
  - a delete or move on a site with no `collections` (the anchor binds SQL `NULL`);
  - a new field reusing a running rename's old key: the exact key wins in `shared`;
  - two members of one group in two repeater items: one row, no constraint error;
  - an unrelated constraint failure is not turned into a `ConflictError`;
  - a status-only holder write racing `set_field_localized` phase A leaves the right `shared` (R16);
  - a group-only `translation.group` change racing a relink (R15);
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
  - purge plans with a theme that emits no new tags: a target retitled, unpublished, newly published, newly translated and with a changed cover; a depth-2 page (A → B → C with C unpublished purges A); a "used by" page when a referrer appears or goes; a rollback whose referrer was since edited to draft; a release pinned before a referrer was published; **an approved request publishing an older snapshot after the referrer was edited, then the target unpublished: the referrer's page is purged**; a referrer write landing between `createSnapshot` and `publish`; a translation that only inherits the reference appearing on a "used by" page; **a referrer edited to stop naming the target, or deleted, between snapshot and purge, still purged from `to`'s bodies**; a translation in `to` that only inherits and was deleted since; a release run whose `scheduled` snapshot has no bundle (one bundle plus its items, no purge-everything); an approval of a manual snapshot without a bundle; a site without reference definitions (no bundle read at all); the byte and node budgets falling back to purge-everything; **any field-operation marker on `from` or `to` purges everything**; the `maxTags` and `maxReads` fallbacks;
  - the live-versus-snapshot `referencedBy` comparison runs with no field-operation marker active.
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
| `cloudhal-ref-<group>` cache tags on referrer responses (first revision) | Purges by group | Themes build tags themselves, so existing themes would never emit them; older site Workers answer 400 to new prefixes and every publish purges everything; ids in headers rest on unverified stripping; header budget | The purge planner adds referrers' existing node tags, found from the snapshots' bodies (§2, Purges) |
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
  - An older site Worker is covered by `fields: 2`. Node stores use `FIELDS_SUPPORTED`, and without a capability every store refuses (§1).
  - The purge endpoint and `isCloudhalCacheTag` are unchanged, so mixed admin and site Worker versions purge normally (§2).
- **Data:** none to migrate. The types are refused on every write path until step 7, so migration 0033 is DDL only. Step 7's one-time per-site rebuild is the safety net, and the definitions anchor keeps `field_key_in_use` honest.
- **Themes:** additive. `entry.fields` keeps meaning what is stored: group ids and item objects.
  - Themes from v0.5.0 on render fields through the renderer's `entryFields` and `EntryFields.astro`, so they draw references and repeaters after a renderer upgrade.
  - Older copies show nothing for them.
  - Either way, no theme code is needed for correct purges, because referrers are purged through their own node tags (§2).
- **Releases:** the kind-aware `depsOf` changes nothing for existing content, because no field value can be a group id before step 7.
- **Phase 2 changes behaviour for every site**, before the types exist, and its changeset says so:
  - relinking or unlinking a node that other nodes use as their group is refused (`translation_group_in_use`);
  - `readsOriginal`/`originalOf` require an original to have its own id as its group (OQ 14);
  - group-only translation changes get the group check;
  - imports store canonical bodies;
  - deletes and moves of entries carry the collections anchor.
- **Rollback:**
  - A snapshot restores the site node and entries, and the index is rebuilt in its batch.
  - An operation reverts through its `before` snapshot, dropping deleted targets.
  - `remove_field` removes values and rows.
  - Downgrading below this RFC restores a snapshot from before the first reference or repeater definition; `entry_refs` is then unused.

## Security & policy impact

§8 is the threat model and the policy.
- No new scopes and no new approval points.
- Every statement filters on `site_id`, every guard re-checks it, and nothing resolves across sites.
- New refusals, each with a hint in `field-hints.ts`: `entry_referenced`, `reference_target_moved`, `reference_target_unknown`, `unknown_entry`, `too_many_references`, `field_key_in_use`, `fields_unsupported`, `field_operation_unsupported`, `field_operation_running`, `translation_group_in_use`, `translation_shape_mismatch`, `list_field_type`.

## Open questions (each with a recommended answer)

The owner's acceptance ratified the three decisions above. The answers below are the recommendations each phase PR follows; a phase PR that needs a different answer brings it back to the owner.

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
12. **Edition chains and non-localized values:** inside an edition site, the edition node's translations do not inherit its non-localized values of any type, as RFC-0041 behaves today (`originalOf`). References follow that rule: the fragment finds no inheriting member there. *Recommended:* keep it in stage 4, and fix it for every field type in its own change, defining the in-site root as the member with no same-site source.
13. **R8 and R14** (a translation published just after its inherited target was deleted; a held node published at its live version): accept both with a warning. *Recommended*, because refusing would block a translator over a value they cannot edit. The alternative is to refuse the publish until the original's value is fixed.
14. **Tightening `readsOriginal`/`originalOf`** (an original must have its own id as its group): legacy data relinked before this RFC stops inheriting non-localized values. *Recommended*, because it is the only reading under which an original belongs to exactly one group. Phase 2 reports such nodes in `cloudhal import --dry-run` and on Studio's collection screen, beside `referenceIssues`.
15. **Depth-2 purges** cost a second hop over bodies already in the cache, so nothing extra is read. *Recommended* as specified. The alternative, dropping depth 2 until themes tag cards, was rejected: reading the snapshots' bodies makes it theme-independent.

## Implementation watch list

The riskiest SQL and interplay. Every phase PR's review checks the items its phase touches against this list.

1. **Batch-time guard SQL** (phase 2).
   - **The target guard.** Membership in its index-friendly form, the per-pair `fresh` flag, and `n.site_id = ?`.
   - **The definitions anchor and the collections anchor.**
     - The fragment's stored text is read when the write is planned and validated with `sameJson` against the planned `Site` (a mismatch is a `ConflictError`). The batch compares exactly that text with `IS`.
     - Key order never matters, and nothing the batch compares was read without that check.
     - The definitions anchor is on every entry write in a site with reference fields (amended in 2a, PR #205).
   - **The delete, move and group-change condition.** The blocking-rows fragment, the planned pairs `:P` with the unseen-field `NOT EXISTS`, and "another member, not archived, in `A`".
   - **The rows `INSERT`.** It is a plain `INSERT`, never `OR IGNORE` on the writer path; `shared` is read in SQL by `key` or `migration.fromKey`; a `NULL` must fail the batch and map to `ConflictError`.
   - **The written-group guard.** Present on every group or source change, absent when the group is the node's own id.
   - **What breaks the index invariant silently.** Any `OR IGNORE` on the writer path, any value bound from the plan where the batch should read it, and any probe without `site_id`.
   - **Deduplication.** The writer deduplicates `(field, target)` *after* canonicalizing to group ids.
   - **The `ConflictError` mapping** matches only the `entry_refs.shared` `NOT NULL` message.
   - **The collections anchor** binds SQL `NULL` for an absent `collections`.
   - **Rebuilds** never run beside an unchanged node set. The step-7 job is per node and anchored on each node's read hash; it never does a site-wide `DELETE`.
2. **Purge reads** (phase 3).
   - Purges read only the immutable `from`/`to` bodies (bundles first), never the working copy or `entry_refs`.
   - Any marker on either snapshot purges everything.
   - Release runs re-plan at run time.
   - The `maxReads`/`maxTags` fallbacks are exercised by tests, including a snapshot without a bundle.
   - One hash-keyed cache, one bundle, then the missing hashes only.
   - Shards are streamed, and the byte and node budgets are checked before each parse, so an out-of-memory isolate can never skip a purge silently.
   - The short-circuit for sites without reference definitions.
   - `RELEASE_EXECUTOR_COST` is updated for the re-plan.
   - The release gate reads the published site node, retries once, then purges everything; it never falls back to the working row (#213).
3. **Marker interplay** (phases 2 to 4).
   - `rename_field`'s `root_key` and `fromKey` lag in the fragment (over-blocks only) and in the rows `INSERT` (`fromKey` match).
   - Step 4: the live `referencedBy` reads candidates from `entry_refs`, and a text value has no row until phase B rewrites its entry. So during a text → reference conversion it lists a converting referrer only after phase B, or step 4 makes it read candidates by collection while such a marker runs. The snapshot's index already resolves through the conversion maps (3a). Step 4 chose "only after phase B" (Amended in 4).
   - Text → reference conversion: readers convert on the fly, `field_operation_running` refuses target deletes, moves and group changes, and any marker on `from` or `to` purges everything.
   - `set_field_localized`'s phase-A `UPDATE` of `shared`.
   - `entryRefsRebuild` reading through `fromKey`.
4. **Phase-2 behaviour changes on existing sites.**
   - `translation_group_in_use`.
   - The `readsOriginal`/`originalOf` tightening (OQ 14).
   - The group check on group-only changes.
   - Canonical bodies on import, as hygiene: the canonicalization job was dropped in 2a, because the anchors compare stored text.
   - The always-on collections anchor's liveness: watch 409 rates in the #105 benchmark and in agents' retry loops.
   - Each of these is listed in the changeset.

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
| The definitions anchor is read separately from the planned `Site` (blocking) | The anchor binds the definitions of the very `Site` object the write planned with (§2.1). *Amended in 2a (PR #205):* the fragment's stored text is read when the write is planned, checked against that `Site` with `sameJson`, and compared as text at batch time, not `json(...) IS json(?)`. |
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

### Third round (2026-11-10, final verification of 9e457d12)

| Finding | Decision |
|---|---|
| Membership used `n.id = G OR group = G`, so a relinked node stayed in its old group, R6 failed, and a published reference could strand (blocking, three verifiers) | One definition everywhere, `COALESCE(translation.group, id) = G`, in the index-friendly form (§2, "Membership"). Relinking a node with dependants is refused (`translation_group_in_use`), with a source guard on new translations (R15). `readsOriginal`/`originalOf` require the original's own group to be its id (OQ 14). The relink-then-publish-then-delete case is in the test plan. |
| `shared` encoded the holder's role at write time | `shared` is a pure function of `localized`; who inherits is decided at batch time by the fragment, exactly as `readsOriginal` (§2). |
| Guards computed allowed collections from rows seen at plan time (blocking) | Planned pairs `P` are bound, and `NOT EXISTS (blocking rows with pair NOT IN :P)` forces a retry, for deletes, moves and group changes (§2.2, R13; the `events.venue`/`talks.room` case in the tests). |
| One-hop purges missed depth-2 cards, rollbacks, release runs and "used by" lists (blocking) | Closure to the render depth (two hops), "used by" pages via the groups changed entries name, index mode for ordinary publishes and snapshot mode for rollbacks, releases (re-planned at run time) and restores. Time gates rely on the gate-index TTL. Bounded by `maxReads`/`maxTags`, with purge-everything as the fallback (§2, Purges). |
| `set_field_localized` left `shared` stale; text→reference rendered references without rows (blocking) | Phase A flips `shared` in the site write's batch (§7). Conversions into references refuse deletes, moves and group changes of target entries until phase C (`field_operation_running`, R12). The `rename_field` `root_key` lag only over-blocks (§2). |
| The bundle gate accepted when support was absent | An absent capability refuses; `CopySiteOptions.fieldTypes` and the Node constant `FIELDS_SUPPORTED` (§1). |
| Imported bodies with unsorted keys break the anchor | `importSite` stores canonical bodies from phase 2 (§2.1). *Amended in 2a (PR #205):* the anchors no longer depend on canonical bodies; they compare the stored text read when the write is planned. |
| The `skip` set cannot hold item paths | Changed in `planEntryFields` too (§9 step 2). |
| The `unused` asset filter is unscoped | Added to step 0 (§9). |
| `null` inside items | Means unset in that item, and the schema descriptions say so (§6). |
| Referrer probes are not counted against `maxReads` | One batched probe per hop, counted, stopping at `maxTags + 1` (§2, Purges). |
| A delete protects the group, not each locale's card | Stated, and the dialog and `referenceIssues` name the locales that lose the card (§2.2, §5). |
| Holds can publish a held referrer while its working copy is a draft | Listed as R14, accepted and warned (OQ 13). |
| The §8 policy-test wording for edition members | Reworded: edition translations never inherit, but an edition member's own published value blocks. |
| The target guard SQL lacked the archived check | A per-pair `fresh` flag (§2.1). |
| Step 7 on Node, and the atomicity of its rebuild | `FIELDS_SUPPORTED`; one atomic batch per site, or `INSERT OR IGNORE`-only chunks for very large sites; the statement cap is counted (§2.4). |
| Size ratchet | New modules named: `core-ts/src/references/`, `core-ts/src/release-deps.ts`, `astro-renderer/src/references.ts` and `reference-conversions.ts` (§9). |
| The live-versus-snapshot comparison during operations | Runs with no marker active (test plan). |

### Fourth round (2026-11-10, verification of 21abf4e1)

| Finding | Decision |
|---|---|
| R12 relied on a site anchor that was added only when blocking rows were seen (blocking) | Every delete, move and group change of a `contentEntry` carries the site anchor, so a delete planned before the conversion marker fails once the marker commits, then is refused (§2.2, R12 and its test). |
| Index-mode purges assumed `to` equals the working copy, but any snapshot can be published (blocking, two verifiers) | Chosen: the hybrid. One method for every path: index rows for entries whose working copy equals `to`, plus a `from`/`to` body scan of the entries whose hash differs, found by one `json_each` comparison. `PublishChange` is unchanged. There are tests for an approved request publishing an older snapshot after the referrer was edited, and for a write between `createSnapshot` and `publish` (§2, Purges point 4). |
| `shared` was bound from plan-time definitions on writes the definitions anchor does not cover (blocking) | Chosen: derive it inside the single `INSERT … SELECT` from the site row at batch time. Phase A's `UPDATE` corrects rows written before it (§2.1, R16). |
| The group check ran only when `source` changed | It runs, with a guard keyed on the written group, whenever `translation.group` or `translation.source` is set or changed (§2.2, R15). |
| Legacy non-canonical rows | The step-7 job rewrites the site's rows canonically (§2.4). *Superseded in 2a (PR #205):* the anchors compare stored text, so no job is needed. |
| The `field-refs.ts:81` skip filter path format | It switches to item paths, with the `planEntryFields` skip set (§9 step 2). |
| "Used by" should use resolved values; `referencedBy` cards | Resolved values with the same-site original; `referencedBy` results are cards, and drawing their fields is outside the guarantee (§2, Purges point 3). |
| Wording: "usable member", "drafts never lock", "the one accepted exception" | The guard protects a member's existence; a draft locks only through a published translation that inherits its value; R8 and R14 are both accepted (Summary, §2). |
| A move could let an archived X satisfy a pair | An archived X satisfies nothing, as in deletes (§2.2). |
| Size ratchet for baselined files | `cache-purge-assets.ts`, `references/release-purge.ts`; no net lines in `assets.ts`/`store.ts` (§9). |
| Phase-2 behaviour changes missing from Compatibility | Listed, for the changeset (Compatibility). |
| The refusal list was incomplete | Completed (Security & policy impact). |
| Probe-count wording; snapshot-scan cost | Three probes plus one hash comparison and batched member lookups; a far rollback usually falls back to purging everything; a per-snapshot reverse map is a later optimization (Purges point 6). |

### Fifth round (2026-11-10, verification of fca37cbe; the PM chose to simplify)

| Finding | Decision |
|---|---|
| R16's `INSERT OR IGNORE` drops a row with a `NULL` `shared` instead of failing, so a write racing `rename_field` phase A loses rows (blocking, two verifiers; one confirmed it in sqlite3) | The writer uses a plain `INSERT`. `shared` is matched by `key` or `migration.fromKey`. A `NULL` fails the batch as a `ConflictError`, and the caller retries. The false claim is corrected, and the rename interleaving is in the R16 test (§2.1, R16). |
| The hash-check hybrid's comparison and probes are separate reads; members came from the working copy (blocking, two verifiers) | Dropped, with index mode altogether. Purges read only the immutable `from`/`to` bodies, from their bundles, for every path. **Deviation from the PM's decision:** index mode on the default path, even with an in-statement freshness check, misses referrers edited away or deleted after the snapshot, because the probe never returns them. The cheap whole-site change checks are unsound (rowid reuse). Bundles make the snapshot read cost about 80 shard reads for 10,000 entries (§2, Purges point 4). |
| Purges ignored references shown through in-flight conversions (blocking) | Any field-operation marker on `from` or `to` purges everything (§2, Purges point 4). |
| The always-on site anchor covers `publishedSnapshotId`, so every publish causes 409s | The collections anchor, `json(json_extract(body, '$.collections'))`, holds the definitions and the markers. The threat-model line is corrected (§2.2, §8). |
| The written-group guard blocks a translation becoming its own original | Omitted when the group is the node's own id (§2.2). |
| The canonical rewrite needs CAS and must start with the anchors | A CAS `UPDATE … WHERE hash = ?` job ships in phase 2, and step 7 runs it again (§2.4). *Superseded in 2a (PR #205):* the job is dropped. |
| Skip filter exact match misses list- and item-level issues | Prefix match (§9 step 2). |
| A large `json_each(:toEntryRefs)` parameter | Moot: purges no longer compare against the working copy. |
| A rebuild during a rename drops rows | `entryRefsRebuild` reads through `migration.fromKey` (§2.4). |
| Stale wording: Status line, §8 anchor line, "never lock", "last usable member", R1–R11, the source-guard name | All corrected. |
| An archived-only member cannot be deleted while referenced | Stated in the delete dialog and the guide (§5). |
| Liveness of the always-on anchor | Narrowed by the collections anchor; on the watch list. |
| Riskiest SQL | The new "Implementation watch list" section, which every phase PR's review checks. |

### Sixth round (2026-11-10, final verification of d8a436cc)

| Finding | Decision |
|---|---|
| Rebuilds from rows read before their batch can overwrite a writer's fresh rows: the `unchanged` import path and the step-7 job (blocking) | `entryRefsRebuild` is emitted only when its batch writes the node set (`sync-plan.ts:295-308`, R10). The step-7 job is per node, anchored on each node's read hash like `lists.backfill`, with no site-wide `DELETE` (R17). The same `asset_refs` hole on main is fixed in step 0 (separate issue). |
| The fifth revision's departure from index mode | Confirmed by the verifiers, and put to the owner in "Owner decisions". |
| Purge cost: bundles are often missing (release runs, manual snapshots, expired prefixes) | One hash-keyed body cache over both snapshots: one bundle (`to`'s first), then only the missing hashes, counted. The re-plan is reflected in `RELEASE_EXECUTOR_COST` (§2, Purges points 4 and 6). |
| Memory, and an out-of-memory isolate silently skipping the purge | Per-shard streaming, with byte (`maxBodyBytes`) and node (`maxNodes`) budgets checked before each parse, falling back to purge-everything. |
| Cost for sites without references | Short-circuit: no bundle reads when neither snapshot defines a reference field; phase 3 costs nothing before step 7. |
| `shared` subquery ambiguity | The exact key match wins (`ORDER BY … = k DESC LIMIT 1`). |
| NULL → `ConflictError` too broad | Only the `entry_refs.shared` `NOT NULL` failure, by message (`errors.ts:51` precedent). |
| Deduplication | After canonicalization to group ids. |
| An absent `collections` | The anchor binds SQL `NULL`. |
| Rule 3 and the asset rule | "Used by" also covers entries the asset rule reaches. |
| Stale index-era wording (Summary, §4, §8, Alternatives, OQ 15), "per-collections", the bundle claim | All corrected. |
| An owner summary | The new "Owner decisions" section near the top. |

### Acceptance (2026-11-10)

The owner accepted the RFC with the three decisions ratified ("Kabul ediyorum"). "Owner decisions" became "Decisions (2026-11-10)", and [#196](https://github.com/cloudhal-dev/cloudhal/issues/196) is linked from step 0.

### Amended in 2a (PR #205, 2026-11-11)

Rollout step 2 shipped in two PRs: 2a, store and integrity, and 2b, the consumers. The review of 2a changed these parts of the design, and the sections above now say so:

- **The anchors (§2.1, §2.2).**
  - Both read the fragment's stored text with `json_extract` when the write is planned, check it with `sameJson` against the planned `Site`, and compare that exact text at batch time.
  - Key order does not matter, and no canonical form is needed.
  - In a site with reference fields, the definitions anchor is on every entry write.
- **No canonical-rows job (§2.4).** It is dropped, and step 7 does not run it. Canonical import bodies stay as hygiene.
- **Other changes, recorded as deviations in PR #205 and in ADR-0046:**
  - usable members are checked per pair, with one `json_each` parameter;
  - a referrer write naming an entry outside the field's collections is refused as `unknown_entry` (422), and `reference_target_moved` (409) is only for moves;
  - a reference sub-field added over a key that items already hold is `field_key_in_use`;
  - the `shared` subquery matches only reference and repeater definitions, as an aggregate, not a correlated `ORDER BY`, which workerd's SQLite does not resolve;
  - the list-values fingerprint format is 2, so listed collections rebuild once after the `readsOriginal` tightening.

### Amended in 3a (PR #211, 2026-11-12)

- **`ReferencedEntry.path`** (§4): the member's graph path (`entryPath`, no locale prefix). Themes link with it, so the locale middleware localizes it once, like every other entry link. `url` stays the canonical URL, already localized, and absolute only on a locale's own domain.
- **`referencedBy` follows each page** (§4): a translation resolves with its same-site original while the view shows that original, and without it otherwise, as its page reads it through the gated `entryById`. Ties on date order by id, so both sources agree on order and on what `limit` keeps.

### Amended in 3b (2026-11-12, after the PR #212 review)

- **Seeds purge their own groups' members** (§2 Purges, point 1). A translation inheriting a changed original's reference shows a new card, but it is neither a referrer of the seed nor changed itself.
- **No seeds, no reads.** A publish that changes no entry and no shown asset (term-only, asset-only, site-only) reads nothing for the closure, so the budgets cannot turn it into purge-everything.
- **Which sites count.** A site counts as having references when its `from` or `to` site node defines a reference field, a repeater with a reference sub-field, or a field (or `sub`) still converting *from* references (`migration.fromType: "reference"`). During `change_field_type` reference → text, the converted values render their targets' titles through the conversion maps until phase B rewrites them. On such sites any field-operation marker purges everything; other sites keep today's purge.
- **The closure's own reads.** Bodies the planner already holds are reused. The missing hashes are read by the closure itself (`readSnapshotBundle` with `only`):
  - six at a time;
  - counted against `maxReads`;
  - added to the same byte total as the bundle before each parse;
  - cut to what the closure needs, and never cached whole.
- **The node budget** (`maxNodes`) counts the entry bodies the closure holds across both snapshots, plus the node count of the one bundle it reads.
- **Release runs.**
  - **The gate is the published site node,** not the working row. A release never carries the site node, so its snapshot publishes the live one's; `publishRelease` returns that ref. Only a node that defines references, or still converts from them, re-plans. Every other site sends the plan stored at pin time, as before 3b (nothing when it purges nothing).
    - That gate costs one blob read per release run that has a purger, except on a first publish: a snapshot's site node is captured before the publish flips the pointer, so the working row equals it only on a site's first publish.
    - The read is counted but never refused, so a site without references never depends on what other runs left. If it fails, it is retried once, then the run purges everything ([#213](https://github.com/cloudhal-dev/cloudhal/issues/213), fixed in step 4). The working row never decides: a draft that dropped its reference fields would send the closure-less stored plan and leave referrer pages stale.
  - **The re-plan** goes from the pointer the batch moved (`from`) to the new snapshot. That is `baseSnapshotId` whenever something was live; a first publish purges everything.
    - It runs over the tick's counting driver, never refused, and spends no shard reads on `to`.
    - If it throws, the run purges everything, never the stored plan.
  - **No bundle write at run time.** The site Worker writes the new snapshot's bundle on its first read. Back-to-back releases of one site with no visitor between them therefore re-plan node by node, within the allowance, or purge everything: an over-purge, never a stale page.
  - **Subrequests.** R2 and D1 calls are capped per invocation: 1,000 on Workers Free, by default 10,000 on Paid.
    - Release runs charge their *actual* blob calls to one allowance per invocation, shared by both ticks of the cron's invocation. That includes `refreshSearch`, `labelOf` and a first publish's own blobs, counted but never refused. Each re-plan gets `maxReads = min(2,000, left)`.
    - A re-plan whose two snapshots hold more distinct terms than reads left purges everything before reading anything.
    - "Publish now" sizes its allowance from the deployment's tick budget (`CLOUDHAL_TICK_BUDGET`).
    - Free: 1,000 − 2 × (40 + 7) D1 − 2 × 40 built-in blobs − 2 × (211 `refreshSearch` + 2 + 4 purge sends) = 392, so 350.
    - Paid: about 27 releases fit a tick's 900 statements (33 each with claim and finish). The allowance is sized for ticks of up to 10 releases of 100 items, 3,000. Twenty-seven such releases pass the default cap with `refreshSearch` alone, re-plan or not; that is RFC-0008's budget, unchanged here.
    - **Accepted over-purges, not fixed:**
      - On Free, a reference site with more terms than the allowance leaves purges everything on every release, because the planner reads every term. No cache priming is built for it.
      - On Free, a reference-site release that changes an existing asset reads every entry, page and term one by one in the asset rule, so above about 350 nodes it purges everything.
      - The AI Search mirror's R2 calls (RFC-0029) are not counted.
  - **`RELEASE_EXECUTOR_COST` is 26 statements:**
    - the stored plan (1), the reads (3), the batch (8) and `refreshSearch` (7);
    - then the re-plan's two `getSnapshot` reads, the bookkeeping (4) and `recordPurge` (1).

    The rare site-moved retry stays outside it, as before.
- **The pin-time plan skips the closure** (`references: false`). It would read every body one by one, and for sites with references it is the batch's *expected* outcome only: the run-time re-plan, or purge-everything, covers referrers.

### Amended in 4 (2026-11-12, rollout step 4)

- **`sub`** (§7). The marker sits on the repeater: `{ id, sub, fromKey | fromType }`, or `{ id, sub }` while a sub-field is removed. Phase A keeps a removed sub-field's definition and phase C drops it, as for a whole field. Every item goes through the sub-field's own per-value rule (`fields/migration-sub.ts`), so readers, writers and phase B agree.
  - A sub-field rename's `fromKey` names a sub-key. Top-level readers ignore it (`renamedFrom`), and the rows `INSERT`'s `fromKey` match requires `migration.sub IS NULL`.
  - `referenceUses`, `definitionOfPath` and `fieldAssetRefs` read an item's old sub-key while the rename runs.
  - `set_field_localized` refuses `sub`, because sub-fields share their repeater's `localized`. Removing a repeater's only sub-field is refused: remove the repeater instead.
- **`change_field_type`'s request checks** (`fields-operations/retype.ts`):
  - an input the target type does not take is refused, and with `sub` only `collections` (to a reference) and `options` apply;
  - a reference changes to a reference only to switch `multiple`;
  - a conversion that carries ids over (reference ↔ reference, reference ↔ repeater) may only widen the target collections, so phase B never writes a carried id where the field no longer allows it;
  - a repeater converts to text or to a reference only when it has exactly one sub-field, of type text or rich text, or reference. Readers know only the new definition and the marker, so they read each item's one value from its shape.
  - Repeater → text sets `multiline: true`. A rich-text sub-field's items join as their Markdown source, as stored, because the marker does not record the sub-field's old type.
  - The dry run checks the site the operation leaves against the contract and `checkFieldDefinitions`, with the store's capability. Until step 7, that is where reference and repeater targets are refused (`fields_unsupported`); `field_operation_unsupported` is no longer raised.
- **Text → reference never picks the entry's own group** (`ConvertContext.group`), the same rule a person's write follows.
- **Phase B's target guard covers only the ids a rewrite newly names** (`rewriteTargetGuard`, mode `fresh`), meaning ids that appear nowhere in the stored value. Ids a reshape or a rename carries over are not checked. A value naming a deleted target therefore finishes its conversion as stored, with its row, as rows are kept for a missing target. Guarding carried ids would skip such an entry on every pass, and phase C would never run.
- **Writers during an operation** (`EntryEngine.write`) load the conversion maps before `normalizeEntryFields`, only while a text ↔ reference conversion runs. They then compare the draft with the stored entry normalized through the same markers, for the target guard and for canonical ids. A person's edit that leaves a reshaped or renamed value alone is therefore not re-checked. Text → reference values converted on a person's write are not guarded as newly chosen: deletes in the target collections are refused meanwhile (`field_operation_running`), and only archiving can race them.
- **`hasReferenceFields` includes a field still converting from references.** Until phase B rewrites them, its entries keep rows, which every write, rewrite and guard must still see.
- **`shared` follows `localized` in every operation site write** (`references/localize.ts`, phase A and the revert's first step), as a diff of the two site bodies anchored on the new site hash. In a site with reference fields, every entry write carries the definitions anchor. A holder write planned before phase A therefore fails its batch, and its retry reads the new definitions: R16 resolves by retry.
- **Revert `dropped`.** Each revert pass reads the members of the ids its decisions name, once. It drops each id with no member in a collection its field allows, whatever the member's status, and guards the rest with a member requirement (mode `present`). A target deleted between the read and the batch skips the entry, and the next pass drops it.
- **Watch item 3, live `referencedBy`:** it reads candidates from `entry_refs`, so during a text → reference conversion it lists a converting referrer only after phase B rewrites that entry. That is the documented behaviour, and nothing reads candidates by collection while a marker runs. The live-versus-snapshot comparison runs with no marker active, so the difference is never compared.
- **The CLI and the admin API** take `collections`, `maxItems`, `subFields` and `sub`, and the API also takes `itemLabel`. MCP's operation tools keep their step-1 inputs until step 5.
- **[#213](https://github.com/cloudhal-dev/cloudhal/issues/213)** (from 3b): the release gate's read of the published site node is retried once, then the run purges everything.

#### Review round 1 (2026-11-12, PM review of PR #214)

- **Values that stop converting while an operation runs** (root cause 1). The dry run sees only the start state; meanwhile a target can be archived or deleted, or a second entry can take the same title. One rule:
  - **Phase C's pending check reads the value where the JSON type cannot tell.** For text ↔ single reference, top-level and in `sub` items, a string that is no group id is pending to a reference, and a string that still is one is pending from a reference. The test is a `GLOB` plus length bounds, the SQL form of `GROUP_ID_PATTERN`. A list of ids and a list of items are told apart by their first element.
  - **Each pass reports its unconvertible entries** (`FieldOperationResult.unconvertible`, `FieldRevertResult.unconvertible`: `{ entryId, reason }`, next to `skipped`). They keep the marker, and with it `field_operation_running`.
  - **The way out.** `continueFieldOperation` and `revertFieldOperation` take `onInvalid: "clear"`, which drops what no longer converts, so the marker can always be lifted. The admin API's continue and revert routes take it in the body, and the CLI's `continue` and `revert` take `--clear`. The CLI stops looping while entries are unconvertible and says how to go on.
  - Id-shaped legacy text (`entry_…` naming no group) converting to a reference is the one value this cannot tell apart. The dry run counts it unconvertible, and readers show nothing for it.
- **The "fits" shortcut** (root cause 2). A group id is valid text, and id-shaped text is a valid single reference. For text ↔ reference, top-level and in items, the shortcut is therefore never taken, in `retype`, `normalizeThroughMarkers`, `resolveFields` (`convertsEveryValue`), phase B and revert. Every value goes through the table, and the table keeps a value already in the new type:
  - text → reference keeps an id of a usable target group that is not the entry's own (`ConversionEntries.usable`);
  - reference → text keeps a string that is no group id.

  This is the PM's baseline rule in value form. A value a person wrote under the new type is the value the table keeps, and a person's newly chosen id still differs from the normalized stored one, so the writer guards it with the own-group check. Readers need no baseline. Phase B's guard treats every id in a value converting from text as newly chosen (`carriedPart`), so a converted id is guarded.
- **Revert of a sub-field removal** counts the definition as restored only once the repeater has the sub-field again, so the definition, its values, their rows and the guard come back.
- **`hasReferenceFields`** counts any marker whose source type can hold references (`fromType` reference or repeater). A repeater converting away keeps its rows visible until each entry is rewritten.
- **`shared` after a rename's revert** matches the definition's key and its `fromKey` (`root_key IN (key, fromKey)`), so a revert that also restores an older `localized` updates the rows of entries under either key.
- **Release dependencies through the markers.** For a field carrying a marker, every group-id string in its value, and in its old key's value, is dropped from the dependency walk. Field values name no other entry. This covers a sub-field rename's old key and a conversion from references.
- **The edition copy** reads a reference sub-value through a running sub-field rename, as `referenceUses` does, so an unusable id is dropped and reported.
- **The 100-references cap** is counted by the dry run and by every pass's decider for a conversion. Over the cap, the value is unconvertible, or cleared under `onInvalid: "clear"`.
- **Collections widen only where ids stay.** The check runs only when the field stays a reference, or becomes one with ids carried over. A sub-field reference → text is no longer held to another sub-field's collections.
- **Titles for reference → text** come from every member, any status, so an archived target converts to its title. The title chosen is the default-locale member's, else the group's original's, else the member with the lowest locale, then id, whatever the read order. Only a group with no member in the site is unconvertible. Archived members still match no text.
- **Repeater → multiple reference** deduplicates ids, first seen first.
- **`multiple`** is ignored where it does not apply, as before step 4. The CLI sends `multiple: false` for a reference target without `--multiple`, so multiple → single can be asked for.
- **Malformed `subFields`** (entries that are not objects) are a 400 in the admin API and a CLI error, never a 500.

#### Review round 2 (2026-11-12, PM verification of c8c00f9e)

Round 1 dropped the "fits" shortcut for text ↔ reference, but then the table re-decided values that were already converted. This round replaces that with one rule.

- **One rule for "already in the new type"** (`fields/text-reference.ts`). Every caller uses it: the dry run, phase B, the revert's decider, a person's write (`normalizeThroughMarkers`), `resolveFields` with and without maps, and so the renderer sources.
  - **A person's write that changes the value** (it differs from the stored value) is kept when it fits, and the writer's guard checks it as newly chosen. `normalizeEntryFields` passes the stored entry, and items are compared one by one.
  - **No maps** (`checkRequiredToPublish`, prechecks): a value is kept as stored, never read as missing for want of maps.
  - The pristine rule this round introduced, and the gap it left, are replaced by round 3's rule below.
- **Phase C's pending check follows the rows, not the shape** (`textReferencePending`, on top-level values and `sub` items, correlated on the pending query's `nodes.id`, run on SQLite, D1 and DO).
  - To a reference: a value is pending when it is text that is not a group id, or a group id with no `entry_refs` row for (node, field path, value).
  - From a reference: a value is pending while any row is left for (node, field path).
  - A multiple reference keeps its shape test: arrays are converted, strings are pending.
- **The cap** (`fields-operations/cap.ts`) is applied by the dry run, phase B and the revert's decider. Under `clear`, a `sub` conversion over the cap loses only the converted sub-values (an emptied item goes, an emptied list is no value), never the repeater.
- **A sub-field operation's revert** starts from the repeater as it is now and puts back only the named sub-field (`revert-sub.ts`):
  - a removed sub-field goes back in at its old index;
  - a renamed or retyped one is replaced by its earlier definition under the inverse marker;
  - a different sub-field of the same key is refused (`field_key_in_use`).

  A removal counts as reverted only when the repeater holds the earlier sub-field unchanged (`sameJson`). Sub-fields added since stay.
- **The renderer's maps read every entry**, archived ones too, as the store does. An archived target or an archived default-locale member lends its title to reference → text on both sources.
- **The edition copy** carries text that a running text → reference conversion has not converted yet as it is, rather than dropping it as missing. The edition's own write converts it.
- **Repeater → reference is always multiple**, as its row is reference (multiple) ↔ repeater. A `multiple: false` (the CLI's default) is ignored there, and `maxItems` is kept.

#### Review round 3 (2026-11-12, PM verification of 23bffe00)

- **The decision reads the facts phase C reads.** Round 2 decided legacy values by whole-entry pristineness (the node's hash against the `before` snapshot), while phase C reads rows. Many writes move a hash without touching the field: a title edit, a status change, source-forward, a term merge or retire, the tags migration. Each one left the two sides disagreeing. `pristine` is gone from these rows' decision (`fields/text-reference.ts`); the other conversion rows keep RFC-0041's rule.
  - Each pass of the dry run, phase B and the revert loads the collection's `entry_refs` rows for the converting field path once, beside the maps (`references/conversion-rows.ts`, filtered by `site_id`, `source_collection` and `field`). A person's write reads its node's rows.
  - **Text → reference**, for an id-shaped value (a string, or every element of a multiple's list):
    - the entry's own group fails first, in every caller;
    - in the target shape with a row for every id, it is kept;
    - written under the new type by a person's write (it differs from the stored value) and fitting, it is kept, and the writer's guard checks it;
    - otherwise it is legacy, and `check` writes it as a reference (a bare string wrapped for a multiple) under the fresh guard, with its rows, when every id names a usable group. Else it fails, is reported, and `clear` drops it;
    - under a multiple definition a bare string is never kept;
    - any other text goes through the table (`byText`).
  - **Reference → text.** A row left for the node and path means the value is still a reference: a group in `titles` converts to its title, any other fails (reported; `clear` removes it and its rows). No row left means it is text already, an id-shaped title included.
  - **A value the decision does not accept keeps its rows as they are** in a person's write (`held`): a rejected text → reference value gets no row, and a reference → text value that does not convert keeps its rows until phase B reports or clears it.
  - **Readers** (`resolveFields`, the renderer) have no rows. They keep a display rule: an id-shaped value naming a member group shows as a reference, except the entry's own group; a group's title shows for reference → text, any other string as it is.
  - Round 2's accepted gap is closed: legacy text is decided by its rows, whatever wrote the entry.
- **The edition copy** carries text a running text → reference conversion has not converted only when the edition site's maps convert it to exactly one group, so the edition's own write converts it. Any other text is dropped and reported, as in round 1.

#### Review round 4 (2026-11-13, PM verification of 0d170eab)

- **Reference → text is decided per value.**
  - A string is still a reference only with its own row (`rows.has`); with no row of its own it is text already, even next to a held reference item in the same repeater.
  - A non-string (a list, `[]` included) is never text yet and goes through the table: joined titles, no value, or a failure.
  - `rows.any` is phase C's pending predicate only.
- **`held` is per value.** A person's write keeps stored rows only for the (field path, group id) pairs the decision failed (`HeldRef`), writes rows for every accepted value, and deletes rows for ids no longer in the draft. `rewriteItems` returns item-level results: in a person's write (`partial`) a failing item stays as stored while the others convert, and the operation's passes still treat any failing item as the entry's failure. The writer's guard skips held values, which are stored as they were and reported by phase B.
- **The writer's "already held" comes from the rows.** While a text → reference conversion runs on a definition or `sub`, an id counts as already held only with its row for that path (`ConvertingRows`, which `normalizeWrite` already reads); every other id is newly chosen, as `rewriteTargetGuard`'s rule treats them. The edition copy follows the same rule.
- **Rebuilds read a converting path through its earlier type** (`rebuildRows`; pull, push, `import --replace` and `--revert`, snapshot restore).
  - From text: no rows for the path, so phase B checks every value again.
  - From references: a stored value that is still a group id of the site keeps its row. An id-shaped title naming no group stays text.

  Sites without such a marker are unchanged, and imports are not refused.
- **The edition's `textConverts`** uses the converter's own rule: `byText` without the entry's own group, exactly one group left.

#### Review round 5 (2026-11-13, PM verification of 973494e9)

- **Rebuilds.**
  - Converting from text, only a bare string loses its row; a multiple's list (stored only by phase B or a guarded write) keeps its rows.
  - Converting from references, every group-id-shaped stored string keeps its row, whether or not its group still has a member, as the live writer keeps it, so phase B reports a deleted target.
- **Text → multiple reference's pending check follows the rows:** a list is pending while any element is not a group id with its own row for (node, path, element) (`listRowsPending`).
- **Held only for stored values.** A person's write holds a failing value only when it is the stored one, compared per item with `rewriteItems`' canonical-item match (`FailedValue.stored`); one the person newly wrote is guarded like any choice.
  - The own-group check runs over every use of a changed key, held or not.
  - Held pairs are counted per occurrence: an id the draft also holds in an accepted or converted item is not held.
- **A repeater converts item by item in a person's write only when every failing sub-value still fits the new sub-field** (an id-shaped value). Otherwise the repeater stays as stored, so the write checks; phase B reports it.
- **`loadNodeRows` filters `source_collection`** by the draft's collection, here and in the edition copy, so a move into a converting collection holds nothing from the old one.
- **Phase B's guard on a converting path** treats an id that already has its row for the path as carried, read from the pass's rows, as `guardedUses` does. An accepted item whose target was archived later no longer skips the entry forever.
- **The edition's held check is per path:** on the converting sub-field only `rows.has`, and other sub-fields' stored ids only for those sub-fields.

#### Final gate (2026-11-13, PM verification of cff168d6)

- **Per-occurrence held subtraction applies only to paths converting to references** (`fromType: "text"`), where another occurrence gets its own guard and row. Converting from references, every stored failing id stays held, so a copy of a failing item cannot drop its rows and turn a dangling id into text unreported.
- **Rebuilds read a running reference (multiple) ↔ repeater conversion through its old type** (`reshapedRows`, top level). A stored value still in the old shape keeps its rows: from a reference, each id-shaped string at the field path; from a repeater, each item's id-shaped sub-value at `<field>.<sub>`. A mid-operation import therefore keeps the target locked.
- **The edition's per-sub-field held check applies only while a text → reference marker runs on the definition.** Otherwise every stored id of the field is held, as before step 4.


### Amended in 5 (2026-11-13, rollout step 5)

- **Prechecks reuse the store's write plan.** `create_entry`, `update_entry` and `delete_entry` run the store's own plan as a dry run (`NodeWriteOptions.dryRun`; `deleteContentEntry(entry, { dryRun })`), which throws every plan-time refusal and writes nothing. MCP no longer keeps a copy of the field checks: values, assets, `requiredToPublish`, translation links, canonical ids, the target guard's plan-time checks (`unknown_entry`, own group, `where`), the references cap, and `planLeave` (`entry_referenced`, `field_operation_running`). The batch-time guards still decide the real write.
- **`fieldsStrict` and `clearFields`** follow §6 as written. The strict values are read by core-ts's `readStrictFields` (`fields/strict-input.ts`), beside the strict schema it reads, and MCP merges them as one merge patch. An unknown key in `fieldsStrict` is `unknown_field` even when its value is `null`, so a typo is never silently "left as it is". An item that was already empty as given is not a strict drop: the checker refuses it ("no empty item").
- **`update_collection`'s and `change_field_type`'s type lists follow the store's capability** by its presence (`SiteGraphStoreOptions.fieldTypes`): the tool list is built when a server starts, before any site is named, so it cannot ask `supported(siteId)`. Production passes none until step 7, and the store still decides per site. `defsClosure` and the resolving-`$ref`s test were already in place from step 1; the test now covers both tool lists.
- **`list_references`** shares the API's referrers read, moved to core-ts (`references/referrers.ts`, `listReferrers`). `direction: "from"` reads the entry's own `entry_refs` rows, and for a same-site translation the rows of its original it shows by the `shared` rule (`inherited`), each with the group's members in the site, any status. Like the API's route, it is an editor's view of the working copy: site-scoped (another site's entry is `not_found`), no gates. Titles are marked as content (`notice`).
- **Translation paths** are `key/index/sub` (`speakers/0/talk`), relative to `fields`, as issue paths are (§3 "Machine translation").
  - A key is an item path only when the part before its first `/` names a repeater of the collection (`itemPathRepeater`); any other key, such as `og/image` in a collection without definitions, is a plain key, as before.
  - Item paths write into a copy of the source's list (or into a list given whole in the same call), so each item keeps the source's other sub-values: targets, images, selects.
  - **Once the same-locale translation holds its own list for that repeater, item paths are refused** (`translation_shape_mismatch`, 409, "send the whole list"): re-translate by sending the whole list, in the source's order. Either side may have been reordered or edited since the first translation, and no revision check can tell whether an index still names the same item, so the rule does not try (review round 3 replaced a `translation.source.rev` check that had holes).
  - A list given whole must have the source's length (`translation_shape_mismatch`).
  - Paths name items by index, so `get_translation_source` returns `sourceRev`, and `save_translation` requires it with item paths (`invalid` without, `conflict` when the source moved on). The handler refuses paths that no longer fit, as the precheck does; nothing is dropped silently.
- **`set_field_localized`** takes no `sub` over MCP, since the store refuses it (§7 "Amended in 4").
- **The dry run's reach.** It returns after the asset references, the release hold (`scheduled_locked`), time gates and the term invariants (`required_term`), with the planned entry. It does not plan the path change (`path_conflict`, redirects), a collection's first entry, list values or source-forward, and slug uniqueness is decided by the write. The prechecks build the same entry the handler writes (terms, cover, title and body included).
- **Approval prompts describe the planned entry** the dry run returns, not the raw patch: a translation's id reads as the group it is stored as, and a key the write would not remove reads as its planned value. Items compare as canonical JSON (key order never counts) against the stored list read through the field-operation markers by the store's own `normalizeEntryFields` (now exported, so the two readings cannot drift: an edition member is no translation there), so a running sub-field operation does not read as every item changing. An added and a removed item at one index read as a changed item (`changed item 1: person → "Grace Hopper" (entry_…, People)`), and `reordered` is noted whenever the items both lists hold change order.
- **Removals during `rename_field`.** While a top-level rename runs, an entry not rewritten yet holds the value under the old key, and the writer moves it. The two keys are one field: removing either (`clearFields`, or `null` in `fields`) removes both, so the move cannot bring the value back, the old key is a known name meanwhile, and setting one while removing the other is `invalid`. This is MCP's patch reading; the API and Studio write whole entries.
- **A continuation's `onInvalid: "clear"`** applies to its report too (`continueFieldOperation`): values it drops are counted as cleared, with no `field_values_unconvertible` refusal. MCP's continuation headline is the stored operation's.
- **`list_entries`** returns `groupId`; `where` on a reference field stays refused (`invalid_query`) until step 8.

### Amended in 6a (2026-11-13, rollout step 6, first PR: blocks and the entry editor)

- **A route for the chosen targets** (§5 "API"): `GET /sites/:siteId/entries/groups?ids=a,b` (`content:read`) answers each group's members in the site, any status, as the picker's cards; `[]` for a group with none left. The picker route finds new targets only, and `references` lists referrers, so the editor had no way to name a stored id. At most 100 ids, the per-entry cap.
- **The member the editor shows** for a target: in an allowed collection, the one in the entry's language, else the default language's, else the first, whatever its status. "Draft", "In review" and "Archived" say "Will not show until published"; a group with no member is "Not found". This is the editor's view, not `pickMember`: whether a published member in another language shows depends on `localization.fallback`, which the publish warnings (step 6b, `referenceIssues`) report.
- **Legends** read "Item 2: Ada Lovelace" (`fields.editor.itemLegend`, a `select` on whether the item has a name). The contract has no singular label for a repeater, so "Speaker 2" is not available; the item's name comes from `itemLabel`, else the first text, select or reference sub-field.
- **Problems in collapsed items** are listed above that repeater's items (a button per item opens it and focuses its first control), and every item a new save error names opens.
- **`EntryPicker`** marks several-choice options with a checkbox icon inside each `option` (the search field keeps the focus, `aria-activedescendant`), not a Kumo `Checkbox`, so the listbox has no nested controls. One choice picks and closes. A group found in several languages is listed once.
- **`FieldControl`** frames a reference in a `fieldset` (label, description, error); the host's `renderReference` fills it.
- **Gate:** step 6a adds no capability check. No production collection can define the two types before step 7, so the editor never meets them there; the builder (6b) offers them only behind the server's capability.

#### Review round 1 (2026-11-13, PM review of PR #219)

- **Undo writes over the present.** The repeater's undo writes through the latest `onChange` and items, `EntryFieldsForm` writes over its latest value, and the editor updates its draft functionally. An undo seconds later therefore keeps every edit made since the removal (title, body, other fields) and the saved `rev`. The toast belongs to its entry: it closes when the editor leaves the entry or unmounts, and an undo for another entry does nothing. Undo answers false, and Studio says so, when the list is full again or gone.
- **Item problems follow their items.** The error map arrives by index and is re-keyed to the items' stable keys once, so moves, removals and undos keep each problem, and `aria-invalid`, on its own item.
- **Announcements** empty the polite region before each message, so a repeated message is announced again (repeater, and `ReferenceList`, whose moves and removals now keep focus on the moved row or move it to the next row, else to the picker's trigger).
- **`EntryPicker`.** A full field keeps its trigger focusable (`aria-disabled`, opens nothing), so focus returns to it after the pick that fills the field. A failed search is the polite status ("The search didn't finish"), and the spinner is hidden from assistive tech.
- **The groups read** sends only well-formed group ids. Anything else (text a running conversion has not rewritten) shows as "Not found". A failed read shows an error banner with "Try again".
- **During a running field operation** the editor reads values through the markers. A top-level rename's old key and a sub-field rename's old key in each item are shown under the new key, and a write leaves only the new key. A value a type change has not converted yet (its shape is not the new type's, `fitsShape`) is shown read-only, as stored, with "Being changed", top level or per item. The UI never converts it; phase B does.
- **No empty item is sent.** "Add item" keeps its empty item in the form while it is being filled; the save leaves out items without a value (the collection's repeater definitions only), and a list left empty is no value.

#### Review round 2 (2026-11-13, PM verification of 5311a1b9)

- **Item issues after empty items are left out.** The server counts the items that were sent; the editor maps each issue's item index back onto the draft's items (`sentIndexes`, `draftPath`) before the error map is built, so a problem never lands on an empty item.
- **Read-only.** Every repeater item is open when the form is read-only (its toggles sit in the editor's disabled fieldset). "Used by" moved to the reach cards, beside "In menus" and outside that fieldset, so its "Show more" works on an article the person can't edit.

#### Review round 3 (2026-11-13, PM check of 98a7e3b3)

- **Duplicate** copies the fields without empty repeater items too (`duplicateOf` runs the same `withoutEmptyItems` as a save).
- **The index map is built from what the failed save sent** (the mutation's variables), not from the draft when the error arrives, which may have changed while the save was in flight.
