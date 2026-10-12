---
name: publish-article
description: Check a draft article, file it under the site's categories and tags, produce a preview and submit it for publication. Use when the user asks to publish, release or go live with an article.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (get_entry, list_taxonomies, list_terms, resolve_terms, propose_term, update_entry, preview_page, create_snapshot, publish). Publishing stops at a human approval gate.
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create,site:publish"
  cloudhal.approval: "publish"
---

# Publish article

## Steps
1. `get_entry` and run the editorial checklist in `references/editorial-checklist.md`; fix what you can with `update_entry` (never rewrite the author's voice).
2. File it. `list_taxonomies` tells you which taxonomies are `required` (they need a primary term before review), how many terms an article takes (`maxPerEntry`) and who may add terms (`allowNewTerms`). `list_terms` (or `resolve_terms` for the words you have in mind) shows the vocabulary. Set the terms with `update_entry` → `terms`, e.g. `{"category": {"primary": "News"}, "tag": {"add": ["AI", "Agents"]}}`; ids, slugs, names and synonyms all work.
3. If no tag fits, call `propose_term` once with a one-sentence reason; the tag stays private until a person approves it. Never propose a category: if none fits, stop and ask the user.
4. Move the entry to `review`, then `preview_page` the article and the listing page; read the HTML back.
5. Move it to `published` only if every checklist item passes.
6. Call `publish` with a label like "Publish: <title>". The server answers `input_required` (or "approval pending"): present the diff summary — it lists the article and its term changes — and pass the person's decision back. If declined, leave the entry in `published` state but the site unpublished, and say so.
7. Report the live snapshot id.

## Rules
- Publishing always requires explicit human confirmation; never retry `publish` with a fabricated confirmation.
- One article per publish; batch requests become separate runs.
- Reuse the vocabulary: an error such as `unknown_term` lists close terms — pick one of them before proposing anything new. Terms are never created implicitly.
- Do not change the slug of a published article: it leaves a redirect and waits for a person.
