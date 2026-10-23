---
"@cloudhal/mcp-server": minor
---

Typed custom fields, step 4 (RFC-0041 §8 / ADR-0043): MCP.

- **`list_collections`** returns each collection's field definitions (`fields`) and `fieldsSchema`, the JSON Schema of an entry's values with labels and help in the asked `locale` (default: the site's).
- **`create_entry` / `update_entry`** check field values in `precheck` with the store's checker (changed keys only, unknown keys, a translation's copy of a non-localized value, `requiredToPublish` for review and published, image and `asset:` references), so a refused call never reaches a person; each issue keeps its path (`fields/startsAt/at`). `update_entry` takes `fields` as a merge patch (`null` removes a key), and its approval names typed changes readably ("Starts at (startsAt) → 5 Nov 2026 19:30 Istanbul", option labels, values quoted and truncated).
- **`update_collection`** takes `fields` (the whole list) for free definition edits; changes that could lose values are refused with `field_change_needs_operation`, naming the operation tool.
- **New tools `rename_field`, `change_field_type`, `set_field_localized`, `remove_field`** (`site:write` + `content:write`): always a person holding `site:settings`, in every mode including `bypass`; the approval shows the dry run (entries touched, values moved, converted or cleared, samples), `dryRun: true` reports without asking, and a call that would clear values without `onInvalid: "clear"` is refused before anyone is asked. A run that stops at its budget answers `done: false` with an `operationId`; calling the same tool again with it continues the operation after a new approval.
- Hints for every field error code, and server instructions telling agents to read `fieldsSchema` before writing entries and to use the operation tools for risky changes.
