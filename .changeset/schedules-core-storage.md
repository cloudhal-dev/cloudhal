---
"@cloudhal/schedules": minor
"@cloudhal/storage": minor
---

Schedules core and storage (RFC-0008 rollout steps 2–3).

- New package `@cloudhal/schedules` (Worker-safe): the time model (wall-clock time plus IANA zone through `temporal-polyfill/implementation`, an injected clock, never early, DST gaps forward and overlaps at the first instant), the RRULE subset (parse, validate with the one-hour minimum interval, expand, presets, English and Turkish sentences as data; property-tested against `rrule-temporal`), the release model (pin, dependency closure, the stable `rl1:` hash, compose `nodes(S) = nodes(L) − ids + targets`, conflicts, the state machine, the one-hour missed rule with back-off, order and overlaps), automation and run state machines, taint and budget accounting, deterministic run ids, the `Scheduler` interface with `runDue` (claims, leases, recovery, the per-invocation `TickBudget`, the heartbeat, `system_jobs` watermarks) behind injected seams for publishing, built-in jobs and system jobs; `SqlScheduleStore` on SQLite/D1 (`@cloudhal/schedules/sql`); store and scheduler suites in `@cloudhal/schedules/testing`.
- `@cloudhal/storage`: migration `0017_schedules` adds `releases`, `release_items`, `automations`, `schedule_runs`, `system_jobs`, `scheduler_heartbeat` and `schedule_settings`, and `run_id`/`release_id`/`automation_id` on `audit` and `release_id`/`run_id` on `approvals`.
