---
"@cloudhal/api": patch
"@cloudhal/core-ts": patch
---

RFC-0045 rollout step 6a: reference and repeater fields in Studio's entry editor. The two types stay refused on every production write path until step 7 (`fields_unsupported`), so no production collection can define them yet and Studio looks unchanged there.

- **New read-only route `GET /api/sites/:siteId/entries/groups?ids=a,b`** (`content:read`, in the playground's allow-list): each translation group's members in the site, any status, as `{groupId, id, title, collection, status, locale}` cards (core-ts `getGroupMembers` and `referenceCard`); a group with no member left answers `[]`. One to 100 well-formed group ids (the per-entry reference cap), 400 otherwise, 404 for an unknown site. Studio reads the chosen targets' titles and states through it.
- **`fieldLabel`, `fieldHelp` and `optionLabel`** (`@cloudhal/core-ts/fields`) also take a repeater's sub-field definitions.
- **Studio** (not published): the entry editor's reference fields (`ReferenceList` and `EntryPicker` over `GET …/entries/pick`), repeaters (`RepeaterField`, focus after add and remove, an undo toast, item errors by path), and a "Used by" card from `GET …/entries/:id/references`, with the new `@cloudhal/ui` blocks `FieldControl`, `RepeaterField`, `ReferenceList`, `EntryPicker` and `UsedByList`. They load with the lazy fields chunk; the initial bundle is unchanged.
