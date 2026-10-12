---
"@cloudhal/comments": minor
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
---

Reader comments core and storage (RFC-0007 rollout steps 2–3).

- New package `@cloudhal/comments` (Worker-safe): the settings model and `threadState` (site, collection and entry settings; 90-day close from first publication), text normalising (NFC, control and bidi characters removed), content rules (word lists with Turkish case folding, link limits, instruction-like labels), the https-only link rule shared with Studio's blocks (`parseCommentText`, `safeCommentHref`, `commentTextHtml`, fixture `@cloudhal/comments/fixtures/comment-text.json`), the signed stateless proof of work with the daily-cap difficulty ramp and replay cache, keys derived from `CLOUDHAL_COMMENTS_KEY`, IP HMACs with a monthly salt, email encryption, `cm1:` state hashes, isolate limits, the submission, report and challenge pipelines with their answers, the purge planner and the retention plan; `SqlCommentStore` on SQLite/D1 (`@cloudhal/comments/sql`); store and pipeline suites in `@cloudhal/comments/testing`.
- `@cloudhal/storage`: migration `0016_comments` adds `comment_settings`, `comment_secrets`, `comment_threads`, `comments`, `commenter_emails`, `comment_events`, `comment_reports`, `comment_bans`, `comment_salts`, `comment_purge_queue` and `cache_purge_log`.
- `@cloudhal/core-ts`: `COMMENTS_TAG_PREFIX` and `commentsCacheTag` (`cloudhal-comments-<nodeId>`) in `./cache-tags`.
