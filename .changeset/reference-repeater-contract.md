---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": patch
"@cloudhal/mcp-server": patch
"@cloudhal/api": patch
---

The contract gains two field types for collections, `reference` and `repeater` (RFC-0045 §1, rollout step 1, #114). Every write path still refuses them, so existing sites behave exactly as before.

- **Contract.** `FieldDefinition` gains `ReferenceField` and `RepeaterField`. A new `SubFieldDefinition` union holds a repeater's sub-fields: scalar values only, so a repeater cannot contain a repeater. `FieldMigration.fromType` gains both types, and `FieldMigration` gains an optional `sub`. There is no `schemaVersion` bump, and existing documents stay valid.
- **The gate.** Until rollout step 7 enables them, a reference or repeater definition, or a migration marker that names one, is refused with `fields_unsupported`: API status 409, with an MCP hint. The refusal covers:
  - site creates and updates, so Studio, MCP and the API;
  - field operations;
  - every bundle `importSite` takes: import, pull, push, `cloudhal import --replace` and `--revert`, snapshot restores and edition copies.

  `checkBundle` gained `assertFieldTypes`, which refuses the types when no capability is given.
- **Pure core** (`@cloudhal/core-ts/fields`), with no effect on stored data yet:
  - the definition rules: `reference_target_unknown`, `where`, `itemLabel`, and caps on sub-fields and leaves;
  - value checks for both types, the per-item `requiredToPublish`, and `too_many_references`;
  - `resolveFields` skips types it does not know;
  - `fieldsJsonSchema(…, { strict: true })` and `strictSchemaCost`;
  - `pickMember`, `referenceIssues`, and `FIELD_QUERY_OPS` and structured-data entries that make neither type listable or mappable.

  `FIELD_TYPES` keeps the nine enabled types (`EnabledFieldType`). `ALL_FIELD_TYPES` lists all eleven.
- **MCP.** `update_collection`'s input now builds its `$defs` with `defsClosure` and offers only the enabled types. A test checks that every `$ref` in every tool's input and output schema resolves. Before this change, `pnpm gen` alone would have left the input pointing at `$defs` it did not carry.
