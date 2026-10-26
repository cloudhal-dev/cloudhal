---
"@cloudhal/cloudflare": patch
---

The admin Worker's minute tick gains a `lists.backfill` system job (every five minutes): a budgeted `rebuildListValues` for listed collections that are new, changed, reset by a race or older than migration 0029, sized to the tick plan. Its declared cost (16 statements on the free plan, 150 on paid) is the run's statement budget, which the backfill enforces on every statement, discovery included, and each run starts at another waiting collection. On the paid plan it also removes rows of collections that list no fields any more, never those of a collection listed while it ran.
