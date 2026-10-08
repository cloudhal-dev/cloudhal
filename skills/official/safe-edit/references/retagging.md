# Re-filing an article

- Look the words up first: `resolve_terms(taxonomy, inputs)` returns the existing term for an id, slug, old slug, name, synonym or singular/plural, and suggestions when nothing matches.
- Send deltas, not lists: `{"tag": {"add": ["llm"], "remove": ["llms"]}}`. Use `set` only when the user gave the complete list.
- `primary` is the main term of a taxonomy (breadcrumbs, the article's section). Setting it adds the term if needed; removing the primary term clears it. Review and published articles need a primary term in every `required` taxonomy, and the server refuses the edit otherwise (`required_term`).
- Limits are per taxonomy (`maxPerEntry` in `list_taxonomies`); `too_many_terms` means remove one first.
- Errors are codes you can act on: `unknown_term` and `ambiguous_term` (pick one of the suggestions or pass the term id), `term_not_assignable` (the term was retired or merged: resolve its name again), `unknown_taxonomy`.
- The same concept under two names on many articles (`llm` and `llms`) is a merge for a person, not N edits: mention it, or run `taxonomy_report` and pass its findings on.
