---
"@cloudhal/api": patch
"@cloudhal/mcp-server": patch
---

RFC-0008 §11.2–§11.3: an agent task's `modeCap` now applies on every call. The automation's key is minted at its owner's role cap (`auto` for Editors and above) instead of at the `modeCap` it was created with, so a run's mode is min(the key's mode, the automation's current `modeCap`, the owner's current role cap): raising or lowering `modeCap` with `PATCH …/automations/:id` takes effect on the key's next call, without a new key. A raise above what the key itself may do (a key minted before this change, one lowered on the Agents page, or one narrowed by its owner's demotion) answers `409 mode_cap_above_key` with the key's mode, so nobody is told a cap applies when it does not; `PATCH` also refuses a `modeCap` other than `plan`, `manual`, `edits` or `auto`. Outside a run, `get_mode` reports the mode the next run works in, and the scheduler's re-check of an `auto` release (§10.6) caps the key by its automation's current `modeCap`, so lowering the cap also ends the `auto` releases its runs scheduled.
