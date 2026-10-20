# RFC-0035: Publishing one page without a release

- Status: Draft (2026-10-18). Implemented in the same PR so it can be tried; it takes effect when accepted.
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-18
- Related: RFC-0001 (page `status`), RFC-0005 (roles: pages are Editor work), RFC-0008 (releases; §24 "approving a release publishes the drafts it holds"), RFC-0033 (§2 "Publish: per translation, through each node's existing `status`"), ADR-0035.

## Summary

A page's own `status` can be changed directly, like an article's: Studio shows **Publish** as a draft page's next step and **Publish / Unpublish** in the Pages list's row menu, and the MCP tool `update_page` takes an optional `status`. The site Publish dialog says how many pages are still drafts or in review, since a site publish takes each page as its status says. Nothing new is enforced: the store's existing invariants (a machine translation in a review-required collection, or one with failing checks, is not published; release holds) apply unchanged.

## Motivation

- On the demo newsroom, four Turkish translation pages stayed drafts after the owner pressed site Publish. The snapshot went live; the pages were left out, as their status said.
- Studio offered no direct way out. A draft page's next step was "Send to review", then "Publish": a two-step editorial flow designed for articles, with nothing on a page to suggest it. The visible alternative, "Schedule…", wraps the page in a release (RFC-0008), which is far more than "publish this now".
- An agent could not do it either: `update_page` said "Status changes are not allowed here", and `schedule_release` needs `schedules:write`, which a content key does not hold.
- The restriction was not a decision. The REST API (`PUT /pages/:id`) and the store already accepted any status; RFC-0008 routes *timed* publication through releases and never claimed the only path; RFC-0033 §2 says each translation publishes through its own status. Only the MCP tool's input schema and Studio's article-shaped flow left it out.

## Proposal

**MCP.** `update_page` gains one optional input:

```jsonc
"status": { "type": "string", "enum": ["draft", "review", "published", "archived"],
            "description": "The page's own status (RFC-0035); live after the next site publish" }
```

The handler copies it onto the page before `store.updatePage`, as `update_entry` does. Scopes stay `content:write`; the call snapshots afterwards as before.

**Studio.**

1. `StatusActions` gains `directPublish`. With it, a draft's primary next step is **Publish** (opening the same `ApprovalDialog`), and "Send to review" moves into the More actions menu. The page editor sets it; the article editor does not, so articles keep draft → review → published.
2. The Pages list's row menu adds **Publish** (draft or review; approval dialog) and **Unpublish** (published; back to draft, no approval, as in the editor). Both are disabled with the reason when the person may not change pages (`pages.write`).
3. The site Publish dialog shows "N pages are not published" (drafts and pages in review) with a **Review pages** action, read only while the dialog is open.
4. The page publish dialog says the page goes live with the next site publish and that other pages and languages keep their own status.

**Invariants** (unchanged, restated):

1. A page's status changes only through `store.updatePage`, so `checkLocalizedNode` still refuses `published` for a machine translation with failing checks (`invalid_translation`) or in a collection listed in `localization.review.required` without a review (`review_required`).
2. A page held by a pending release cannot be changed (`assertUnlocked`), so this never races a scheduled publish.
3. A page's status is working-copy state. Visitors see it only after a site publish (snapshot), which keeps its own approval point and role rules (RFC-0005 §4).

## Alternatives considered

| Option | Pros | Cons | Why not |
| --- | --- | --- | --- |
| "Publish now" through a one-item release (`publish-now`) | reuses RFC-0008 approvals and history | needs `schedules:write`/`releases:publish`; publishes the whole site at once; heavy for a status flag | a release is for timing; nothing here is timed |
| Site Publish also publishes every draft page | one click | publishes work nobody meant to ship; breaks per-translation review (RFC-0033) | silent and unsafe |
| Leave it; document "send to review, then publish" | no change | the gap that left four translations offline remains; agents still cannot do it | the problem is real |
| A separate `set_page_status` tool | narrow, auditable | one more tool for a field `update_entry` already takes inline | inconsistent with articles |

## Compatibility & migration

No contract change (`Page.status` exists), no data migration. `update_page` callers that never send `status` behave as before. Rolling back the code removes the input; pages keep whatever status they were given.

## Security & policy impact

No new scope. `update_page` already needs `content:write`, and the REST route `PUT /pages/:id` already accepted a status with the same scope; the MCP tool now matches it. Going live still requires a site publish, which is approval-gated for agents.

## Open questions

1. Should the article editor offer `directPublish` to Editors too (skipping review for their own articles)? Not proposed here.
