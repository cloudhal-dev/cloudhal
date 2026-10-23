---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
---

Collections stage 3 contract and pure core (RFC-0042 step 1, ADR-0044). `CollectionSettings` gains optional `listFields` (up to 4 field keys), `expiry` (`{ field, action: "unlist" | "hide", afterMinutes? }`) and `structuredData` (`{ type: "Event" | "JobPosting" | "Product" | "Recipe", properties }`, each property sourced by `kind`: `field`, `entry`, `site` or a plain-text `text` constant); `contentList` sections gain `where` (up to 4 `FieldCondition`s) and `orderBy` (`FieldOrder`), both new in `common.schema.json`. New `@cloudhal/core-ts/structured-data`: the closed preset table, `checkStructuredData` (save-time mapping check) and `structuredDataFor` (an entry's JSON-LD, none when a required value is missing, capped at 32 KB). `@cloudhal/core-ts/fields` adds the listing evaluator (`checkFieldQuery`, `parseFieldQuery`, `matchesFieldQuery`, `compareByField`) and the derived expiry gate (`fieldGateInstant`, `expiryInstant`, `effectiveUntil`, `dayStartIn`). Nothing reads them yet: no behaviour change.
