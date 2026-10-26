---
"@cloudhal/core-ts": patch
---

New `restoreBundle(from, snapshot)`: a site bundle of one snapshot's nodes, rebuilt from the stored node bodies, for `importSite(…, { mode: "replace" })`, which checks it like any bundle. The site's working copy and published pointer become that snapshot's again (`cloudhal import --revert`, RFC-0039). Revs only move forward: a node the site holds at the snapshot's rev or a later one, with other content, comes back at the rev after its current one, so a Studio tab or agent still holding a rev that node had gets a conflict instead of saving over it; a node whose content already is the snapshot's is left as it is. It lists the media those nodes need and carries the store's takedowns among them, so taken-down content stays down; a missing node body, or one that is not the node its snapshot ref names, is refused before anything is written. `exportSite`'s output is unchanged.
