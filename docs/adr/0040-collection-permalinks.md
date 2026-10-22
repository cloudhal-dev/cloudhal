# ADR-0040: Collection permalinks: a closed-token template per collection, one path function both ways
- Status: Accepted
- Date: 2026-10-22 (decided by Halil)
- Related: RFC-0038, RFC-0002, RFC-0003, RFC-0033, #50
- Sources: [Ghost routes](https://docs.ghost.org/themes/routing/) · [Hugo permalinks](https://gohugo.io/configuration/permalinks/) · [WordPress `register_post_type`](https://developer.wordpress.org/reference/functions/register_post_type/) and [old-slug redirects](https://developer.wordpress.org/reference/functions/wp_old_slug_redirect/) · [Eleventy permalinks](https://www.11ty.dev/docs/permalinks/)

## Context
An entry's URL is `/<collection>/<slug>`, built inline in about 15 places. A site that wants its posts at `/blog` has to rename the collection, which changes the key filters, templates and agents use (cloudhal.com, #50). WordPress, Ghost and Hugo all ended up with URL templates. None of them reliably redirects when a template changes, and date tokens move URLs when an editable date changes.

## Decision
1. **`Site.collections.<key>.permalink`**, optional, default `/<collection>/{slug}`. Version 1 accepts only fixed lower-case segments followed by `/{slug}`, enforced by the schema pattern.
2. **A closed token set**, widened only by changing the schema pattern. There is no template language, so every template is checked when it is written.
3. **One path function each way** in `@cloudhal/core-ts`: `entryPath(site, entry)` and `entryAt(site, path)`. Every inline `/${collection}/${slug}` moves to them.
4. **Redirects come from the change.** A v1 template change adds one prefix redirect in the same batch as the site update (`RedirectPlan`, as for taxonomy archives). Once there are tokens, the store compares each published entry's path before and after and writes one redirect per entry.
5. **Collisions fail at write time** (`path_conflict`) against other collections, taxonomy archives, pages and reserved paths.
6. **Later, already decided:** date tokens from a fixed first-publication date; per-locale templates as a map; entries at the root once page writes run the same collision check; an explicit `indexPath`; `{category}` only once an entry has one primary term.

## Consequences
- Positive:
  - URLs become content: they are in snapshots, can be rolled back, and agents and Studio can change them behind approval.
  - Moving a collection no longer changes its key.
  - The path logic exists once.
- Negative:
  - A larger site node.
  - Every caller of the inline path moves in one PR.
  - Templates and redirects have to stay in step on rollback (redirects are kept).
- Risks: an overlap check that misses a case would make two things answer one URL. That is why the check runs both ways (`entryAt`) and at write time.
