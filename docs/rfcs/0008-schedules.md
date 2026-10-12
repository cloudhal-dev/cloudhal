# RFC-0008: Schedules — releases, embargoes, scheduled publishing and automations
- Status: Accepted (2026-10-12, PR #15 approved by Halil with the defaults D1–D15 as drafted; ADR-0023)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-12
- Related: ADR-0002 (storage, batch-only), ADR-0008 (precompiled validators), ADR-0011 (agent layer, policy engine), ADR-0012 (two Workers, pointer-flip publishing, Workers Cache and purge through the site Worker), ADR-0014 (approvals bound to state), ADR-0015 (agent modes), ADR-0016 (time-boxed elevation; it rejected "a scheduled job that reverts the mode"), ADR-0018 / RFC-0005 (roles, scopes, keys never exceed their creator), ADR-0020 / RFC-0004 (assets and blob GC roots), ADR-0021 / RFC-0006 (analytics: the hourly job, `CLOUDHAL_ANALYTICS_CRON=off`), ADR-0022 / RFC-0007 (comments: `cm1:` bindings, call classes, the shared purge budget, `CLOUDHAL_COMMENTS_CRON=off`), RFC-0001 (open question "a visibility/schedule field"), `docs/security/threat-model.md`, `docs/design/DESIGN.md`
- Numbering: RFC-0007's non-goals pointed editorial notes at "RFC-0008"; schedules take this number by the owner's decision, and editorial notes take the next free one when written. RFC-0007's sentence now points at RFC-0009.
- Owner decisions: Halil, 2026-10-12 (§0.1). This RFC adopts them and does not reopen them. §0.2 lists the defaults this draft chose for the remaining questions; each is marked **[default]** and can change at review.
- Background: the maintainer's three private research notes on schedules (Studio interface, infrastructure, agents; 2026-10-12). Nothing from them is copied here; the public sources they checked are listed below.
- Sources (as checked on 2026-10-12; claims not re-verified for this draft are marked **[verify]** and collected in §2):
  - Cloudflare: Cron Triggers — https://developers.cloudflare.com/workers/configuration/cron-triggers/ · `scheduled()` handler — https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ · Workers limits (cron triggers per account, CPU, subrequests) — https://developers.cloudflare.com/workers/platform/limits/ · Workers pricing (cron invocations are requests) — https://developers.cloudflare.com/workers/platform/pricing/ · Durable Objects alarms — https://developers.cloudflare.com/durable-objects/api/alarms/ · DO limits and pricing — https://developers.cloudflare.com/durable-objects/platform/limits/ · https://developers.cloudflare.com/durable-objects/platform/pricing/ · DO on Workers Free (SQLite-backed only) — https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/ · Queues limits, delays, pricing and Free plan — https://developers.cloudflare.com/queues/platform/limits/ · https://developers.cloudflare.com/queues/configuration/batching-retries/ · https://developers.cloudflare.com/queues/platform/pricing/ · https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/ · Workflows limits, pricing, step billing, sleeping, Workers API, schedules — https://developers.cloudflare.com/workflows/reference/limits/ · https://developers.cloudflare.com/workflows/reference/pricing/ · https://developers.cloudflare.com/changelog/post/2026-07-07-workflows-billing-updates/ · https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/ · https://developers.cloudflare.com/workflows/build/workers-api/ · https://developers.cloudflare.com/workflows/build/trigger-workflows/ · Agents SDK scheduling — https://developers.cloudflare.com/agents/api-reference/schedule-tasks/ · D1 limits — https://developers.cloudflare.com/d1/platform/limits/ · Workers Cache and purge — https://developers.cloudflare.com/workers/cache/ · https://developers.cloudflare.com/cache/how-to/purge-cache/ · a past cron incident — https://cloudflarestatus.com/incidents/j4jg0mwf07j6 · a reported 2026-08 runtime incident in which `Temporal.Now` returned 1970 (third-party mirror, **[secondary]**) — https://pulsetic.com/status/cloudflare/incidents/6138/
  - Time and recurrence: RFC 5545 §3.3.5 and §3.3.10 — https://www.rfc-editor.org/rfc/rfc5545 · RFC 7529 — https://www.rfc-editor.org/rfc/rfc7529 · `temporal-polyfill` — https://www.npmjs.com/package/temporal-polyfill · `rrule-temporal` — https://github.com/ggaabe/rrule-temporal · `rrule` (last release 2023) — https://www.npmjs.com/package/rrule · `croner` (skips DST-gap jobs) — https://www.npmjs.com/package/croner · Node.js 26 (Temporal on by default) — https://nodejs.org/en/blog/release/v26.0.0 · IANA tzdb (Europe/Istanbul) — https://data.iana.org/time-zones/tzdb/europe · CLDR week data — https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/supplementalData.xml · MDN `Intl.Locale#getWeekInfo` — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getWeekInfo
  - Prior art (CMS): WordPress cron and "Missed schedule" — https://developer.wordpress.org/plugins/cron/ · https://core.trac.wordpress.org/ticket/63599 · Ghost scheduling (source and Admin API) — https://github.com/TryGhost/Ghost · https://docs.ghost.org/admin-api/posts/scheduling-a-post · Contentful scheduled actions and releases — https://contentful.com/developers/docs/references/content-management-api/scheduled-actions.md · https://contentful.com/developers/docs/references/content-management-api/releases.md · Sanity Content Releases (scheduled releases are locked) — https://www.sanity.io/docs/user-guides/content-releases · Strapi Releases (publishes the latest saved version) — https://docs.strapi.io/cms/features/releases · Storyblok Release Merging — https://www.storyblok.com/cl/release-merging · Payload scheduled publish and jobs — https://payloadcms.com/docs/versions/drafts · https://payloadcms.com/docs/jobs-queue/queues · Drupal Scheduler — https://www.drupal.org/project/scheduler · RebelMouse embargo — https://www.rebelmouse.com/article-embargo
  - Prior art (calendars and automation): Google Calendar views and shortcuts — https://support.google.com/calendar/answer/6110849 · https://support.google.com/calendar/answer/37034 · Linear filters, views, Loops — https://linear.app/docs/filters · https://linear.app/docs/custom-views · https://linear.app/changelog/2026-07-20-introducing-loops · GitHub Projects filters and views — https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects · Claude Code routines — https://code.claude.com/docs/en/routines · GitHub Agentic Workflows (read-only agent job, safe outputs) — https://docs.github.com/en/copilot/concepts/agents/about-github-agentic-workflows · https://github.github.com/gh-aw/introduction/architecture/ · Zapier agent limits and auto-off — https://help.zapier.com/hc/en-us/articles/26559132765325 · https://help.zapier.com/hc/en-us/articles/8496216132621 · n8n Schedule Trigger and human review — https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/ · https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/ · Make scheduling and errors — https://help.make.com/schedule-a-scenario · https://help.make.com/Introduction-to-errors-and-warnings · GitHub Actions schedule time zones — https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/
  - Security: S. Willison, "The lethal trifecta" — https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/ · Beurer-Kellner et al., design patterns against prompt injection — https://arxiv.org/abs/2506.08837 · Debenedetti et al., CaMeL — https://arxiv.org/abs/2503.18813 · Anthropic on prompt-injection defenses — https://www.anthropic.com/research/prompt-injection-defenses · OWASP LLM06 Excessive Agency — https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ · Google spam policies (scaled content abuse) — https://developers.google.com/search/docs/essentials/spam-policies · Google on publication dates — https://developers.google.com/search/docs/appearance/publication-dates
  - Accessibility: WCAG 2.2 SC 2.5.7 Dragging Movements — https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html · SC 2.5.8 Target Size — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html · WAI-ARIA APG grid and date-picker dialog — https://www.w3.org/WAI/ARIA/apg/patterns/grid/ · https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ · dnd-kit accessibility — https://dndkit.com/guides/accessibility
- Contracts on this branch: `Site.timeZone`, `availability` on `ContentEntry` and `Page`, and three new roots `release`, `automation`, `schedule-run` (§4), generated and tested in both languages (`pnpm gen`, `pnpm drift`, the contract tests, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`).

## Summary
Cloudhal gets one scheduling model for content and one for automations, both with D1 as the source of truth and nothing trusted to a timer. **Content** is scheduled as **releases**: node versions pinned by id, rev and hash together with the version that was live, applied on top of whatever is live at the release's time, held as a conflict when a pinned node or its base changed, approved once by a person against an `rl1:` hash of exactly those versions, and locked until unscheduled; **embargoes and expiries** are **time gates** (`availability.from/until`) that the published renderer checks on every request, with the edge cache's lifetime capped at the next gate, so they hold to the second even when no scheduler runs. A single every-minute tick (the existing cron trigger, or a Durable Object alarm when no cron slot is free, or a Node timer) runs releases at most once and at most an hour late, runs **built-in deterministic jobs**, and opens run windows for **scheduled agent tasks** that external agents perform over MCP with a per-automation key, under a mode cap, budgets, a taint rule and kill switches; no language model runs inside Cloudhal.

## Motivation
- **Problem.** Nothing in Cloudhal happens later. "Publish this at 09:00 on Monday", "keep this press release dark until the embargo lifts", "take the campaign page down after Sunday", "check the site for broken links every week" all need a person at the keyboard at that moment. Studio's sidebar has carried a disabled **Schedules — Soon** entry since the design system was written; `Snapshot.reason` has had a `scheduled` value since RFC-0001 that nothing uses.
- **Why it is not a small feature.** Publishing in Cloudhal is a **site-wide pointer flip** (ADR-0012): `publish` snapshots the whole working copy and makes it live. Running that at T would (a) publish everything else that is pending at T and (b) need an approval bound to the whole site's state hash (ADR-0014), which any edit voids, so in an active newsroom the approval would almost never survive until T. The obvious alternative, "prepare a full snapshot now and flip to it at T", silently reverts everything published in between. Scheduling therefore needs a new content primitive, a new approval binding and new policy rules, not a cron job.
- **Who is affected.**
  - Newsrooms need minute-accurate releases and embargoes that never leak (wire stories, results, press releases).
  - Small publishers want "schedule for Monday" and a calendar that shows the week.
  - Documentation and data sites need expiries, stale-content reviews and broken-link sweeps.
  - Owners need to see what will happen, who asked for it and whether a person approved it, and to stop everything with one switch.
  - Agents gain the most: today an agent that wants something published later must keep a session alive and poll an approval (the demo's `editor-agent.ts` polls for up to 15 minutes). With releases, an agent leaves a pinned proposal, a person approves it once, and the server does the rest.
- **Why now.** Everything the design leans on exists: snapshots and diffs, `planCachePurge`, the shared purge budget (RFC-0007), the per-argument call classes and state bindings (`cm1:`) introduced for comments, modes and elevation computed per call (ADR-0015/0016), the approvals screen and the derived notifications. The hourly cron that analytics and comments share is the right place to grow a minute tick, and its "on admin requests" fallback is exactly the WordPress failure ("missed schedule") that a scheduler for publishing must not repeat.

## Non-goals
- **No language model inside Cloudhal** (owner decision 4). Agents are external MCP clients with their own keys; Cloudhal schedules, constrains and records their work. Workers AI or bring-your-own-key loops are a later RFC, if ever.
- **No Week or Timeline (Gantt) views** in v1. Agenda and Month cover "what happens next, who does it, is it approved" (§15.2). Week and Timeline come when hour-level overlaps and long embargo windows are real needs.
- **No composed per-locale releases** ("the Turkish version at 09:00 Istanbul, the English one at 09:00 New York" as one object). Two releases do this today; a composed object waits for a locale model (Cloudhal has no translation links yet).
- **No webhook triggers** (Cloudhal calling an agent platform at T, or an external system starting a release). They need stored third-party secrets, egress and SSRF rules; a later RFC builds them on the same run records.
- **No scheduled rollback.** A rollback undoes everything published since; v1 offers "undo this release" as a person's ordinary rollback (§6.6). A reverse release is a later idea.
- **No "evergreen republish".** No automation ever changes `publishedAt`; Google asks publishers not to change dates without meaningful changes, and agents writing and scheduling content on their own is the "scaled content abuse" pattern. Agents may draft and propose; people publish.
- **No schedules in site bundles** in v1 (`cloudhal push/pull`; §Compatibility).
- **No implementation in this RFC** beyond the contracts and their fixtures. Rollout is in Compatibility & migration.

## Proposal

### 0. Decisions

#### 0.1 Owner decisions (Halil, 2026-10-12), adopted
1. **Releases are content-level change sets.** Node-pinned versions are applied on top of the live snapshot at time T. A single scheduled publish is a one-item release. If a pinned node or its live base changed since approval, the release is **held** as a conflict and a diff is shown. The approval is bound to the release hash. Scheduled content is **locked** until it is unscheduled, or edited and re-approved. **Embargo and expiry use time gates** (`availability.from/until`) checked at render, with the cache lifetime capped at the next gate; embargoed content is excluded from feeds, sitemap, search output and Open Graph until `from`.
2. **Missed runs.** A release runs late **at most once and only within one hour** of its time; later, it becomes `missed`, with a notification and a "Publish now" action. Recurring jobs run only the **latest** missed occurrence.
3. **Scheduler on Cloudflare.** The existing hourly cron becomes **every minute** (no new cron slot); hourly jobs move behind a D1 watermark in the same handler. When no cron slot is available, a single **Durable Object alarm** clock ticks instead. A heartbeat and a "scheduler stalled" notification exist in every mode. On Node, the same `runDue` runs on a timer of at most 60 s, with catch-up on start.
4. **Automations v1** are **built-in deterministic jobs** (broken-link sweep, stale-content review, feed and sitemap checks, a weekly digest to Studio notifications, cleanup) **plus scheduled agent tasks** that external agents pick up over MCP with their own key and mode, with budgets, a run window, a kill switch and run history. **No LLM runs inside Cloudhal.**

#### 0.2 Defaults for the remaining questions (this draft's decisions; changeable at review)
| # | Question | Default chosen here |
|---|---|---|
| D1 | Site time zone | New optional contract field **`Site.timeZone`** (IANA). Absent means **UTC**. Studio suggests the owner's browser zone; Turkish sites typically use `Europe/Istanbul` (UTC+3 all year since 2016). |
| D2 | DST | A wall-clock time that does not exist (spring-forward gap) runs at the **next valid time**; a time that occurs twice runs **once, at the first**. For recurrences this deliberately deviates from RFC 5545 §3.3.10, which drops gap occurrences (§9.2). |
| D3 | Recurrence | An **RRULE subset**: FREQ DAILY/WEEKLY/MONTHLY, INTERVAL, BYDAY (ordinals only with MONTHLY), BYMONTHDAY, BYHOUR/BYMINUTE, COUNT or UNTIL. Studio presets: hourly, daily, weekdays, weekly, monthly, once. |
| D4 | Moving an approved release | A person who may approve it keeps the approval when they move it (the content hash is unchanged; moving is their decision). **An agent moving it, or any content change, needs re-approval.** |
| D5 | Unapproved at its time | The release **expires**; nothing is published. |
| D6 | Proposals | `propose_release` is allowed from **`manual` mode up** (not in `plan`). |
| D7 | Automations | Creating and resuming automations is **people-only, in Studio**. Agents may **pause their own**. |
| D8 | Embargo override | Publishing before `from` (lifting an embargo) is **Editor and above**, with a required reason and an audit row. Agents may ask; a person decides, in every mode. |
| D9 | `auto` mode | An `auto`-mode release scheduled without a person must run **within the key's elevation window, or within 24 h**, whichever ends first; otherwise it waits for a person. |
| D10 | Taint | Once a run reads untrusted text (comments, 404 paths, referrers, fetched pages), the **rest of that run may only read, label and hide**. Automations declared to read untrusted text **cannot hold write scopes**. |
| D11 | Budgets | Per run: tool calls, writes, approval requests, minutes; per site: a daily cap on automation writes. **Three consecutive failures pause** an automation. |
| D12 | Drag to reschedule | On the desktop Month view in v1, with a confirmation dialog and undo; **"Move to…"** is always available as the non-drag equivalent (WCAG 2.2 SC 2.5.7). |
| D13 | Keyboard | "Today" is **`g t`** (avoids the existing `t s` sidebar chord). |
| D14 | Proposed chip | A dashed outline marks proposals; if the design lint objects, a **documented exception** for the `ScheduleItem` block (§15.3). |
| D15 | Order and overlap | Releases execute **one at a time, in time order**, per site. A node in two pending releases is **flagged** (not refused). |

### 1. Overview
```
 people (Studio) ─┐                         agents (MCP, own keys, modes)
                  ▼                                       ▼
 admin Worker ── REST + MCP ── policy (scopes · call classes · modes · elevation · taint · budgets)
   │   releases:  pin node versions + live base ─ rl1: hash ─ approval (person | auto window) ─ lock
   │   gates:     availability.from/until on the node ─ published like any change
   │   automations: built-in jobs · agent tasks (per-automation key, run window)
   │
   │   D1: releases · release_items · automations · schedule_runs · system_jobs · scheduler_heartbeat
   │
   ├── ticker: cron "* * * * *"  |  SchedulerClock DO alarm  |  request backstop (heartbeat stale)
   │      └─ runDue(now): due releases (one at a time) → compose live ⊕ items → one guarded batch
   │                      → purge (shared budget) · automation occurrences · system jobs (watermarks)
   │
   └── SITE binding → /__cloudhal/purge, /__cloudhal/features
 site Worker ── renders the live snapshot; isAvailable(node, now) on every path;
               Cloudflare-CDN-Cache-Control max-age ≤ next gate
 Node (cloudhal dev/studio/mcp, self-host) ── the same runDue on a ≤ 60 s timer, catch-up on start
```

### 2. Verification: what is verified, what is assumed
| # | Item | Status |
|---|---|---|
| S1 | The admin Worker's `scheduled` handler runs the analytics rollup and the comments job on `17 * * * *`; the deploy falls back to `CLOUDHAL_*_CRON=off` and runs the comments job after admin requests | **Verified** in code (`packages/cli/src/cloudflare/config.ts` `HOURLY_CRON`, `deploy.ts` `isCronLimitError`, `packages/cloudflare/src/admin-worker.ts`) |
| S2 | Publish is `createSnapshot` (whole working copy) + `updateSite` (CAS); rollback needs an ancestor; `stateHash` digests every node | **Verified** (`packages/core-ts/src/store.ts`) |
| S3 | Only `200`/`304` responses are edge-cached; everything else is `no-store` | **Verified** (`cacheOnlySuccess` in `cloudflare-entry.ts`) |
| S4 | Published pages carry `Cloudflare-CDN-Cache-Control: public, max-age=31536000` | **Verified** (`runtime-workerd.ts`) |
| S5 | Workers have no native `Temporal` at the pinned compatibility date; Node 24 neither; `temporal-polyfill/implementation` resolves gaps forward and overlaps to the first instant with `disambiguation: "compatible"` | **Verified locally** by the research (workerd 1.20260730.1 and 1.20261006.1, Node 24.15, `temporal-polyfill` 1.0.5) |
| L1 | Delay distribution of a `* * * * *` trigger on Workers Free (`scheduledTime` vs `Date.now()`) over 48 h | **[verify]** step 0 |
| L2 | Changing the expression from hourly to every minute keeps using the same slot; the cron-limit error text is the same | **[verify]** step 0 |
| L3 | Durable Object alarm precision on Free (SQLite-backed class), retry behaviour, and that `setAlarm` works in `createTestHarness` | **[verify]** step 0 |
| L4 | Workers Cache honours a short `Cloudflare-CDN-Cache-Control: max-age` (a gate 90 s away stops being served from cache after 90 s, without a purge) | **[verify]** step 0; §7.4 has the fallback |
| L5 | CPU and query count of composing and writing a release snapshot inside a cron/alarm invocation on Free (10 ms CPU, 50 D1 queries) for sites of 500 and 2,000 nodes | **[verify]** step 0 |
| L6 | Whether cron triggers and DO alarms still run after a Free account exhausts its 100,000 requests for the day | **[verify]** step 0 |
| L7 | How statements inside one `batch()` count toward D1 Free's 50 queries per invocation (RFC-0007 V4, still open) | **[verify]** step 0; §6.3 stays ≤ 12 statements either way |
| L8 | Whether a Workflow binding's `schedules` count against the account's cron-trigger limit (only matters for the alternative in §Alternatives) | **[verify]**, optional |
| L9 | Cron propagation after a deploy ("up to 15 minutes") and what runs meanwhile | **[verify]** step 0; the request backstop covers it (§8.6) |

Rollout step 0 closes L1–L7 and L9 on a Workers Free account before anything else ships.

### 3. Vocabulary
- **Release**: a scheduled change set. Each **item** pins a **target** version (`rev` + content `hash`) of one node, or its removal, together with the **base**: the version that was live when it was pinned (absent for a node that was not live).
- **Hold / lock**: while a release is `awaiting_approval`, `scheduled` or `running`, its nodes are **held** (an ordinary publish keeps their live version) and **locked** (edits and deletes are refused) until the release is unscheduled, edited and re-approved, or finished.
- **Time gate**: `availability.from` (embargo) and `availability.until` (expiry) on a page or entry. Checked by the renderer per request; independent of any scheduler.
- **Automation**: a recurring job: a **built-in** deterministic job, or an **agent task**.
- **Occurrence**: one planned time of a release or automation. **Run**: what happened at one occurrence (`ScheduleRun`), with a deterministic id that is the occurrence's idempotency key.
- **Run window**: the period after an agent task's occurrence during which its key works.
- **Tick**: one call of `runDue(now)`, from cron, the DO alarm, an admin request (backstop), the Node timer or a person.

### 4. Contracts
All changes are additive; `schemaVersion` stays `1`. They follow the AGENTS.md subset: unions are `oneOf` with inline variants whose `kind` is a single-value enum, no `default`, `additionalProperties: false` except declared maps, cross-file refs only to `common.schema.json#/$defs/*`, and root-local `$defs` carry the root's prefix (`Release…`, `Automation…`, `ScheduleRun…`) so the package index never shadows another type.

**Why contracts.** Releases, automations and runs cross trust boundaries — Studio, MCP results, REST, the audit — and the Rust core will execute releases later; both languages must agree on them, as they do on `Comment` and `AnalyticsEvent`. They are **not graph nodes**: they are not in the node-kind registry, snapshots or bundles. `Site.timeZone` and `availability` **are** graph data: they are content, versioned, diffed and published like any field.

#### 4.1 Shared definitions and graph fields
```jsonc
// common.schema.json — new $defs
"TimeZone":      { "type": "string", "maxLength": 64,
                   "pattern": "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$" },   // shape only; writers check Intl's zone list
"LocalDateTime": { "type": "string",
                   "pattern": "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$" },
"Availability":  { "type": "object", "additionalProperties": false, "minProperties": 1,
                   "properties": { "from": Timestamp, "until": Timestamp } }
// site.schema.json
"timeZone":     { "$ref": "common.schema.json#/$defs/TimeZone" }        // optional; absent = UTC
// content-entry.schema.json and page.schema.json
"availability": { "$ref": "common.schema.json#/$defs/Availability" }    // optional
```
- `availability` lives on the node, so it is part of the node's hash, snapshot, diff, approval and rollback like any other field. Rolling back to a snapshot from before an embargo was set restores the content without it — exactly what a rollback means.
- Cross-field rules stay in code (the subset has no `if/then`): `from < until`; a page or entry with gates must also be `published` to show; `publishedAt` follows `from` (§7.5); a zone name must be in `Intl.supportedValuesOf("timeZone")` of the runtime that writes it.
- Fixtures: valid `site/with-time-zone`, `site/with-three-part-time-zone` (`America/Argentina/Buenos_Aires`), `content-entry/embargoed-until-publication`, `content-entry/campaign-with-embargo-and-expiry`, `page/event-page-expires`; invalid `site/time-zone-offset` (`+03:00`), `site/time-zone-without-area` (`Istanbul`), `content-entry/availability-empty`, `content-entry/availability-unknown-gate`, `content-entry/availability-epoch-number`, `page/availability-extra-field`.

#### 4.2 `release.schema.json` — `Release`
```jsonc
{
  "required": ["schemaVersion","id","siteId","items","state","hash","createdBy","createdAt","updatedAt","rev"],
  "properties": {
    "id": "^rel_[A-Za-z0-9]{6,32}$",
    "title?": "one line, 1–200, no controls or bidi overrides",
    "items": [ /* 1..100, at most one per node */
      { "kind": "set",    "nodeId": "Id", "nodeKind": ReleaseNodeKind, "target": {rev, hash}, "base?": {rev, hash} },
      { "kind": "remove", "nodeId": "Id", "nodeKind": ReleaseNodeKind, "base": {rev, hash} } ],
    // ReleaseNodeKind: page | contentEntry | taxonomy | term | redirect | menu | asset   — never "site"
    "when?": { "kind": "at", "at": Timestamp, "timeZone": TimeZone, "localTime?": LocalDateTime }
           | { "kind": "on-approval" },
    "state": "draft|awaiting_approval|scheduled|running|published|conflict|missed|expired|failed|canceled",
    "hash": "^rl1:[0-9a-f]{64}$",
    "approval?": { "kind": "person", "by": { "id": "^user_…$", "name?" }, "at", "executeAt?", "approvalId?" }
               | { "kind": "auto", "by": Actor, "keyId", "at", "windowEnds" },
    "outcome?":  { "kind": "published", "runId", "at", "snapshotId", "baseSnapshotId", "latenessSeconds": int, "purge": "tags|everything|deferred|failed|none" }
               | { "kind": "conflict", "runId?", "at", "conflicts": [{ "nodeId", "expected?": {rev,hash}, "found?": {rev,hash} }] }
               | { "kind": "failed", "runId?", "at", "code": "dependency_missing|invalid_snapshot|site_missing|node_body_missing|store_error", "message?" }
               | { "kind": "missed", "at", "latenessSeconds" }
               | { "kind": "expired", "at", "reason": "unapproved|approval_lost|auto_window_ended|creator_removed" }
               | { "kind": "canceled", "at", "by": Actor },
    "createdBy": Actor, "createdAt", "updatedAt", "rev", "metadata?"
  }
}
```
Rules the shape enforces: a release never carries the site node (site settings, domains and structure are published the ordinary way); a person's approval names a staff person (`user_…`), never an agent; an `auto` approval always records when its window ends; the binding has a version prefix; instants are always stored with the zone they were entered in, wall-clock times are to the minute; lateness is whole seconds (it round-trips through serde exactly). Rules left to code: one item per node; `outcome.kind` matches a terminal `state`; `approval` present in `scheduled`; `base` absent only for a node that was not live; `remove` only for `contentEntry`, `page` and `redirect` (§6.1).

Fixtures — valid: a person's one-article schedule with the wall-clock time; an agent's draft with two items; an expiry gate awaiting approval (`on-approval`); a published release with an asset, a term and a removal; a conflict with the changed node; an `auto` release inside the elevation window; missed; expired without approval; failed with a missing dependency; canceled by an agent. Invalid: `site-node-item`, `approved-by-an-agent`, `hash-unknown-version` (`rl2:`), `empty-items`, `too-many-items` (101), `set-without-target`, `remove-with-target`, `unknown-state` (`held`), `local-time-with-seconds`, `time-zone-as-offset`, `at-without-time-zone`, `published-without-snapshot`, `lateness-fraction`, `auto-approval-without-window`, `id-wrong-prefix`, `title-with-newline`, `missing-hash`.

#### 4.3 `automation.schema.json` — `Automation`
```jsonc
{
  "required": ["schemaVersion","id","siteId","name","job","recurrence","state","consecutiveFailures","owner","createdAt","updatedAt","rev"],
  "properties": {
    "id": "^aut_[A-Za-z0-9]{6,32}$", "name": "one line, 1–120",
    "job": { "kind": "builtin", "builtin": "broken-links|stale-content|feed-check|weekly-digest|cleanup", "staleAfterDays?": 30..1095 }
         | { "kind": "agent-task", "keyId", "instructions": "plain text 1–2,000", "skill?": "slug",
             "modeCap": "plan|manual|edits|auto",            // never bypass
             "readsUntrustedText": boolean, "windowMinutes": 5..240,
             "budget": { "maxToolCalls": 1..500, "maxWrites": 0..200, "maxApprovalRequests": 0..20, "maxMinutes": 1..240 } },
    "recurrence": { "start": LocalDateTime, "timeZone": TimeZone, "rule?": AutomationRule,
                    "preset": "once|hourly|daily|weekdays|weekly|monthly|custom" },
    "state": "active|paused|auto-paused|broken|ended",
    "pausedReason?": "person|agent|failures|budget|kill-switch|key-revoked|owner-removed|role-changed",
    "consecutiveFailures": int ≥ 0, "owner": { "id": "^user_…$", "name?" }, "nextRunAt?": Timestamp, …
  }
}
```
`AutomationRule` is the RRULE value without its `RRULE:` prefix, bounded by a pattern to the subset of D3 (`^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=…|BYDAY=…|BYMONTHDAY=…|BYHOUR=…|BYMINUTE=…|COUNT=…|UNTIL=…))*$`, at most 300 characters). The "hourly" preset is `FREQ=DAILY;BYHOUR=0,…,23;BYMINUTE=m`, which keeps HOURLY, MINUTELY and SECONDLY out of the vocabulary. The parser refuses what a pattern cannot: a part given twice, COUNT with UNTIL, BYDAY ordinals outside MONTHLY, and occurrences closer than the job's minimum interval (§9.3).

Fixtures — valid: a weekly built-in broken-link sweep; an hourly comment-triage agent task that reads untrusted text; a monthly digest on the first Monday with COUNT; an auto-paused stale-content review after three failures; a one-off agent task in `plan`; a weekday feed check with UNTIL in `America/New_York`. Invalid: `mode-cap-bypass`, `rule-hourly-frequency`, `rule-secondly`, `rule-byweekno`, `rule-with-prefix`, `rule-exdate`, `owner-is-an-agent`, `window-too-long`, `budget-incomplete`, `unknown-builtin`, `agent-task-without-untrusted-flag`, `time-zone-lower-case`, `start-with-offset`, `negative-failures`, `instructions-with-bidi-override`.

#### 4.4 `schedule-run.schema.json` — `ScheduleRun`
```jsonc
{
  "required": ["schemaVersion","id","siteId","subject","occurrenceAt","state","attempt","createdAt","updatedAt","rev"],
  "properties": {
    "id": "^run_[A-Za-z0-9]{6,32}$",                       // derived from subject + occurrence (§8.5)
    "subject": { "kind": "release", "releaseId": "^rel_…$" } | { "kind": "automation", "automationId": "^aut_…$", "job": "builtin|agent-task" },
    "occurrenceAt": Timestamp,
    "state": "due|ready|running|succeeded|failed|missed|skipped|budget-exceeded|killed",
    "outcome?": "did-work|nothing-to-do|proposed|waiting-approval",   // separate from state: "ran" ≠ "achieved"
    "trigger?": "cron|alarm|request|node|manual", "attempt": int ≥ 1,
    "startedAt?", "endedAt?", "latenessSeconds?": int ≥ 0, "adjusted?": "dst-gap|tzdata",
    "window?": { "opensAt", "closesAt" }, "usage?": { "toolCalls", "writes", "approvalRequests" },
    "taint?": { "at", "tool": "^[a-z][a-z0-9_]{0,63}$" },
    "summary?": "plain text ≤ 2,000 (written by an agent: rendered as text)",
    "counts?": { "<finding>": int ≥ 0 } /* ≤ 20 */, "approvalIds?": [Id] /* ≤ 50 */,
    "error?": { "code", "message?" }, …
  }
}
```
Fixtures — valid: a release run that succeeded 41 s late; an agent task's open window; a tainted agent run that hit its tool-call budget; a coalesced (skipped) built-in occurrence; a built-in run moved by a DST gap. Invalid: `unknown-trigger` (`webhook`), `usage-negative`, `summary-bidi-override`, `taint-tool-upper-case`, `release-subject-without-id`, `attempt-zero`, `counts-fraction`, `id-wrong-prefix`, `unknown-outcome`.

#### 4.5 What is not a contract
- **Leases, watermarks, the heartbeat, purge plans, dependency lists, findings rows** (D1 columns, §5) — internal.
- **Per-site schedule settings** (kill switch, daily automation write cap): typed in `@cloudhal/schedules`, validated in the route, outside the graph so a rollback cannot un-pause a site (RFC-0006 §3.3's reasoning).
- **Calendar items** (`list_schedule`, `GET …/schedule`): a view built from releases, gates and occurrences (§12).
- **Built-in job findings** (broken links, stale entries): Studio-only JSON on the run row, at most 200 per run.

#### 4.6 What the generators showed
The branch adds the three roots to `ROOT_SCHEMAS`, the precompiled validators (`assertValid("release" | "automation" | "schedule-run", …)`), the Rust re-exports and round-trip tests. Both generators accepted the shapes as written; the lessons of RFC-0007 §5.4 were applied up front (object `$ref`s carry no sibling `description`, so json-schema-to-typescript mints no copies; arrays of unions use `maxItems` > 20 so TypeScript does not expand them into tuple unions; patterns avoid lookbehind for the Rust `regress` crate; invalid fixtures never rely on `format`, which the Rust validator treats as an annotation). Results on this branch: contract tests 382 passed; `cargo test --workspace` 19 passed; `cargo clippy --workspace --all-targets -- -D warnings` clean; `pnpm drift` clean.

### 5. Data model

#### 5.1 Migration `0017_schedules` (plain SQL, `packages/storage/migrations/0017_schedules.ts`)
The latest migration is `0016_comments`, so this is `0017`.
```sql
-- A release and its pinned items. The tick looks only at releases_due.
CREATE TABLE releases (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, title TEXT,
  state TEXT NOT NULL,                     -- §5.2
  hash TEXT NOT NULL,                      -- rl1:… (§10.4)
  when_kind TEXT,                          -- 'at' | 'on-approval' | NULL (a draft without a time)
  execute_at TEXT,                         -- UTC instant; recomputed from local_time before running (§9.1)
  time_zone TEXT, local_time TEXT,
  approval TEXT,                           -- JSON ReleaseApproval
  request_id TEXT,                         -- the waiting request in `approvals`, if any
  outcome TEXT,                            -- JSON ReleaseOutcome
  purge_plan TEXT,                         -- JSON {tags[], everything}: computed when pinned (§6.1)
  lease_token TEXT, lease_until TEXT,
  created_by TEXT NOT NULL,                -- JSON Actor
  metadata TEXT, rev INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX releases_due ON releases (execute_at) WHERE state = 'scheduled';
CREATE INDEX releases_site ON releases (site_id, state, execute_at);
CREATE TABLE release_items (
  release_id TEXT NOT NULL, site_id TEXT NOT NULL, node_id TEXT NOT NULL,
  op TEXT NOT NULL,                        -- 'set' | 'remove'
  node_kind TEXT NOT NULL,
  target_rev INTEGER, target_hash TEXT,    -- NULL for 'remove'
  base_rev INTEGER, base_hash TEXT,        -- NULL when the node was not live
  deps TEXT NOT NULL,                      -- JSON [ids] the target body references (terms, assets, parents, menu targets)
  blob_sha TEXT,                           -- an asset target's media blob: a GC root while held (RFC-0004)
  held INTEGER NOT NULL,                   -- 1 while the release is awaiting_approval | scheduled | running
  PRIMARY KEY (release_id, node_id)
);
CREATE INDEX release_items_held ON release_items (site_id, node_id) WHERE held = 1;
-- Automations and their key.
CREATE TABLE automations (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, name TEXT NOT NULL,
  job TEXT NOT NULL,                       -- JSON AutomationJob
  key_id TEXT,                             -- agent tasks: the per-automation key (§11.2)
  start_local TEXT NOT NULL, time_zone TEXT NOT NULL, rule TEXT, preset TEXT NOT NULL,
  state TEXT NOT NULL, paused_reason TEXT, consecutive_failures INTEGER NOT NULL,
  owner_id TEXT NOT NULL, owner_name TEXT,
  next_run_at TEXT,                        -- next occurrence (UTC), recomputed in the zone after each run
  cursor TEXT,                             -- built-in jobs: where a bounded job continues next tick
  lease_token TEXT, lease_until TEXT,
  metadata TEXT, rev INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX automations_due ON automations (next_run_at) WHERE state = 'active';
CREATE INDEX automations_site ON automations (site_id, state);
CREATE UNIQUE INDEX automations_key ON automations (key_id) WHERE key_id IS NOT NULL;
-- One row per occurrence: the idempotency key of every scheduled effect.
CREATE TABLE schedule_runs (
  id TEXT PRIMARY KEY,                     -- run_ + 20 base32 chars of SHA-256(subject_id ‖ "\n" ‖ occurrence_at)
  site_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL,
  occurrence_at TEXT NOT NULL,
  state TEXT NOT NULL, outcome TEXT, trigger TEXT, attempt INTEGER NOT NULL,
  lease_token TEXT, lease_until TEXT,
  window_opens TEXT, window_closes TEXT,
  started_at TEXT, ended_at TEXT, lateness_s INTEGER, adjusted TEXT,
  usage TEXT, taint TEXT, summary TEXT, counts TEXT, findings TEXT, approval_ids TEXT, error TEXT,
  rev INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (subject_id, occurrence_at)
);
CREATE INDEX schedule_runs_site ON schedule_runs (site_id, created_at);
CREATE INDEX schedule_runs_open ON schedule_runs (window_closes) WHERE state IN ('ready', 'running');
-- Watermarks for the deployment's periodic jobs (§8.2).
CREATE TABLE system_jobs (
  name TEXT PRIMARY KEY,                   -- 'analytics.rollup' | 'comments.hourly' | 'schedules.retention' | …
  next_run_at TEXT NOT NULL, last_run_at TEXT, last_ok_at TEXT,
  lease_token TEXT, lease_until TEXT, last_error TEXT
);
-- One row: is the scheduler alive, and when does it expect to wake next? (§8.7)
CREATE TABLE scheduler_heartbeat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  at TEXT NOT NULL, trigger TEXT NOT NULL, next_wake_at TEXT NOT NULL,
  ran INTEGER NOT NULL, more INTEGER NOT NULL, lag_s INTEGER
);
-- Per-site settings, outside the graph. A missing row means the defaults.
CREATE TABLE schedule_settings (
  site_id TEXT PRIMARY KEY,
  paused INTEGER NOT NULL,                 -- the site's kill switch (§11.6)
  paused_by TEXT, paused_at TEXT, paused_reason TEXT,
  daily_write_cap INTEGER NOT NULL,        -- automation mutations per UTC day (default 200)
  rev INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
-- Who did what, for whom, within which run.
ALTER TABLE audit ADD COLUMN run_id TEXT;
ALTER TABLE audit ADD COLUMN release_id TEXT;
ALTER TABLE audit ADD COLUMN automation_id TEXT;
CREATE INDEX audit_run ON audit (run_id, at) WHERE run_id IS NOT NULL;
CREATE INDEX audit_automation_day ON audit (automation_id, at) WHERE automation_id IS NOT NULL;
ALTER TABLE approvals ADD COLUMN release_id TEXT;
ALTER TABLE approvals ADD COLUMN run_id TEXT;
```
No counter columns: budget usage and daily caps are indexed `COUNT`s over audit rows (reads, no extra writes), as RFC-0007 counts its daily cap.

#### 5.2 Release states and transitions
| From → to | Who / what | Locks | Notes |
|---|---|---|---|
| (new) → `draft` | `propose_release`, Studio "New release" | none | pins current working-copy versions and the dependency closure (§6.1) |
| `draft` → `scheduled` | a person who may approve it ("Schedule") | held + locked | `approval.kind = person` with no request (their own decision) |
| `draft` → `awaiting_approval` | an agent's `schedule_release`; a person without the right (Contributor, an Author with someone else's item) | held + locked | files one approval request bound to `rl1:` and `when` |
| `draft` → `scheduled` (`auto`) | an `auto`-mode key, low-risk items, inside the window (§10.7) | held + locked | `approval.kind = auto`, `windowEnds` recorded |
| `awaiting_approval` → `scheduled` | a person approves in Studio (carry-out, §10.4) | held + locked | the request is consumed |
| `awaiting_approval` → `draft` | denied; the agent's own cancel; a person "Unschedule" | released | |
| `scheduled` → `scheduled` | a person who may approve it moves it | kept | approval kept, `executeAt` updated, audited (D4) |
| `scheduled` → `awaiting_approval` | an agent moves it; any item re-pinned (edit and re-approve) | kept | the approval is voided and a new request filed |
| `scheduled` → `running` | the tick claims it (§8.5) | kept | |
| `running` → `published` | the guarded batch committed | released | `outcome.published` |
| `running` → `conflict` | a pinned node or base changed (§6.4) | released | the diff is shown; "Re-pin and approve" or cancel |
| `running` / `scheduled` → `missed` | more than an hour late (§8.6) | released | "Publish now" (a person) |
| `scheduled` / `awaiting_approval` → `expired` | no valid approval at its time (§10.6) | released | |
| `running` → `failed` | a dependency missing, invalid snapshot, store error after retries | released | |
| any non-terminal → `canceled` | a person; an agent where its class allows (§12) | released | |

Terminal states keep the row (history, the calendar's past) and the items with `held = 0`. `published`, `conflict`, `missed`, `expired`, `failed` and `canceled` releases older than 400 days are deleted by `schedules.retention`; audit rows stay.

#### 5.3 Automation and run states
- **Automation:** `active` ⇄ `paused` (a person; its agent may pause, only a person resumes); `active` → `auto-paused` (three consecutive failures, a budget exceeded); `active` → `broken` (key revoked, owner removed, owner's role no longer holds the needed scopes); `active` → `ended` (COUNT or UNTIL reached). The site kill switch pauses every automation with `pausedReason = kill-switch` and resuming the site resumes exactly those.
- **Run:** `due` (claimed) → `running` → `succeeded` | `failed` | `budget-exceeded` | `killed`; agent tasks start at `ready` (window open) and become `missed` when the window closes without `begin_run`; older missed occurrences of a recurring job become one `skipped` row with `counts.coalesced`.

### 6. Releases

#### 6.1 Creating and pinning
1. **Items.** `propose_release`, `schedule_release` or Studio name node ids. Each item pins the node's **current working-copy version** (`rev`, `hash`); a removal pins nothing. The **base** is the node's ref in the live snapshot at that moment (absent if not live). An item whose target equals its base is refused (`nothing_to_publish`).
2. **Dependency closure.** The store adds what the targets need that is not live: assets the entries use (RFC-0004's `ridingAssets` logic), terms and their parents filed on them that are not live, a menu's newly referenced pages. Added items are listed in the result (`closureAdded`) and in Studio. It records each target's outgoing ids in `deps`, so the run can check the composed snapshot without reading bodies (§6.3).
3. **Removals** are allowed for `contentEntry`, `page` and `redirect` only. References to a removed entry or page from live menus and lists degrade exactly as references to an unpublished node do today (they are skipped). Removing terms, taxonomies, menus and assets stays an ordinary publish in v1.
4. **Bodies.** Target bodies are written to the blob store (`nodes/<hash>.json`) **now**, as `createSnapshot` does, so running the release reads no blob. On Workers Free (50 subrequests) a request writes at most 20 new bodies; larger releases are assembled over several calls (`add_items`), which Studio does for the person.
5. **Purge plan.** `planCachePurge(base → target)` is computed per item now and stored as the release's `purge_plan` (tags, or "everything"). The tags depend only on the base and target bodies, which the run checks are unchanged, so the plan is exact at T and the run reads no bodies to purge.
6. **Hash.** `hash = rl1:` + the item lines (§10.4). Every change to items re-pins and re-hashes.
7. **Limits.** At most 100 items per release (Contentful allows 200; Sanity 1,000 documents), at most 200 non-terminal releases per site, `at` between now + 1 minute and now + 366 days. A time closer than one minute is "Publish now" or `on-approval`.

#### 6.2 Holds and locks
- **Ordinary publishes keep held nodes at their live version.** `createSnapshot(…, { reason: "publish" })` composes the working copy **except** nodes held by a non-terminal release: for those it keeps the live ref (or leaves the node out when it is not live). `pendingChanges`, the publish approval prompt, `checkAutoPublish` and the Author own-only rule (`ownOnlyChangeSet`) all see the same composition, so a person approving "publish" sees exactly what goes live and never a held node. History snapshots (`agentMutation`, `manual`) still capture the whole working copy.
- **Locks.** `update_*`, `delete_*` and their REST routes refuse a held node with `409 scheduled_locked` naming the release and its time. For people, Studio offers **"Unschedule and edit"** (the item leaves the release; a one-item release becomes a draft) and, for a person who may approve the release, **"Edit and re-approve"** (the edit re-pins the item, the hash changes, and the same person's approval is recorded in the same act; others get "Edit and send for approval"). **For agents the lock is absolute**: they cancel (when their class allows) or ask a person.
- **Rollback warning.** A rollback may move a held node's live version; Studio's rollback dialog lists the scheduled releases it will turn into conflicts.
- **Overlaps.** A node in two non-terminal releases is allowed and **flagged** on both (`overlaps` in `get_release`, a warning badge in Studio). They run in time order; the second will be a conflict unless it was pinned after the first ran.

#### 6.3 Applying a release at time T
`publishRelease(releaseId, now, runId, leaseToken)` in `SiteGraphStore` (core-ts), called by the scheduler (§8) or by a person's "Publish now". Reads first; then one guarded batch.

**Reads (no writes).**
1. The release and its items; the site row (`rev`, `hash`, body with `publishedSnapshotId = L`); the live snapshot `L` (one row: its node refs). Four queries.
2. **Gates of the run** (§8.6 and §10.6): lateness ≤ 3,600 s, the approval still valid, the site not paused, `hash` recomputed from the items equals the stored and approved hash. A failure ends here with `missed`, `expired` or a paused wait.
3. **Conflicts.** For each item: the node's ref in `L` must equal `base` (both absent counts as equal). Any mismatch → `conflict` with every mismatched node; nothing is written but the outcome.
4. **Compose.** `nodes(S) = nodes(L) − {item ids} + {set targets}`, sorted by id. The site ref stays `L`'s.
5. **Dependencies.** Every id in the targets' `deps` must be in `nodes(S)` with a compatible kind; otherwise `failed: dependency_missing` naming the first missing id.
6. **Snapshot S.** `reason: "scheduled"`, label = the release title or "Scheduled: <entry title>", `actor = { kind: "system", id: "sys_scheduler", name: "Scheduler" }`, `parentId` = the site's latest snapshot (history stays linear, so `L` remains an ancestor and rollbacks keep working), `summary` = the diff `L → S`, `metadata = { cloudhal.release, cloudhal.releaseHash, cloudhal.run, cloudhal.base: L, cloudhal.approvedBy }`; `assertValid("snapshot", S)`. The new site body points at S, `rev + 1`, a new `hash'`.

**Write: one `batch()`** (AGENTS.md rule 4: every later statement is guarded on the new site hash, never on `rev + 1`).
1. `UPDATE nodes SET body = :site, rev = rev + 1, hash = :hash', updated_at = :now WHERE id = :siteId AND rev = :rev AND hash = :hash AND EXISTS (SELECT 1 FROM schedule_runs WHERE id = :run AND lease_token = :token)` — the pointer flip, CAS on the site and on our lease.
2. `INSERT INTO snapshots (…) SELECT … WHERE EXISTS (SELECT 1 FROM nodes WHERE id = :siteId AND hash = :hash')`.
3. `INSERT OR IGNORE INTO snapshot_blobs (snapshot_id, site_id, sha256) SELECT :S, site_id, sha256 FROM snapshot_blobs WHERE snapshot_id = :L AND EXISTS (…hash'…)` — the GC roots of the live assets carried over (a replaced asset's blob stays rooted until S is collected; over-retention is safe).
4. `INSERT OR IGNORE INTO snapshot_blobs … FROM json_each(:releaseBlobShas) WHERE EXISTS (…hash'…)`.
5. `UPDATE releases SET state = 'published', outcome = :o, lease_token = NULL, rev = rev + 1, updated_at = :now WHERE id = :r AND lease_token = :token AND EXISTS (…hash'…)`.
6. `UPDATE release_items SET held = 0 WHERE release_id = :r AND EXISTS (…hash'…)`.
7. `UPDATE schedule_runs SET state = 'succeeded', outcome = 'did-work', ended_at = :now, lateness_s = :late, rev = rev + 1 WHERE id = :run AND lease_token = :token AND EXISTS (…hash'…)`.
8. `INSERT INTO audit (…) SELECT … WHERE EXISTS (…hash'…)` — `release.publish`, actor the scheduler, `onBehalfOf` the approver, `requestedBy` the creator, `release_id`, `run_id`, the hash and the snapshot.

Eight statements (notifications are derived, nothing is stored for them) — far inside the 50-query budget however statements count (L7). If statement 1 changed no row, the site moved between the reads and the write (an ordinary publish, a settings edit, a rollback): the run re-reads and repeats steps 3–6 once; a second miss leaves the release `running` under its lease for the next tick.

**After the batch** (outside it, never undoing it): the stored purge plan is sent through the site Worker's `/__cloudhal/purge` over the `SITE` binding, as an ordinary publish does (≤ 3 tag requests, else one "purge everything"), recorded in `cache_purge_log` with source `schedules`. It is a publish, so it may use the budget like one; when the bucket is empty (`success: false`) the tags go into the existing purge queue (RFC-0007 §8.4; the queue and its flusher are tag-generic) and the outcome records `purge: "deferred"`. Then the derived notifications show "Published" (§14).

**Recovery.** A run whose lease expired while `running` is reclaimed by the next tick, which first checks whether the effect already happened (a snapshot whose `metadata["cloudhal.run"]` is the run id, or the site already pointing at it): if so it records `published` and stops; otherwise it repeats the run, still within the hour.

#### 6.4 Conflicts
A conflict means someone published or rolled back one of the release's nodes after it was pinned. The release is **held**, nothing is published, and Studio shows a three-way view per node: the pinned base, the version now live, and the pinned target (the snapshot diff dialog, DESIGN §2i, with a third column). The person may **re-pin** (take the current working copy, which shows the live changes), **re-base** (keep the target, accept the new live version as base — only when the target already contains the live change, which the dialog checks by hash), or cancel. Either path changes the hash and needs an approval again. v1 never merges automatically; field-level merging (Storyblok's Release Merging) is a later improvement.

#### 6.5 Order
Per site, releases run **one at a time in `execute_at` order** (ties by id); a claim succeeds only when no other release of the site is `running` under a live lease. Studio warns when two releases share a minute ("2 releases at 09:00"), as Sanity's random order within a minute and Contentful's per-minute limit both show the risk.

#### 6.6 Undo and history
A published release is a snapshot with reason `scheduled` in the ordinary history: Snapshots, Activity and diffs show it, and "Undo" on the release is the ordinary rollback to its base (an ancestor), with the ordinary approval. Releases published after it are listed in the rollback dialog because a rollback reverts them too.

### 7. Time gates in the renderer

#### 7.1 One helper, one clock
```ts
// @cloudhal/core-ts/availability — Worker-safe, no dependencies; one function used everywhere.
export function isAvailable(node: { status: PublishStatus; availability?: Availability }, now: number): boolean {
  if (node.status !== "published") return false;
  const a = node.availability;
  return (!a?.from || Date.parse(a.from) <= now) && (!a?.until || now < Date.parse(a.until));
}
export function gateState(node, now): "open" | "embargoed" | "expired";
export function nextGate(nodes: Iterable<…>, now: number): number | undefined;   // the next instant any gate changes
```
The renderer takes `now = Date.now()` once per request (an injected clock in tests) and never uses `Temporal.Now` (§9.4). Gates compare instants only; the site Worker needs no time-zone code.

#### 7.2 Every public path
`isAvailable` replaces the bare `status === "published"` checks in the published source and its consumers: page and entry routes (`source.ts` `visible`), lists and `ContentList` sections, term archives and their counts (`archive.ts`'s `minEntriesToIndex` counts available entries only), related entries (`taxonomy.ts`), navigation and menus (`navigation.ts`; an `EntryMenuItem` or `PageMenuItem` to a gated target is skipped), RSS (`feeds.ts`), `sitemap.xml` and `robots.txt`, JSON-LD and Open Graph (`seo.ts`, `SeoHead.astro`: only rendered nodes have any), `GraphSource.entryById` (the comments endpoint answers `404` for a gated entry, and a thread on an expired entry is closed), the analytics resolver (a beacon for a gated path resolves to nothing), and the media route: **an asset whose every live referrer is embargoed inherits the earliest `from`** of its referrers (computed with the gate index), so an embargoed article's cover image is not served early. A gated page or entry answers `404` with `no-store` (`cacheOnlySuccess` already refuses to cache it), exactly like an unpublished one; after `until` it is `404` too (a `410` option is an open question).

**Route sweep test** (the leak guard, rollout step 4). A fixture site with entries and pages embargoed in the future, expired in the past, gated exactly at "now", and an asset riding only with an embargoed entry. The test renders **every route the blog starter serves** — pages, entries, term archives and their feeds, `rss.xml`, `sitemap.xml`, `robots.txt`, media URLs, the 404 page, the comments endpoints, analytics beacons — at three clocks (just before, at, just after each gate) in `astro-renderer` and again on workerd (`createTestHarness`), and asserts that no gated id, slug, path, title, summary or asset URL appears in any public body or header, and that previews show them. A new route that forgets the helper fails this test.

#### 7.3 Previews, Studio and agents
- **Previews** show gated content (they ignore gates, like drafts) with a notice the preview rewriter injects: "Embargoed until 2 November 2026, 09:00 (Istanbul)" or "Expired on …". Preview tokens are `no-store` and never cached, so nothing leaks through the edge cache.
- **Studio and MCP** read gates as content: `get_entry`/`list_entries` return `availability`, and views add `gate: { state, from?, until? }`. Agents with `content:read` see embargoed content as they see drafts today; scheduled runs have no egress tools (§11.4).

#### 7.4 Cache lifetime capped at the next gate
- **The gate index.** For a live snapshot, the sorted list of every future `from`/`until` instant (pages, entries and inherited asset gates). A snapshot is immutable, so the index is computed once per isolate per snapshot, next to the snapshot source's existing memo.
- **Every published `200`** gets `Cloudflare-CDN-Cache-Control: public, max-age = min(31536000, ceil((nextGate − now) / 1 s))`, at least 1 s. The cap is **site-wide**, because any page may list any entry; at a gate the whole cache expires once and pages re-render on their next miss. Media keep their own headers, except gated assets (`404` before `from`).
- **No purge is spent on gates.** This depends on L4. If Workers Cache does not honour short `max-age` values, the fallback is that the scheduler enqueues the gated nodes' tags (`cloudhal-node-…`, `cloudhal-list-<site>`) into the purge queue at each gate instant — inside the shared budget, at normal priority — and the cap stays as a second line.
- **Browsers** already revalidate (`Cache-Control: public, max-age=0, must-revalidate`).

#### 7.5 Dates
When an entry with `availability.from` is first published, `publishedAt` is set to `from`, not to the publish instant, so the article's date, its feed item and its sitemap entry show the embargo time. No automation ever moves `publishedAt` afterwards (non-goal "evergreen republish").

#### 7.6 How gates reach the live site
A gate is a field, so it goes live when its node does — by an ordinary publish or a release:
- **Embargo** (`set_embargo`, Studio "Visible from…"): sets `from` on the working copy. A node that is not live yet carries the gate into whatever publishes it, so an early ordinary publish cannot break the embargo. A node already live and visible is hidden by publishing a **gate-only change** (the working copy differs from live only in `availability`): a one-item `on-approval` release that, because it can only reduce visibility, needs no person in `edits` mode (§12).
- **Expiry** (`schedule_unpublish`, Studio "Hide after…"): sets `until` and publishes it the same way, as a one-item `on-approval` release. Expiry removes content, so it waits for a person (§12). The expiry then happens at `until` on its own, scheduler or not.
- **Lifting an embargo** early is a person's act (D8).
A node with other unpublished edits cannot carry a gate-only change; Studio says so and offers to include the edits (the person then sees the full diff) or to wait.

#### 7.7 Compatibility guard
An older site Worker ignores `availability` and would show embargoed content. Therefore **writers refuse `availability`** (REST, MCP, store; `409 gates_unsupported`) until the site Worker confirms it enforces gates: `GET /__cloudhal/features` (authenticated with the purge token over the `SITE` binding) answers `{ "gates": 1 }`, memoised per admin isolate. Locally and on Node the renderer and the writer are one process. The reverse direction is safe already: an older admin Worker's contract validation refuses the unknown field (`additionalProperties: false`), so a newer CLI cannot push gated content into an older deployment.

### 8. Scheduler

#### 8.1 One interface, many tickers
```ts
// @cloudhal/schedules (Worker-safe: no Node-only imports, AGENTS.md rule 5)
export interface Scheduler {
  /** Runs what is due within a budget. Idempotent: two concurrent calls never double an effect. */
  runDue(now: Date, budget: TickBudget, trigger: TickTrigger): Promise<TickReport>;
  /** The next instant anything is due (releases, occurrences, window closes, system jobs). */
  nextWakeAt(now: Date): Promise<Date | undefined>;
}
export type TickTrigger = "cron" | "alarm" | "request" | "node" | "manual";
export interface TickBudget { maxQueries: number; maxReleases: number; deadlineMs: number }
export interface TickReport { ran: number; late: number; failed: number; more: boolean; nextWakeAt?: string }
```
D1 (SQLite on Node) is the only state; cron, the alarm and timers only wake `runDue`. A tick does, in order: (1) heartbeat check; (2) due releases, one at a time; (3) due automation occurrences (built-in steps; agent-task window bookkeeping); (4) due system jobs; (5) heartbeat write. A `TickBudget` wraps the `SqlDriver` and counts statements, so a tick stops cleanly before the platform's limit and reports `more`.

#### 8.2 Cloudflare: every-minute cron (default)
- `HOURLY_CRON = "17 * * * *"` becomes `MINUTE_CRON = "* * * * *"` in `packages/cli/src/cloudflare/config.ts` — the same single trigger, no new slot (L2).
- **Hourly jobs move behind watermarks.** `system_jobs` rows (`analytics.rollup`, `comments.hourly`, later `schedules.retention` daily) carry `next_run_at`; a tick claims a due job with the same lease pattern (§8.5), runs today's code unchanged (`analytics.rollup`, `runCommentsHourly`, the purge backstop), and moves the watermark to the next `:17`. A missed hour is caught up by the next tick (today's "bounded, idempotent" contract).
- **Budgets per tick.** Free: `maxQueries` 40 (of 50), `maxReleases` 1, deadline 8 s; system jobs run only when a release left room, otherwise next minute. Paid: `maxQueries` 900, `maxReleases` 50, deadline 12 minutes (under the 15-minute wall clock). An idle tick costs three indexed reads (due releases, due automations, due jobs) and, every fifth minute, one heartbeat write.
- `controller.scheduledTime` is the tick's `now`; tests drive it with `/cdn-cgi/local/scheduled?time=…` through `createTestHarness`.

#### 8.3 Cloudflare: the Durable Object clock (no cron slot)
- The admin Worker always declares one SQLite-backed Durable Object class, `SchedulerClock` (`durable_objects.bindings: [{ name: "SCHEDULER_CLOCK", class_name: "SchedulerClock" }]`, `migrations: [{ tag: "v1", new_sqlite_classes: ["SchedulerClock"] }]`), so switching tickers later needs no migration. With a cron slot it is never woken and costs nothing.
- When Cloudflare refuses the trigger (`isCronLimitError`), `cloudhal deploy` redeploys without it and sets `CLOUDHAL_SCHEDULER = "alarm"`. This **replaces** `CLOUDHAL_ANALYTICS_CRON=off` and `CLOUDHAL_COMMENTS_CRON=off` and the "run the comments job after admin requests" path (RFC-0007 implementation notes, step 10): analytics roll up on schedule again instead of on read.
- **The clock holds no state.** `alarm()` calls `runDue(…, "alarm")`, catches every error (a thrown alarm is retried only six times, from 2 s; the documentation recommends catching and re-arming), and always re-arms at `min(nextWakeAt, now + 1 h)`; with `more`, at `now + 1 s`, which gives each continuation a fresh invocation and a fresh query budget. One `env.SCHEDULER_CLOCK.getByName("clock")`.
- **Pokes.** Creating, approving or moving a release or an automation calls `clock.poke(at)`, which moves the alarm earlier when `at` is sooner. Cron mode ignores pokes.

#### 8.4 Node (`cloudhal dev`, `cloudhal studio`, `cloudhal mcp`, self-host)
- The same `runDue` on a `setTimeout` to `min(nextWakeAt − now, 60 s)`, re-armed after each tick and on every poke, timer `unref`'d. It replaces `startLocalCommentsJob`'s hourly interval.
- **Catch-up on start**: the first tick runs immediately, so releases and occurrences missed while the process was down follow §8.6 (within the hour: run; later: `missed`).
- Several processes on one SQLite file are safe because every effect is claimed with a lease.
- Self-hosters without a long-running process can call `cloudhal schedules run-due` from the system's cron every minute.

#### 8.5 Claims, leases and exactly-once effects
Delivery is at least once on every ticker (cron, alarms and timers alike); the **effect** happens once:
- **The occurrence key.** A run's id is `run_` + 20 base32 characters of SHA-256(`subject_id` ‖ "\n" ‖ `occurrence_at`). Every tick that reaches the same occurrence computes the same id.
- **Claim (one batch).** `INSERT OR IGNORE INTO schedule_runs (id, …, state = 'due', lease_token = :t, lease_until = :now + 10 min)` then `UPDATE releases SET state = 'running', lease_token = :t, lease_until = :until, rev = rev + 1 WHERE id = :r AND rev = :rev AND state = 'scheduled' AND execute_at = :at AND NOT EXISTS (SELECT 1 FROM releases WHERE site_id = :s AND state = 'running' AND lease_until > :now)`. The claim is ours only when the second statement changed one row; otherwise another tick has it.
- **Effect** guarded on the lease token and the site CAS (§6.3). **Rescheduling and canceling** are one `UPDATE … WHERE id = ? AND rev = ? AND state IN (…)`; a `running` release cannot be canceled (409 — the person waits seconds for the outcome). This avoids Ghost's documented race where an unschedule and a schedule arrive in the wrong order and the post never publishes.

#### 8.6 Missed runs (owner decision 2)
| Subject | Rule |
|---|---|
| Time gates | No policy needed: the renderer applies them per request. |
| Release | Runs late **at most once, only while `now − execute_at ≤ 1 h`** (transient errors retry with back-off — 30 s, 1, 2, 5, 10 min — inside the same hour). Later → `missed`, a notification and **"Publish now"** for a person (a manual run: the conflict check and the person's rights apply, the snapshot records the real time). Nothing is ever published silently hours late. |
| Release while the site is paused | Not claimed. If the site resumes within the hour, it runs; otherwise `missed`. |
| Built-in job | Only the **latest** missed occurrence runs; earlier ones become one `skipped` row (`counts.coalesced = n`). |
| Agent task | Windows are **computed from the recurrence**, not opened by the tick: `begin_run` is accepted whenever now falls inside `[occurrence, occurrence + windowMinutes]`, scheduler or not. The tick only closes windows that passed without `begin_run` (`missed`); after downtime only the latest window is recorded. |
| System jobs | Watermarks with bounded catch-up (today's contract). |
| **Request backstop** (every mode) | Every admin request reads the heartbeat (memoised 60 s per isolate); if it is more than 2 minutes behind `next_wake_at`, the request runs `runDue(…, "request")` in `waitUntil` (at most once a minute per isolate). This also covers the up-to-15-minutes cron propagation after a deploy (L9). It is a safety net, never the scheduler: cached page views never run the Worker, so site traffic cannot be a ticker (the WordPress lesson). |

#### 8.7 Heartbeat and "scheduler stalled"
Each tick that did work, and otherwise every fifth minute, upserts the one `scheduler_heartbeat` row with `at`, `trigger`, `next_wake_at` (the next minute with cron; the alarm time with the clock) and the lag of the oldest due item. **Stalled** = `now > next_wake_at + 2 min` while something is due within 24 h, or `now > next_wake_at + 10 min` at all. Then `scheduler-stalled` appears in the bell for Administrators and for everyone with a release due within 24 h, Studio's Schedules page shows an alert banner, and `/api/scheduler` reports `healthy: false`. On Node, a stopped process shows the same state the next time Studio opens. Each tick also writes one log line (`schedules tick (cron): 1 release, 0 late, 2 jobs; next 06:07Z`), as the analytics rollup does.

#### 8.8 Errors
| Class | Example | Behaviour |
|---|---|---|
| Transient | D1 error, CPU exceeded, timeout | The run stays claimed; retry with back-off inside the hour; then `missed`. |
| Permanent | Conflict, dependency missing, invalid snapshot, lost approval | Terminal state at once, notification, no retry. |
| Side effect | Purge failed or budget empty | The publish **stands**; tags go to the purge queue; `purge` is `deferred` or `failed`; the flusher's own retries and "Purge the whole site cache" apply. |
| Alarm handler | Anything | Caught, recorded, the alarm re-armed — never thrown. |

### 9. Time model and recurrence

#### 9.1 Instants and wall-clock times
| Input | Stored as | Why |
|---|---|---|
| A person picks "2 November, 09:00" in Studio | `localTime = 2026-11-02T09:00`, `timeZone = Europe/Istanbul`, plus the computed `at` | The intent is "09:00 in Istanbul". Governments change rules (Türkiye moved to permanent UTC+3 in 2016); the instant is recomputed before running. |
| An agent or API sends `2026-11-02T06:00:00Z` | `at`, with the site zone for display | A machine's intent is an absolute instant. |
| A recurring automation | `start` (wall clock) + `timeZone` + `rule` | "Mondays 09:07" must stay 09:07 across DST changes (a week across the autumn change is 169 hours in Berlin). |
- **Never early.** Before a release with `localTime` runs, `at` is recomputed with the runtime's current tzdata. If the new instant is later, the release is rescheduled to it (`adjusted: "tzdata"`, audited); it is never run before its wall-clock time. workerd's ICU and Node's ICU may differ by a tzdata release; this rule makes the difference harmless.
- **Display.** Studio shows times in the **site's zone** and, when the viewer's zone differs, both ("09:00 Istanbul · 08:00 your time, Berlin") with a "Show in my time" switch. Readers' dates are rendered by the theme in the site zone.

#### 9.2 DST (D2)
Resolution uses `disambiguation: "compatible"`: in a spring-forward gap, 02:30 in Berlin on 29 March becomes 03:30 (+02:00); in the autumn overlap, 02:30 on 25 October is the first 02:30 (+02:00). This is RFC 5545's rule for a single DATE-TIME (§3.3.5). For recurrences RFC 5545 §3.3.10 says occurrences in a gap must be ignored, and libraries such as `croner` and `rrule-temporal` skip them; **Cloudhal moves them forward instead**, because a weekly digest that silently disappears once a year is worse than one that comes an hour late. The run records `adjusted: "dst-gap"`. Studio hints when someone picks a local time between 00:00 and 04:00 in a zone with DST.

#### 9.3 RRULE subset and presets (D3)
- **Accepted:** FREQ DAILY, WEEKLY, MONTHLY; INTERVAL (1–999); BYDAY (ordinals such as `2TU` and `-1FR` only with MONTHLY); BYMONTHDAY (1–31, −1); BYHOUR; BYMINUTE (up to four values); COUNT or UNTIL; week start fixed to Monday.
- **Refused:** SECONDLY, MINUTELY, HOURLY, BYSECOND, BYWEEKNO, BYYEARDAY, BYSETPOS, BYMONTH, YEARLY, RDATE, EXDATE ("skip the next one" is a run state). RFC 7529 (RSCALE, SKIP) is out of scope; "last day of the month" is `BYMONTHDAY=-1`.
- **Presets** (Studio and MCP): *once* (no rule), *hourly* (`FREQ=DAILY;BYHOUR=0,…,23;BYMINUTE=m`), *daily*, *weekdays* (`FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`), *weekly*, *monthly*; *custom* opens the editor.
- **Minimum interval:** built-in jobs 1 hour; agent tasks 1 hour; at most 24 occurrences a day.
- **Expander:** our own, about 200 lines in `@cloudhal/schedules/recurrence`: it expands in floating local time and resolves each `PlainDateTime` with the zone (§9.2). `rrule-temporal` (MIT) is a **test oracle** in property tests, with the documented DST difference excluded. `rrule` (unmaintained since 2023, `Date`-based) is not used. The Rust mirror comes with the Rust executor (later).

#### 9.4 Library and clock rules
- **`temporal-polyfill/implementation`**, pinned exactly, is the only Temporal entry point: it never uses a native `Temporal`. Neither workerd at the pinned compatibility date nor Node 24 has native Temporal; a reported 2026-08 incident in which a runtime briefly exposed a global `Temporal` whose `Now` returned 1970 shows why "use native if present" is unsafe **[secondary]**. A Biome `noRestrictedImports` rule refuses `temporal-polyfill` and `temporal-polyfill/global`, and a test refuses `Temporal.Now` anywhere in the repository.
- **`now` is always injected** (`Date.now()` at the edge of the system, as `AuthOptions.now` does); tests run DST, tzdata and lateness cases with a fake clock.
- The polyfill runs in the admin Worker and on Node only. The **site Worker** compares instants (`Date.parse`) and needs none. **Studio** uses `@date-fns/tz`, which Kumo already brings, for display and input, and asks the server for "next runs" (`POST …/automations/preview-rule`), so recurrence has one implementation and Studio's bundle grows by nothing.

#### 9.5 Granularity, lead time, horizon, jitter
Minutes (seconds are dropped); a release runs at or after its minute, normally within the minute plus the cron delay (L1). Lead time ≥ 1 minute, horizon ≤ 366 days (releases), ≤ 30 days for a request an agent files (§10.5). Releases get **no jitter** (an embargo time is exact). Built-in jobs created from presets get a deterministic minute offset (`hash(automationId) mod 10`), and Studio suggests a minute such as :07 for agent tasks, so many sites do not all wake at :00.

### 10. Approvals and policy

#### 10.1 Scopes
```diff
 // packages/agent-runtime/src/policy.ts
 export type Scope = …
+  | "schedules:read"                              // calendar, releases, automations, runs
+  | "schedules:write" | "schedules:write:own"     // create and change releases, gates; own = only one's own nodes
+  | "releases:publish" | "releases:publish:own"   // approve releases; auto-mode releases without a person
+  | "automations:manage"                          // people only: create, edit, resume, run, delete automations
 export const KEY_SCOPES = [ …, "schedules:read", "schedules:write", "schedules:write:own",
+  "releases:publish", "releases:publish:own" ];
 export const PERSON_SCOPES = [ …, "automations:manage" ];
 const IMPLIES = { …,
+  "schedules:write": ["schedules:write:own"],
+  "site:publish": ["site:publish:own", "releases:publish"],      // publishing later is no more power than publishing now
+  "site:publish:own": ["releases:publish:own"],
+  "releases:publish": ["releases:publish:own"],
 };
 const OWN_VARIANTS = { …,
+  "schedules:write": [{ scope: "schedules:write:own", level: "own" }],
+  "releases:publish": [{ scope: "releases:publish:own", level: "own" }],
 };
 // OwnLimit gains { level: "own"; target: "release" }: every item must be the person's own node
 // (author is the person or one of their agents, RFC-0005 §9), checked with ownOnlyChangeSet.
```
- `releases:publish` is implied by `site:publish` so no role or existing key changes meaning; it exists on its own so an owner can give a key "schedule, never publish now".
- **New keys** get `schedules:read` by default in every mode (like `analytics:read`, `comments:read`); the `manual`, `edits` and `auto` prefills add `schedules:write`. **Existing keys are not widened**; Studio offers "Allow schedules" (`ADDABLE_KEY_SCOPES` gains `schedules:read`).
- `ABILITIES`: `schedules.read`, `schedules.write` (own), `schedules.writeAny`, `releases.approve` (own), `releases.approveAny`, `automations.manage`, `schedules.settings` → `site:settings`.

#### 10.2 Roles
| Role | `schedules:read` | `schedules:write` | `releases:publish` | `automations:manage` | Kill switch, daily cap (`site:settings`) |
|---|---|---|---|---|---|
| Owner, Administrator | ✓ | all | all | ✓ | ✓ |
| Editor | ✓ | all | all | ✓ | — |
| Author | ✓ | own | own | — | — |
| Contributor | ✓ | own (draft releases and requests) | — | — | — |

Editors manage automations because an automation's key is narrowed to its owner's role on every call (ADR-0018), so an Editor's automation can never exceed an Editor.

#### 10.3 Call classes: a new `publish` class
RFC-0007 introduced per-argument classes (`read`, `advisory`, `reduce`, `person`). `person` waits in every mode including `bypass`, which is right for "only a person breaks an embargo" but not for scheduled publishing, which must follow the publish rules of ADR-0015. One class is added:

| Class | Meaning | `plan` | `manual` | `edits` | `auto` | `bypass` (local) |
|---|---|---|---|---|---|---|
| `read` | changes nothing | ✓ | ✓ | ✓ | ✓ | ✓ |
| `advisory` | leaves notes or proposals people read before deciding | ✗ | ✓ | ✓ | ✓ | ✓ |
| `reduce` | reversible; can only make content less visible or make work wait | ✗ | waits | ✓ | ✓ | ✓ |
| **`publish`** | makes content public, or removes it, at a time | ✗ | waits | waits | **low-risk inside the window: ✓**; else waits | ✓ |
| `person` | a person decides, always | ✗ | waits | waits | waits | waits |

`publish` decisions carry `autoApprove: "low-risk-release"` in `auto` mode; the server then applies `checkAutoPublish` to the release's items (articles only, nothing removed, at most 20 changes, riding assets allowed) and the window rule (§10.7).

#### 10.4 The `rl1:` binding and carry-out
```
rl1 = "rl1:" + hex(SHA-256(lines.join("\n")))
lines = ["site <siteId>"] + for each item, sorted by node id:
        "<set|remove> <nodeId> <nodeKind> <targetRev>:<targetHash>|- <baseRev>:<baseHash>|-"
```
- `ToolDefinition.bindState` (RFC-0007) returns the release's `rl1:` for `schedule_release`, `lift_embargo`, `schedule_unpublish` and the `publish`-class variants of `reschedule` and `cancel_schedule`; the request's `args_hash` covers `{ releaseId, when }`. The approvals table stores the binding in `state_hash` and the release id in `release_id` (no other change).
- **Carry-out, not redemption.** These tools have `carryOutOnApproval`: approving in Studio recomputes the binding **as the approver**, compares it and the release's current `when` with the request's, and on a match moves the release to `scheduled` with `approval = { kind: "person", by, at, executeAt, approvalId }`. A mismatch denies the request (`409 state_changed`, "the release changed after the agent asked"). The agent never repeats the call and never polls: `get_release` or the next run tells it the outcome. A binding that cannot be computed fails closed (RFC-0007 review item 3).
- **The time is not in the hash** (D4): a person who may approve the release may move it and keep the approval (audited `release.reschedule` with old and new times, `by` the person). An agent's move voids the approval and files a new request; any item change re-pins and voids it.
- Single use, one waiting request per identical call (ADR-0014 addendum) and "only someone who could make the call now decides" (ADR-0018) apply unchanged; nobody approves a release they requested themselves as a person.

#### 10.5 How long requests and approvals live
- A request filed for a release stays open **until the release's time** (not ADR-0014's 24 h), because "approve by Monday 09:00" is the natural deadline; at that time an undecided request expires and the release becomes `expired` (D5). Agents may file requests only for releases at most **30 days** ahead (`too_far_for_request`); further out they propose a draft and a person schedules it.
- An **approved** release stays approved until it runs, however far ahead — it is locked and bound to `rl1:`. Whether very distant releases should be re-confirmed a day before is an open question.

#### 10.6 Re-checks when a release runs
| Situation at T | Result |
|---|---|
| The approver is still a member and could approve it now (`releases:publish`, or `:own` with own-only items) | Runs. Audit actor `system:sys_scheduler`, `onBehalfOf` the approver. |
| The approver lost the right or left | `expired` (`approval_lost`); Editors are notified with "Approve and publish now". |
| The requesting key was revoked or its creator left, but a person approved | Runs (a person approved exactly this); the notification mentions it. |
| An `auto` release: the key is revoked, its creator left, its effective mode is no longer `auto`, or `now > windowEnds` | `expired` (`creator_removed` / `auto_window_ended`). |
| The site or a node no longer exists | `canceled` by the system, audited (a Ghost-style no-op). |
| The site's kill switch is on | Waits; §8.6. |

#### 10.7 Modes and elevation (D9)
- In `auto` mode a low-risk release may be scheduled without a person only if it runs **before the end of the key's elevation** (when `auto` comes from an elevation) **and within 24 hours** of scheduling. `windowEnds` is stored; otherwise the call waits for a person. One hour of elevation therefore cannot pre-approve next month's publishing — ADR-0016's "autonomy lasts exactly as long as it is needed", carried over to time.
- The mode is computed per call as today; ADR-0016's decision against a mode-reverting job stands (this RFC adds a scheduler, not a clock-dependent mode).
- `request_elevation` is refused inside a run (code `run`); an automation's autonomy is fixed in advance by its `modeCap`.
- `bypass` never applies to scheduled execution or runs: the server executes releases as the scheduler on behalf of a person or an `auto` window, and automation keys are remote keys.

#### 10.8 Embargo override (D8)
Moving `from` earlier or removing it is `lift_embargo`: class `person` for agents; in Studio, Editor and above (`schedules:write` and `releases:publish` on the node), with a required reason, an alert dialog naming the embargo time, and an audit row `schedule.embargo.lift` carrying the reason.

### 11. Automations

#### 11.1 Built-in jobs (deterministic, owner decision 4)
| Job | What it reads | Output | Never |
|---|---|---|---|
| `broken-links` | internal links in live entries, pages and menus resolved against live routes; the top 404 paths from analytics (`broken_links`) | findings; **redirect proposals** a person turns into redirects with one click (RFC-0002) | creates redirects or edits content |
| `stale-content` | live entries not updated for `staleAfterDays` (default 365) | a review list; `counts.stale-entries`; a notification | edits |
| `feed-check` | the rendered RSS, sitemap and JSON-LD at "now" | findings: future `datePublished`, missing titles or images, assets not live, **and a self-check that no gated node appears** (the gate helper verified in production) | changes anything |
| `weekly-digest` | analytics top content, comments counts, the week's release outcomes, stale counts | a templated `automation-digest` notification in Studio (no LLM; email when a mail sender exists) | sends anything outside Studio |
| `cleanup` | runs older than 90 days, terminal releases older than 400 days, drafts untouched for 90 days, unused assets (RFC-0004 retire proposals) | deletions of the first two; reminders and proposals for the rest | deletes content |

Each runs in bounded steps (`cursor` on the automation row; at most 200 nodes or 20 queries per tick on Free), so a large site's sweep spans several ticks. Analytics are read through `@cloudhal/analytics`' reader, preferring the D1 rollups: a digest or a 404 sweep issues at most one or two live Analytics Engine queries, in the shapes already pinned against the live SQL dialect (RFC-0006 implementation notes), counted against the deployment's daily analytics query budget. Built-ins run as the system actor on behalf of the owner and touch no content, so they need no mode.

#### 11.2 Scheduled agent tasks
- **The key.** Creating an agent-task automation (people only, Studio) mints a **per-automation key** owned by the creator: a Better Auth API key with metadata `{ automationId, purpose: "automation" }`, scopes chosen within the creator's role (refused above it) and narrowed to the creator's current role on every call (ADR-0018). The secret is shown once, for configuring the external agent (a Claude Code routine, a GitHub Agentic Workflow, an n8n flow — §11.9). One key, one automation (`automations_key` is unique).
- **Valid only inside an open run.** Outside an open run window, the key answers `401 outside_run` for every tool except `begin_run` and `get_mode`. A leaked key is useless between occurrences — the difference from ordinary keys.
- **`begin_run { automationId }`** succeeds when now is inside an occurrence's window and that occurrence has no run yet (`INSERT OR IGNORE` on the deterministic run id: one run per occurrence). It returns the **run envelope**: `runId`, the owner's instructions, the effective mode (`min(the key's effective mode, modeCap)`), the tools available, the budget, `endsAt = min(window end, start + maxMinutes)`, and the rules (no waiting, the taint rule). The server attaches the open run to every later call of the key; `_meta["cloudhal.run"]` is optional.
- **`end_run { runId, summary, outcome }`** closes it (`succeeded`); a run still open at `endsAt` is closed as `failed` (`not_ended`).
- **Runs never wait (owner decision 4).** A call that needs a person files the approval (with `run_id`) and returns at once; for releases the server carries the approval out at T (§10.4), so nobody polls. The run's `outcome` becomes `waiting-approval` or `proposed`.

#### 11.3 Run modes
- `plan`: reads only; it reports through `end_run`'s summary and findings (proposals need `manual` or more, D6).
- `manual`: proposals (`propose_release`, labels) are free; every other write waits for a person.
- `edits` (the default cap): drafts and reductions are free; publishing, expiry and removal wait.
- `auto`: as `edits`, plus low-risk releases inside the window (§10.7) — never while tainted.

#### 11.4 The taint rule (D10)
Unattended runs combine private data (embargoed drafts), untrusted text and outward channels — Willison's "lethal trifecta". Defences, enforced by the server and never by the model's judgement:
1. **Taint per run.** Tools that return visitor-supplied text taint the run when called: `list_comments`, `get_comment_thread` (reader text), `broken_links` (404 paths), `get_analytics` and `top_content` (referrer hosts, UTM values), and `fetch_asset_url` (fetched content). From then on the run may call only `read`-class tools, `label_comments` and `reduce`-class tools; everything else answers `tainted`. The run records `taint = { at, tool }`.
2. **No egress in runs.** `fetch_asset_url` is unavailable inside runs in v1.
3. **Declared input profile.** An automation with `readsUntrustedText: true` cannot hold `content:write`, `site:publish`, `schedules:write`, `releases:publish` or `asset:*` (refused when created and stripped on every call); its useful scopes are reads plus `comments:moderate` (label, hide). A writer automation and a triage automation are two automations — the "dual LLM" separation at product level.
4. **Writes are proposals.** Unattended runs publish nothing directly except `auto`-mode low-risk releases while untainted.
5. **Existing quoting stays** (`<reader-text>` blocks, `untrusted: true`, per-call caps).
6. **Anomaly pause.** More than 50 `reduce` calls or 10 consecutive refusals in one run end it (`killed`) and pause the automation.
Whether other people's drafts count as untrusted input is an open question.

#### 11.5 Budgets and caps (D11)
| Scope | Limit | Default | Counted by |
|---|---|---|---|
| Run | tool calls | 100 | indexed `COUNT` of audit rows by `run_id` |
| Run | writes (calls that snapshot) | 20 | the same rows with a snapshot |
| Run | approval requests filed | 5 | approvals by `run_id` |
| Run | minutes | 15 | `endsAt` |
| Automation | runs per day | from the rule (≤ 24) | runs |
| Automation | consecutive failures | **3 → `auto-paused`** + notification | `consecutive_failures` |
| Site | automation writes per UTC day | **200** (`daily_write_cap`; about 2–3 % of D1 Free's daily writes including snapshots) | audit rows by `automation_id` since midnight |
| Deployment | automations at all | `CLOUDHAL_AUTOMATIONS=off` | env |
Exceeding a run limit ends the run (`budget-exceeded`) and pauses the automation. Cloudhal cannot see an external agent's tokens; the guide recommends the platform's own limits (turn caps, credits, timeouts).

#### 11.6 Kill switches
1. **Pause one automation** (a person; its own agent with `pause_automation`, in every mode, because stopping must never wait). Resuming is a person's act.
2. **Pause schedules and automations for the site** (Administrator and above, `site:settings`): due releases wait (and become `missed` after an hour), windows do not open, open runs are killed. One switch in Site settings › Schedules and on the Schedules page.
3. **`CLOUDHAL_AUTOMATIONS=off`** in the deployment: automations stop; releases and gates are unaffected.
4. **Revoke the key** (Agents page): the automation becomes `broken`; approved releases still run (a person approved them).
5. **Rollback**, as always.

#### 11.7 Notifications and history
Every run is a `ScheduleRun` with usage, taint, summary and findings; Studio separates **"ran"** (state) from **"did something"** (outcome), because a clean run can achieve nothing. Audit rows of a run carry `run_id` and `automation_id`; the history tab links each run to its audit rows, snapshots and approval requests.

#### 11.8 Owner changes
| Event | Automation | Releases |
|---|---|---|
| Owner demoted | Key narrows on the next call; if `modeCap` no longer fits or a needed scope is gone → `broken` (`role-changed`) | Re-checked at T (§10.6) |
| Owner removed | `broken` (`owner-removed`); keys disabled (ADR-0018); an Administrator may take it over, which mints a new key | Their pending requests are denied; releases they approved expire at T (`approval_lost`) |
| Key revoked | `broken` (`key-revoked`) | Person-approved releases run |
| Automation deleted | Open run `killed`; its waiting requests denied | — |

#### 11.9 Recipes
Docs ship ready configurations for three external schedulers — a Claude Code routine, a GitHub Agentic Workflow (whose read-only agent job and "safe outputs" match this model) and an n8n Schedule Trigger — each calling `begin_run`, working, then `end_run`, with the platform's own limits set, and a skill per built-in pattern (`comment-triage`, `calendar-planner`, `stale-review`). The `publish-article` skill's last step becomes `schedule_release` (`on-approval` or a time) instead of `publish` plus polling, and the demo's `editor-agent.ts` gains `--at`.

### 12. MCP tools
Defined in `packages/mcp-server/src/schedule-tools.ts`, audited by `runTool`; every row carries `release_id`, `run_id` and `automation_id` where they apply.

| Tool | Scopes | Class | `plan` | `manual` | `edits` | `auto` | `bypass` | Tainted run |
|---|---|---|---|---|---|---|---|---|
| `list_schedule`, `get_schedule` | `schedules:read` | read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `list_releases`, `get_release` | `schedules:read` | read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `list_automations`, `list_runs`, `get_run` | `schedules:read` | read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `propose_release` | `schedules:write` (own) | advisory | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `schedule_release` | `schedules:write` (own); `releases:publish` (own) for `auto` | publish | ✗ | waits | waits | low-risk in window ✓, else waits | ✓ | ✗ |
| `reschedule` | `schedules:write` (own) | reduce (an agent's move always voids the approval; in `auto` it is re-evaluated as `schedule_release`) | ✗ | waits | ✓ | ✓ | ✓ | ✓ |
| `cancel_schedule` | `schedules:write` (own) | reduce for releases that only publish; **publish** for releases that remove or expire content (canceling keeps content up) | ✗ | waits | ✓ / waits | ✓ / waits | ✓ | reduce only |
| `set_embargo` | `schedules:write` + `content:write` (own) | reduce when the node is not visible or the change only delays it; otherwise publish | ✗ | waits | ✓ | ✓ | ✓ | ✓ (reduce) |
| `lift_embargo` | `schedules:write` (own) | person | ✗ | waits | waits | waits | waits | ✗ |
| `schedule_unpublish` | `schedules:write` (own) | publish (removes content: never low-risk) | ✗ | waits | waits | waits | ✓ | ✗ |
| `begin_run`, `end_run` | the automation's key | read (bookkeeping) | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `pause_automation` | the automation's key, or `schedules:write` on one's own automations | read (stops work only) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Not over MCP (people, REST only): creating, editing, resuming, running and deleting automations; the site kill switch and caps; "Unschedule and edit"; "Publish now" for missed releases. They are standing rules of autonomy or a person's override; ADR-0015 and ADR-0016 keep those with people.

```ts
list_schedule   { siteId; from: Timestamp; to: Timestamp (≤ 62 days); types?: ("release"|"gate"|"automation")[];
                  states?: …; origin?: "person"|"agent"; cursor? }
                → { items: CalendarItem[] (≤ 200); timeZone; nextCursor? }
                // CalendarItem = { id: "rel_…" | "gate:<nodeId>:from|until" | "occ:<automationId>:<at>", kind, at,
                //   title, target, origin, approval: none|pending|approved|auto|denied|expired, state, overlaps? }
get_schedule    { siteId; id } → CalendarItem + detail
list_releases   { siteId; state?; cursor?; limit? (≤ 50) } → { releases: ReleaseView[]; nextCursor? }
get_release     { siteId; releaseId } → ReleaseView = Release + { items[].title, items[].path, diff summary, closureAdded,
                  overlaps, lockedNodes, request? }
propose_release { siteId; nodeIds: Id[] (1..100); title?; at? | { localTime; timeZone? }; note? (≤ 500) }
                → { release (draft); closureAdded: Id[] }
schedule_release{ siteId; releaseId? | nodeIds?; when: { at } | { localTime; timeZone? } | "on-approval"; expectedRev? }
                → { release; status: "scheduled" | "approval-pending"; approvalId? }
reschedule      { siteId; releaseId; when; expectedRev } → { release; status }
cancel_schedule { siteId; releaseId; expectedRev } → { release }
set_embargo     { siteId; nodeId; from: Timestamp; expectedRev } → { node; release?; status }
lift_embargo    { siteId; nodeId; from?: Timestamp | null; reason (≤ 500); expectedRev } → { status: "approval-pending"; approvalId }
schedule_unpublish { siteId; nodeId; at: Timestamp | { localTime; timeZone? }; expectedRev } → { node; release; status }
list_automations{ siteId } → { automations: Automation[] }   // no key secrets, ever
list_runs       { siteId; automationId? | releaseId?; state?; cursor? } → { runs: ScheduleRun[]; nextCursor? }
get_run         { siteId; runId } → ScheduleRun + { auditRowIds, snapshots, approvals }
begin_run       { automationId } → RunEnvelope
end_run         { runId; summary (≤ 2,000, plain); outcome } → { run }
pause_automation{ automationId; reason (≤ 500) } → { automation }
```
`get_mode` gains `run: { runId, endsAt, budgetLeft, tainted }` inside a run. Run summaries are agent-written text: Studio renders them as plain text and other agents receive them inside the untrusted quoting of RFC-0007 §11.2.

**Server instructions** gain a paragraph: "Schedules: to publish later, propose or schedule a release with the entries; a person approves the pinned versions in Studio and Cloudhal publishes them at that time — do not poll. Scheduled content is locked; ask a person to unschedule it. Embargoes and expiries are times on the entry, enforced by the site itself. Inside an automation run (begin_run) you have a budget and an end time; once you read reader text, 404 paths, analytics referrers or fetched pages, the run can only read, label, hide or pause."

### 13. REST (people; agents use MCP)
`ROUTE_SCOPES` additions; everything else stays default-deny (RFC-0005 I15). Handlers enforce own limits and person-only rules as the existing routes do.
```ts
["GET",    `${S}/schedule`, "schedules:read"],                          // calendar items: ?from&to&types&states&origin&approval&collection&q
["GET",    `${S}/releases`, "schedules:read"],
["POST",   `${S}/releases`, "schedules:write:own"],                     // draft {nodeIds, title?, when?}
["GET",    `${S}/releases/:releaseId`, "schedules:read"],               // + items with titles, closure, overlaps, request
["GET",    `${S}/releases/:releaseId/diff`, "schedules:read"],          // base → target per item; three-way after a conflict
["PATCH",  `${S}/releases/:releaseId`, "schedules:write:own"],          // title; items while draft; rev (CAS)
["POST",   `${S}/releases/:releaseId/items`, "schedules:write:own"],    // add items in chunks of ≤ 20 new bodies (§6.1)
["POST",   `${S}/releases/:releaseId/schedule`, "schedules:write:own"], // {when}: own approval when allowed, else a request (cause role)
["POST",   `${S}/releases/:releaseId/reschedule`, "schedules:write:own"],
["POST",   `${S}/releases/:releaseId/repin`, "schedules:write:own"],    // current versions; voids the approval unless the caller re-approves
["POST",   `${S}/releases/:releaseId/unschedule`, "schedules:write:own"],
["POST",   `${S}/releases/:releaseId/cancel`, "schedules:write:own"],
["POST",   `${S}/releases/:releaseId/publish-now`, "releases:publish:own"], // missed / expired / scheduled: a manual run now
["POST",   `${S}/gates`, "schedules:write:own"],                        // {nodeId, from?|until?, apply: "with-next-publish"|"now"}
["POST",   `${S}/gates/:nodeId/lift`, "releases:publish:own"],          // embargo override with reason (D8)
["GET",    `${S}/automations`, "schedules:read"],
["POST",   `${S}/automations`, "automations:manage"],                   // agent tasks mint the key; the secret is in this answer only
["GET",    `${S}/automations/:automationId`, "schedules:read"],
["PATCH",  `${S}/automations/:automationId`, "automations:manage"],
["POST",   `${S}/automations/:automationId/pause`, "automations:manage"],
["POST",   `${S}/automations/:automationId/resume`, "automations:manage"],
["POST",   `${S}/automations/:automationId/run-now`, "automations:manage"], // built-ins: run; agent tasks: open a window now
["DELETE", `${S}/automations/:automationId`, "automations:manage"],
["POST",   `${S}/automations/preview-rule`, "schedules:read"],          // {start, timeZone, rule} → next 5 occurrences, DST notes, sentence
["GET",    `${S}/runs`, "schedules:read"],
["GET",    `${S}/runs/:runId`, "schedules:read"],
["GET",    `${S}/schedule-settings`, "schedules:read"],
["PUT",    `${S}/schedule-settings`, "site:settings"],                  // kill switch, daily cap; rev (CAS); audited
["GET",    "/api/scheduler", "signed-in"],                              // mode, last tick, next wake, 7-day lag p50/p95, healthy
["GET",    "/api/admin/schedules/status", "deploy-token"],              // for `cloudhal schedules status --remote`
["POST",   "/api/admin/schedules/run-due", "deploy-token"],             // operator's manual tick
```
Approvals keep their routes; `POST …/approvals/:aid/approve` gains carry-out for release tools (§10.4). `/api/instance` reports `features.schedules = { available, scheduler: "cron" | "alarm" | "node" | "request", gates: boolean, limits: { maxItems, horizonDays, requestHorizonDays, lateMinutes: 60 } }`.

### 14. Notifications
Derived from state on every `GET /api/notifications`; nothing stored (ADR-0016 addendum); stable ids so a toast fires once.

| Kind | For | When | Content and action | Id |
|---|---|---|---|---|
| `schedule-approval-due` | people who may decide | a release awaiting approval is due within 60 min | "‘Election results’ publishes at 09:00 but waits for approval" · Review | `schedule-approval-due:<rel>:<at>` |
| `schedule-upcoming` | creator, approver | a scheduled release is due within 15 min | "Publishes at 09:00" · Open | `schedule-upcoming:<rel>:<at>` |
| `schedule-published` | creator, approver | published within the last 24 h (the "after" notice) | "Published at 09:00:41 (41 s late)" · View | `schedule-published:<rel>` |
| `schedule-conflict` | creator, approver, Editors | conflict | "2 entries changed since approval; nothing was published" · Resolve | `schedule-conflict:<rel>` |
| `schedule-missed` | creator, approver, Editors | missed | "Missed by 1 h 31 min" · Publish now | `schedule-missed:<rel>` |
| `schedule-expired` | creator, Editors | expired | the reason · Approve and publish now | `schedule-expired:<rel>` |
| `schedule-failed` | creator, approver, Editors | failed | the code in words · Open | `schedule-failed:<rel>` |
| `scheduler-stalled` | Administrators; anyone with a release due in 24 h | §8.7 | "Scheduled work is not running; last tick 14:02" · Scheduler status | `scheduler-stalled:<hour>` |
| `automation-paused` | owner | auto-paused or broken | the reason · Open | `automation-paused:<aut>:<rev>` |
| `automation-failed` | owner | a run failed or was missed | the error · History | `automation-failed:<run>` |
| `automation-digest` | owner (and later subscribers) | a `weekly-digest` run finished | the templated digest · Open | `automation-digest:<run>` |

Email and webhook delivery wait for a mail sender (RFC-0007 v1.1); browser notifications work as today.

### 15. Studio
Follows `kumo-design`, `studio-ui` and a new **DESIGN.md §2x "Schedules"**, written with the implementation. Words go through `useT()` in two lazy namespaces: **`schedules`** (calendar, releases, automations, history, the schedule dialogs and blocks' words) and **`scheduleSettings`** (the settings section and the time-zone field). The shell keeps `nav.schedules` (exists), `commands.goSchedules`, `commands.newSchedule` and `commands.goToday`; the Publish split button's "Schedule…" item is a core key, its dialog loads `schedules`.

#### 15.1 Screens and navigation
- **Sidebar**: Automation › **Schedules** (`CalendarDots`) loses "Soon"; its `Sidebar.MenuBadge` shows the count of releases needing attention (awaiting approval within 24 h, conflict, missed, failed), nothing otherwise.
- **`/sites/:siteId/schedules`** — template **`calendar`** (new in `design-lint.ts`: `PageLayout`, `crumbs=`, `title=`, `ListToolbar`, `ScheduleFilters`, `LayerCard`, `Empty`, and `CalendarMonth` or `AgendaList`). `PageLayout` (crumbs, `CalendarDots` 24 px, "Schedules", "What happens on this site and when — by people and agents.", primary split action "New schedule ▾": *Schedule a publish…*, *New release…*, *New automation…*) with page **tabs Calendar · Automations · History** (sub-views of one page). Below the tabs: an alert `Banner` when something is missed, failed or in conflict ("2 schedules need attention" · Review → the "Needs attention" view), and a secondary `Banner` while the site's kill switch is on.
  - **Calendar** tab: `ListToolbar` in two rows of equal height — search + `ScheduleFilters` + saved-view menu; `CalendarNav` (‹ Today › + the period title, `aria-live="polite"`, "Go to date" `Popover` + `DatePicker` via `calendarLocaleProps`) + view switch (segmented `Tabs`: **Agenda | Month**). `TimezoneNote` ("Times are in Istanbul time (UTC+3)" · "Show in my time"). `LayerCard p-0` with `AgendaList` (default everywhere) or `CalendarMonth`. **Aside** (380 px sticky): "Waiting for approval" (compact rows deciding through the existing `ApproveRequestDialog`), "Scheduler" (health dot `Badge`: Running / Late / Stopped, last tick, "Runs within about a minute of their time", the mode, a link to settings), "From the terminal" (`cloudhal schedules list`).
  - **Automations** tab (`list` template, own route file): `Table` — name and job (`Badge` builtin / agent task), agent (`ActorBadge` + key name + `ModeBadge`), "When" in words ("Weekdays at 09:07"; `Tooltip`: the rule and zone), next run (`RelativeTime`), last run (`OutcomeBadge` + `RelativeTime`), a `Switch` "On" (`aria-label` "Pause Hourly comment triage"), a sticky ⋯ menu (Run now, Edit, History, Duplicate, separator, Delete). Empty: `Empty` (`Robot` 48), "No automations yet", `commandLine`, secondary "New automation".
  - **History** tab (`list` template, own route file): `ScheduleRunRow`s in a `Table` — time, kind, subject, origin, **state** and **outcome** in separate columns, lateness, snapshot and audit links; filters by state, kind, origin; cursor pagination ("Load more", the Activity pattern).
- **Release** (`/sites/:siteId/schedules/releases/:releaseId`, template `editor`, `EditorLayout` without a preview column): title, state `ScheduleStatusBadge`, "Publishes 2 November 09:00 (Istanbul)". Main: "Items" `SectionCard` (per item: title, path in mono, kind, "pinned version 7 · live version 6", a ghost "Compare" opening the snapshot diff dialog with base and target; closure items marked "added because the article uses it"; overlap warnings), "Approval" `SectionCard` (who approved, when, for which time; the request; "Single use, for these versions"), after a conflict a "Changed since approval" `SectionCard` with the three-way view and "Re-pin and approve" / "Cancel". Aside: "When" (`DateTimeField`, "Move to…"), "Danger zone" (Unschedule, Cancel).
- **Automation editor** (`LayerDialog size="lg"`): name; job (`Radio appearance="card"`: built-in jobs with one-line descriptions, or "Agent task"); for agent tasks the key (new, minted on save; its secret in a one-time reveal as on the Agents page), `ModePicker` limited to the owner's cap, "Reads visitor text" `Switch` with what it implies (no write scopes; label and hide only), instructions `InputArea`, window and budget `Input type=number` with defaults; `RecurrenceEditor` + `NextRuns`; a read-only `InsetPanel` "What this automation can do" derived from the mode and scopes.
- **Editors**: the top bar's **Publish split button gains "Schedule…"**, opening `ScheduleDialog` (`DateTimeField` in the site zone; "When approved"; the items that will be included, with the closure; the approval effect in an info `Banner`). The article and page editors' aside gains a **"Schedule" `SectionCard`**: gates ("Visible from…", "Hide after…" via `DateTimeField`), the lock state ("Locked: publishes 2 November 09:00 · Unschedule and edit · Edit and re-approve"), and links to the release.
- **Site settings**: *General* gains "Time zone" (`Combobox`, "Istanbul (UTC+3)", the browser's zone suggested); a new **Schedules** section (`scheduleSettings`): scheduler health, the kill switch (`Switch` with an alert confirmation), the daily automation write cap with today's use as a `Meter`.
- **Approvals** (DESIGN §2m): release requests render the release itself — items with diffs, the time in the site zone, "Approving schedules exactly these versions; any change asks again" — and `lift_embargo` requests show the embargo time and the agent's reason in `AgentReason` styling.
- **Snapshots and Activity**: `scheduled` snapshots are labelled "Scheduled release" with the release link; audit rows show "Scheduler, on behalf of Ayşe".

#### 15.2 Views (v1: Agenda and Month)
- **Agenda** (default on every width): day headings ("Today · Monday 12 October"), a "Now" rule between past and future, today's finished items folded ("3 done today ▾"), rows by `ScheduleItem variant="row"`: time (`tabular-nums`), kind icon, title (link), collection, locale and terms as outline `Badge`s, `ActorBadge` + `ModeBadge subtle`, `ScheduleStatusBadge`, actions (awaiting approval: Deny secondary / Approve primary; others: ⋯ Move to…, Publish now, Unschedule, Compare). Recurring automations fold per day ("+ 24 automation runs").
- **Month** (desktop: full chips; ≤ 640 px: **dots**, `CalendarMonth density="dots"` — the day number and up to three kind dots plus an approval dot; tapping a day opens that day's agenda below, DayTicker-style). Cells show at most three chips and "+N more" (a `Popover` with that day's agenda). Weekends and past days `bg-kumo-recessed`; today `aria-current="date"`.
- **Week and Timeline are v2** (non-goal).

#### 15.3 Visual language
**Fill = certainty, tone = state, icon = kind and origin; colour is never the only signal** (WCAG 1.4.1).

| State | Month chip | Badge |
|---|---|---|
| Scheduled by a person, or approved | filled neutral tint, kind icon | none (the normal state is quiet); approved agent items: outline `CheckCircle` "Approved" |
| `auto` (low-risk, no person) | filled + `Lightning` | `warning` `Lightning` "Automatic" (the `AutoApprovedBadge` language) |
| **Proposed / awaiting approval** | **dashed outline, empty fill**, `Robot` + `HandPalm` | `warning` dot "Waiting for approval" + `ClockCountdown` time left |
| Denied, expired | struck through, `text-kumo-inactive`; hidden by default | `secondary` "Expired" / `error` "Denied" |
| Conflict, failed | filled + `Warning` / `WarningCircle` | `error` "Conflict" / "Failed" |
| Missed | `error` tint, `ClockCounterClockwise` | `error` "Missed" |
| Running | filled + spinner (`role="status"`) | `info` "Publishing…" |
| Published, ran | faded fill | `success` dot "Published" / "Ran" |
| Recurring occurrence (future) | ghost chip (outline only, `ArrowsClockwise`) | — |
| Paused automation occurrence | ghost chip + `Pause` | `secondary` "Paused" |
| Embargo / expiry gates | `CalendarCheck` / `CalendarX` chips at each end (bars are v2) | `info` "Embargo" / `secondary` "Expires" |

Icons (Phosphor, 16 px): publish `CalendarCheck`, expiry `CalendarX`, release `Package`, automation `Robot` / `ArrowsClockwise`, person `User`, approval `HandPalm`, automatic `Lightning`, missed `ClockCounterClockwise`, failed `WarningCircle`, locked `LockSimple`. The dashed outline is drawn as `border border-dashed` without a shadow inside the `ScheduleItem` block; DESIGN §4 asks for `ring` borders, which cannot be dashed, so `design-lint` gets a documented, block-scoped exception (D14).

#### 15.4 New blocks (`packages/ui/src/blocks`, listed in DESIGN §6; every word is a prop)
`CalendarMonth` (Kumo `Table layout="fixed"` + 7 `col`, `role="grid"`, roving `tabindex`, APG date-grid keys, `weekStartsOn = firstDayOfWeek(locale)`, days computed in the site zone with `TZDate`, drop targets only when `onReschedule` is given) · `AgendaList` (sticky day headings, `divide-y` rows, `SectionEmpty`, "Load more") · `ScheduleItem` (`variant="chip" | "row"`, chips ≥ 24 px tall; the accessible name is the whole sentence: "09:00, Publish, ‘Election results’, proposed by Desk, waiting for approval") · `ScheduleStatusBadge` (`Badge` + icon + reason `Tooltip`, `data-state`) · `ScheduleFilters` (the `CommentFilters` pattern: `Toolbar` + `Select render={<Toolbar.Button/>}`, multi-value facets as `Combobox multiple` in a `Popover`, ghost "Clear filters", the saved-view menu) · `CalendarNav` · `TimezoneNote` (`GlobeHemisphereWest` + both times in a `Tooltip`; generalises DESIGN §2v's "Days are in UTC") · `DateTimeField` (Kumo has no time picker: `Field` + `InputGroup` with a `DatePicker` `Popover`, an `HH:mm` `Input` honouring `hourCycle` — 24-hour in Turkish — and the zone as an addon; messages for past times, "less than 5 minutes away", DST gaps "02:30 does not exist on 29 March in Berlin; it runs at 03:30") · `RecurrenceEditor` (presets as `Radio appearance="card"`, custom: every N days/weeks/months, weekday `Checkbox` chips in `weekStartsOn` order, monthly "on the 12th" / "on the second Tuesday" / "on the last day", end never / on date / after N; a hint to avoid :00) · `NextRuns` (`InsetPanel` `dl` of the next five runs from the server, a `Badge warning` "Clock change" on DST days) · `RescheduleDialog` (`LayerDialog size="base"`: "Now → New" `InsetPanel`, `DateTimeField`, conflict and approval-effect `Banner`s, primary "Move", then a toast with **Undo** for 10 s) · `ScheduleRunRow` (state and outcome apart; counts; links).

#### 15.5 Filters, saved views and the URL
- **Facets**: kind (publish, expiry, embargo, release, automation), state (scheduled, waiting for approval, conflict, failed or missed, done, canceled), origin (people, agents; then specific people and keys), approval (none needed, waiting, approved, automatic, denied or expired), collection, category and tag, locale (multilingual sites only).
- **Default**: canceled, denied and expired hidden; past "done" faded in Month and folded in Agenda.
- **The URL is the state**: `?view=month&date=2026-10&kind=publish,release&origin=agent&approval=waiting` — shareable, back/forward work, `lib/schedules-search.ts` validates and drops unknown values (the `analytics-search` pattern).
- **Built-in views** (v1, in code): All · Waiting for approval · Proposed by agents · This week · Needs attention (failed, missed, conflict) · Mine. Personal and site-shared saved views stored on the server are v1.1 (never `localStorage` for shared state); a text query syntax (`state:failed agent:desk`) is v2.

#### 15.6 Keyboard and drag (D12, D13)
- Shortcuts, only when focus is not in a field, listed in the palette's "Keyboard shortcuts": `j` / `k` next / previous period, `a` Agenda, `m` Month, **`g t` today**, `g d` go to date, `c` new schedule, `f` filters, `?` the list. `t` alone is not used (`t s` toggles the sidebar).
- **Drag** only on the desktop Month view, with a pointer; draggable: future, not running, not locked by a conflict, not a recurring occurrence. Dropping never writes: it opens `RescheduleDialog` with the old time of day on the new day. No optimistic update; a 409 shows "This schedule changed somewhere else" with "Load the latest". The library (dnd-kit, with its keyboard sensor and announcements translated) loads only with the Month view's chunk on desktop.
- **"Move to…"** is in every item's ⋯ menu on every width — the single-pointer, non-drag equivalent SC 2.5.7 requires, and the only way on phones.

#### 15.7 Accessibility
`CalendarMonth` is an ARIA data grid with one tab stop; arrows move by day and week, Home/End to the week's ends, PageUp/PageDown by month (Shift: year), Enter/F2 into a cell's items and Esc back; cell names read "Monday 12 October, today, 3 items: 2 publishes, 1 waiting for approval". The Agenda is a complete equivalent and the view switch says so to screen readers. One `role="status"` region announces moves and approvals ("‘Election results’ moved to 14 October 09:00"). Targets are at least 24 × 24 px (SC 2.5.8); phone day cells are the whole cell. Motion follows `prefers-reduced-motion`.

#### 15.8 Language and locale
Turkish weeks start on **Monday** and times are **24-hour** (`firstDayOfWeek` and `hourCycle: "h23"` from `calendar-locale.ts`); dates read "12 Ekim Pazartesi", short `12.10.2026`; "Bugün", "Yarın" through `RelativeTimeFormat`; counts through `Intl.PluralRules`. Recurrence sentences come from our own templates in both languages ("Her ayın ikinci salısı 09:07"), not from a cron-to-text library. Zone names show the city and offset ("İstanbul (UTC+3)").

#### 15.9 Bundle budget
The three schedule routes and the release route are lazy (`LAZY_ONLY`), with `withMessages(…, ["schedules"])`; the settings route loads `scheduleSettings`; dnd-kit loads only with desktop Month. The initial load stays within **470 kB gzip** and the entry chunk within **280 kB** (today 464 / 276 kB), enforced by `bundle-budget.ts`; the measurements go into the implementation notes. `pnpm design:lint` and `pnpm design:shots` at 1440 and 390 px, light and dark, English and Turkish, for every new screen.

### 16. Packages, CLI and deployment
- **`@cloudhal/schedules`** (new, Worker-safe): the time model (resolve, never-early recompute), the RRULE subset (parse, expand, sentences), the release model (pin, closure, `rl1:`, compose, conflict check, state machine), the `Scheduler` (`runDue`, claims, leases, budgets, heartbeat, missed policy), built-in job steps, the run envelope, taint and budget accounting. Subpaths `./sql` (`SqlScheduleStore` over `SqlDriver`) and `./testing` (the conformance suite on better-sqlite3 and Miniflare D1, counting statements per path).
- **`@cloudhal/core-ts`**: `availability` (the gate helper), `publishRelease`, holds in `createSnapshot`, locks in the update and delete paths, the gate rules in `update_entry`/`update_page`, `publishedAt = from`.
- **`@cloudhal/astro-renderer`**: the gate helper on every path (§7.2), the gate index and cache cap, the asset inheritance, the preview notice, `GET /__cloudhal/features`.
- **`@cloudhal/cloudflare`**: `scheduled` → `runDue`; `SchedulerClock`; the request backstop; `system_jobs` for the analytics and comments jobs.
- **`@cloudhal/cli`**:
  - `cloudhal deploy`: `MINUTE_CRON`, the DO binding and migration always, `CLOUDHAL_SCHEDULER = cron | alarm`; on a cron-limit refusal it redeploys with `alarm` and says so ("Cloudflare refused the cron trigger: this account uses all its cron triggers (Workers Free allows 5). The scheduler runs on a Durable Object alarm instead."). `DeployState` records `scheduler`. `CLOUDHAL_ANALYTICS_CRON` and `CLOUDHAL_COMMENTS_CRON` are read once as `alarm` and then removed.
  - `cloudhal schedules status | list | run-due` (`--remote` with the deploy token); `cloudhal dev`, `studio` and `mcp` start the Node ticker.
  - `cloudhal push` refuses while the target has non-terminal releases unless `--cancel-schedules` (a replaced graph would invalidate their pins).
- **Docs**: `docs/guides/schedules.md` (releases, embargoes, the scheduler and its health, automations, recipes, the Free-plan notes), the threat model edits, DESIGN §2x, the changesets, and the ADR after acceptance.

### 17. Invariants
| # | Invariant | Enforced in | Proven by |
|---|---|---|---|
| S1 | A release changes the live snapshot exactly by its items: `nodes(S) = nodes(L) − ids + targets`. | `publishRelease` | store suite: composed snapshots on SQLite and D1 |
| S2 | Nothing runs early: no release before its (recomputed) time, no gate open before `from`. | scheduler, `isAvailable` | fake-clock tests incl. tzdata changes and DST |
| S3 | At most one effect per occurrence. | deterministic run id, lease, guarded batch | concurrent `runDue` on two stores sharing one database |
| S4 | A changed pinned node or base holds the release; nothing is applied partially. | conflict check before the batch; CAS in it | tests: publish, rollback and edits between pin and run |
| S5 | Held nodes are locked and kept at their live version by ordinary publishes. | `createSnapshot` holds; update/delete guards | tests: publish, `pendingChanges`, auto-publish and own-only with holds |
| S6 | Approvals bind to `rl1:` and `when`; a person's move keeps them, an agent's move or any item change voids them. | `bindState`, carry-out | tests per mode and actor |
| S7 | Rights are re-checked when a release runs; lost rights expire it. | run gates | tests: demotion, removal, revoked key, ended elevation |
| S8 | More than an hour late is `missed`, never published; recurring jobs run only the latest missed occurrence. | missed policy | fake-clock tests |
| S9 | Gated nodes appear in no public output before `from` or from `until` on; previews show them. | `isAvailable` on every path | the route sweep test (local and workerd) |
| S10 | No published response is cached past the next gate. | cache cap | header tests; L4 live |
| S11 | An automation key works only inside an open run; scheduling grants no scope; `bypass` never applies. | principal resolution, `modeCap` | MCP tests |
| S12 | A tainted run can only read, label and reduce; untrusted-input automations hold no write scopes. | policy | MCP tests with each tainting tool |
| S13 | Budgets and caps are enforced by the server; three failures pause. | run accounting | tests |
| S14 | Every scheduler action is audited as the scheduler on behalf of a person, with release and run ids. | audit | tests |
| S15 | Writers refuse `availability` until the site renderer confirms it enforces gates. | the features handshake | workerd test with an "old" site Worker |
| S16 | No code reads `Temporal.Now` or a native `Temporal`; `now` is injected. | lint, test | CI |
| S17 | A tick stays within the platform's per-invocation query budget. | `TickBudget` | statement-counting suite |

## Cost
Assumptions: Workers Free 100,000 requests a day, 10 ms CPU per invocation; cron invocations count as requests (Cloudflare's pricing example counts an hourly trigger as 720 requests a month); D1 Free 5 million rows read and 100,000 written a day, 50 queries per invocation; Durable Objects Free 100,000 requests a day, SQLite storage writes counted per row (each `setAlarm` is one); a release run writes about 15–20 D1 rows plus the ordinary publish's `snapshot_blobs` copies (one row per live media blob, as every publish already does); an agent-task run writes about 4 run rows plus the audit rows and snapshots its calls already produce.

**The ticker, idle:**
| | Every-minute cron (default) | Durable Object clock |
|---|---|---|
| Requests / day | 1,440 (1.4 % of Free) | ≤ 24 safety alarms + pokes (≈ 0.03 %) |
| D1 queries / day | ≈ 4,300 indexed reads, a few rows each | ≈ 100 |
| D1 rows written / day | ≈ 290 heartbeats (0.3 % of Free) | ≈ 30 |
| Durable Object | — | ≈ 25–100 requests and SQLite row writes a day |
| Purges | none (gates cap the cache instead) | none |

**Workloads (Cloudhal's side; external agents' own costs are theirs):**
| | Small (20 releases a month, 2 weekly built-ins) | Medium (300 releases a month, 5 built-ins, 2 hourly agent tasks) | Large (100 releases a day, 10 automations incl. hourly triage) |
|---|---|---|---|
| Extra requests / day | ≈ 1,450 (1.5 %) | ≈ 4,400 (4 %): ticks + ≈ 2,900 MCP calls | ≈ 16,000 (16 %) |
| D1 rows written / day | ≈ 310 (0.3 %) | ≈ 3,500 (3.5 %) | ≈ 17,000 (17 %) |
| D1 rows read / day | negligible | ≈ 60,000 (1.2 %) | ≈ 400,000 (8 %) |
| Purge requests | ≈ 1 a day | ≈ 10–30 a day | ≤ 2–3 a minute at peaks, inside the shared budget |

**Workers Free.** Small and medium fit comfortably; the minute tick costs 1.4 % of the daily requests. Large fits only on paper: its agent traffic and the site's own traffic would meet Free's request ceiling first (RFC-0006 showed this), and a release on a 2,000-node site may not fit 10 ms of CPU (L5) — Paid is the recommendation there. The daily automation write cap (200 by default) keeps runaway automations from exhausting D1's daily writes, which would stop the CMS until midnight UTC.

**Workers Paid ($5 a month).** **$0 extra** for all three: 43,200 tick requests a month against 10 million included; ≈ 0.5 million D1 rows written a month against 50 million; DO requests and storage far inside the included amounts; tick CPU ≈ 2 ms × 43,200 ≈ 90 s a month against 30 million ms.

**For comparison** (§Alternatives): one Workflow instance per scheduled publish uses about four steps (sleep, publish, purge, record) — Free allows 3,000 steps a day and keeps instance state 3 days; delayed Queue messages need re-queuing every 24 hours and cannot be withdrawn.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| **Whole-site snapshot prepared now, flipped at T** | One pointer move; trivial executor | Reverts everything published between preparation and T; approval tied to the whole site's state, voided by any edit | Wrong for a pointer-flip model (owner decision 1) |
| **"Latest version at T"** (Strapi, reportedly Contentful) | No pinning | Publishes edits nobody approved — ADR-0014's H2 finding, in time | Pinned versions instead |
| **Time gates only** | No scheduler for anything | Cannot schedule an update to live content; content must be published early | Gates for embargo and expiry; releases for changes |
| **Releases only** | One mechanism | Embargo depends on the scheduler being up; a late run leaks or misses; purges at T | Gates hold without a scheduler |
| **Cloudflare Workflows** (instance per schedule, `sleepUntil`) | Durable sleep and retries | Still needs D1 for lists and cancel; no Node equivalent (a second engine); Free 3,000 steps a day, 100 concurrent, 3-day state; step billing since 2026-08 | v2 candidate for long multi-step automations behind the same `Scheduler` |
| **Queues with delays** | Managed delivery | 24 h maximum delay, no withdrawal, 24 h retention on Free | Not a scheduler |
| **A cron trigger per schedule** | Native | 5 triggers per account on Free, a deploy per change, UTC only | Impossible at scale |
| **WP-Cron style: run on requests** | No infrastructure | Cached page views never run the Worker; schedules are missed (WordPress's "Missed schedule") | Kept only as the backstop |
| **Durable Object alarm as the only ticker** | Second precision, no cron slot | New deploy surface for every install; precision undocumented (L3) | Fallback when no slot (owner decision 3) |
| **Agents SDK `schedule()`** | Ready-made | Pulls an SDK into the core (ADR-0011 keeps it SDK-free); Durable Objects only; no Node path | Same pattern, our code |
| **LLM inside Cloudhal** (Workers AI, BYO key) | Turnkey automations | Secrets, cost ceilings, and the whole prompt-injection burden on us; Workers AI Free's 10,000 neurons a day cannot run an agent loop | Non-goal (owner decision 4) |
| **Strict lock only** (Sanity) | Simple | People must unschedule to fix a typo | People may edit and re-approve; agents are strictly locked |
| **Approval bound to the site `stateHash`** | No new code | Voided by any unrelated edit before T | `rl1:` |
| **Skip DST-gap occurrences** (RFC 5545 §3.3.10) | Standard | A weekly run silently vanishes once a year | Move forward (D2) |
| **Store only UTC instants** | Simpler | Wall-clock intent lost when tz rules change; recurrences drift by an hour across DST | Wall clock + zone, instant recomputed |
| **Contract-free internal tables** | Less schema work | Studio, MCP and the future Rust executor would each re-describe releases | Three roots, as comments did |

## Compatibility & migration
- **Contracts.** Additive: `Site.timeZone`, `availability` (optional) and three roots; `schemaVersion` stays 1. Older readers never see releases, automations or runs. Content with `availability` is refused by older admin Workers (`additionalProperties: false`), and writers refuse it until the site Worker confirms gates (§7.7).
- **Storage.** Migration `0017_schedules` is additive (new tables; nullable columns on `audit` and `approvals`).
- **Behaviour.** Nothing changes for a site that schedules nothing: no gates means `max-age=31536000` as today; ordinary publishes compose the working copy as today when nothing is held. New keys get `schedules:read`; existing keys keep their scopes.
- **Existing hourly jobs.** The analytics rollup and the comments job run unchanged behind `system_jobs` watermarks on the minute tick; their logs keep their wording. Deployments without a cron slot move from "on read / on request" to the Durable Object clock on their next deploy; `features.analytics.rollups` reports `scheduled` again.
- **Policy engine.** The `publish` class is optional per tool; tools without `classify` behave as today.
- **Rollback.** Per site: the kill switch. Per deployment: `CLOUDHAL_AUTOMATIONS=off`. **Code downgrade is unsafe while releases are pending or gates exist**: older code ignores holds (an ordinary publish would release held nodes) and older site Workers ignore gates. `cloudhal deploy` refuses to deploy an older version over a deployment that has non-terminal releases or live gated nodes unless `--force-downgrade`, and `cloudhal schedules status` lists them.
- **Rollout** (numbered so agents can implement in order; each step ships with tests and keeps `pnpm check` green):
  0. **Live verification on a Workers Free account** (the maintainer): L1 cron delay over 48 h; L2 the slot and the error text; L3 alarm precision and retries, and DO alarms in `createTestHarness`; L4 short `max-age` on Workers Cache; L5 release-run CPU and queries on 500- and 2,000-node sites; L6 cron and alarms after the daily request limit; L7 batch statement counting; L9 cron propagation. Results go into this RFC's implementation notes; a failed L4 switches §7.4 to gate purges before step 4; a failed L5 limits Free to smaller releases or moves composition to the alarm path with a fresh invocation per release.
  1. **Contracts** (this branch).
  2. **`@cloudhal/schedules` core**: time model, RRULE subset and sentences (property tests against `rrule-temporal`), release model (`rl1:`, compose, conflicts, closure), state machines, taint and budget accounting.
  3. **Storage**: migration `0017_schedules`, `SqlScheduleStore`, the conformance suite on SQLite and Miniflare D1 (statement counts per path, claims under concurrency, recovery).
  4. **Renderer gates**: `isAvailable` everywhere, the gate index and cache cap, asset inheritance, preview notice, `/__cloudhal/features`, **the route sweep test** locally and on workerd.
  5. **Store**: `publishRelease`, holds in `createSnapshot`, locks, gate writes, `publishedAt = from`, the writer guard.
  6. **Scheduler**: `runDue`, `system_jobs` (moving the analytics and comments jobs), `MINUTE_CRON`, `SchedulerClock`, the Node ticker, heartbeat, backstop; workerd tests with `/cdn-cgi/local/scheduled` and alarms.
  7. **Policy and API**: scopes, roles, abilities, the `publish` class, `rl1:` binding and carry-out, run-time re-checks, REST routes in `ROUTE_SCOPES` with the shared suite on SQLite and D1, notifications, `/api/instance`, `/api/scheduler`.
  8. **MCP**: the seventeen tools, server instructions, `get_mode` run info; policy tests per mode and class.
  9. **Built-in automations**: the five jobs in bounded steps, findings, the digest.
  10. **Agent tasks**: automation keys, run windows, `begin_run`/`end_run`, budgets, taint, anomaly pause, kill switches; recipes and skills.
  11. **Studio**: blocks, the Schedules page (Calendar, Automations, History), the release screen, editors' Schedule card and dialog, settings, approvals; DESIGN §2x; lazy namespaces; design lint and screenshots; bundle budget.
  12. **CLI, deployment and docs**: `cloudhal deploy` (cron, DO, downgrade guard), `cloudhal schedules …`, `push` guard, the guide, threat-model edits, the `publish-article` skill and `editor-agent.ts --at`, changesets; the ADR after acceptance.
- **Acceptance (v1).** On a deployed Free site: an article scheduled for T is live within a minute of T and not before; an ordinary publish before T does not release it; an edit after approval is refused, and "edit and re-approve" re-binds; a publish of the same node between approval and T turns the release into a conflict with a diff; a release reached 90 minutes late is `missed` with "Publish now"; an embargoed article is absent from every route, feed and sitemap until `from` and appears at `from` without a purge; an hourly agent task's key is refused outside its window, and after `list_comments` the run cannot create a draft; removing the cron trigger moves the deployment to the DO clock and everything still runs; the conformance suite passes on SQLite and D1.

## Security & policy impact
- **New scopes:** `schedules:read`, `schedules:write`, `schedules:write:own`, `releases:publish`, `releases:publish:own` (key-grantable) and `automations:manage` (person-only). Settings use `site:settings`.
- **New approval points:** scheduling and moving releases (the `publish` class), lifting an embargo (a person in every mode), expiring content, and canceling a removal or expiry. Approvals are bound to the exact pinned versions (`rl1:`) and re-checked when the release runs.
- **New unattended principal:** automation keys valid only inside run windows, capped by `modeCap`, narrowed to their owner's role, never `bypass`.
- **Tenant isolation:** `site_id` comes from the route after the scope check or from the stored release, never from input; the scheduler processes each site's releases under that site's own rules.
- **Threat-model edits** (rollout step 12):
  - **Promise 2** gains: "Scheduled publishes are approved by a person (or by an `auto`-mode key within its elevation window and 24 hours) against the exact pinned versions, re-checked when they run, executed at most once and never early; content scheduled for later is locked against edits and held back from ordinary publishes."
  - **New promise 13:** "Embargoes and expiries hold without a scheduler. The published site checks every page's and entry's time gates on each request, keeps embargoed content out of every route, list, feed, sitemap and search output until its time, and never caches a page past the next gate. Unattended agent runs work only inside their window, within budgets, and lose the ability to write once they read visitor-supplied text."
  - **Principals:** "Scheduler — a system actor that publishes releases on behalf of the person who approved them." "Automation key — an agent key that works only inside its automation's run windows."
  - **New section "Schedules (RFC-0008)"**, mitigated vs residual:

    | Threat | Mitigated | Residual |
    |---|---|---|
    | Embargo leak through a forgotten render path | One helper, the route sweep test, the `feed-check` self-check, asset inheritance, writer guard against older renderers | A theme route that bypasses `GraphSource` can still leak; previews shared by link show embargoed content by design |
    | Early publication (clock, tzdata, DST) | Never-early recompute, injected clock, no `Temporal.Now`, minute granularity | A wrong system clock on a self-hosted Node server |
    | Double or partial publication | Deterministic run ids, leases, one guarded batch, recovery check | — |
    | Content changed after approval | Pins, `rl1:`, locks, holds, conflicts | — |
    | Approval outliving the approver's rights | Re-check at run time | A release approved minutes before a demotion runs if T comes first |
    | Silent late publication | One-hour limit, `missed`, notifications, heartbeat | A stalled scheduler delays releases by up to an hour before they are declared missed |
    | Leaked automation key | Run windows, budgets, role narrowing, revocation | Usable inside its window |
    | Prompt injection in unattended runs | Taint per run, no egress, write-scope ban for untrusted-input automations, proposals not publishes, anomaly pause | A fooled run can mislabel or hide comments (reversible, audited) |
    | Automation exhausting D1 | Per-run budgets, the site's daily write cap, pause after three failures | An Administrator can raise the cap |
    | Downgrade releasing held or gated content | Deploy refuses downgrades while releases or gates exist | `--force-downgrade` |
    | Purge budget exhaustion at popular release times | Releases share the budget like publishes; gates need no purge; deferred purges retry | A full bucket delays a release's cache update by a minute or two |
  - **Accepted risks:** the cron trigger has no delivery guarantee (mitigated by the backstop, the heartbeat and the one-hour window); Workers Cache's honouring of short lifetimes is verified live, not by contract; agents see embargoed drafts as they see any draft.

## Open questions
1. **Very distant releases.** Should a release approved more than 30 days ahead ask its approver to re-confirm a day before? *Recommend no in v1*: it is locked and pinned; notifications cover the day.
2. **Expired pages: `404` or `410`?** *Recommend `404`* (indistinguishable from never published); `410` tells crawlers to drop the URL faster for campaigns.
3. **Per-page cache caps.** The cap is site-wide (§7.4). A per-page cap (only pages that show a gated node) saves re-renders on large sites; *measure after L4*.
4. **Other people's drafts as untrusted input.** Should reading a Contributor's draft taint an Editor's run? *Recommend yes for agent tasks in v1.1* after measuring how often it bites.
5. **Releases in `cloudhal push/pull` bundles.** Sanity's lesson is that schedules should travel with the data; *recommend an export command first* (`cloudhal schedules export`), bundles later.
6. **Revoked keys' releases.** Should an owner be able to say "cancel everything a revoked key asked for, even if approved"? *Recommend a checkbox in the revoke dialog*, off by default.
7. **Contributor proposals.** Contributors may create draft releases of their own drafts; should they also file requests, or only drafts? *Recommend requests*, as Contributors' publishes already do.
8. **Removal items.** v1 allows `remove` for entries, pages and redirects. Is that enough, or should releases also retire terms and menus?
9. **Built-in job findings retention** (200 per run, 90 days): enough for documentation sites with thousands of broken links?
10. **Notification delivery** by email and webhooks waits for a mail sender; is Studio-only acceptable for newsroom launches?
11. **iCal feed** (read-only, signed) for editorial calendars: v2 or never?
12. **The `g d` chord** and a saved-view picker in the command palette: confirm against the shortcut list when Studio's keyboard map is reviewed.
