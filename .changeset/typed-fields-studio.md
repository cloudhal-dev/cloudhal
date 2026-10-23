---
"@cloudhal/cli": minor
---

Typed custom fields, step 5 (RFC-0041 §7 / ADR-0043): Studio.

- **Entry editor › Fields:** collections with field definitions get a "Fields" card in the entry editor (loaded only for them), one control per type — text, rich text (the body editor), number, yes/no, date, date and time in its own zone, link, image (the media picker) and choice (one or several). Labels and help follow the Studio language, required fields say "Needed to publish", and the API's issues show on their field. On a translation, shared (non-localized) fields are read-only with the original's value and a link to it; empty per-language fields show the original's value as their placeholder. Values save with the entry.
- **Collection settings › Fields:** a builder to add fields (the key follows the label until saved), reorder them and edit labels, help, limits and options, saved together. Renaming, changing a type or the languages of a saved field, and removing one open a dialog that runs the dry run first (entries changed, values moved, converted or cleared, per language, examples, a note about themes), needs confirmation — and an explicit opt-in to clear values that cannot be converted — then runs the operation to the end and offers Revert. A running operation shows its progress and can be continued. Only people who may change site settings edit fields; others see them read-only.
- Activity and Approvals name the collection and field tools, field operations that convert or remove values ask for confirmation before approval, and every field error code reads as a sentence in the Studio language. New words live in a lazy `fields` namespace (drafts in every language, awaiting review).
