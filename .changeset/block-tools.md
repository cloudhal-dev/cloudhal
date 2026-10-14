---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
---

Typed blocks for agents, phase 6c (RFC-0015). MCP `list_block_types` lists the site's block types with their props schemas. `edit_body` (and REST `PATCH …/body`) take `insertBlock` and `setProps`, so agents never write directive syntax; `expandBlockOps` turns them into ordinary `insert` and `replace` operations against the registry. `get_body` returns typed blocks' props, and page, article and body writes report `unknownBlocks`. AI commands keep block directives intact.
