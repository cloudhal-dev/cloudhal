---
"@cloudhal/storage": patch
---

Migration `0029_entry_list_values` (RFC-0042 §4, #110): `entry_list_values`, the indexed list-field values of entries (field, presence, number, text, collection-sort key, creation time, node, locale and status) with a query index and a per-node index, and `entry_list_state`, each listed collection's readiness (definition fingerprint, ready flag, backfill epoch and cursor). DDL only; existing data is untouched.
