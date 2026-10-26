---
"@cloudhal/mcp-server": patch
---

`list_entries` with `orderBy` and `limit` lets the store page (in SQL once the collection's list values are ready, RFC-0042 §4, #110) instead of loading every match. Arguments, cursors and output are unchanged; without `orderBy` the list keeps its last-updated order.
