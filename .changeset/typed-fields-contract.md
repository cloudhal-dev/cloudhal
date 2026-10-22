---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
---

Typed custom fields, step 1 (RFC-0041 / ADR-0043). `Site.collections.<key>.fields` takes an ordered list of 1–30 field definitions in nine types (`text`, `richText`, `number`, `boolean`, `date`, `datetime`, `url`, `image`, `select`), discriminated by `type`, each with per-locale labels, `localized` and (except `boolean`) `requiredToPublish`. The new `@cloudhal/core-ts/fields` subpath (Worker-safe, eval-free) checks definitions (reserved keys, unique keys and options, 30 per collection, 200 per site, 256 KB of collection settings, the plain-edit guard), checks values through ADR-0030's `validateProps` (only changed values; unknown keys refused once a collection has definitions; 256 KB per entry), checks `requiredToPublish`, emits the JSON Schema agents receive (strict-mode safe), and resolves values across translations (`resolveFields`). Nothing reads it yet: the store, API, MCP, Studio and renderer adopt it in later steps, so nothing changes for existing sites.
