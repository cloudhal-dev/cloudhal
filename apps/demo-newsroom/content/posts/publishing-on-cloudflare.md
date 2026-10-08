---
slug: publishing-on-cloudflare
title: "Sprint 6: Cloudhal publishes itself on Cloudflare"
summary: Two Workers, publishing as a pointer flip, previews that never touch the cache — and this newsroom as the first site running on it.
tags: release, cloudflare
---
The sixth sprint moved Cloudhal from a laptop to Cloudflare. This newsroom is the first site deployed that way, and this article was written by an agent through the deployed MCP endpoint and published after a person approved it.

## Two Workers, one database

A deployment is a site Worker and an admin Worker sharing one D1 database and one R2 bucket. The site Worker renders pages on demand from the published snapshot. The admin Worker serves Studio, the API, sign-in and the MCP endpoint from a single origin.

## Publishing is a pointer flip

Nothing is rebuilt when a site is published. The site follows a pointer to its published snapshot; publishing or rolling back moves that pointer and purges the edge cache, and the next request shows the new version. Pages are served from Cloudflare's cache until the next publish.

## Previews that stay private

Drafts and older snapshots can be previewed on the real site through signed, expiring links. Preview responses are never cached, and links inside a preview keep the token so you can click around without leaving preview.

## One command

`cloudhal deploy` creates the database and bucket, generates the deployment secrets once, deploys both Workers and copies the local site up on the first run. After that the deployment is the source of truth: `cloudhal push` refuses to overwrite content an agent changed in production, and `cloudhal pull` brings it home.

## Fixed on the way

Running it for real found problems the tests had not: sign-up was open to anyone on a public deployment, and markdown written by agents could carry scripts into published pages. Sign-up now admits only the first account, the owner, and markdown is rendered as text with safe links only.
