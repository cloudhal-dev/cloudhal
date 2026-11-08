---
"@cloudhal/core-ts": patch
"@cloudhal/analytics": patch
"@cloudhal/astro-renderer": patch
"@cloudhal/cli": patch
"@cloudhal/comments": patch
---

Slug and name trims run in one linear pass instead of `/^-+|-+$/g` (CodeQL js/polynomial-redos, #168). This covers `slugify`, `foldName` and `slugifyFilename` in core-ts (the new `trimChar` is exported from `@cloudhal/core-ts/names`), heading ids in astro-renderer, and Studio's option, media and entry slugs. Results are unchanged. These trims were already linear in practice, because a run of other characters was collapsed to one `-` first. These inputs were quadratic and are linear now: analytics' `datasetName` on a long run of `_` inside a deployment name; json-render component keys in `fromJsonRender` (`./interop`); trailing whitespace in directive blocks and on comment lines; trailing `/` in request paths (the playground guard and route matching in api, analytics paths, the renderer's link localizing and redirect splats, the docs Worker). The new `trimEndChar` is exported from `@cloudhal/core-ts/names` too.

Also in 0.6.3, with no changeset at the time (#161): Studio's "Not published" badges and its "unknown" scheduler state show their status dot again. They used a Badge variant without a dot colour and rendered no dot.
