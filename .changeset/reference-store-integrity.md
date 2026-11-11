---
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
"@cloudhal/api": patch
"@cloudhal/cloudflare": patch
"@cloudhal/mcp-server": patch
---

Reference fields get their index and integrity rules (RFC-0045 §2, rollout step 2a, #114). Both new field types stay refused on every write path in production, so no reference value can exist yet; the store and the shared suites run them through `SiteGraphStoreOptions.fieldTypes` and `CopySiteOptions.fieldTypes`.

- **Storage.** Migration `0033_entry_refs` adds `entry_refs`, one row per stored reference value, removed with its site.
- **Store.** Entry writes keep the rows in their own batch and check their targets at batch time (`unknown_entry`, `reference_target_moved`). Deletes, moves and group changes are refused while a published entry shows a reference to the group's last usable member (`entry_referenced`, `reference_target_moved`, `field_operation_running`). Imports rebuild the rows beside a written node set. Field operations naming a reference or repeater field answer `field_operation_unsupported`. Definition changes that would strand values are refused (`field_key_in_use`, removed target collections or sub-fields, `multiple`).
- **API and MCP.** The new refusals answer 409 or 422, with MCP hints.
- **Cloudflare.** The hourly `nodes.canonical` job rewrites site rows that older imports stored verbatim, so the anchors compare equal text; local stores do the same when they open.

**Behaviour changes on existing sites** (RFC-0045 decision 3):

- relinking a node that other nodes use as their translation group is refused (`translation_group_in_use`, 409);
- `resolveFields` and the store read an original's non-localized values only when the original's own group is its id: a node relinked into another group lends them to nobody (OQ 14);
- a change of `translation.group` alone gets the same source-group check as a source change, and a write joining a group checks that its node is still that group's original;
- imports store node bodies in canonical form (the hash is unchanged);
- deletes, moves and group changes of entries carry the collections anchor, and entry writes that change `fields` or `collection` carry the definitions anchor: a concurrent change of the collections' settings makes them answer 409, and a retry succeeds;
- field operations that would turn a field into a reference or repeater answer `field_operation_unsupported` (409) instead of `fields_unsupported`.
