# @cloudhal/mcp-server

The Model Context Protocol surface of Cloudhal (spec 2026-07-28, `@modelcontextprotocol/server` 2.3). ADR-0004 and ADR-0011.

**Tools (deterministic order):** `list_sites, get_site, list_pages, get_page, create_page, update_page, delete_page, list_entries, get_entry, create_entry, update_entry, delete_entry`, then the taxonomy tools (RFC-0002 §6.2) `list_taxonomies, list_terms, resolve_terms, propose_term, update_term, rename_term, merge_terms, retire_term, set_term_parent, set_term_visibility, review_term, taxonomy_report, create_taxonomy, update_taxonomy, list_redirects, create_redirect, delete_redirect`, then `create_snapshot, list_snapshots, diff_snapshots, preview_page, publish, rollback, get_mode, request_elevation`. Every tool has JSON Schema input/output (built from the contract schemas), honest annotations and `structuredContent`. Updates need the current `rev` (optimistic locking). Every mutation snapshots automatically (exactly one snapshot per call; governance snapshots carry `cloudhal.opId`).

**Taxonomy (RFC-0002):** `create_entry` / `update_entry` take `terms: { [taxonomy]: { set?, add?, remove?, primary? } }` with values by id, slug, old slug, name, synonym or singular/plural, resolved by the store; an unknown or ambiguous value is an error with suggestions (`unknown_term`, `ambiguous_term`), never an implicit create. `tags` is a deprecated alias for `terms.tag.add`. `list_entries` takes the RFC §5 `filter`. Agents add terms only through `propose_term` (`allowNewTerms`: none → denied, propose → proposed, free → active; an existing match is returned). Structural tools (`site:write`) always wait for a person; their prompts list the articles touched and every redirect. Agents never redirect off-site, never reclaim slugs and never approve their own proposals (checked before anyone is asked). Store invariant errors map to stable codes (`required_term`, `too_many_terms`, …) with the next step in the text. Assignment deltas and governance results (`opId`, counts, redirects) go into the audit row's `input.effect`.

**Approval:** `publish`, `rollback`, `delete_*` and the structural taxonomy/redirect tools return MCP's multi-round-trip `input_required` with an elicitation (the message carries the diff summary) and an HMAC-signed `requestState` bound to the tool, the arguments and the principal. The person answers in their client; the call completes only on an explicit accept. Clients without elicitation get a `confirmToken` to pass on a second identical call (`confirmTokenFallback: false` turns that off).

**Skills:** `skill://<name>/SKILL.md` and `skill://<name>/references/<file>` resources. A client that follows a skill sends `_meta["cloudhal.skill"] = "<name>"`; the policy engine then limits the call to that skill's declared scopes.

```ts
import { createCloudhalMcpServer } from "@cloudhal/mcp-server";          // McpServer for one principal
import { serveCloudhalStdio } from "@cloudhal/mcp-server/stdio";          // what `cloudhal mcp` runs
import { createCloudhalMcpHandler } from "@cloudhal/mcp-server/http";     // fetch(request, principal) — mounted at /mcp by @cloudhal/api
```

`tools.ts` is SDK-independent (`defineTools()`, `runTool()` = policy → audit → handler) and is what the tests exercise first; `test/e2e.test.ts` runs a real client ↔ server pair over the in-memory transport and proves the Sprint 5 exit criterion.
