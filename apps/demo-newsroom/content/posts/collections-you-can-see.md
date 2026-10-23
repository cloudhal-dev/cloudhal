---
slug: collections-you-can-see
title: "0.4: collections people can see and manage"
summary: Events, team members or jobs are no longer strings on an entry. Collections have names, icons, URLs and settings, and agents create them only with a person's approval.
tags: release, content
---
An agent could always put an entry into any collection it named, and Studio only ever showed posts. Collections are now first-class.

## A registry without a migration

A site's collections live in its settings: a name in every language, an icon, whether they appear in feeds and the sitemap, and how their lists are sorted. Collections that already had entries count as declared from the first read, so existing sites keep working without rewriting anything.

## URLs that cannot collide

Each collection has its own address, such as `/blog/{slug}` instead of `/posts/{slug}`. Changing it moves the entries and leaves permanent redirects behind. The first entry of a new collection is checked against every other collection, archive and reserved path, so two collections can never answer the same URL.

## People decide on new collections

Agents read the registry before they write. Creating or changing a collection waits for a person who may change site settings, in every mode. An entry in a collection nobody declared is refused.

## In Studio

Every collection appears in the sidebar with its own list, editor and settings: names, URL, categories and tags, comments, and how it is listed.
