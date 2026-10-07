# RFC-0001: Site Graph contracts v1
- Status: Accepted (implemented in Sprint 1)
- Author: Halil, Date: 2026-10-07
- Related: ADR-0001, ADR-0002, `packages/core-contracts/schemas/`

## Summary
A site is a graph of typed, individually versioned nodes. Version 1 defines seven contracts — Project, Site, Page, Section, ContentEntry, Snapshot, SkillManifest — as JSON Schema with generated TypeScript and Rust types. This RFC records the model and its invariants so that later changes are measured against something written down.

## Motivation
Sprint 1 needs a concrete model to generate from and to write fixtures against; later sprints (storage, renderer, MCP tools) build on it. Writing the model as contracts first keeps the "agent edits a typed graph" promise honest from day one.

## Proposal

### Nodes and references
```
Project ──1:n──▶ Site ──1:n──▶ Page ──embeds──▶ Section (hero | richText | image | contentList)
                  │
                  ├──1:n──▶ ContentEntry (collection, slug, locale, body, fields)
                  └──history──▶ Snapshot ──▶ Snapshot (parentId)
```
- References are by **prefixed id** (`site_…`, `page_…`, `entry_…`, `snap_…`), never by embedding, except Sections, which are embedded in their Page.
- **Page is the unit of locking, snapshotting and diffing**; Sections have ids for stable diffs but no `rev`.
- **ContentEntry** separates typed core fields (title, slug, locale, status, body) from collection-specific `fields` (free JSON, validated per collection later).
- **Snapshot** lists `{id, kind, rev, hash}` for every node of the site at that instant; bodies live in the blob store by hash. Publish and rollback only move `Site.publishedSnapshotId`.

### Invariants
1. Every root document has `schemaVersion` (currently `1`); readers reject other values; migrations move documents one version at a time.
2. Mutable nodes (Project, Site, Page, ContentEntry) carry `rev`; writes are compare-and-swap on `rev` (ADR-0002).
3. Snapshots are immutable and form a linked list per site via `parentId`.
4. `Site.pageIds` is the authoritative page order; a Page not listed there is unreachable but not deleted.
5. Paths are absolute, lower-case, no trailing slash (regex in `page.schema.json`); one `(siteId, locale, path)` is unique (enforced by storage, not schema).
6. Actors (human, agent, system) share one shape; policy decisions never depend on the actor's kind alone.
7. Unknown properties are rejected everywhere except declared maps (`metadata`, `fields`, `theme.config`).

### Generator-safe subset
See ADR-0001. In short: `oneOf` + inline variants + single-value `kind` enum; no `default`; refs only to `common.schema.json#/$defs/*` or another root's top level.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Sections as separate nodes with their own `rev` | Finer-grained locking | Diffs and snapshots explode; agents edit pages, not sections | Page-level locking matches the editing unit |
| Single "Node" table with `kind` + JSON blob | Simple storage | No typed contracts; Rust side becomes `Value` | Defeats the contract goal |
| CRDT document per page | Concurrent editing | Complexity before the loop is proven | Deferred; optimistic locking first |

## Compatibility & migration
First version; no migration. Future additive changes (optional fields, new Section kinds) are non-breaking. Removing or renaming requires `schemaVersion: 2` with a migration function and both versions' fixtures kept.

## Security & policy impact
Ids are opaque handles that the MCP server re-authorizes per call (ADR-0004). `metadata` is string-only to prevent smuggling structured instructions into nodes.

## Open questions
- Redirects, navigation menus and media assets as first-class nodes (likely v1 additive, Sprint 3).
- Per-collection schemas for `ContentEntry.fields` (Sprint 4/5).
- Whether `Section` gains a `visibility`/`schedule` field for the workflow engine (Phase 1.5).
