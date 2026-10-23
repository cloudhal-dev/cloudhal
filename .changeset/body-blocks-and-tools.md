---
"@cloudhal/core-ts": patch
"@cloudhal/mcp-server": patch
"@cloudhal/cli": patch
---

Gaps an agent hit building a site through MCP:

- **Section-only theme blocks in article bodies are refused.** A theme block type with `where: ["section"]` (say `link-cards`) has no component in an article, and drew "unknown component" there. `create_entry`/`update_entry` now refuse it inside a body ```` ```surface ```` fence (`invalid_surface`, with the component's path); primitives, built-in blocks and theme blocks that allow `body` stay. `get_catalog`'s "In article bodies" lists which blocks a body may use and which are page sections only.
- **`list_entries` lists every collection by default**, not only `posts`: a site whose articles live in `blog` got `[]`. `where`/`orderBy` need the collection whose list fields they use; without one they are refused (`invalid_query` at `collection`) instead of ignored.
- **`long-line` gives a text column one verdict.** It counted characters over a rounded line count, so how full a paragraph's last line was decided whether it passed, and identical paragraphs in one column disagreed. It now counts the characters on each rendered line, leaves each paragraph's last line out, and pools the paragraphs of one width and font: one example per column, with its width and how many paragraphs it holds.
- **Blog starter:** a primary surface `Button` in an article body keeps its `on-brand` text; the body's link colour no longer applies to buttons (it failed contrast at 2.5:1 light, 1.3:1 dark).
