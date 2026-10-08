# Cloudhal threat model (alpha)

Cloudhal lets AI agents change websites. The central security promise: **an agent can only do what its scopes allow, every change is recorded and reversible, and nothing goes live without a person.** This page lists who can do what, the controls behind each promise, and the risks we accept for the alpha. Report vulnerabilities as described in [SECURITY.md](../../SECURITY.md).

## Principals
| Principal | How it authenticates | Can do |
|---|---|---|
| Owner / person | Better Auth session cookie (Studio) | Everything on their deployment, through Studio/REST and MCP |
| Agent | API key (`x-api-key`) with explicit scopes | MCP tools only, within its scopes; publish/rollback/delete wait for a person |
| Local developer's agent | `cloudhal mcp` over stdio | All scopes on the local project; gated tools ask in the MCP client |
| Operator | Deployment token (bearer) | Export/import whole sites (`cloudhal push/pull`) |
| Site visitor | — | Published pages; drafts only with a signed preview link |

## Promises and controls
1. **Agents stay inside their scopes.** Agent principals are refused on the REST API (403 on `/api/sites/**`, `/api/instance`, `/api/skills`, `/api/agent-keys`); MCP calls pass the policy engine (scopes × tool annotations × declared skill). Keys cannot mint keys; permissions are server-only. Per-key rate limit 600/min.
2. **Nothing goes live without a person.** Publish, rollback and delete create a pending approval that a signed-in person decides in Studio (ADR-0014). Approvals are single-use and bound to the tool, exact arguments, the requesting agent and the content state; any change after the question voids them. Agents never receive a redeemable token.
3. **Every change is recorded and reversible.** Each MCP mutation snapshots the site; every tool call and decision is written to the audit log; rollback moves the published pointer to an ancestor snapshot.
4. **Agent-written content cannot run code.** Agents write markdown only (no HTML sections, no edits to HTML bodies); markdown escapes raw HTML; links and image sources are limited to safe schemes; site responses carry a CSP without inline or third-party scripts.
5. **Studio sessions are not usable cross-site.** State-changing `/api` requests must be same-origin; cookies are HttpOnly + SameSite=Lax; `/mcp` refuses foreign origins; a server without auth only answers localhost host names.
6. **A fresh deployment cannot be claimed by a stranger.** The first (owner) account needs the one-time setup link printed by `cloudhal deploy`; afterwards sign-up is closed.
7. **Drafts stay private.** Previews require signed, expiring, site-bound tokens, are never cached, and their HTML is sandboxed (CSP `sandbox`).

## Accepted risks (alpha)
- **Skill narrowing is advisory.** A client that omits `_meta["cloudhal.skill"]` is limited only by its key's scopes. Bind skills to keys before treating them as a control.
- **No per-site authorization yet.** One deployment = one owner; keys are not scoped to a site.
- **The deployment token is root** for site data (read drafts, replace content). Keep `.cloudhal/deploy/secrets.json` private; rotation tooling is pending.
- **Preview tokens and agent keys do not expire by default** (preview links up to 7 days; keys until revoked). Revoke keys in Studio; shorter defaults are planned.
- **Approval prompts include agent-chosen titles** (shortened and quoted). Read the change list, not just the counts.
- **Local `cloudhal mcp` trusts the developer's MCP client** to ask the person (elicitation).

## Reviews
- 2026-10-08 — pre-launch review (Sprint 7): 1 critical, 3 high, 5 medium findings fixed (agents on REST, self-approval, approval replay, agent HTML/XSS, CSRF, owner claim, scoped CAS, audit rows, no-auth host check); low items tracked above.
