# ADR-0001: JSON Schema is the contract source; TypeScript and Rust are generated
- Status: Accepted
- Date: 2026-10-07
- Related: RFC-0001
- Sources: https://github.com/bcherny/json-schema-to-typescript · https://github.com/oxidecomputer/typify (issues #579, #828) · https://ajv.js.org/json-schema.html · https://docs.rs/jsonschema · https://zod.dev/json-schema · https://github.com/glideapps/quicktype

## Context
Cloudhal ships in TypeScript first and moves the core to Rust later. Both must agree on Project/Site/Page/Section/ContentEntry/Snapshot/SkillManifest without hand-maintained duplicates. Discriminated unions (Section kinds) and versioning (`schemaVersion`) must survive generation in both languages.

## Decision
Hand-written **JSON Schema 2020-12 (draft-07-compatible subset)** in `packages/core-contracts/schemas/` is the single source of truth. A bundler inlines shared `$defs` into self-contained per-root files (`schemas/.bundled/`). TypeScript is generated with **json-schema-to-typescript 16.0.0**, Rust with **cargo-typify 0.8.0**; both outputs are committed and CI regenerates and `git diff --exit-code`s them. Golden fixtures under `fixtures/{valid,invalid}` are validated by **ajv 8.20 (Ajv2020)** and the **jsonschema 0.58** crate, and valid fixtures must round-trip through the generated Rust types.

Authoring rules: unions are `oneOf` with inline variants and `kind: {type: string, enum: [one]}`; no `default` (serde would drop default-equal values and break round-trips); no `$dynamicRef`/`unevaluated*`/`dependentSchemas`; cross-file refs only to `common.schema.json#/$defs/*` or another root's top level; `additionalProperties: false` except on declared maps; every root carries `schemaVersion`.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| TypeScript-first (zod 4 / TypeBox) → JSON Schema → Rust | Runtime validation DSL for free | Rust becomes downstream of whatever shape `toJSONSchema` emits (`anyOf` vs `oneOf`), typify needs specific shapes | Second source of truth; weak Rust fidelity |
| Rust-first (schemars) → JSON Schema → TS | Best Rust types | Rust ships months after TS | Timeline makes it impossible |
| quicktype for both | One tool | Flattens discriminated unions into one struct in both targets (verified) | Loses the core modelling feature |

## Consequences
- Positive: one place to change; drift is mechanical to detect; both validators consume identical fixtures.
- Negative: generated code is committed (larger diffs); typify's subset constrains schema features; generator versions must be pinned exactly because output changes between minors.
- Risks: typify 0.x churn (mitigated by pin + drift job); schema evolution needs a migration story (RFC-0001 §versioning).
