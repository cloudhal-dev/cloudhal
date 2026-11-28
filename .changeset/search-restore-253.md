---
"@cloudhal/core-ts": patch
---

A site restored from a D1 backup gets its search back on the next publish (#253). D1 cannot export FTS5 tables, so a backup leaves the index out while `search_state` survives. The planner used to trust that state, so it rewrote only changed nodes, or nothing at all, and search stayed empty until `cloudhal search reindex`. A state whose rows the index no longer has now counts as none, and the next publish or refresh rebuilds the site in full. The search guide gives a D1 backup recipe that D1 accepts.
