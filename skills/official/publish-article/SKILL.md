---
name: publish-article
description: Check a draft article, produce a preview and submit it for publication. Use when the user asks to publish, release or go live with an article.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (get_entry, update_entry, preview_page, create_snapshot, publish). Publishing stops at a human approval gate.
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create,site:publish"
  cloudhal.approval: "publish"
---

# Publish article

## Steps
1. `get_entry` and run the editorial checklist in `references/editorial-checklist.md`; fix what you can with `update_entry` (never rewrite the author's voice).
2. Move the entry to `review` with `update_entry` and `preview_page` the listing page; read the HTML back.
3. Move it to `published` only if every checklist item passes.
4. Call `publish` with a label like "Publish: <title>". The server will answer `input_required`: present the diff summary to the user and pass their decision back. If declined, leave the entry in `published` state but unpublished site, and say so.
5. Report the live snapshot id.

## Rules
- Publishing always requires explicit human confirmation; never retry `publish` with a fabricated confirmation.
- One article per publish; batch requests become separate runs.
