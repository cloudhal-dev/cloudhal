# RFC-0013: `cloudhal.json` settings for observability and placement
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-13
- Related: ADR-0012 (two Workers, generated configs), RFC-0006/0007/0008/0011 (earlier `cloudhal.json` keys), the 2026-10-13 audit roadmap (item 3, "ops and security hardening"), PR #25, `docs/guides/cloudflare-hardening.md`
- Sources (checked 2026-10-13 in `cloudflare/cloudflare-docs` at `0cd4753`, and in the config schema of wrangler 4.148):
  - Workers Logs, head sampling and pricing — https://developers.cloudflare.com/workers/observability/logs/workers-logs/
  - Workers Traces, sampling and pricing from 2026-12-01 — https://developers.cloudflare.com/workers/observability/traces/
  - Placement (`mode: "smart"`) — https://developers.cloudflare.com/workers/configuration/placement/
  - `observability.redact_query_string`: wrangler `config-schema.json`

## Summary
Two optional `cloudhal.json` keys are added. `observability` sets the log sampling rate and turns on Workers Traces for both Workers. `placement: "smart"` turns on Smart Placement for the admin Worker. Separately, and with no setting, both Workers now redact query strings from logs and traces. `cloudhal.json` is a public CLI surface, so the keys need an RFC (GOVERNANCE.md, "Significant changes").

## Motivation
- **Cost and noise:**
  - every request is logged today: Workers Free keeps 200,000 log events a day, Workers Paid includes 20 million a month;
  - a busy site, or an agent polling the API, can fill that, and owners have no way to sample short of editing generated files that the next deploy overwrites.
- **Diagnosis:** Workers Traces show each D1, R2 and service-binding call of a request. They are the quickest way to see why an MCP call or a publish is slow, but they are opt-in, and stored traces are billed from 2026-12-01.
- **Latency:** every admin request makes several D1 round trips: the session, the membership, then the work itself. Smart Placement can run the Worker near the database instead of near the person. Whether it helps depends on where people and the database are, so it has to be something an owner can try and measure.
- **Tokens in logs:** preview links carry their signed token in the query string. Workers Logs are readable by every account member with Workers access.

## Proposal

### Settings
```jsonc
// cloudhal.json
{
  "observability": {
    "logs": 0.25,  // share of requests whose logs are kept, 0–1 (default 1)
    "traces": 0.05 // Workers Traces: true (every request), or a share 0–1 (default: off)
  },
  "placement": "smart" // Smart Placement for the admin Worker (default: off)
}
```

```ts
// packages/cli/src/config.ts
export interface ObservabilityConfig {
  readonly logs?: number;              // 0–1
  readonly traces?: boolean | number;  // true = 1; false / 0 = off
}
// ProjectConfig gains:
readonly observability?: ObservabilityConfig;
readonly placement?: "smart";
```

- **Parsing:** lenient, like `analytics`, `comments` and `schedules`. A value of the wrong type or outside 0–1 is left out, and so behaves as the default.
- **`cloudhal deploy`** writes both Workers' `observability` block:
  - `enabled: true` and `redact_query_string: true` always;
  - `head_sampling_rate` when `logs < 1`;
  - `traces: { enabled: true, head_sampling_rate }` when traces are on.
- **Placement:** with `placement: "smart"`, the admin Worker gets `placement: { mode: "smart" }`.
  - The site Worker never does: published pages come from the Workers Cache.
  - Smart Placement only moves `fetch` handlers, so the cron and the alarm are unaffected.
- **Deploy output:** one line when traces are on (with the billing date), and one when placement is on (how to measure it).

### Invariants
1. Without the keys, a deployment behaves as before: every log, no traces, default placement. The one change is that query strings are redacted.
2. Query strings are always redacted from both Workers' logs and traces. No setting turns that off.
3. The keys change only generated Wrangler configuration, never the Workers' code, a contract or the API.
4. A redeploy without a key removes its effect: generated configs are rewritten on every deploy.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| No settings; owners edit the generated `wrangler.jsonc` | Nothing to add | Overwritten on every deploy | Not durable |
| CLI flags (`--log-sampling`, `--traces`) | Visible per deploy | Forgotten on the next deploy unless stored, like `--plan` | `cloudhal.json` already holds per-deployment choices |
| Smart Placement on by default | Possible latency win for everyone | Unmeasured; may add a hop for people close to the database's colo | Make it a measured trial first; revisit with numbers |
| Traces on by default with low sampling | Better first-run diagnostics | Billed from 2026-12-01; owners should opt in to costs | Off by default |
| A `logs: false` switch | Saves log volume | Losing logs makes incidents undiagnosable | Sampling down to `0` already does it explicitly |

## Compatibility & migration
- **Contracts:** none. Both keys are optional.
- **Data:** none.
- **Rollout:** the next `cloudhal deploy` after upgrading applies redaction. The keys apply when set.
- **Rollback:** remove a key and deploy.
- **Wrangler:** `redact_query_string` is in wrangler 4.148's config schema. The deploy dry run with that wrangler passes. The first real deploy confirms the API accepts it; if it does not, the field is dropped in a patch.

## Security & policy impact
- Redaction removes signed preview tokens from logs and traces.
- No new scopes, routes or approval points.
- Traces record span metadata, not request bodies. With redaction on, no query strings are recorded either.

## Open questions
1. Default log sampling: keep **1** (every request), or sample by default once a deployment grows? **[default: 1]**
2. After a measured trial on a real deployment, should `placement: "smart"` become the default for the admin Worker? **[default: decide with numbers, in a later change]**
