---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
---

Body block index (RFC-0014 accepted, ADR-0028). Markdown bodies (`ContentEntry.body`, `RichTextSection`) gain the optional `profile` (`1`, Cloudhal Markdown v1) and `blocks` (`BodyBlock[]`: `id`, `hash`, `by?`, `via?`, `at?`). The store maintains both on every write:
- Each block is hashed with SHA-256 of its trimmed source.
- Ids carry over: unchanged blocks are matched in order, moved blocks by hash, edited blocks by position.
- `by`/`via`/`at` change only when a block's content changes.
- An index a client sends is ignored. HTML bodies and bodies over 5,000 blocks get none.

`NodeWriteOptions.writer` (`{ actor, via }`), also accepted by `createPage` and `createContentEntry`, records who wrote. The REST API passes `studio` for people's sessions and `api` for keys; MCP tools pass `mcp`. `schemaVersion` stays 1.
