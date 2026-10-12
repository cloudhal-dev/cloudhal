# Schedules: a guide for site owners and agent builders

Cloudhal can publish later, keep content under embargo, take it down on a date, and run recurring work: built-in checks and tasks that your own agents perform on a schedule. Everything scheduled is stored in your database (D1 on Cloudflare, SQLite locally), approved by a person against the exact versions that will go live, and recorded in Activity. No language model runs inside Cloudhal: agents are external MCP clients with their own keys. The design and its reasons are in [RFC-0008](../rfcs/0008-schedules.md) and [ADR-0023](../adr/0023-schedules.md); the security analysis is in the [threat model](../security/threat-model.md#schedules-rfc-0008).

> **Status (2026-10-13).** Releases, embargoes and expiries, the scheduler on Cloudflare and on Node, the REST API, the 17 MCP tools, automation keys and runs, and `cloudhal schedules` work today. Still being built: Studio's Schedules screens and the editors' "Schedule…" dialog (rollout step 11), and the bodies of the built-in jobs (step 9). Until step 9 lands, a built-in job's run records "nothing to do" and "Run now" on a built-in answers `409 not_available`. This guide names the Studio places as they are planned; the REST routes and MCP tools below do the same jobs now.

## Two tools: releases and time gates

| You want to… | Use | Needs the scheduler? |
|---|---|---|
| publish an article (or several changes together) at 09:00 on Monday | a **release** | yes: it runs at its minute |
| keep an article off the site until an embargo lifts | an **embargo** (`availability.from`) | no: the site checks it on every request |
| take a campaign page down after Sunday | an **expiry** (`availability.until`) | no |
| run a check every week, or let an agent triage comments every night | an **automation** | yes |

Releases change what is live. Time gates decide, per request, whether a live page or article may be shown. They combine: an embargoed article can be published early and stays dark until its time, even if no scheduler is running.

## Releases

A release is a set of changes to publish at a time. A single scheduled article is a one-item release.

### What a release pins
- Each **item** pins one node at its current working-copy version (`rev` and content hash), or removes it. It also records the version that was live when it was pinned (the **base**).
- Items can be articles, pages, taxonomies, terms, redirects, menus and media. **Removals** are for articles, pages and redirects only. Site settings are never in a release.
- Cloudhal adds what the items need that is not live yet: media an article uses, terms filed on it and their parents, pages a menu now links to. The answer lists them (`closureAdded`).
- At most **100 items** per release, at most 200 open releases per site, between **1 minute and 366 days** ahead. On Workers Free one request pins at most 20 new versions; larger releases are built in steps (`POST …/releases/:releaseId/items`).

At its time the release is applied **on top of whatever is live then**: everything published in between stays published. Exactly the pinned versions go live, never "the latest draft".

### Approving and scheduling
A release is approved once, by a person, against an `rl1:` hash of exactly its pinned versions. Any change to the items re-pins them and asks again.

| Role | Read the calendar | Create and schedule releases | Approve releases | Automations | Kill switch, daily cap |
|---|---|---|---|---|---|
| Owner, Administrator | ✓ | all | all | ✓ | ✓ |
| Editor | ✓ | all | all | ✓ | — |
| Author | ✓ | own work | own work | — | — |
| Contributor | ✓ | own drafts (a request) | — | — | — |

- A person who may approve a release schedules it directly; their approval is recorded with it.
- Someone who may not (a Contributor, an Author with someone else's article) files a request. It waits in Activity › Approvals until **the release's time**; undecided at that time, the release **expires** and nothing is published.
- **Agents never approve their own releases.** `schedule_release` leaves a request bound to the pinned versions and the time; a person approves it in Studio and Cloudhal carries it out. The agent does not wait or poll. Agents may ask at most 30 days ahead (`too_far_for_request`); further out they leave a draft with `propose_release` and a person schedules it.
- **`auto` mode** (ADR-0015): a small, article-only release with nothing removed is scheduled without a person only if it runs within the key's elevation window and within 24 hours. One hour of elevation cannot pre-approve next month's publishing.
- Rights are checked again when the release runs. If the approver has left or lost the right, the release expires (`approval_lost`) and Editors are told.

### Holds and locks
While a release is waiting for approval, scheduled or running, its nodes are:
- **held**: an ordinary publish keeps them at their live version, so "Publish" never sends a scheduled article out early. The publish prompt shows exactly what goes live;
- **locked**: edits and deletes answer `409 scheduled_locked` with the release and its time.

People can **unschedule** (the release becomes a draft again and unlocks) or **edit and re-approve** (the edit re-pins the item; a person who may approve the release approves it again in the same step). For agents the lock is absolute: they cancel where their mode allows it, or ask a person.

### Moving, canceling, conflicts
- **Moving.** A person who may approve a release keeps the approval when they move it (audited with both times). An agent's move voids it and asks again (in `auto` mode a small release within the window is re-approved for the key).
- **Canceling** withdraws the release; nothing in it is published. A running release cannot be canceled (it finishes in seconds). Canceling a release that removes or expires content keeps that content up, so an agent's cancel of such a release waits for a person.
- **Conflicts.** If someone published or rolled back one of the release's nodes after it was pinned, the release is held as a **conflict** at its time and nothing is published. `GET …/releases/:releaseId/diff` shows base, live and target per item. A person re-pins (takes the current versions) or cancels; either way it needs an approval again. Cloudhal never merges on its own.

### When it runs
- Releases of one site run **one at a time, in time order**. Two releases in the same minute both run, one after the other (on the Workers Free tick budget, one per minute; see [Free plan notes](#free-plan-notes-and-costs)).
- A release runs **at or after its minute, never before**. With the cron ticker it normally goes live a few seconds after the minute (measured below).
- A release that could not run on time (the scheduler was down, a transient error) is retried with back-off — 30 s, 1, 2, 5, 10 minutes — but **only within one hour** of its time. Later it becomes **missed**: nothing is published silently hours late. You get a notification with **"Publish now"** (`POST …/releases/:releaseId/publish-now`, `releases:publish:own`), which runs it at once with the conflict check and your rights; the snapshot records the real time.
- While the site's kill switch is on, due releases wait; if it is turned off within the hour they run, otherwise they are missed.
- A published release is an ordinary snapshot with reason `scheduled`, labelled with the release title, "Scheduler, on behalf of <approver>" in Activity. Undo is the ordinary rollback. Its cache purge goes through the same purge budget as a publish; when the budget is used up, the purge is queued and retried, and the release shows `purge: deferred`.

## Embargoes and expiries (time gates)

A time gate is a field on an article or page: `availability.from` (embargo) and `availability.until` (expiry). It is part of the content, so it is versioned, diffed, approved and rolled back like any field.

**The site enforces gates on every request, scheduler or not.** Before `from` and from `until` on, the article or page is absent from every public route: its own URL (`404`, never cached), lists and archives and their counts, related posts, menus, RSS, `sitemap.xml`, JSON-LD and Open Graph, the comments endpoints and analytics. Media used **only** by embargoed articles inherit the earliest embargo and answer `404` until then. A test renders every route of the blog starter just before, at and just after each gate, locally and on workerd, and fails if a gated title, path or media URL appears anywhere.

### Setting gates
- **Embargo** (Studio: "Visible from…"; REST `POST …/gates` with `{ "nodeId", "from" }`; MCP `set_embargo`). On content that is not live yet, the gate travels with whatever publishes it, so an early publish cannot break it. On content that is live now, the embargo hides it: Cloudhal publishes the gate on its own as a one-item "gate-only" release that runs on the next tick, within about a minute (`apply: "now"` over REST, else the gate waits for the next publish; agents in `edits` mode and above may do this, because it only reduces what is visible). An article with other unpublished edits cannot carry a gate-only change; the gate then goes live with its next publish, and the answer says so.
- **Expiry** (Studio: "Hide after…"; REST `POST …/gates` with `{ "nodeId", "until" }`; MCP `schedule_unpublish`). Taking content down always needs a person who may publish it; an agent's request waits in Approvals. Once the expiry is live, the page disappears at `until` on its own.
- **Lifting an embargo early** (publishing before `from`, or moving it earlier) is a person's decision in every mode: Editors and above, with a required reason, audited as `schedule.embargo.lift` (REST `POST …/gates/:nodeId/lift`). Agents may only ask (`lift_embargo`); `set_embargo` refuses to move an embargo earlier.
- **Dates.** When an embargoed article is first published, its date (`publishedAt`) is the embargo time, so the article, its feed item and its sitemap entry show when it really became public. No automation ever changes `publishedAt` later.
- After `until`, the URL answers `404`, like an unpublished page.

### Caching
Published pages are cached at Cloudflare's edge for up to a year. With gates, every published page's edge lifetime is capped at the **next gate instant** of the site (`cloudflare-cdn-cache-control: public, max-age=<seconds until the next gate>`): at a gate, the cached copies expire and pages re-render on their next request. No cache purge is spent on gates. The cap is site-wide because any page may list any article; a site without gates keeps the one-year lifetime. Browsers revalidate as before.

### Previews
Preview links and Studio previews show gated content with a notice ("Embargoed until 2 November 2026, 09:00 (Istanbul)", "Expired on …"). Preview responses are never cached. Anyone holding a preview link sees the embargoed article; treat preview links to embargoed content like the content itself.

### The writer handshake
An older site Worker does not know gates and would show embargoed content. So the admin Worker refuses to save gates (`409 gates_unsupported`, over REST, MCP and `cloudhal push`) until the site Worker confirms it enforces them (`GET /__cloudhal/features`, authenticated with the purge token over the `SITE` binding). After upgrading, deploy both Workers (`cloudhal deploy` does). Locally and on Node the renderer and the writer are one process, so there is nothing to wait for.

## Time zones and recurrence

- **Site time zone.** `Site.timeZone` is an IANA zone such as `Europe/Istanbul`; without one, the site uses **UTC**. Studio's Site settings › General will suggest your browser's zone; today set it with `PUT /api/sites/:siteId` (the whole site body with its `rev`). Use the zone name, never an offset: `Europe/Istanbul`, not `+03:00`.
- **Wall-clock times stay wall-clock.** "2 November, 09:00" entered for a site in Istanbul is stored as `localTime: 2026-11-02T09:00`, `timeZone: Europe/Istanbul` plus the computed instant. Before running, Cloudhal recomputes the instant with the runtime's current time-zone data and only ever moves it **later**, never earlier (`adjusted: "tzdata"`). Instants sent by an agent (`2026-11-02T06:00:00Z`) are kept as instants.
- **Daylight saving.** A time that does not exist (02:30 on the spring-forward day in Berlin) runs at the next valid time (03:30); a time that occurs twice (autumn) runs once, at the first. For recurrences this deliberately differs from RFC 5545, which drops such occurrences: a weekly job that silently skips a week once a year is worse than one that comes an hour late. Runs moved this way are marked `adjusted: "dst-gap"`. Türkiye has no DST since 2016, so `Europe/Istanbul` never hits this.
- **Minutes.** Times are to the minute; seconds are dropped.
- **Recurrence** (automations) is a subset of iCalendar RRULE: `FREQ=DAILY|WEEKLY|MONTHLY`, `INTERVAL`, `BYDAY` (ordinals such as `2TU` or `-1FR` only with `MONTHLY`), `BYMONTHDAY` (1–31, −1 for the last day), `BYHOUR`, `BYMINUTE`, and `COUNT` or `UNTIL`; weeks start on Monday. Hourly, minutely, yearly and exception dates are refused. Presets: once, hourly (`FREQ=DAILY;BYHOUR=0,…,23;BYMINUTE=m`), daily, weekdays, weekly, monthly. Runs are at least an hour apart and at most 24 a day.
- `POST …/automations/preview-rule` with `{ start, timeZone, rule, locale }` answers the next five runs, the DST notes and the rule in words ("On the second Tuesday of every month at 09:07" / "Her ayın ikinci salısı 09:07").
- Pick a minute such as :07 rather than :00 for recurring work, so that not every site wakes at once.

## The scheduler

All state is in the database; timers only wake one function, `runDue`. Each tick runs due releases (one at a time), automation occurrences and the deployment's periodic jobs (the analytics rollup and the comments job at :17 each hour, a daily schedules retention), then writes a heartbeat. Every effect is claimed with a lease and has a deterministic run id per occurrence, so two ticks at once never publish twice.

### On Cloudflare
- **Cron (default).** The admin Worker's one cron trigger fires **every minute** (`* * * * *`). It replaces the hourly trigger that analytics and comments used, in the same slot.
- **Durable Object alarm (fallback).** Workers Free allows 5 cron triggers per account. When Cloudflare refuses the trigger, `cloudhal deploy` redeploys without it, sets `CLOUDHAL_SCHEDULER=alarm` and says: "Cloudflare refused the cron trigger: this account uses all its cron triggers (Workers Free allows 5). The scheduler runs on a Durable Object alarm instead." The SQLite-backed `SchedulerClock` Durable Object then ticks: it re-arms at the next due time (at most an hour ahead), and creating, approving or moving a release or an automation moves the alarm earlier. The class is declared on every deploy, so switching tickers needs no migration. The choice is remembered in `.cloudhal/deploy/state.json`; `cloudhal deploy --scheduler cron` tries the cron trigger again. Deployments that used `CLOUDHAL_ANALYTICS_CRON=off` or `CLOUDHAL_COMMENTS_CRON=off` move to the alarm on their next deploy, and the analytics rollup and comments job run on schedule again instead of after requests.
- **Request backstop.** Every admin request (Studio, API, MCP) checks the heartbeat at most once a minute; if the scheduler is more than two minutes behind, the request runs a tick in the background. This also covers the minutes after a deploy before Cloudflare starts the new cron. It is a safety net, never the scheduler: cached page views do not run the Worker, so site traffic cannot drive schedules.
- **First tick.** The first tick after the upgrade only registers the periodic jobs' watermarks; the analytics rollup and the comments job then run from the next :17.

### On Node
`cloudhal dev`, `cloudhal studio` and `cloudhal mcp` run the same `runDue` on a timer of at most 60 seconds, with a catch-up tick at start: releases missed while the process was down run if they are within the hour and are marked missed otherwise. Several processes on one SQLite file are safe. A self-hosted server without a long-running Cloudhal process runs `cloudhal schedules run-due` from the system's cron every minute. The Node clock is the server's clock: keep it synchronised (NTP), since a wrong clock publishes at the wrong time.

### Health
- The heartbeat records the last tick, what woke it and when the next one is expected. The scheduler is **late** when it is more than 2 minutes overdue while something is due within 24 hours, and **stopped** when it is more than 10 minutes overdue at all. Then Administrators, and anyone with a release due within 24 hours, get a "scheduler stalled" notification, and Studio's Schedules page shows a banner.
- `GET /api/scheduler` (any signed-in person): mode, state (`running`, `late`, `stopped`, `unknown`), last tick, next wake, the next due item and the 7-day lateness of published releases (p50, p95).
- `cloudhal schedules status [--remote]`: the same health, plus each site's open releases and gated pages and entries. `cloudhal schedules list [--remote] [--limit <n>]` lists releases; `cloudhal schedules run-due [--remote]` runs one tick now. `--remote` uses the deployment token.
- Each tick logs one line, e.g. `schedules tick (cron): 1 release, 0 late, 2 jobs; next 06:07Z`.

### Measured on Cloudflare (2026-10-12, Workers Paid)
Live measurements on the maintainer's Workers Paid account, rollout step 0:

| What | Result |
|---|---|
| Every-minute cron after a deploy | first fired about **7 minutes** after the deploy (the request backstop covers the gap) |
| Every-minute cron, delay after the scheduled minute | **0 of 106** ticks missed; delay p50 **4.3 s**, p99 **24.6 s**, max **27.2 s** |
| Durable Object alarm, delay after the set time | **0 of 113** missed; p50 **13 ms**, max **92 ms** |
| Short edge lifetime (`cloudflare-cdn-cache-control: max-age=30`) | honoured: the oldest copy served over 60 requests was **27.8 s** old, so a gate takes effect without a purge |
| Workers Cache and responses without caching headers | Workers Cache **cached GET responses that carried no caching header**. Every API and feature endpoint therefore answers `cache-control: no-store` unless it sets its own header. |

In practice a release on the cron ticker goes live within about half a minute of its time, usually within 5 seconds; on the alarm ticker within a second.

### Still to verify on Workers Free
These step-0 checks (RFC-0008 §2) have **not** been run on a Workers Free account yet; the numbers above are from Paid:
- **L1** cron delay over 48 hours on Free;
- **L2** that changing the trigger from hourly to every minute keeps the same slot, and the exact cron-limit error text;
- **L3** Durable Object alarm precision and retries on Free (SQLite-backed class);
- **L5** CPU and query count of running a release inside a tick on Free (10 ms CPU, 50 D1 queries) for sites of 500 and 2,000 nodes;
- **L6** whether cron triggers and alarms still run after a Free account has used its 100,000 requests for the day;
- **L7** how statements inside one `batch()` count toward D1 Free's 50 queries per invocation.

## Automations

An automation is recurring work: a **built-in job** or a **scheduled agent task**. Creating, changing, resuming, running and deleting automations is for people (`automations:manage`: Editors and above), in Studio or over REST; agents can only list them and pause their own.

### Built-in jobs
Deterministic, run as the system on behalf of the owner; they touch no content and need no agent.

| Job | Reads | Produces | Never |
|---|---|---|---|
| `broken-links` | internal links in live articles, pages and menus; the top 404 paths from analytics | findings and redirect proposals a person turns into redirects | creates redirects or edits content |
| `stale-content` | live articles not updated for `staleAfterDays` (default 365) | a review list and a notification | edits |
| `feed-check` | RSS, sitemap and JSON-LD as rendered now | findings, including a check that no embargoed or expired content appears | changes anything |
| `weekly-digest` | analytics, comments, the week's release outcomes, stale counts | a Studio notification | sends anything outside Studio |
| `cleanup` | runs older than 90 days, finished releases older than 400 days, old drafts, unused media | deletes the first two; reminders and proposals for the rest | deletes content |

They run in small steps across ticks on large sites. After downtime only the latest missed occurrence runs; earlier ones are recorded as one skipped run. (Status: the job bodies land with rollout step 9.)

### Scheduled agent tasks
An agent task asks an **external** agent — a Claude Code routine, a GitHub Actions or Agentic Workflows job, an n8n flow, your own script — to do something at each occurrence, with limits Cloudhal enforces.

- **The key.** Creating an agent task mints a **per-automation agent key**, owned by its creator. Its secret is shown **once**, in the creation answer; store it in the external platform's secret store. Its scopes are chosen within the creator's role and narrowed to the creator's current role on every call.
- **Only inside a run.** Outside an open run, the key answers `outside_run` for every tool except `begin_run`, `get_mode` and `pause_automation`. A leaked key is useless between occurrences.
- **The run window.** Each occurrence opens a window of `windowMinutes` (5–240, default 30). The window follows the recurrence, not the ticker: `begin_run` works whenever now is inside a window, scheduler or not. A window that closes without `begin_run` records a missed run.
- **`begin_run { automationId }`** opens the run (once per occurrence; calling it again during the run returns the same envelope) and answers the **run envelope**: `runId`, `siteId`, the owner's `instructions`, the effective `mode`, the `tools` the run may call, the `budget` and what is left of it, `endsAt`, and the rules.
- **`end_run { runId, summary, outcome }`** closes it. `outcome` is `did-work`, `nothing-to-do`, `proposed` (it left proposals) or `waiting-approval` (it filed requests); Studio shows "ran" and "did something" apart. A run still open at `endsAt` fails.
- **Runs never wait for people.** A call that needs one files a request (marked with the run) and returns at once; for releases, Cloudhal carries the approval out at the release's time. `get_mode` inside a run reports the run, its end, the budget left and whether it is tainted.
- **Mode cap.** The run's mode is the key's mode capped by the automation's `modeCap` (`plan`, `manual`, `edits` — the default — or `auto`; never `bypass`). `plan` only reads; `manual` may propose and label, everything else waits; `edits` may write drafts and reduce visibility, publishing waits; `auto` adds low-risk releases inside the window, never while tainted. `request_elevation` is refused inside runs.

### Budgets and caps
| Limit | Default | When exceeded |
|---|---|---|
| tool calls per run | 100 | the run ends (`budget-exceeded`) and the automation pauses |
| writes per run (calls that snapshot) | 20 | same |
| approval requests per run | 5 | same |
| minutes per run | 15 (and never past the window) | same |
| consecutive failed runs | 3 | the automation pauses itself (`auto-paused`) and its owner is told |
| automation writes per site per UTC day | 200 (Site settings › Schedules, `PUT …/schedule-settings` `dailyWriteCap`) | further writes are refused until midnight UTC |
| more than 50 hiding calls, or 10 refusals in a row, in one run | — | the run is killed and the automation pauses |

Cloudhal cannot see the external agent's own tokens or spend: set the platform's limits too (turn caps, timeouts, credits).

### The taint rule
Unattended runs mix private data (embargoed drafts), text written by strangers and tools that act. Cloudhal enforces the separation, not the model's judgement:
1. A run is **tainted** from the first call of a tool that returns visitor-written text: `list_comments`, `get_comment_thread`, `broken_links`, `get_analytics`, `top_content`, `fetch_asset_url`. From then on it may only read, label (`label_comments`), hide and pause; anything else answers `tainted`. The run records when and by which tool.
2. `fetch_asset_url` is not available inside runs at all.
3. An automation **declared to read visitor text** (`readsUntrustedText: true`) cannot hold `content:write`, `site:publish`, `schedules:write`, `releases:publish` or any `asset:` scope: its key is created without them and they are stripped on every call. A writer and a triage agent are two automations.
4. Run summaries are agent-written: Studio shows them as plain text, and other agents receive them inside `<run-summary>` blocks marked as untrusted.

### Kill switches
1. **Pause one automation**: a person, or the automation's own agent (`pause_automation`, in every mode: stopping never waits). Only a person resumes it.
2. **Pause schedules and automations for the site** (Administrators and above, Site settings › Schedules; `PUT …/schedule-settings` with `{ "paused": true, "reason", "rev" }`): due releases wait (and are missed after an hour), windows do not open, open runs are killed, every active automation pauses. Turning it off resumes exactly the automations it paused.
3. **`CLOUDHAL_AUTOMATIONS=off`** on the admin Worker: automations stop; releases and gates go on. `cloudhal deploy` does not set this variable yet: set it on the admin Worker in the Cloudflare dashboard, and check it after each deploy, which rewrites the Worker's variables.
4. **Revoke the automation's key** (Agents page): its calls stop at once; releases a person approved still run.
5. **Rollback**, as always.

## Recipes

### Schedule an article from an agent
The official `publish-article` skill does it: after the editorial checklist it calls `schedule_release` with the article and a time instead of `publish`, or `set_embargo` / `schedule_unpublish` for embargoes and expiries. The demo newsroom's editor agent does the same for a batch of articles:

```bash
# in the site's time zone; an instant (2026-11-02T06:00:00Z) or on-approval also work
node apps/demo-newsroom/scripts/editor-agent.ts --url https://<studio-host>/mcp --at 2026-11-02T09:00
```

The key needs `content:write` and `schedules:write`. The script writes the articles, pins exactly what it wrote as one release and stops; a person approves the request in Studio and the release goes live at 09:00. Locally (`--project`), `cloudhal mcp` asks you in the terminal and schedules it at once.

### Create a scheduled agent task
People create agent tasks in Studio (Schedules › New automation), or over REST as a signed-in person with `automations:manage`:

```http
POST /api/sites/:siteId/automations
content-type: application/json

{
  "name": "Nightly comment triage",
  "recurrence": { "start": "2026-10-14T02:07", "timeZone": "Europe/Istanbul", "preset": "daily" },
  "job": {
    "kind": "agent-task",
    "instructions": "Triage the comment queue with the comment-triage skill. Never approve.",
    "skill": "comment-triage",
    "modeCap": "edits",
    "readsUntrustedText": true,
    "windowMinutes": 30,
    "budget": { "maxToolCalls": 60, "maxWrites": 0, "maxApprovalRequests": 0, "maxMinutes": 10 },
    "scopes": ["site:read", "comments:read", "comments:moderate", "schedules:read"]
  }
}
```

The answer carries `automation` and, once only, `key.secret`. Without `job.scopes` the key gets the scopes of its mode cap within your role (minus write scopes when it reads visitor text).

### The external agent's loop
Whatever runs the agent, the loop is the same: wake up shortly after the occurrence, `begin_run`, do the work within the envelope, `end_run`. A minimal client with the TypeScript MCP SDK (the same one the newsroom's editor agent uses):

```ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const client = new Client({ name: "nightly-triage", version: "1.0.0" }, { capabilities: {} });
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://<studio-host>/mcp"), {
    requestInit: { headers: { "x-api-key": process.env.CLOUDHAL_AUTOMATION_KEY! } },
  }),
);
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error((r.content as { text?: string }[]).map((c) => c.text).join(" "));
  return r.structuredContent as Record<string, any>;
};

const run = await call("begin_run", { automationId: process.env.CLOUDHAL_AUTOMATION_ID });
// run.instructions, run.mode, run.tools, run.budgetLeft, run.endsAt, run.rules
let outcome = "nothing-to-do";
let summary = "Nothing pending.";
try {
  // … the work: hand run.instructions and run.tools to your model, or do it deterministically …
} catch (e) {
  summary = `Stopped: ${(e as Error).message}`.slice(0, 2000);
} finally {
  await call("end_run", { runId: run.runId, summary, outcome });
  await client.close();
}
```

- An `outside_run` error from `begin_run` means no window is open (the run already ended, the automation is paused, or the site's kill switch is on): exit quietly.
- Schedule the external job a few minutes after the occurrence and inside the window (an occurrence at 02:07 with a 30-minute window: run it between 02:08 and 02:30). A **Claude Code routine** or a **GitHub Actions** `schedule:` trigger can call the script above, or give the model the Cloudhal MCP server with the key and the skill's instructions. In **n8n**, a Schedule Trigger followed by MCP client calls to `begin_run`, the work, and `end_run` does the same.
- Keep the key in the platform's secret store, never in the repository or the prompt. Set the platform's own limits (turns, timeout) at or below the automation's budget.

### Nightly comment triage (reads visitor text: label and hide only)
- **Automation:** daily at 02:07 in the site's zone, `modeCap: "edits"`, `readsUntrustedText: true`, scopes `site:read, comments:read, comments:moderate, schedules:read`, budget as above with `maxWrites: 0`.
- **Skill:** [`comment-triage`](../../skills/official/comment-triage/SKILL.md). It reads the counts first (`comments_summary`, no reader text), then the pending and reported comments (from here the run is tainted), labels them in one call, marks obvious spam and hides clearly abusive or personal-data comments with a reason, and ends with a summary of counts only.
- **What it cannot do, whatever a comment says:** approve, restore or reply (a person decides those in every mode, and a tainted run is refused), or touch content, publishing or schedules (the key has no such scope). The worst a fooled run can do is mislabel or hide comments, which is reversible and audited.

### Weekly content review (a proposal, never a publish)
- **Automation:** weekly on Monday at 07:07, `modeCap: "edits"`, `readsUntrustedText: false`, scopes `site:read, content:read, content:write, preview:create, schedules:read, schedules:write` (no `site:publish`, no `releases:publish`), budget `maxWrites: 10`, `maxApprovalRequests: 0`.
- **Skill:** [`stale-review`](../../skills/official/stale-review/SKILL.md). It picks at most five published articles not updated for a year, makes only safe fixes (aged relative dates, missing summaries, dead internal links, broken formatting) as working-copy edits, previews them, and leaves **one draft release** (`propose_release`) titled "Content review: <date>" with a note per article. It ends with `outcome: "proposed"`.
- **A person** opens the release in Studio, compares each item, and schedules it, edits it, or discards it. The agent never schedules or publishes, never moves `publishedAt`, and must not read comments or analytics in this run (that would taint it and refuse the proposal).
- The edits sit in the working copy until the release (or a person's ordinary publish) takes them live; the release note says what changed.

## Reference

**MCP tools** (agents; classes per ADR-0015 modes):

| Tool | Scope | What waits for a person |
|---|---|---|
| `list_schedule`, `get_schedule`, `list_releases`, `get_release`, `list_automations`, `list_runs`, `get_run` | `schedules:read` | nothing (read) |
| `propose_release` | `schedules:write` (own) | nothing; refused in `plan` |
| `schedule_release` | `schedules:write` (own) | always, except low-risk releases in `auto` inside the window, and local `bypass` |
| `reschedule` | `schedules:write` (own) | always: an agent's move voids the approval (in `auto`, a low-risk release inside the window is re-approved) |
| `cancel_schedule` | `schedules:write` (own) | in `manual`; canceling a release that removes or expires content, always |
| `set_embargo` | `schedules:write` + `content:write` (own) | in `manual` |
| `lift_embargo` | `schedules:write` (own) | always, in every mode (a person, Editor and above) |
| `schedule_unpublish` | `schedules:write` + `content:write` (own) | always, except local `bypass` |
| `begin_run`, `end_run`, `pause_automation` | the automation's own key | never |

**REST** (people; under `/api/sites/:siteId`): `GET /schedule` (calendar, at most 62 days per request), `GET|POST /releases`, `GET|PATCH /releases/:releaseId`, `GET /releases/:releaseId/diff`, `POST /releases/:releaseId/{items,schedule,reschedule,repin,unschedule,cancel,publish-now}`, `POST /gates`, `POST /gates/:nodeId/lift`, `GET|POST /automations`, `POST /automations/preview-rule`, `GET|PATCH|DELETE /automations/:automationId`, `POST /automations/:automationId/{pause,resume,run-now}`, `GET /runs`, `GET /runs/:runId`, `GET|PUT /schedule-settings`. Plus `GET /api/scheduler`, and for the operator (deployment token) `GET /api/admin/schedules/status` and `POST /api/admin/schedules/run-due`. Writes take the `rev` you read.

**Scopes.** `schedules:read` (new keys get it in every mode; existing keys can be widened with "Allow schedules" on the Agents page), `schedules:write` and `schedules:write:own` (new keys from `manual` up), `releases:publish` and `releases:publish:own` (implied by `site:publish` and `site:publish:own`, so no role changes meaning; a key can be given "schedule, never publish now"), and the person-only `automations:manage`.

**Notifications** (Studio's bell): approval due within the hour, publishing within 15 minutes, published (with lateness), conflict, missed ("Publish now"), expired, failed, scheduler stalled, automation paused, automation run failed, weekly digest.

## Deployment notes

- `cloudhal deploy` adds the minute cron trigger, the `SchedulerClock` Durable Object and its migration, and `CLOUDHAL_SCHEDULER` (`cron` or `alarm`). Migration `0017_schedules` runs on the admin Worker's first request.
- **Downgrades are refused while schedules are in use.** Older code ignores holds and gates, so an ordinary publish could release held content and an older site Worker would show embargoed pages. `cloudhal deploy` compares the code's schedules level (`cloudhal.schedulesLevel`) with the deployment's and refuses to go back while the deployment has open releases or gated pages, unless `--force-downgrade`.
- **`cloudhal push` refuses while the deployment has open releases** (their pinned versions point into the graph a push replaces), unless `--cancel-schedules` cancels them first. Releases and automations do not travel in `push`/`pull` bundles.
- **Tick budget.** The admin Worker ticks within Workers Free's limits by default (40 statements, 1 release per tick). On Workers Paid, set `CLOUDHAL_TICK_BUDGET=paid` on the admin Worker (900 statements, up to 50 releases per tick); like `CLOUDHAL_AUTOMATIONS`, `cloudhal deploy` does not set it yet.

## Free plan notes and costs

- **The minute tick** costs 1,440 Worker requests a day (1.4 % of Workers Free's 100,000), about 4,300 indexed D1 reads and about 290 heartbeat writes (0.3 % of D1 Free's daily writes). The Durable Object clock instead costs at most a few dozen alarms and D1 rows a day.
- **One release per tick on Free.** A tick stays within 40 of D1 Free's 50 queries per invocation; a published release takes about 17 statements, so the Free budget runs one release per minute. Two releases set for the same minute go live a minute apart.
- **Large releases on Free.** Pinning writes at most 20 new versions per request (Studio and `POST …/items` build bigger releases in steps). Whether a release on a 2,000-node site fits Free's 10 ms of CPU per tick is still to be measured (L5); Paid is the recommendation for large sites.
- **The daily automation write cap** (200) keeps a runaway automation from using up D1's 100,000 daily writes, which would stop the whole CMS until midnight UTC.
- **Workers Paid** ($5 a month): schedules cost nothing extra for small, medium and large sites — 43,200 tick requests a month against 10 million included, about 0.5 million D1 rows written against 50 million, Durable Object usage far inside the included amounts.

| Cloudhal's side, per day | Small (20 releases a month, 2 weekly built-ins) | Medium (300 releases a month, 5 built-ins, 2 hourly agent tasks) | Large (100 releases a day, 10 automations incl. hourly triage) |
|---|---|---|---|
| Extra Worker requests | ≈ 1,450 (1.5 % of Free) | ≈ 4,400 (4 %) | ≈ 16,000 (16 %) |
| D1 rows written | ≈ 310 (0.3 %) | ≈ 3,500 (3.5 %) | ≈ 17,000 (17 %) |
| D1 rows read | negligible | ≈ 60,000 (1.2 %) | ≈ 400,000 (8 %) |
| Cache purge requests | ≈ 1 | ≈ 10–30 | ≤ 2–3 a minute at peaks, inside the shared budget |

These are estimates from [RFC-0008 › Cost](../rfcs/0008-schedules.md#cost); external agents' own costs are theirs. Small and medium sites fit Workers Free comfortably; a large site meets Free's request ceiling through its own traffic first.
