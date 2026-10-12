# ADR-0014: Approvals happen in Studio, once, for the state the person saw
- Status: Accepted (supersedes the approval mechanics of ADR-0004 and ADR-0011)
- Date: 2026-10-08
- Related: ADR-0004, ADR-0011, ADR-0012
- Source: Sprint 7 pre-launch security review (findings H1, H2)

## Context
ADR-0004/0011 approved gated calls (publish, rollback, delete) through MCP elicitation, with a signed `confirmToken` for clients that cannot elicit. The review confirmed two flaws. **H1:** whoever answers the elicitation or holds the token is the agent's own client — the token was returned to the agent in the tool result, and an auto-accepting client passes elicitation — so a remote agent could approve itself. **H2:** the approval was bound only to (tool, arguments, actor) and was reusable for ten minutes, so after one approved publish an agent could edit content and publish again with the same approval.

## Decision
1. **Agents with their own credentials (API keys over HTTP) never answer for a person.** A gated call creates a `pending` row in `approvals` (migration 0006) and returns "approval pending" with an `approvalId`. A signed-in person approves or denies it in Studio (`POST /api/sites/:id/approvals/:aid/approve|deny`, people only, audited). The agent repeats the same call with `approvalId`.
2. **Single use, bound to the exact call and the content.** Redeeming is one atomic `UPDATE … WHERE status='approved' AND tool AND args_hash AND actor_id AND state_hash AND not expired`. `state_hash` is a digest of every node's id, rev and hash at request time (`SiteGraphStore.stateHash`): any change after the person looked voids the approval. Requests expire after 24 h.
3. **Elicitation remains for people and local use** (a session-authenticated person's MCP client; `cloudhal mcp` over stdio on the developer's machine), now also bound to `state_hash`.
4. **`confirmToken` is off by default**; it is an explicit local opt-in only.
5. Agents are refused on the REST API (security review C1), so approval endpoints are reachable by people only.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Keep elicitation for agents | No Studio step | The agent's client answers it | Not a human control |
| Signed single-use tokens without storage | Stateless | Single use needs storage anyway; the token still reaches the agent | Same flaw |
| Approve by e-mail/Slack link | Reach people anywhere | New channels, identity mapping | Later, on top of the same table |

## Consequences
- Positive: "publish stops for a person" holds even against a compromised or careless agent client; every decision is audited with who decided.
- Negative: a remote agent must wait (and poll) for the decision; Studio needs an Approvals screen.
- Follow-up: notifications for pending approvals; per-site approver roles.

## Addendum (2026-10-09): one waiting request per call
An agent that repeats a call needing approval (same actor, tool, arguments and site state) gets the request that is already pending instead of a new one (`ApprovalStore.request`). Retries and lost answers no longer leave copies in Approvals for a person to deny. A call with other arguments, or after the site changed, still files its own request; a request voided by a site change ("the site changed after the approval was requested") is never reused.
