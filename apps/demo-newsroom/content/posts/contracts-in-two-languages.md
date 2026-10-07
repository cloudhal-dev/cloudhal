---
slug: contracts-in-two-languages
title: "Sprint 1: one contract, two languages"
summary: The site graph is defined once in JSON Schema and generated into TypeScript and Rust, with a CI job that fails on drift.
tags: release, contracts
---
Cloudhal describes a website as a typed graph: a site, its pages and their sections, content entries such as articles, and immutable snapshots. The first sprint fixed where that description lives.

## JSON Schema is the source of truth

Every node type is a hand-written JSON Schema 2020-12 file. TypeScript types and precompiled validators are generated from it, and so are the Rust types the core will move to later. Generated files are committed, and CI regenerates them on every push: if anything differs, the build fails.

## A deliberately small schema subset

Both generators have to agree, so the schemas use a narrow subset: discriminated unions with an explicit `kind`, no defaults, closed objects. The same golden fixtures are validated in both languages.

## Why it matters for agents

Agents only touch the site through typed tools. When the contract is the single source of truth, the tools, the API, the Studio and the renderer cannot quietly disagree about what a page is.
