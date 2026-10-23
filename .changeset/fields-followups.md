---
"@cloudhal/core-ts": patch
"@cloudhal/mcp-server": patch
---

Typed fields follow-ups (RFC-0041). One asset check for field values, `fieldAssetIssues` in `@cloudhal/core-ts/media` (with `fieldAssetRefs` and `newFieldAssetRefs`), now used by both the store's entry write and MCP's `create_entry`/`update_entry` precheck; same codes and messages. Machine translation now follows §5: `get_translation_source` returns only the localized text and rich-text field values to translate (`fields`) and names the shared ones (`sharedFields`); `save_translation` takes translated `fields`, refuses shared ones in precheck with `field_not_localized` (paths in `details.issues`), and no longer copies the source's field values into a new translation in the same site. New helpers in `@cloudhal/core-ts/fields`: `localizedFieldValues`, `translatableFieldValues`, `sharedFieldKeys`, `sharedFieldIssues`. Studio's "write by hand" draft copies only localized field values.
