# @cloudhal/schedules

Scheduled publishing and automations for Cloudhal sites ([RFC-0008](../../docs/rfcs/0008-schedules.md), [ADR-0023](../../docs/adr/0023-schedules.md)): the time model, the RRULE subset, releases pinned to exact node versions, automation and run state, taint and budget accounting, and the scheduler's `runDue` with its D1/SQLite store.

Everything here is **Worker-safe**: no Node-only import at any entry. The only Temporal entry point is `temporal-polyfill/implementation` (never a native or global `Temporal`, never `Temporal.Now`; Biome refuses the other entries and a test scans the repository). `now` is always injected.

| Entry | What |
|---|---|
| `@cloudhal/schedules` | Time model, recurrence, release model, automation/run state machines, taint, budgets, `TickMeter`, the `Scheduler` interface, `runDue`, `createScheduler`. No storage dependency beyond the `SqlDriver` type. |
| `@cloudhal/schedules/engine` | The Temporal-free part: the release model, run ids, instant helpers, `TickMeter`, `releaseFinishStatements`, the scheduler's types. `@cloudhal/core-ts` applies releases through it, so the site Worker never bundles the time-zone library. |
| `@cloudhal/schedules/time` | The time model alone; `@cloudhal/core-ts/time` re-exports it (one implementation). |
| `@cloudhal/schedules/recurrence` | The RRULE subset alone (parse, validate, expand, presets, sentences). |
| `@cloudhal/schedules/sql` | `SqlScheduleStore` over `SqlDriver` for migration `0017_schedules`. |
| `@cloudhal/schedules/testing` | `describeScheduleStoreConformance`, `describeSchedulerConformance`, `fakeReleaseExecutor`, `countingDriver`, `expectContract*` (vitest). |

## Time (§9)

- `resolveLocalTime("2026-11-02T09:00", "Europe/Istanbul")` → `{ at: "2026-11-02T06:00:00.000Z", offset: "+03:00" }`. A time inside a DST gap moves to the next valid time (`adjusted: "dst-gap"`); a repeated time resolves to its first instant (D2).
- `recomputeExecuteAt(when)` — never early: a stored wall-clock time is re-resolved with today's tzdata and the instant only ever moves later (`adjusted: "tzdata"`).
- `isTimeZone`, `toLocalDateTime`, `zoneOffset`, `latenessSeconds`, `canonicalInstant` (the stored form is `Date#toISOString()`).

## Recurrence (§9.3, D3)

`parseRule`, `formatRule`, `validateRecurrence` (minimum interval 1 hour, at most 24 a day), `occurrences`, `nextOccurrence`, `occurrencesBetween`, `presetRule`/`presetOf`, `presetMinuteOffset`. Gap occurrences move forward instead of being dropped (the documented deviation from RFC 5545 §3.3.10); property tests compare the expander with `rrule-temporal` on seeded random rules with that difference excluded.

Sentences are data: `describeRecurrence(rec)` returns `{ key, times, days?, weekdays?, monthDays?, n?, count?, until? }`; `renderRecurrence(sentence, "en" | "tr")` renders it with `RECURRENCE_MESSAGES` ("On the second Tuesday of every month at 09:07" / "Her ayın ikinci salısı 09:07").

## Releases (§6)

- `pinItems`, `dependencyClosure` (with `referencedNodeIds` as the default extractor), `composeRelease` (S1: `nodes(S) = nodes(L) − ids + targets`), `releaseConflicts` (S4), `missingDependency`, `planRelease`.
- `RELEASE_TRANSITIONS`, `HOLDING_STATES`, `TERMINAL_RELEASE_STATES`, `releaseWhen` (lead time, horizon), `baseApprovalVerdict` (D5, D9), `isPastLateLimit` and `nextRetryAt` (the one-hour rule and back-off), `orderReleases` and `releaseOverlaps` (D15).

### Identifiers (stable)

```
rl1   = "rl1:" + hex(SHA-256(utf8(lines.join("\n"))))
lines = ["site <siteId>"] + per item, sorted by node id (code-unit order):
        "<set|remove> <nodeId> <nodeKind> <targetRev>:<targetHash>|- <baseRev>:<baseHash>|-"

runId = "run_" + Crockford-base32(first 100 bits of SHA-256(utf8(subjectId + "\n" + occurrenceAt.toISOString())))
```

The time is not in `rl1:` (D4); an approval request's `args_hash` covers `approvalArgs(releaseId, when)`. Release and automation ids are random (`rel_`/`aut_` + 20 Crockford characters); lease tokens are random per claim.

## Automations (§5.3, §11)

`AUTOMATION_TRANSITIONS`, `RUN_TRANSITIONS`, `accountRunResult` (three failures pause, a budget breach pauses at once), `dueOccurrences` (only the latest missed occurrence runs), `runWindow`, `runEndsAt`, `killSwitchPauses`/`killSwitchResumes`; taint (`checkRunCall`, `afterRunCall`, `forbiddenUntrustedScopes`, `untrustedEffectiveScopes`); budgets (`checkRunBudget`, `budgetLeft`, `withinDailyWriteCap`).

## Scheduler (§8)

```ts
import { createScheduler, TICK_BUDGETS, TickMeter } from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";

const scheduler = createScheduler({
  openStore: (meter) => new SqlScheduleStore(meter.wrap(d1Driver)),
  newMeter: (budget) => new TickMeter(budget),
  releases: releaseExecutor({ graph, schedules }), // `@cloudhal/core-ts/releases`
  builtins, systemJobs, checkApproval, wake: "minute",
});
await scheduler.runDue(new Date(controller.scheduledTime), TICK_BUDGETS.free, "cron");
```

In practice every ticker calls `runScheduledTick` from `@cloudhal/core-ts/releases`, which builds the graph, this store, the executor and the system jobs over one `TickMeter`. `runClaimedRelease` ends a run a caller claimed itself (a person's "Publish now", `SqlScheduleStore.claimManualRun`).

`runDue` claims each occurrence with a compare-and-swap and a fresh lease token and guards every later write on that token, so concurrent ticks produce one effect (S3). Releases run one at a time per site in time order (D15), at most an hour late (S8), with back-off retries and lease recovery. `SqlScheduleStore.releaseFinishStatements(…, guard)` gives `publishRelease` the statements that end a release to append to its own guarded batch.

For the API and MCP (rollout steps 7–8) the store also has `automationByKey`, `openAgentRun`, `readyAgentRun`, `openManualWindow`, `recordRunCall`, `endAgentRunAs`, `updateAutomation`, `deleteAutomation`, `retitleRelease` and `releaseLateness`. The scheduler's `checkApproval` is `createReleaseApprovalCheck` from `@cloudhal/mcp-server/schedules` (re-exported by `@cloudhal/api` with `releaseRights`).

## Built-in automations (§11.1, rollout step 9)

`createBuiltinRunner(sources)` is the `BuiltinRunner` for the five jobs; `@cloudhal/core-ts/automations` implements `BuiltinSources` over the site graph (`graphBuiltinRunner`), and `runScheduledTick` uses it by default. Every job runs in bounded steps — one per tick, at most `BUILTIN_STEP_COST[job]` statements — and keeps its position in `automations.cursor`, so a large site spans several ticks and a crash between them continues the same run. Findings (Studio-only JSON on the run, at most 200; counts exact) carry stable codes:

| Job | Steps | Finding codes | Counts |
|---|---|---|---|
| `broken-links` | pages of 50 live pages, entries, terms and menus; then the week's 404 rows (taints: `broken_links`) | `broken-internal-link`, `broken-media-reference`, `broken-menu-target`, `link-to-gated-content`, `not-found-path` (with a redirect `proposal`) | per code, `broken-links`, `nodes-scanned`, `links-checked` |
| `stale-content` | pages of 200 entries (route fields only) | `stale-entry` (oldest first) | `stale-entries`, `entries-scanned` |
| `feed-check` | `/rss.xml`, then `/sitemap.xml` (taints: `feed_check`) | `feed-unreachable`, `feed-invalid`, `feed-item-incomplete`, `feed-future-date`, `feed-missing-entry`, `feed-gated-node` (the gate self-check), `feed-asset-not-live` | per code, `documents-checked`, `feed-problems`, `feed-errors` |
| `weekly-digest` | one | `digest-published`, `digest-scheduled`, `digest-attention`, `digest-open-findings` (sections) | `published`, `scheduled`, `needs-attention`, `open-findings` |
| `cleanup` | retention batches until nothing is left, then reminders | `stale-draft` | `runs-deleted`, `releases-deleted`, `findings-trimmed`, `leases-cleared`, `stale-runs-closed`, `stale-drafts` |

Every built-in run also records `counts.steps` and `counts.statements` (its budget use). A step that reads visitor text or a fetched document returns `taint`; the running run is marked at once. `RunDueDeps.notify` (`ScheduleNotifier`) receives `automation-findings`, `automation-digest`, `automation-failed` and `automation-paused` after the run's end is committed; Studio's notifications are derived from the run rows by `@cloudhal/api`. A person's "Run now" is `SqlScheduleStore.startBuiltinNow`: a `manual` run for this minute that the next tick steps, after which the automation returns to its schedule. Nothing seeds automations: people create them in Studio (D7).

Statements per path (counted by `TickMeter`, Workers Free budget 40):

| Path | Statements |
|---|---|
| Idle tick | 1 (2 when the heartbeat is due, every fifth minute) |
| Release published, executor not committing | 9 |
| Release published, `publishRelease` shape (4 reads + 8-statement batch) | 18 |
| Release published by `runScheduledTick` with the real `publishRelease` (core-ts suite, no asset blobs) | 17 |
| Release missed | 7 |
| Release recovered (expired lease or transient error) | 13 |
| Built-in step (claim, a two-statement step, finish) | 8 |
| Built-in step that taints the run (more to do) | 10 |
| `broken-links` tick (core-ts suite: a page of live nodes) | 9–10 |
| `stale-content` tick | 8–9 |
| `feed-check` tick | 9 |
| `weekly-digest` tick | 13 |
| `cleanup` tick (retention batch / draft reminders) | 17 / 8 |
| Agent-task occurrence recorded | 6 |
| Agent-task window closed | 8 |
| First tick registering system jobs | 3 |
| System job run (plus the job's own) | 6 |
