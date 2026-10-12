---
slug: storage-on-sqlite-and-d1
title: "Sprint 2: the same store on SQLite and Cloudflare D1"
summary: Optimistic locking, content-addressed snapshots, diff, publish and rollback — one behavioural test suite, two databases.
tags: release, storage
---
The second sprint built the store that every change goes through.

## Optimistic locking everywhere

Each node carries a revision. A write states the revision it read; if someone else wrote in between, it fails with a conflict instead of overwriting their work. Agents and people use exactly the same rule.

## Snapshots are content-addressed

A snapshot records the hash of every node at a point in time; node bodies are stored once in a blob store and shared between snapshots. Diffing two snapshots is a comparison of hashes, and rollback can only move to an ancestor of what is live.

## Self-host and Cloudflare from day one

The storage interface was shaped by D1's limits: no interactive transactions, only atomic batches. The same behavioural suite runs against SQLite on Node and D1 under Miniflare, so self-hosting is not a second-class path.
