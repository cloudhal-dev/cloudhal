---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
---

Body diffs (RFC-0014 phase 2, no contract change). `@cloudhal/core-ts/body-blocks` exports `splitMarkdown`, the normative block splitter (RFC-0014 §2), and `bodyDiff(before, after)`, which aligns two markdown bodies block by block and diffs edited blocks word by word. It is Worker-safe and depends only on `marked`. The API adds `GET /api/sites/:siteId/snapshots/:snapshotId/nodes/:nodeId` (scope `content:read`), which returns one node as a snapshot holds it, drafts included, so Studio can show what a page's or article's text changed.
