---
"@cloudhal/astro-renderer": minor
"@cloudhal/core-ts": patch
---

RFC-0045 rollout step 3a: the renderer resolves reference and repeater fields. Both types stay refused on every write path until rollout step 7, so nothing changes for existing sites.

- **`@cloudhal/astro-renderer`.**
  - `entryFields` resolves a reference to cards (`RenderedField.references`: `ReferencedEntry` with group id, id, collection, locale, slug, title, summary, URL, cover image and `fromFallbackLocale`), in stored order, by `pickMember`'s locale rule among the members the source's view shows, gates included. `depth: 2` adds each card's own fields, with their references as cards without fields. Resolution is breadth-first over a visited set of groups, one `groupMembers` call per level, and spends the request's 200 targets (`PlaceholderBudget.references`; `placeholderBudget()` includes it); past the budget the rest resolve to nothing, with one `console.warn` per request.
  - A repeater renders its items' sub-fields (`RenderedField.items`), like fields; empty items are left out.
  - An unresolved target leaves nothing behind: no id, no title, no empty item. `value` keeps only the resolved group ids.
  - `GraphSource.groupMembers?` and `GraphSource.referencedBy?` on `SnapshotSource` (in memory: gate-independent indexes built once per snapshot, filtered per view) and `LiveSource` (one `entry_refs` read expanded by the `shared` rule, each candidate resolved like the snapshot's index). `referencedBy` lists entries whose resolved values name the group, newest first, at most 100.
  - `GraphSource.conversionEntries?` builds the entry maps of a text ↔ reference conversion while one runs (rollout step 4 adds the conversions).
  - `EntryFields.astro` draws references as links (`lang` on a fallback-locale card, a `ul.ch-references` for several) and repeaters as an `ol.ch-items` of nested `dl`s. Old theme copies get both with no change of their own.
  - The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2, "fields": 2 }`.
- **`@cloudhal/core-ts`.** `getGroupMembers` and `referrerCandidates` (the live renderer's reads, by `site_id`); `conversionEntries`, `conversionTargets`, `conversionCollections` and `foldText` in `./fields`; `resolveFields` takes an optional fourth argument with the conversion maps (`ConvertContext.entries`).
