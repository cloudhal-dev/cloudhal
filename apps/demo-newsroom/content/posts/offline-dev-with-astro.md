---
slug: offline-dev-with-astro
title: "Sprint 3: init, dev, build — fully offline"
summary: An Astro 7 renderer, a blog starter and a CLI that creates and previews a site without any account.
tags: release, renderer
---
`cloudhal init` creates a project with a seeded site, `cloudhal dev` serves it with drafts visible, and `cloudhal build` renders the published snapshot to static HTML. None of it needs a network connection.

## Live in development, frozen in builds

The renderer reads current nodes during development, so an edit shows up on the next request. A build renders exactly one snapshot, so changes made after publishing cannot leak into production.

## Starters own the routes

Routes, layouts and the theme live in the starter; the renderer only provides data sources and section components. Changing how a site looks never requires touching the core.
