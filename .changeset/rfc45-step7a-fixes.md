---
"@cloudhal/core-ts": patch
"@cloudhal/mcp-server": patch
---

RFC-0045 rollout step 7a: two fixes ahead of enabling reference and repeater fields. Both types stay refused on every production write path until step 7b; nothing changes for the nine existing types.

- **core-ts (#215).** While a top-level conversion from references runs without a text ↔ reference path (reference (multiple) ↔ repeater, reference single ↔ multiple, a repeater converting away), a stored value still in the old shape that does not convert keeps its `entry_refs` rows through a person's unrelated write, such as a title edit. Before, the write dropped them, and the target's delete guard under-blocked. The writer holds the rows at the old type's paths, the same ones the import rebuild keeps (one helper, `oldShapePairs`), so the rows no longer depend on which touched the entry last.
- **mcp-server, core-ts (#218).** Once a translation holds its own list for a localized repeater, `get_translation_source` returns the source's whole list for that key under `fields` (in the source's order, with every sub-value) instead of item paths, and names it in the new `wholeLists` output: send it back whole, translated. `save_translation` already refused item paths there (`translation_shape_mismatch`); its hint and the tool descriptions now say what to send. New core-ts export: `translationSourceValues`.
- **Wording qualified.** The step-5 note that "a whole list of another length than the source's is refused too" holds only when item paths come in the same call. A whole list sent alone is the translation's own and is stored as sent.
