---
"@cloudhal/core-ts": minor
"@cloudhal/api": patch
"@cloudhal/cli": patch
---

`cloudhal push --replace` no longer moves a deployment's production back to an older snapshot. The site node carries `publishedSnapshotId`, so replacing the node set used to copy the local copy's pointer over a publish (or rollback) made in Studio since the last pull. `importSite` takes `published: "target"` (used by the admin Worker's push route): once the target has published, the written site node keeps the target's pointer; when that is its only difference, the target's row stays as it is, otherwise its rev moves past both so stale Studio edits fail their compare-and-swap. A target that never published still takes the bundle's pointer (first deploy). `pull` keeps mirroring the deployment. `scripts/build-packages.ts` also skips the development-only `core-ts/scripts/gen-icons.ts`, which broke the package build.
