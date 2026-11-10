---
"@cloudhal/core-ts": patch
---

`asset_refs` is scoped by site (RFC-0045 §2.5, rollout step 0), and an unchanged import no longer rebuilds it (#196).

- An import, push or pull planned `unchanged` used to rebuild the site's `asset_refs` from rows read at plan time. An edit that committed in between could lose its new row, so the asset it started using could be deleted and showed as unused. The rebuild now runs only in a batch that also writes the node set.
- The rebuild records only references to assets of the same site, and splits its `INSERT` so each statement stays below 90 KB (large sites could exceed D1's statement limit). Its statements count against the import's 1,000-statement cap.
- Deleting an asset and the media library's "unused" filter look only at references from the asset's own site, so a foreign archive naming another site's asset no longer blocks its delete or hides it.
- A publish that changes an asset now also purges the pages that show it through a typed `image` or `richText` field (RFC-0041), not only through covers, bodies and sections.
