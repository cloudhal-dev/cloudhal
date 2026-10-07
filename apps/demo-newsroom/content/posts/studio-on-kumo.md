---
slug: studio-on-kumo
title: "Sprint 4: a Studio built on Kumo"
summary: The admin UI follows Cloudflare's Kumo design system, with a written design contract and tests that enforce it.
tags: release, studio
---
The Studio is where people review what agents did and decide what goes live. It is a single-page app on Kumo, Cloudflare's design system, served by the same API that agents use.

## A design contract, not taste

A design document fixes the page anatomy, five page templates, the sidebar, spacing, colour and every state a screen can be in: loading, empty, error. A test suite checks the source against those rules so regressions fail in CI.

## Draft, review, publish

Articles move from draft to review to published with explicit actions. Publishing asks for confirmation and records a snapshot, so every publish can be inspected and undone. The interface ships in English and Turkish.
