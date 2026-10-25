---
"@cloudhal/core-ts": patch
---

`importSite`, used by `cloudhal pull`, by the admin bundle route `cloudhal push` uses, and by `cloudhal import`, now runs every check before it writes anything, the bootstrap conflict and the 1000-statement limit included, and plans the media ledger with them. A refused bundle leaves the target as it was; before, node bodies could land ahead of a conflict and snapshots ahead of the size limit. Only a storage failure can stop it between its writes, and importing the bundle again completes it. New checks, each before the first write:

- Every node body the target lacks must be a valid contract document of the kind of each snapshot ref that points to it, with that ref's id and rev, of the bundle's site (precompiled validators). A body no snapshot references is refused. Before, a body was only checked against its hash, so a crafted bundle could put invalid content behind the published snapshot.
- Node and snapshot ids may not belong to another site of the target, each appears once, and no two nodes share a kind and key or a translation group and locale (the node batch's unique keys).
- Every takedown entry has its fields with their types (`reason`, `legal`, `by`, `at`).
- The media ledger (`snapshot_blobs`) reads the target's own asset bodies, never the bundle's text for a body the target already holds.

New `planImport(to, bundle, options)` returns what an import would change, without writing:

- the nodes added, changed and removed;
- the snapshots and node bodies to add;
- whether the project row is new;
- the listed media that are present, missing, of another size or taken down on the target;
- the bundle's takedowns, those whose bytes the target holds (an import deletes them) and those its ledger does not hold yet.

With `report: true` it returns a bootstrap conflict and missing media instead of throwing them. A node body that is not JSON is refused as `blob <hash> is not JSON` instead of with the parser's message.
