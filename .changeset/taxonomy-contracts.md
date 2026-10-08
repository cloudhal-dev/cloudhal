---
"@cloudhal/core-contracts": minor
---

RFC-0002 contracts that land with the store: `NodeRef.kind` gains `taxonomy`, `term` and `redirect` (readers with exhaustive maps over `NodeRef["kind"]` must add them), and `Term` gains an optional `position` (integer ≥ 0) for sibling order.
