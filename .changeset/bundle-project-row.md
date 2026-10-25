---
"@cloudhal/core-ts": patch
---

`importSite` (behind `cloudhal pull`, the admin bundle route `cloudhal push` uses, and the coming `cloudhal import`) now checks a bundle's project row before inserting it: it must be the site node's project (`projectId`), a valid Project, with its `id` and `rev` columns matching its body. Before, a bundle could plant any projects row.
