# Editorial checklist

1. Title in sentence case, ≤ 70 characters, no clickbait.
2. Summary present, 1–2 sentences, ≤ 160 characters.
3. Slug is lower-case, hyphenated, stable (do not change slugs of published articles: that leaves a redirect a person must approve).
4. Body has an H1-free structure (the title is the H1), at least one paragraph, no placeholder text.
5. Categories: a primary term in every `required` taxonomy (`list_taxonomies`). The primary category is the article's main subject, not the first one you thought of. At most `maxPerEntry`.
6. Tags: 1–5 existing tags from `list_terms` (match by name or synonym, e.g. "JS" → JavaScript), no two that mean the same. A missing tag is proposed with `propose_term` and a reason, never invented as free text.
7. Author set; `publishedAt` set when moving to published. Under an embargo (`availability.from`), leave `publishedAt` alone: Cloudhal dates the article at the embargo time when it first goes live.
