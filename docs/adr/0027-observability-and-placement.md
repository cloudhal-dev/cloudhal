# ADR-0027: `cloudhal.json` settings for observability and placement
- Status: Accepted
- Date: 2026-10-13
- Related: RFC-0013 (the design), ADR-0012 (two Workers, generated configs), PR #25 (the implementation)
- Sources: Workers Logs — https://developers.cloudflare.com/workers/observability/logs/workers-logs/ · Workers Traces — https://developers.cloudflare.com/workers/observability/traces/ · Placement — https://developers.cloudflare.com/workers/configuration/placement/ · `observability.redact_query_string` in wrangler 4.148's config schema (checked 2026-10-13)

## Context
Both Workers logged every request, with no way to sample short of editing generated files that the next deploy overwrites. Traces could not be turned on. The admin Worker makes several D1 round trips per request. Signed preview tokens travel in query strings, and those appeared in logs.

## Decision
Adopt RFC-0013 with its defaults, accepted by the owner on 2026-10-13:
- **`observability`.** `{ logs: 0–1, traces: true | 0–1 }` sets both Workers' log `head_sampling_rate` and opt-in Workers Traces. Defaults: every log, no traces.
- **`placement: "smart"`.** Smart Placement for the admin Worker only. Default off, as a measured trial.
- **Redaction.** Query strings are always redacted from both Workers' logs and traces. No setting turns that off.
- **Parsing** is lenient, like the other `cloudhal.json` blocks. Generated configs are rewritten on every deploy, so removing a key removes its effect.

## Consequences
- **Positive:** owners control log volume and cost, can turn on tracing when diagnosing, and can try Smart Placement without editing generated files. Preview tokens no longer reach logs.
- **Negative:** two more public keys to support.
- **Risks:** whether the API accepts `redact_query_string` is confirmed only by the first real deploy (the wrangler dry run passes). Smart Placement's gain is unmeasured until an owner tries it.
