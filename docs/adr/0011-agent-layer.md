# ADR-0011: Agent layer — policy engine, audit, skills and the MCP server
- Status: Accepted
- Date: 2026-10-08
- Builds on: ADR-0004 (stateless MCP server, layered approval), ADR-0005 (skills format), ADR-0010 (Better Auth)
- Sources: `@modelcontextprotocol/server` 2.3.1 / `@modelcontextprotocol/client` 2.3.1 (verified against the published type definitions) · https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr · https://modelcontextprotocol.io/extensions/skills/overview · `@better-auth/api-key` 1.7.7

## Context
Sprint 5 makes Cloudhal usable *by agents*: an MCP client must be able to create content, see a preview, and ask to publish — with publishing stopping at a human. Three things were undecided: how policy, audit and skills relate to the MCP SDK; how approval works for clients with and without elicitation; and how agents authenticate over HTTP.

## Decision
1. **`packages/agent-runtime` is SDK-free.** It holds the `PolicyEngine` (actor scopes × tool scopes × annotations × declared skill → `allow | deny | approval-required`), the `SkillLoader` (SKILL.md → `SkillManifest` contract; Cloudhal data in flat `cloudhal.*` metadata keys) and the `AuditLog` (table `audit`, migration `0003_agent`). It never imports MCP.
2. **Tools are defined once, independently of the SDK** (`packages/mcp-server/src/tools.ts`): JSON Schema in/out built from the contract schemas, honest annotations, scopes, handler over `SiteGraphStore`. `runTool` is the only execution path: policy → audit → handler. Every mutation auto-snapshots (`reason: "agentMutation"`, label = tool name). The 18 tools are listed deterministically.
3. **The MCP server is a thin wrapper** (`createCloudhalMcpServer`): one instance per principal, `fromJsonSchema` for schemas (no zod in our code), `structuredContent` on every result, skills exposed as `skill://<name>/SKILL.md` (+ `references/`) resources, and a declared skill via `_meta["cloudhal.skill"]` narrowing the call to that skill's scopes.
4. **Approval = multi-round-trip elicitation, with a signed token as fallback.** `approval-required` returns `input_required` carrying an elicitation (the prompt shows the diff summary) and an HMAC-signed `requestState` bound to the tool, the argument hash and the principal. The client retries with the answer; only `accept` + `confirm: true` runs the handler; `decline`/`cancel` is audited as a denial. Clients that cannot elicit (2025-era over stateless HTTP, hosts without elicitation) receive a `confirmToken` to pass on a second identical call — same HMAC state, same binding, 10-minute TTL; can be disabled with `confirmTokenFallback: false`.
5. **Transports:** `cloudhal mcp` (stdio, local developer, default scopes `*`, `--scopes` to narrow) and `/mcp` inside the Hono API (`createMcpHandler`, stateless per request, 2025-era served statelessly). Authentication stays outside the SDK: the API resolves a `Principal` (session cookie → human with all scopes; `x-api-key` → `agent` actor with the key's `cloudhal` permissions as scopes) and passes it via `authInfo.extra`.
6. **Agent credentials are Better Auth API keys** (`@better-auth/api-key`, table in migration `0003_agent`). Keys are minted server-side through `POST /api/agent-keys {name, scopes}` by a signed-in human (permissions are a server-only property in the plugin), listed and revoked under the same route.
7. **Skills extension (SEP-2640) is not implemented yet.** The TypeScript SDK has no `skills/list`/`skills/get` support in 2.3.1 (PR #2818 open); resources cover discovery for now. Revisit when the SDK ships it.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Register tools directly with the SDK (zod schemas) | Less code | Policy/audit/tests tied to SDK types; zod in our tree despite ADR-0001 | Contract schemas already exist; `fromJsonSchema` reuses them |
| Approval only via `confirmToken` | Works everywhere | The agent sees the token; relies on the host to involve a human | Elicitation is the first-class path; token is the documented fallback (ADR-0004) |
| OAuth 2.1 (`@better-auth/mcp` + CIMD) now | Spec-aligned remote auth | Much larger surface; not needed for local/CI agents | Sprint 6; API keys cover agents today |
| Durable Object / sessionful server | Server-initiated elicitation works for legacy clients | Deprecated pattern; session affinity | Stateless per ADR-0004 |

## Consequences
- Positive: one tool table drives policy, MCP, docs and tests; the exit criterion is proven by a real client ↔ server test (in-memory, HTTP and stdio); audit answers "who did what, under which skill, with which snapshot".
- Negative: two approval paths to keep in sync; legacy clients over HTTP never get interactive approval.
- Risks: SDK v2 is young (2.3.x) — pinned exact; `requestState` HMAC key must be shared across instances in multi-process deployments (configure `mcp.stateKey` from a secret).
