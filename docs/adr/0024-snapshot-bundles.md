# ADR-0024: Snapshot bundles — the site Worker loads a published snapshot from a few shard objects
- Status: Accepted
- Date: 2026-10-13
- Related: RFC-0010 (the design), ADR-0002 (storage interface), ADR-0012 (pointer-flip publishing, snapshot sources cached per isolate), RFC-0004 (blob keys), RFC-0008 §6.1 (its subrequest note, corrected)
- Sources: Workers limits, "Subrequests" and "Simultaneous open connections" — https://developers.cloudflare.com/workers/platform/limits/ · R2 object lifecycles — https://developers.cloudflare.com/r2/buckets/object-lifecycles/ (both checked 2026-10-13 in `cloudflare/cloudflare-docs` at `0cd4753`)

## Context
The site Worker renders a published snapshot. Its node bodies live in R2 as `nodes/<hash>.json`, and `SnapshotSource` read them one `get` each on the first render of a snapshot in an isolate: after every cold start and after every publish. A Worker invocation has at most 6 connections waiting for response headers, so a 1,000-node site needed about 167 sequential rounds before its first byte; and R2/D1 calls are subrequests to internal services, capped at 1,000 per invocation on Workers Free (the configured limit, default 10,000, on Paid), so a site near 1,000 nodes could not render on Free at all. RFC-0008 §6.1 had assumed 50, which is the Free limit for external `fetch` only.

## Decision
Adopt RFC-0010 with its defaults, accepted by the owner on 2026-10-13 (PR #23):
- **Layout.** A published snapshot also gets `bundles/<siteId>/<snapshotId>/<i>.json`: shard *i* holds the bodies of `snapshot.nodes[i·256 … i·256+255]` in the snapshot's order, with their hashes and the snapshot id. No manifest and no contract change: the shard count follows from the number of refs. `nodes/<hash>.json` stays the source of truth.
- **Writers.** `createSnapshot` with reason `publish` writes the shards from the bodies it already holds. The site Worker writes them read-through, in `waitUntil`, when it renders the **published** snapshot without a complete bundle (release runs, rollback, push, expiry). Previews and history snapshots never get a bundle.
- **Reader.** `SnapshotSource` reads all shards (at most 6 in flight) and uses them only if every shard exists and its `v`, `snapshotId` and hashes match the snapshot's refs; otherwise it loads node by node, as before.
- **Retention.** `cloudhal deploy` adds an R2 lifecycle rule expiring `bundles/` after 30 days; a missing bundle costs one slow load, never correctness.
- **Not in v1:** shard compression; pre-warming bundles from the admin Worker after release runs or rollbacks.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Per-isolate cache of bodies by hash | Small change | Cold isolates still read every node | Helps warm isolates only |
| Bodies in a D1 table, one query | One subrequest, dedupe | Every node version of every site in D1 (500 MB per database on Free); rows read billed per cold load | Wrong home for history |
| KV or Cache API per node | Simple | Still one subrequest per node | Same round count |
| One unsharded bundle | Simplest | One large parse in a 128 MB isolate | Shards bound peaks and retries |
| Raise `limits.subrequests` | One line | Paid only; latency unchanged | Treats the ceiling, not the cause |

## Consequences
- **Positive:** a cold or just-published site loads in `ceil(N/256)` reads, one round up to 1,536 nodes; sites no longer hit the Free subrequest ceiling by size; no migration and no contract change.
- **Negative:** R2 storage grows by the bodies of what was published in the last 30 days; one more object family to reason about.
- **Risks:** a writer bug producing a wrong shard is caught by the hash check and falls back; a missing lifecycle rule (wrangler or permissions) only means bundles live until deleted.
