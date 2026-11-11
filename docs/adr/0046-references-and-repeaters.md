# ADR-0046: Collections stage 4: reference fields by translation group, guarded by an `entry_refs` index; repeaters of flat items
- Status: Accepted
- Date: 2026-11-11 (decided by Halil, RFC-0045 accepted 2026-11-10; lands with rollout step 2a)
- Related: RFC-0045, RFC-0041 / ADR-0043, RFC-0042 / ADR-0044, RFC-0033 / ADR-0035, RFC-0004 (`asset_refs`), RFC-0008 / ADR-0023 (releases), #114, #71
- Sources: [Sanity reference type](https://www.sanity.io/docs/studio/reference-type) · [Payload relationship field](https://payloadcms.com/docs/fields/relationship) · [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) · [SQLite JSON functions](https://www.sqlite.org/json1.html)

## Context
Collections have typed fields (ADR-0043), but a venue, a speaker or a brand is still plain text retyped on every entry, and a recipe's ingredients are lines of one text field. Two field types fix that, and each needs integrity rules that hold under D1, which has only atomic batches (AGENTS.md rule 4).

## Decision
1. **Two types.** `reference` (one to five target collections of the same site, one target or up to 50) and `repeater` (up to 50 items of up to ten flat scalar sub-fields; no nesting). Both are refused on every write path until rollout step 7, when the site Worker reports `fields: 2`: definitions with `fields_unsupported`, field operations that name them with `field_operation_unsupported` (until step 4).
2. **A reference stores a translation group id**, `COALESCE(translation.group, id)`, the one identity shared by every language version in every site. It resolves only through members of the page's own site, in the page's locale, then `localization.fallback`. Membership is that expression everywhere (guards, renderer, purges).
3. **`entry_refs`** holds one row per (holder, field path, stored group id), whatever the target's state, written in the holder's own batch, anchored on its new hash, with a plain `INSERT` (never `OR IGNORE`) that reads `shared` from the site row at batch time. Every guard and lookup filters `site_id`.
4. **Strong where the live site depends.** Only what a published entry shows locks: a delete, a move out of every allowed collection, or a group change of a group's last usable member is refused while a published entry shows a reference to it (`entry_referenced`, `reference_target_moved`). Archiving and unpublishing are always allowed; an unresolved reference renders nothing. Publishing a *site* warns (`referenceIssues`) and never fails; publishing a *referrer* whose own value names a group with no usable member is refused (`unknown_entry`).
5. **Races are closed at batch time**, not by reads: the target guard in the referrer's CAS; the definitions anchor (a collection's definitions as planned) on every entry write in a site with reference fields, and on writes that change values elsewhere; the collections anchor on every delete, move and group change. Both anchors compare the fragment's stored text, read when the write is planned and checked against the planned `Site`, so they never depend on the row's key order; planned pairs with an unseen-field check; the written-group and dependants guards on translation links (`translation_group_in_use`). The cases R1–R16 of RFC-0045 §2.3 are shared-suite tests, except R9 (field-operation rewrites, rollout step 2b; unreachable before step 4) and R14 (accepted, holds).
6. **Rebuilds only beside a written node set** (imports, pulls, pushes, restores), chunked below 90 KB a statement. References are not release dependencies (rollout step 2b).

## Consequences
- Existing sites see the phase-2 behaviour changes listed in RFC-0045's "Decisions" (relink refusal, the `readsOriginal` tightening with a one-time rebuild of listed collections' `entry_list_values`, canonical import bodies, the anchors' 409s on concurrent settings changes, `field_operation_unsupported`).
- Purges read the published and previous snapshots' bodies (rollout step 3); no new cache tags.
- Per-sub-field localization, `datetime` and multiple values inside items, and sorting by a referenced entry's field stay out of stage 4 (RFC-0045 open questions 2 and 3, §4).
