---
"@cloudhal/mcp-server": minor
---

`update_page` takes an optional `status` (draft, review, published, archived; RFC-0035), so an agent can publish or unpublish one page, such as a finished translation, without a release. The store's checks still apply: a machine translation in a review-required collection, or one with failing checks, is refused. The page goes live with the next site publish.
