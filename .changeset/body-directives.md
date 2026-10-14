---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/ui": minor
---

Body directives, phase 6b (RFC-0015). `@cloudhal/core-ts/directives` reads and writes `::name{…}` leaves and `:::name{…}` … `:::` containers; `directiveExtension` makes each one a single body block (`directive:<name>`), and the store refuses directives of known types whose props do not fit (`invalid_props`). The renderer draws the built-in blocks inside bodies with the same markup as sections. `MarkdownEditor` takes `blocks` (`EditorBlocks`): directives become framed blocks edited through their generated form, containers keep their inner text editable, and the `/` menu inserts body block types. `blockIcon` is exported from `@cloudhal/ui`.
