---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Surfaces take input (RFC-0022 22b).
- **Inputs:** `NumberField`, `TextField`, `Checkbox` and `RadioGroup` write only to the surface's data in the reader's browser. Each has a label, help text and an invalid state.
- **Actions:** `append` adds text to a value (keypads), and `set` can write a computed value.
- **Text:** a bound `Text` updates live.
- **Interop:** A2UI text fields and check boxes convert instead of being dropped.
- **`render_page`** checks for unlabelled inputs.
- **Runtime:** it is now `surface.3.js`; the earlier names keep working.
