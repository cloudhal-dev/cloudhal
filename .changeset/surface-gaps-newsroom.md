---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Four surface gaps found while building interactive articles (RFC-0022, after 22e).
- **Computed comparisons:** a `visible` condition or `if`'s `cond` takes a call as an operand, e.g. `{"lt": [{"call": "calculate", …}, {"call": "calculate", …}]}`, within the same nesting and call limits. `evaluateCondition` takes an optional `ResolveContext`.
- **`Toggle` label:** a labelled Toggle shows its label as a `<legend>`, as RadioGroup does.
- **`Table` columns:** `hideOnPhone: true` keeps a column (never the first) out of the phone card.
- **`formatNumber`:** `minDigits` keeps trailing zeros (9.60).
- **Runtime:** it is now `surface.11.js`; the earlier names keep working.
