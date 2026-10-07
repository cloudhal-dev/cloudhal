---
name: safe-edit
description: Make a reviewable change to an existing page or article - snapshot first, edit, preview, report the diff. Use for any edit request on existing content.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (get_page/get_entry, update_page/update_entry, create_snapshot, diff_snapshots, preview_page).
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create"
  cloudhal.approval: ""
---

# Safe edit

The loop every change goes through: snapshot → edit → preview → diff → report. Never skip the preview, never publish.

## Steps
1. Read the current node (`get_page` or `get_entry`). Keep its `rev`; send the full document back on update (the server rejects stale revisions with a conflict — reload and retry once, then stop and report).
2. `create_snapshot` labelled "Before: <short description>".
3. Apply the smallest change that satisfies the request. Preserve section ids; add new sections with new ids only when asked.
4. `preview_page` (for articles, preview the page that lists them or the article path) and read the HTML back.
5. `diff_snapshots` between the "Before" snapshot and a new `create_snapshot` labelled "After: <short description>"; include added/changed/removed counts in the report.
6. Report: what changed, preview URL, and the two snapshot ids so a human can roll back.

## Rules
- Do not change `status`; moving to review or published is `publish-article`.
- Do not touch content in locales other than the one requested.
