---
name: contract-change
description: Change a Cloudhal domain contract (JSON Schema in packages/core-contracts) and regenerate TypeScript and Rust types without drift. Use when adding or changing a node type, field, enum value or shared definition.
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:graph"
---

# Contract change

Contracts are JSON Schema 2020-12 files in `packages/core-contracts/schemas/`. Both `src/generated/*.ts` and `crates/cloudhal-schema/src/generated/*.rs` are produced from them and committed; CI rejects drift.

## Steps

1. **Decide the version impact.** Adding an optional field is non-breaking. Removing/renaming a field, changing a type, or adding a required field is breaking → bump `SchemaVersion` enum in `common.schema.json` only with an accepted RFC (`write-rfc`), and keep the old version's fixtures.
2. **Edit the schema.** Shared shapes go in `common.schema.json#/$defs`; root-specific helpers in that root's `$defs`. Stay inside the generator-safe subset:
   - unions: `oneOf` + inline object variants + `"kind": {"type":"string","enum":["one"]}` + `required` includes `kind`
   - no `default`, `$dynamicRef`, `unevaluatedProperties`, `dependentSchemas`, `if/then`
   - cross-file refs only `common.schema.json#/$defs/X` or `<root>.schema.json` (top level)
   - `additionalProperties: false` on objects; maps use `additionalProperties: {schema}`
   - string `pattern`s must be valid in both JS and the Rust `regress` crate (ECMAScript syntax; avoid lookbehind)
3. **Add fixtures.** At least one `fixtures/valid/<schema>/*.json` exercising the new shape and one `fixtures/invalid/<schema>/*.json` as `{"reason": "...", "data": {...}}`.
4. **Regenerate and test.**
   ```bash
   pnpm gen
   pnpm check && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
   ```
   If Rust round-trip fails, the usual causes are `default` (serde skips defaults) or a union shape typify turned into `untagged`. Fix the schema, not the generated code.
5. **Check the generated diff reads as intended** (`git diff packages/core-contracts/src/generated crates/cloudhal-schema/src/generated`). Unexpected renames mean a `title` changed.
6. **Commit schema + fixtures + generated files together**; add a changeset for `@cloudhal/core-contracts`; reference the RFC/ADR in the commit body.

## References
- `docs/adr/0001-contract-pipeline.md` — why this pipeline, tool pins
- `docs/rfcs/0001-site-graph.md` — the model and its invariants
- https://github.com/oxidecomputer/typify (supported schema subset) · https://github.com/bcherny/json-schema-to-typescript
