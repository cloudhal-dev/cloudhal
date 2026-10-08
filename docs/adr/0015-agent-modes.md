# ADR-0015: Agent modes — how independently an agent works
- Status: Accepted
- Date: 2026-10-08
- Related: ADR-0011 (policy engine), ADR-0014 (approvals)

## Context
Owners chose raw scopes when creating an agent key. Scopes say *what* an agent may touch, not *how independently* it works — the question an owner actually has, and the one IDE agents answer with permission modes (plan, ask, accept edits, auto, bypass).

## Decision
Every agent principal has a **mode**, stored with its API key (metadata) and chosen by its owner; a mode never grants scopes, it narrows them and decides where a person approves:

| Mode | Content changes | Publish | Rollback / delete |
|---|---|---|---|
| `plan` | denied (read + preview only) | denied | denied |
| `manual` | each waits for a person | waits | waits |
| `edits` (default) | free, snapshotted | waits | waits |
| `auto` | free | **low-risk publishes go live without a person**; others wait | waits |
| `bypass` | free | free | free — **local stdio only** |

- **Low risk** (`isLowRiskPublish`): only articles added or edited, nothing removed, no pages or site settings changed, at most 20 changes — measured against the live version (`SiteGraphStore.pendingChanges`, which ignores the publish pointer itself). Such publishes are audited as `auto mode: published without approval (…)`.
- **`bypass` never applies to API keys**: creating or switching a key to it is refused, and a remote principal claiming it is treated as `edits` (`effectiveMode`). `cloudhal mcp --mode bypass` is the only way to get it.
- Keys without a stored mode read as `edits` (the previous behaviour). Mode changes take effect on the agent's next call and are audited (`agent-key.mode`, `old → new`). Every audit row records the mode the call ran under (migration 0007).
- The MCP server tells the agent its mode in the server instructions so it can plan accordingly.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Scopes only | Already there | Owners reason about autonomy, not scope lists | The UX question stays unanswered |
| Mode replaces scopes | One concept | Loses fine-grained limits (e.g. publish but never rollback) | Keep scopes as the hard limit, mode as policy |
| `auto` = publish everything | Simple | One bad call goes live | Low-risk rule + audit + one-click rollback instead |
| Remote `bypass` with expiry | Power users | A leaked key publishes at will | Local only for now |

## Consequences
- Positive: owners pick a behaviour they understand; agents learn their limits up front; the audit says which mode allowed what.
- Negative: `manual` makes agents slow (every write waits); `auto` publishes without a person by design.
- Follow-ups: time-boxed elevation ("auto for 1 hour"), proposals (plan mode leaving a draft change set for review), per-site modes.
