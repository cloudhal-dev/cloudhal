---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/cli": minor
---

Typed custom fields, step 3 (RFC-0041 §6 / ADR-0043): field operations.

- **`runFieldOperation` / `continueFieldOperation` / `revertFieldOperation` / `fieldOperationStatus`** in `@cloudhal/core-ts` run `rename_field`, `change_field_type`, `set_field_localized` and `remove_field`: a dry run (entries touched, values moved, converted, cleared, removed, unchanged and unconvertible, per locale, with samples), a `before …` snapshot whose id is the operation id, the new definition with its `migration` marker (phase A), entries rewritten in guarded batches of 200 that resume after an interruption (phase B), the marker dropped once nothing is pending (phase C) and an `after` snapshot. Only the draft graph changes. A type change follows a closed conversion table (`convertFieldValue`, exported from `@cloudhal/core-ts/fields`) and refuses values it cannot convert (`field_values_unconvertible`) unless `onInvalid: "clear"`. One operation per collection at a time (`operation_in_progress`). Reverting restores the earlier definition and the entries nobody edited since, and converts edited ones back.
- **Readers stay consistent mid-run:** `resolveFields` converts values still in the old type, and a field being removed reads as gone; a person's entry write during an operation goes through the marker, so edits and the operation converge.
- **Translations:** changing only non-localized field values of an original no longer marks its translations stale (their recorded source hash follows, in the same batch); operations keep fresh translations fresh.
- **API:** `POST /api/sites/:id/collections/:key/fields/operations` (`dryRun`, `?continue=<id>`), `GET …/:operationId`, `POST …/:operationId/revert` (`site:settings` and `content:write`), and the same under `/api/admin` with the deployment token.
- **CLI:** `cloudhal fields rename|retype|localize|remove|continue|revert [--dry-run] [--remote]`; the dry run also lists theme files that read the field directly.
