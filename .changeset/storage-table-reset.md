---
"@cloudhal/storage": patch
---

`@cloudhal/storage/testing` adds `createTableReset()`: a cheap reset between tests on a shared database. It empties every table and restores the rows the migrations seeded in one batch instead of dropping and re-migrating, which takes the per-test cost on Miniflare D1 from about 1 s to a few hundred milliseconds.
