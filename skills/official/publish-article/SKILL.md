---
name: publish-article
description: Check a draft article, file it under the site's categories and tags, produce a preview and submit it for publication now or at a set time, optionally under an embargo or with an expiry. Use when the user asks to publish, release, schedule or go live with an article.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (get_entry, list_taxonomies, list_terms, resolve_terms, propose_term, update_entry, preview_page, create_snapshot, publish; for later or timed publishing get_site, schedule_release, propose_release, get_release, set_embargo, schedule_unpublish). Publishing stops at a human approval gate.
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create,site:publish,schedules:read,schedules:write"
  cloudhal.approval: "publish,schedule_release"
---

# Publish article

## Steps
1. `get_entry` and run the editorial checklist in `references/editorial-checklist.md`; fix what you can with `update_entry` (never rewrite the author's voice). An answer `scheduled_locked` means the article is in a scheduled release: stop and tell the user which release and when (`get_release`); a person unschedules it.
2. File it. `list_taxonomies` tells you which taxonomies are `required` (they need a primary term before review), how many terms an article takes (`maxPerEntry`) and who may add terms (`allowNewTerms`). `list_terms` (or `resolve_terms` for the words you have in mind) shows the vocabulary. Set the terms with `update_entry` → `terms`, e.g. `{"category": {"primary": "News"}, "tag": {"add": ["AI", "Agents"]}}`; ids, slugs, names and synonyms all work.
3. If no tag fits, call `propose_term` once with a one-sentence reason; the tag stays private until a person approves it. Never propose a category: if none fits, stop and ask the user.
4. Move the entry to `review`, then `preview_page` the article and the listing page; read the HTML back.
5. Move it to `published` only if every checklist item passes.
6. Decide when it goes live:
   - **Now** (the user said "publish" with no time): go to step 7.
   - **Later** ("publish Monday at 09:00", "schedule it", "when approved"): go to step 8.
   - **Embargo** ("not before 10:00", "under embargo until …"): call `set_embargo` with the instant as `from` before anything is published. The site keeps the article off every page, list, feed and sitemap until then, on its own; then publish now (step 7) or later (step 8).
   - **Expiry** ("take it down after Sunday"): after it is live or scheduled, call `schedule_unpublish` with the time. Taking content down always waits for a person.
7. Call `publish` with a label like "Publish: <title>". The server answers `input_required` (or "approval pending"): present the diff summary — it lists the article and its term changes — and pass the person's decision back. If declined, leave the entry in `published` state but the site unpublished, and say so. Report the live snapshot id.
8. Call `schedule_release` with `nodeIds: [<entry id>]`, a `title` like "Publish: <title>" and `when`:
   - `{"localTime": "2026-11-02T09:00"}` for a wall-clock time the user gave. It is read in the site's time zone (`get_site` → `timeZone`, absent = UTC); add `"timeZone"` only when the user named another zone;
   - `{"at": "2026-11-02T06:00:00Z"}` for an exact instant;
   - `"on-approval"` for "as soon as someone approves it".

   The release pins the article (and the terms and media it needs that are not live yet, listed in the answer) at exactly the versions you just wrote. Report the release id, the time in the site's zone and the status:
   - `approval-pending`: a person approves exactly these versions in Cloudhal Studio (site → Activity → Approvals) and Cloudhal publishes them at that time. **Do not poll and do not call again**; `get_release` shows the outcome whenever the user asks.
   - `scheduled`: it is approved already and will publish at that time.
9. More than 30 days ahead, or when the user only wants it lined up: call `propose_release` instead (same items and time). It leaves a draft a person schedules in Studio.

## Rules
- Publishing always requires explicit human confirmation; never retry `publish` or `schedule_release` with a fabricated confirmation, and never call `schedule_release` again for a request that is pending.
- One article per publish or release; batch requests become separate runs.
- Scheduled content is locked until it is published or unscheduled: do not try to edit it, and do not cancel a release the user did not ask you to cancel.
- Never publish before an embargo and never move one earlier: `lift_embargo` asks a person, with your reason, and only when the user asked for it.
- Reuse the vocabulary: an error such as `unknown_term` lists close terms — pick one of them before proposing anything new. Terms are never created implicitly.
- Do not change the slug of a published article: it leaves a redirect and waits for a person.
- Do not set `publishedAt` on an embargoed article: Cloudhal dates it at the embargo time.
