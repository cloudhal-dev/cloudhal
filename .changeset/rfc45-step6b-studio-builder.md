---
"@cloudhal/api": patch
---

RFC-0045 rollout step 6b: Studio's fields builder, delete dialog and publish warnings for reference and repeater fields. Both types stay refused on every production write path until step 7, and the builder offers them only where the server takes them, so production Studio is unchanged.

- **`/api/instance`** reports `features.referenceFields`: true when the store accepts reference and repeater fields (`SiteGraphStoreOptions.fieldTypes`, MCP's rule).
- **`DELETE /api/sites/:siteId/entries/:entryId?rev=&dryRun=1`** runs the store's delete plan and writes nothing: `{ dryRun: true }`, or the plan's refusal (`entry_referenced` with its referrers, `field_operation_running`, …).
- **New read-only route `GET /api/sites/:siteId/entries/reference-issues`** (`content:read`, in the playground's allow-list): `referenceIssues` over the working copy, the first 50 with each holder's title, and the total.
- **Studio** (not published): reference and list fields in the builder (target collections, "Several", the maximum and conditions; item fields with up/down and ⋯, the maximum and the item name), sub-field operations and reference/list targets in "Change type…", a cleared finish for a run stuck on values that stopped converting, the delete dialog's reference rules (off while published entries show the last entry, drafts that will show nothing, the language that loses the card), publish warnings, and worded API errors for the RFC-0045 refusals.
