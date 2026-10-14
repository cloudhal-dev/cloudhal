---
"@cloudhal/ui": minor
---

`MarkdownEditor` takes `onAskAi` and `labels.askAi` (RFC-0016). The selection toolbar gains an "Ask AI" button. It hands the host the whole top-level blocks the selection touches, as markdown, together with `replace(markdown)`: one undo step, refused when those blocks changed meanwhile. `selectionBlocks` and the `AiSelection` type are exported from `@cloudhal/ui/editor`.
