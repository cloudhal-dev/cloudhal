# ADR-0004: Stateless MCP server (spec 2026-07-28) with layered approval
- Status: Accepted
- Date: 2026-10-07
- Sources: https://modelcontextprotocol.io/specification/2026-07-28/changelog · https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization · https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation · https://developers.cloudflare.com/changelog/post/2026-07-27-agents-sdk-v0.20.0-mcp-sdk-v2/ · https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/

## Context
MCP spec 2026-07-28 removed sessions and `initialize`; every request is self-describing, elicitation became multi-round-trip (`input_required` + retry with `inputResponses`), SSE is deprecated, Dynamic Client Registration is deprecated in favour of Client ID Metadata Documents. Cloudflare deprecated `McpAgent` in favour of `createMcpHandler` (one server per request).

## Decision
`packages/mcp-server` uses **`@modelcontextprotocol/server` 2.x**, served on Workers via **`createMcpHandler`** (`legacy: "reject"`), wrapped by **`@cloudflare/workers-oauth-provider`** (OAuth 2.1, CIMD with DCR fallback). Scopes: `site:read`, `site:write`, `site:publish`, `site:rollback`. All cross-call state is carried by **server-minted handles** (`snap_…`, `draft_…`, `pub_…`) stored in D1/KV and re-authorized against the caller on every call — ids in the contracts follow the same prefixed form. Every tool declares `outputSchema`, returns `structuredContent`, sets honest annotations (`destructiveHint: true` only for publish/rollback/delete) and `tools/list` is deterministic. Approval is layered: policy engine → `publish` returns `input_required` with a diff summary → `accept` completes; hosts without elicitation use a `confirm_token` on a second call. Decisions are audit-logged.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| `McpAgent` (Durable Object per session) | Familiar, stateful | Deprecated and feature-frozen | Dead end |
| Legacy SDK 1.x with SSE | Wider old-client support | Deprecated transport, 12-month removal window | Support legacy only via `isLegacyRequest` routing if demanded |
| Approval only in the host (Claude Code permission prompts) | Zero server work | Not every host gates; policy must hold without the host | Defence in depth required |

## Consequences
- Positive: scales horizontally, no session affinity, works from any MCP client.
- Negative: more explicit handle plumbing; two approval paths to test.
- Risks: host elicitation support is uneven in 2026; the `confirm_token` fallback must be first-class, not an afterthought.
