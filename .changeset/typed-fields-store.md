---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
---

Typed custom fields, step 2 (RFC-0041 / ADR-0043): the store and the API enforce field definitions.

- **Site writes** (`updateSite`, `createSite`, `PUT /api/sites/:id/collections/:key`, dry run included) check definitions: reserved (`field_key_reserved`) and duplicate keys or options, `minimum` above `maximum`, 30 fields per collection and 200 per site (`too_many_fields`), 256 KB of collection settings (`too_large`). A plain edit never loses a value: changing a field's `type`, `localized` or `multiple`, or dropping a key or a select option that an entry still holds, is refused with `409 field_change_needs_operation`, naming the field operation to use. Other site writes do not re-run the checks.
- **Entry writes** check only the field values that changed: `422 invalid_fields`, `unknown_field` (a new key without a definition, once the collection has definitions; stored unknown keys are kept), `field_not_localized` (a translation's own copy of a non-localized value) and `required_field` (review or published without a `requiredToPublish` value; drafts save freely). `fields` is capped at 256 KB per entry in every collection when it changes (`too_large`). Image values must be image assets of the site, and image and rich-text asset references are recorded in `asset_refs` under `fields.<key>`, so a used file cannot be deleted. Every refusal lists its problems with paths in `details.issues` (`fields/startsAt/at`).
- **API inputs** remove a key with `null` in a collection that has definitions. Collections without definitions keep `fields` as any JSON, exactly as before.
- **Search**: `text` and `richText` fields marked `searchable` add their words to the entry's search text at the next publish (off by default; sites without searchable fields index byte for byte as before).
- `refuseFieldIssues` and `fieldRefusalCode` are exported from `@cloudhal/core-ts/fields`.
