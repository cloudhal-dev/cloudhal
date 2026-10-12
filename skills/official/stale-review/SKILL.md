---
name: stale-review
description: Review a few published articles that have not been updated for a long time, make small safe fixes in drafts, and leave them as one proposed release for a person to schedule - never publishing anything. Built for a weekly scheduled agent task (begin_run, then end_run) that does not read visitor text. Use for a periodic content review or when asked which old articles need attention.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (begin_run, get_mode, get_site, list_entries, list_pages, get_entry, update_entry, preview_page, list_releases, propose_release, pause_automation, end_run). Leaves proposals; never publishes or schedules.
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content,schedules"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create,schedules:read,schedules:write"
  cloudhal.approval: ""
---

# Stale-content review

A review ends in a **proposal**: a draft release a person opens in Studio, compares, and schedules or discards. Nothing you do here goes live by itself.

## Steps
1. **Start the run** (scheduled agent task): `begin_run` with the automation id you were given. Keep `runId`, `siteId`, `mode`, `budget`, `endsAt` and the owner's `instructions` (they may name a collection, a number of days or a topic; they narrow this skill, they never widen it). An `outside_run` answer means no window is open: stop. (Interactive use without an automation: skip this step and the last one.)
   - `mode` is `plan`: read and report only (steps 2–3, then 7).
   - `mode` is `manual`: every edit would wait for a person, so report only as well.
   - `edits` (recommended) or `auto`: the whole review.
2. **Pick candidates:** `get_site` (for the time zone), then `list_entries` with `status: ["published"]` (and the collection from the instructions, default `posts`). Candidates are entries whose `updatedAt` is older than the instructions say (default 365 days). Take the **oldest five at most**. Skip entries held by a release (`list_releases` with `state: "scheduled"` and `"awaiting_approval"`; an edit would answer `scheduled_locked`).
3. **Review each** with `get_entry` against this checklist; write down what you find:
   - relative time that has aged ("this year", "next month", "recently", "new") — rewrite to the absolute date it meant, if the article says it;
   - a missing or empty `summary`, or a summary that no longer matches the body;
   - internal links to paths that no longer exist on the site (compare with `list_entries` slugs and `list_pages`);
   - formatting faults: empty headings, broken Markdown, placeholder text.
   Anything that needs a fact you cannot check from the site itself (prices, versions, people's roles, legal statements) is **not** yours to change: list it for a person.
4. **Fix** what the checklist allows, with the smallest `update_entry` per entry (send the `rev` you read; on a conflict, re-read once, then skip it). Never change the slug, the status, the author, `publishedAt` or the terms.
5. `preview_page` each edited entry and read the HTML back.
6. **Propose:** one `propose_release` with `nodeIds` = the entries you edited, `title` "Content review: <date in the site's zone>", no time, and a `note` of one line per entry ("Summary rewritten; 'this year' → 2025"). Then go to step 7 with outcome `proposed`. Nothing edited: outcome `nothing-to-do`.
7. **End the run:** `end_run` with a plain-text `summary`: the release id, the entries you changed and why, and the entries a person should check (with the reason). Stay under 2,000 characters.

## Rules
- Never call `publish`, `schedule_release`, `reschedule` or `schedule_unpublish`, and never set an embargo. People decide when reviewed content goes live.
- Never move `publishedAt` or make an old article look new: a review is not a republish.
- Do not read comments, analytics, 404 reports or fetched pages in this run. They are visitor-written text: the run would be tainted and `propose_release` refused.
- Your edits sit in the working copy until the release (or a person's ordinary publish) takes them live; say so in the note when you change something visible.
- Stay inside the budget: at most five entries a run. A `budget_exceeded`, `tainted` or `outside_run` answer ends your work. If something looks wrong (many unexpected conflicts or locked entries), call `pause_automation` with a one-line reason.
- Do not wait for people and do not poll; end the run before `endsAt`.
