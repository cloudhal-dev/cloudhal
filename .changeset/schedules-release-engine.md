---
"@cloudhal/schedules": minor
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
---

Scheduled releases on the site graph (RFC-0008 rollout step 5, the release half).

- `SiteGraphStore.publishRelease` applies a claimed release on top of whatever is live: conflicts are checked before the batch and the site CAS inside it, `nodes(S) = nodes(L) − ids + targets`, a `scheduled` snapshot (release, run, base and approver in its metadata), and one guarded batch of at most eight statements (pointer flip, snapshot, GC roots, the release and run finished, the audit row as the scheduler on behalf of the approver). A tick that publishes a release takes 17 statements (Workers Free budget: 40).
- Holds and locks: while a release awaits approval, is scheduled or running, an ordinary publish keeps its nodes at their live version (`createSnapshot` with reason `publish`, `pendingChanges`, and `stateHash`, which now includes the holds), `publish` refuses a snapshot that would move them, and every update and delete path refuses them with `409 scheduled_locked` (`ScheduledLockedError`). People may "Edit and re-approve" through `updateContentEntry`/`updatePage`'s `{ releaseEdit }`. Snapshots made to go live (REST `publish: true`, `cloudhal snapshot --publish`) use reason `publish`.
- `@cloudhal/core-ts/releases`: `ReleaseService` (create with the dependency closure, target bodies and the purge plan; add or remove items, re-pin, schedule, move, unschedule, cancel, edit and re-approve, publish now), `releaseExecutor`, `runScheduledTick`, `schedulerHealthReport`, `SchedulerRuntime`.
- `@cloudhal/core-ts/time` re-exports the schedules time model (instants keep the `Date#toISOString()` form). The site Worker's entries never reach `temporal-polyfill`: `@cloudhal/schedules/engine` is the Temporal-free part of the release model, `@cloudhal/schedules/time` the time model alone; `SqlScheduleStore` gains `claimManualRun`, `releasePurgePlan` and `recordPurge`.
