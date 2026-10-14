---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/ui": minor
---

Block registry, phase 6a (RFC-0015, ADR-0030). Pages gain a `component` section kind: a block type's name and its props. `@cloudhal/core-ts/blocks` holds the block types, the `eval`-free props-schema interpreter (`validateProps`), the built-ins `callout`, `button`, `embed` and `faq`, `defineBlockTypes` and `createBlockRegistry`; the store refuses misfitting props with `invalid_props` (422) and keeps sections of unknown types. `GET /api/sites/:siteId/block-types` lists the types (`content:read`). The renderer draws the built-ins as escaped markup (`embed` as a link card for now) and lets themes map any type to their own component through `Sections`' `blocks` prop. `BlockPropsForm` in `@cloudhal/ui` builds a form from a props schema.
