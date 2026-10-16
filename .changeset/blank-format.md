---
"@cloudhal/core-ts": patch
"@cloudhal/astro-renderer": patch
---

`formatNumber` and `formatCurrency` show a blank input as blank, not 0, so an empty calculator no longer reads "0" or "$0.00". The runtime is now `surface.6.js`. Theme and preview buttons in a `Stack` keep their own width.
