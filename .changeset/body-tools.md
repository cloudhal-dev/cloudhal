---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
---

Body operations (RFC-0014 §4, ADR-0028).
- **New MCP tools:**
  - `get_body` reads an article body, or a page's markdown rich-text section, as blocks: id, hash, type, markdown and last author.
  - `edit_body` applies up to 50 operations in one write: `replace`, `replaceText`, `insert`, `move`, `delete`. A stale `rev` is rebased when every block the operations name still exists and carries the `ifHash` the agent read. Every write is snapshotted.
  - `diff_node` compares a page or article between two snapshots, or with its draft, body block by block.
- **core-ts:** exports `applyBodyOps`, `currentBlocks`, `virtualIds` and `opTargets`.
- **Store alignment:** edited blocks keep their ids by shared words first, and by position only for pure replacements.
