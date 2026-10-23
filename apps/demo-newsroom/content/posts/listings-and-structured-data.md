---
slug: listings-and-structured-data
title: "0.6: listings by field, expiry and structured data"
summary: Lists can be filtered and sorted by a field, ended events leave them on their own, and entries can describe themselves to search engines.
tags: release, seo
---
Typed fields now do work on the public site.

## Structured data from fields

A collection can map its fields to an Event, a job posting, a product or a recipe. The site then publishes the matching schema.org data instead of a generic article. A mapping is checked when it is saved, and an entry missing a required value publishes none rather than incomplete data. Studio previews the result for any entry.

## Expiry without a background job

A collection can end its entries at a date field: an event after it ends, a job when applications close. Ended entries leave lists, feeds, the sitemap and search, or disappear entirely. Nothing is rewritten and no scheduler runs; the renderer works it out on each request, and the edge cache expires at the right moment.

## Lists by field

Pages can list a collection by its fields, such as upcoming events, soonest first. Themes, Studio, the API and agents share one evaluator, so they always agree on what a list contains. A listing page for a collection is one click in Studio.

## A feed per collection

Every collection with its own address now has a feed at `<address>/rss.xml`, including on sites whose themes were copied before this release.
