# ADR-0010: Better Auth for human identity, tenants and (later) MCP authorization
- Status: Accepted
- Date: 2026-10-08
- Related: ADR-0002, ADR-0004, ADR-0003
- Sources: https://better-auth.com/docs/installation · https://www.better-auth.com/docs/plugins/organization · https://www.better-auth.com/docs/plugins/admin · https://www.better-auth.com/docs/plugins/mcp · https://www.better-auth.com/docs/plugins/cimd · https://www.better-auth.com/docs/plugins/oauth-provider · https://better-auth.com/blog/1-7 · https://better-auth.com/blog/better-auth-joins-vercel · https://github.com/better-auth/better-auth/security/advisories

## Context
Cloudhal needs user authentication for Studio, a tenant/role model, non-interactive credentials for agents, and — per MCP 2026-07-28 — an OAuth 2.1 authorization server whose tokens the MCP server verifies. All of it must run on Cloudflare (D1) and self-hosted (Node + SQLite). Hand-rolling an OAuth AS is the riskiest code a small team can write.

## Decision
Adopt **Better Auth 1.7.x** (MIT; Vercel-owned since 2026-07 with an open-source, framework-agnostic commitment):
- Studio identity: core email+password (+ magic link / GitHub / Google when configured), `admin` plugin for roles; `organization` plugin as the tenant and membership model; `@better-auth/api-key` with organization-owned keys for non-interactive agents.
- MCP authorization (Sprint 5): `@better-auth/mcp` + `@better-auth/cimd` + `jwt()` — RFC 9728 resource metadata, PKCE, RFC 8707 `resource` → `aud`, JWKS verification in the MCP server; DCR disabled; DPoP optional.
- Database: the Kysely adapter over the same better-sqlite3/D1 handle as the storage layer; Better Auth's DDL is **checked into `packages/storage/migrations`** so one migration pipeline governs everything.
- Cloudhal keeps one actor model: `Actor { kind: "human", id: user_<betterAuthUserId> }`; the policy engine decides, Better Auth only authenticates and issues tokens.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| `@cloudflare/workers-oauth-provider` | Excellent MCP AS | Workers+KV only; no user authentication | Cannot serve self-host |
| Auth.js | Familiar | Maintenance mode, no AS/orgs/API keys | Dead end |
| Clerk / WorkOS | Hosted, polished | Not self-hostable | Violates the product promise |
| Hand-rolled (arctic + own sessions + own AS) | Full control | Largest security surface, slowest | Risk |

## Consequences
- Positive: one library covers Studio login, tenants, API keys and the MCP authorization server on both runtimes.
- Negative: 1.5→1.7 churn (adapter packages split, OIDC plugin removed, tables renamed) and a wide advisory history → pin to 1.7.x, subscribe to GHSAs, keep telemetry off.
- Risks: scrypt cost on Workers free plan (override hashing or document paid plan); Vercel governance (mitigated by MIT + data in our DB).
