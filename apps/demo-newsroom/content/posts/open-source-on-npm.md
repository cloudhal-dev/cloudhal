---
slug: open-source-on-npm
title: "0.3: open source, on npm, running our own site"
summary: The repositories are public, every package installs from npm, and cloudhal.com itself is a Cloudhal site that updates the way any other site does.
tags: release, launch
---
Cloudhal is now public. The source is open, the packages are on npm, and `npm create cloudhal` sets up a site in an empty folder.

## Our own site, our own releases

cloudhal.com runs on Cloudhal. A new release reaches it the way it reaches anyone: a dependency update opens a pull request, the site and Studio are bundled as a check, and merging deploys through Workers Builds. If the site or Studio stops answering after a deploy, a post-deploy check rolls it back.

Running our own site found problems that tests did not. A redirect from `www` looped because the edge cache was keyed by path rather than host, so every response now varies by host. A theme copied by an older version broke when a helper changed its signature, so the old signature came back as a deprecated overload, and a frozen copy of the old theme now builds in CI on every change.

## A playground anyone can open

try.cloudhal.com gives every visitor a private site for an hour, in its own Durable Object, with Studio and the public pages. Nothing needs an account.

## Fast first paint

Pages preload their fonts with Early Hints, and the fallback fonts are measured to match the web fonts, so text does not jump when they load. A render check flags fonts without a matched fallback.
