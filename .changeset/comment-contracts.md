---
"@cloudhal/core-contracts": minor
---

RFC-0007 draft contracts for reader comments: two new roots. `Comment` (`comment.schema.json`) is a stored, returned and exported reader comment — kept in D1 outside the site graph — with a guest, verified-reader, staff (always a person, optionally drafted by an agent) or erased author, plain-text body, status (`pending`, `approved`, `hidden`, `spam`, `deleted`), advisory labels and the latest moderation decision as a statement of reasons; it has no field for an email, an IP address or its hash, or a user agent. `CommentSubmission` (`comment-submission.schema.json`) is what a browser may send to the site Worker's comment and report endpoints: no status, site, author kind, labels or addresses. `assertValid("comment" | "comment-submission", …)` and `ROOT_SCHEMAS` include them.
