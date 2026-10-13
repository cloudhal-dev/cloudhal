---
"@cloudhal/mcp-server": patch
"@cloudhal/core-ts": patch
---

The MCP and REST paths that schedule a release with an approval (an `auto` key, or a person carrying out a request) now publish the drafts it holds too, as `ReleaseService.schedule` does.
