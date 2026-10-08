# ADR-0016: Time-boxed elevation — a more autonomous mode, for a while
- Status: Accepted
- Date: 2026-10-08
- Related: ADR-0015 (agent modes), ADR-0014 (approvals)

## Context
Owners pick a mode per key (ADR-0015). Often they want more autonomy only for a while: "let the newsroom agent publish small updates on its own during launch day", "let it edit freely for the next hour while I watch". Raising the key's mode and remembering to lower it again is error-prone; a forgotten `auto` key keeps publishing without a person.

## Decision
An owner can **elevate** an API key to a more autonomous mode for a bounded time. It ends by itself.

- **Stored with the key** (API key metadata, next to `mode`): `elevation = { mode, until, grantedBy, grantedAt, reason? }`.
- **Computed on every call.** `resolvePrincipal` checks the clock each time. While `now < until`, the agent's mode is the elevated one and the principal carries `elevation: { from, until }`. Afterwards the key's own mode applies again. Nothing has to run at expiry, and there is no window where a stale mode survives.
- **Bounds.** The elevated mode must be a remote mode (never `bypass`) more autonomous than the key's own mode. The duration is 5 minutes to 24 hours (`ELEVATION_MIN_MINUTES`, `ELEVATION_MAX_MINUTES`). A new elevation replaces the one in force. Changing the key's own mode keeps an elevation only while it is still higher.
- **API (people only):**
  - `POST /api/agent-keys/:id/elevation {mode, minutes, reason?}` grants an elevation.
  - `DELETE /api/agent-keys/:id/elevation` ends it early.
  - Summaries carry `mode` (the key's own), `elevation` (only while in force) and `effectiveMode`.
  - `/api/instance` reports the bounds under `agentModes.elevation`.
- **Audit.**
  - Granting is audited as `agent-key.elevate`, with reason `name: edits → auto until … (60 min): reason`.
  - Ending early is audited as `agent-key.elevation-end`.
  - Every agent call made while elevated records `elevation: { from, until }` (migration 0009).
  - Natural expiry is not an event. The next call simply runs in the key's own mode, and its audit row shows it.
- **The agent is told.** The MCP server instructions add that the mode is temporary, when it ends, and which mode follows.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Owner changes the mode and changes it back | No new concept | People forget; a lingering `auto` key publishes unattended | The failure mode we want to remove |
| Scheduled job reverts the mode | Mode field stays the only truth | Needs a scheduler on every runtime (Node, Workers); stale until it runs | Computing on each call is simpler and exact |
| Separate short-lived elevated API key | Natural expiry via key `expiresAt` | Agent must be reconfigured with a new secret; two keys to manage | Owners want the same agent, just freer |
| Elevation to `bypass` for remote keys | Power users | A leaked key publishes at will, even if briefly | `bypass` stays local only (ADR-0015) |
| Elevation downwards (temporary restriction) | Incident response | Different intent; a permanent mode change already does it | Keep "elevation" meaning more autonomy |

## Consequences
- Positive: autonomy can be granted for exactly as long as it is needed, and it is revoked without anyone remembering to. The audit shows who granted what and which calls used it.
- Negative: the effective mode now depends on the clock. Tests inject `now` (`AuthOptions.now`). Clock skew between isolates is negligible at minute granularity.
- Follow-ups: notify the owner shortly before an elevation ends.

## Addendum (2026-10-08): agents ask for an elevation
An agent that needs more autonomy for a task asks for it instead of failing or nagging in chat:

- **`request_elevation {siteId, mode, minutes, reason}`** (MCP). It files an approval with tool `request_elevation`, input `{mode, minutes, reason, keyId}` and a prompt quoting the reason, on that site's Approvals.
  - Only API-key agents on a server with approvals can use it. Local stdio is told to restart with `--mode`, and people are refused.
  - The same rules as a person's grant apply: more autonomous than the key's own mode, not already in force, never `bypass`, 5 minutes to 24 hours.
  - One open request per key: asking again returns the pending one.
  - It changes neither the site nor the key, so it is annotated read-only and also works in `plan` mode (a planner may ask to become `edits`).
- **`get_mode`** (MCP) returns:
  - the current and own mode;
  - the elevation in force;
  - which modes could still be requested;
  - the latest request's status (`pending`, `denied`, `expired`, or `consumed` = granted).
- **Granting is a person's act.** `POST /api/sites/:id/approvals/:id/approve` with an optional `{minutes}` grants the elevation with the approver's own rights. The approver may shorten the request but not extend it.
  - The key must still exist, belong to the approver, and still be able to take the elevation; otherwise the answer is 409 and the request stays pending.
  - The request is then marked `consumed`, since the agent has nothing to redeem.
  - The grant is audited as `agent-key.elevate` on the site, naming the request.
- **The agent learns the outcome** from `get_mode` or from its next call's instructions. Nothing it receives can grant the elevation.
- **Answers are data, not wording.** Readers never parse the English text:
  - The request's `input` carries the key's own mode (`ownMode`).
  - A granted request records what was granted, `grant: {from, mode, minutes, until}` (migration 0010), which may be shorter than asked. `get_mode` reports it as `latestRequest.granted`.
  - The grant's audit row carries `input: {requestId, keyId, minutes}`.
  - A 409 says which case applies: `conflict` when the request is no longer pending, and `elevation_conflict` when it is still pending but the key cannot take it.
  - Ending an elevation early is audited with its `elevation`.

