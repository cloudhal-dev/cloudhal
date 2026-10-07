# @cloudhal/mcp-server

The Model Context Protocol surface of Cloudhal (spec 2026-07-28, `@modelcontextprotocol/server` 2.3). ADR-0004 and ADR-0011.

**Tools (deterministic order):** `list_sites, get_site, list_pages, get_page, create_page, update_page, delete_page, list_entries, get_entry, create_entry, update_entry, delete_entry, create_snapshot, list_snapshots, diff_snapshots, preview_page, publish, rollback`. Every tool has JSON Schema input/output (built from the contract schemas), honest annotations and `structuredContent`. Updates need the current `rev` (optimistic locking). Every mutation snapshots automatically.

**Approval:** `publish`, `rollback`, `delete_*` return MCP's multi-round-trip `input_required` with an elicitation (the message carries the diff summary) and an HMAC-signed `requestState` bound to the tool, the arguments and the principal. The person answers in their client; the call completes only on an explicit accept. Clients without elicitation get a `confirmToken` to pass on a second identical call (`confirmTokenFallback: false` turns that off).

**Skills:** `skill://<name>/SKILL.md` and `skill://<name>/references/<file>` resources. A client that follows a skill sends `_meta["cloudhal.skill"] = "<name>"`; the policy engine then limits the call to that skill's declared scopes.

```ts
import { createCloudhalMcpServer } from "@cloudhal/mcp-server";          // McpServer for one principal
import { serveCloudhalStdio } from "@cloudhal/mcp-server/stdio";          // what `cloudhal mcp` runs
import { createCloudhalMcpHandler } from "@cloudhal/mcp-server/http";     // fetch(request, principal) — mounted at /mcp by @cloudhal/api
```

`tools.ts` is SDK-independent (`defineTools()`, `runTool()` = policy → audit → handler) and is what the tests exercise first; `test/e2e.test.ts` runs a real client ↔ server pair over the in-memory transport and proves the Sprint 5 exit criterion.
