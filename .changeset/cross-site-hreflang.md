---
"@cloudhal/astro-renderer": minor
---

`hreflang` and the language switcher now list language editions (RFC-0033 §7, RFC-0034 §6).

**What changed**
- A page's alternates include the versions that other sites of the project have published, each on its own host. Before, they listed only the site's own languages.
- `peerEditions(config, node)` finds those sites. It reads only their published snapshot, so drafts never show. It skips sites without a hostname, and a locale the site serves itself is never taken from an edition.
- `alternatesFor` takes the peers as a new optional argument, so existing calls work unchanged.
- The blog starter passes them.

**Limit**
- A page that is already in the edge cache picks up a newly published edition on its next purge or render.
