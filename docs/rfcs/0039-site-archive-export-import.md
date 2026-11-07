# RFC-0039: Site archives: `cloudhal export` and `cloudhal import`

- Status: Accepted (2026-10-22, by Halil; ADR-0041). Open questions decided as recommended. Revised before acceptance after a comparison with Sanity, Strapi, Contentful, Ghost, WordPress, Directus and Webflow (see Prior art): NDJSON parts instead of one JSON file, per-file checksums, contract versions in the manifest, and a snapshot before `--replace`. Implemented: rollout steps 1–5 (#47).
- Amendment (2026-10-25, rollout step 1): identical `.cloudhal` bytes need the same Node/zlib build; the tar stream inside, and so every SHA-256 in the manifest, is identical on every platform. See invariant 7.
- Amendment (2026-10-26, rollout step 4): `--replace` takes the archive's published snapshot (the site node carries it, as `pull --replace`; `push` keeps a deployment's own); it saves `before import <file>` and the result as `import <file>`; the "rollback" that undoes it is `cloudhal import --revert <snapshot-id>`, since Studio's rollback moves only the published pointer, to an ancestor; and `cloudhal site delete` already deletes a local site. See §2 and invariant 6.
- Amendment (2026-10-26, rollout step 5):
  - The demo archive is `packages/cli/test/fixtures/site-archives/starter-blog.cloudhal`, the site `cloudhal init` seeds with fixed ids and a fixed clock, published once. `scripts/demo-archive.ts` regenerates it, and its `--check` (in `pnpm check` and CI) compares the manifests of the committed and a fresh export without `createdBy`: the manifest pins every other file's SHA-256, so this compares the decompressed tar's content (invariant 7) without failing on every CLI version bump.
  - §1's "neither export nor import has to hold the whole site in memory" holds for the container and the media; the graph rows are held in memory, since `exportSite` and `importSite` take whole bundles.
  - Invariant 6's atomic batches are one batch of at most 1000 statements, the same limit as `push` and `pull`; a larger site is refused before anything is written. Every refusal comes before the first write, and the node set is one atomic batch, but node bodies, snapshots and the media ledger are written in batches of their own. A storage failure between them can leave part of an import; running the same import again completes it, as for `pull`, and the message says so.
  - §4's list also names scheduled releases (with their pinned versions), pending approvals and agents' open edit suggestions (RFC-0014 proposals). Like automations they live outside the graph, so an archive never held them; `export` now prints them, and the guide says to schedule releases again after a move or restore.
  - §4's "the manifest says so" is the manifest's `bundle` (`cloudhal.site-bundle@1`, the graph only) together with the list `export` prints and the guide documents; `@1`'s closed key set gets no field of its own.
  - Invariant 4's forward migration applies once a contracts `schemaVersion` 2 exists; the demo archive can then serve as its `@1` test fixture.
  - The guide is [docs/guides/site-archives.md](../guides/site-archives.md).
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-21
- Related:
  - #47 (found while building cloudhal.com: no way to keep or move a site's content without a deployment, so it was written as code).
  - RFC-0004 §4.7 (media bytes travel apart from the bundle, verified by SHA-256), RFC-0010 (snapshot bundles).
  - `SiteBundle` (`cloudhal.site-bundle@1`), `exportSite`, `importSite`, `copyMediaBlobs` in `packages/core-ts/src/sync.ts`: what `cloudhal push` and `pull` send over HTTP today.
  - Prior art:
    - [Sanity dataset export/import](https://www.sanity.io/docs/cli-reference/dataset): tar.gz with NDJSON and assets, asset checks, `--replace`/`--missing`.
    - [Strapi data management](https://docs.strapi.io/cms/data-management/export): JSONL parts, schema match required, AES-128-ECB encryption, import erases the target.
    - [Contentful CLI export](https://github.com/contentful/contentful-cli/tree/main/docs/space/export): one JSON file, credentials dropped.
    - [Ghost](https://docs.ghost.org/migration/ghost): JSON without images.
    - [WordPress WXR](https://wordpress.org/documentation/article/tools-export-screen/): XML, media by URL, carries users.

## Summary

`cloudhal export` writes one site of a local project to a single file, its content graph, snapshots and media; `cloudhal import` reads it back into a local project, keeping the site's id. The file is a gzipped tar of the existing `SiteBundle`'s rows as NDJSON parts plus the media bytes, so it streams for large sites and adds a container, not a second data model. This gives backups, starters and templates as files, moving a site between machines, and demo seeding without a deployment and without content written as code.

## Motivation

- **Who:** a person keeping a backup or moving a site to a new machine; a theme author shipping a demo site; a team seeding a playground or test environment; anyone migrating content out of one project into another.
- **Today:** `push` and `pull` need a deployment, and `.cloudhal/` is git-ignored. cloudhal.com worked around this with a hand-written `content/site.ts` and a seed script: content as code, which contradicts how Cloudhal sites are edited (Studio, agents) and was removed when the repo went public.
- **Identity:** `seedStarterSite` cannot take a site id, so a fresh clone always gets a new `siteId`. Anything keyed by the id (analytics, cache tags, the deployment's site row) then no longer matches.
- **Why now:** the bundle code exists and is tested by push/pull; what is missing is a file container and two commands.

## Proposal

### 1. The file

`<name>.cloudhal` (suggested; any name works): a gzip-compressed POSIX tar (ustar) with, in this order:

```
manifest.json               the archive's header (below), first so it can be read without unpacking the rest
project.json                the project row, when the site has one
nodes/0001.ndjson …         one node row per line, sorted by id, a new part every 8 MB
snapshots/0001.ndjson …     one snapshot row per line, by creation time
blobs/0001.ndjson …         {hash, body} per line: node bodies the snapshots reference
media/<sha256>              one file per media entry, the raw bytes
ledger.ndjson               taken-down content (the bundle's `purged` rows), when there is any
```

The rows are the `SiteBundle`'s, one per line instead of one large JSON document, so neither export nor import has to hold the whole site in memory: Sanity and Strapi stream for the same reason. Reading the parts back in order gives exactly the `SiteBundle` that `importSite` takes.

```ts
interface SiteArchiveManifest {
  format: "cloudhal.site-archive@1";
  /** The contracts' schemaVersion the rows were written with (all `1` today). */
  contracts: { schemaVersion: number };
  /** The bundle format the rows reassemble into. */
  bundle: "cloudhal.site-bundle@1";
  siteId: string;
  siteName: string;
  /** `@cloudhal/cli` version that wrote it. */
  createdBy: string;
  createdAt: string; // RFC 3339
  /** What the archive holds, so `import --dry-run` can show it before reading the parts. */
  counts: { nodes: number; snapshots: number; blobs: number; media: number; mediaBytes: number };
  /** Every other file in the archive with its SHA-256 and size: a damaged or edited file is refused. */
  files: { path: string; sha256: string; bytes: number }[];
  /** True when written with --no-media: import warns that the media must come from elsewhere. */
  mediaOmitted?: true;
}
```

### 2. Commands

```text
cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]
cloudhal import <file> [--replace] [--dry-run]
cloudhal import --revert <snapshot-id> [--dry-run]     (amended 2026-10-26)
```

- **export:**
  - Streams the local store, the project's site or, with `--site <id>`, another site listed in `cloudhal.json` `sites`, together with its media from the local blob store.
  - The default file name is `<site-slug>-<YYYYMMDD>.cloudhal`.
  - `--no-media` writes the graph only.
  - `--latest-only` keeps only the published and latest snapshots, for templates that should not carry history.
- **import:** checks the manifest and every file's SHA-256 as it streams (media files are named by their hash as well), then calls `importSite`. Three modes:
  - **bootstrap** (default), into a project with no site or one whose site is the archive's (same `siteId`). Like `pull`, it adds what is missing and refuses nodes that differ: never Strapi's "erase the target first".
  - **`--replace`:** the local nodes become the archive's. Snapshots are only ever added. First, the current local graph is saved as a snapshot labelled `before import <file>`, so the import can be undone with a rollback. Into a project whose site has another id, `--replace` switches `cloudhal.json`'s `siteId` to the archive's. The old site stays in the local store, unlisted; there is no command to delete a local site yet.
    *Amended 2026-10-26 (rollout step 4):*
    - The published snapshot is the archive's: the site node carries it, so `--replace` takes it as `pull --replace` does. A deployment keeps its own, since `push` applies with the deployment's pointer.
    - The snapshot is taken only when the project holds the site and its nodes would change (none for a new or unchanged site), with the file's base name; the result is saved as `import <file>` right after, so the latest snapshot is the imported graph.
    - The undo is `cloudhal import --revert <snapshot-id>`: it restores that snapshot's nodes, the site node and so its published snapshot included, through `importSite`'s replace, saving the current graph first as `before revert import <file>`. Studio's rollback only moves the published pointer to an ancestor of the published snapshot, which a `before import` snapshot is not.
    - Revs: the store's compare-and-swap checks only a node's rev. `--revert` moves revs forward (a node edited since comes back at the rev after its current one), so a Studio tab or agent holding a rev the node had gets a conflict. `--replace` keeps the archive's revs, as `pull --replace` does, so the local site equals the archive; its summary counts the nodes given a rev no higher than they had, which such an editor could save over, and says to reload.
    - The switch edits only `siteId` and the old id's entry in `sites`, after the import has landed. It is undone by writing the old id back by hand: the old site is untouched, and `--revert` restores nodes only. `cloudhal site delete <id> --confirm <slug>` deletes the old site for good.
    - Refused before anything is written: open releases (their pinned versions point into the replaced graph; cancelled in Studio, no `--cancel-schedules` here), an unfinished field operation (RFC-0041; its marker is on the site node), and a hostname another local site serves (never released: that would write the old site).
  - **`--dry-run`:** prints the manifest and the difference the import would make (nodes added, changed and removed by kind and title; snapshots added; media to copy) and writes nothing.

### 3. Invariants

1. The site's id is kept: an imported site is the same site, so a later `push` to its deployment is an update, not a second site.
2. Nothing in the archive runs: it is data validated with the precompiled validators (`assertValidRows`), and gates (`assertGates`) apply as for push.
3. Every file is verified against the manifest (SHA-256 and size), and every media file against its own name, before it is used. A missing or wrong file fails the import before any node is written (the bundle's `missing_media` rule).
4. An archive written by a newer format or a newer contracts `schemaVersion` is refused with the CLI version needed. Older ones are read, and migrated forward if a later schema version requires it.
5. Taken-down content stays taken down: the `purged` ledger travels and the import never restores those bytes.
6. Import writes the graph in atomic batches (no interactive transactions, AGENTS.md rule 4), guarded like `importSite` today. A failure leaves the project as it was, and `--replace` can always be undone through its `before import` snapshot. *Amended 2026-10-26:* with `cloudhal import --revert <snapshot-id>` (§2), and a site id switch by writing the old `siteId` back (the old site is untouched); a failure after that snapshot was taken leaves it, holding the graph as it was, and the message names it.
7. Same content, same file: rows and files are written in a fixed order, with zero timestamps and fixed modes in the tar headers, so exporting an unchanged site twice gives identical bytes (good for git and for diffing). *Amended 2026-10-25:* identical bytes hold for the same Node/zlib build. gzip output differs between zlib builds (Homebrew's zlib and the Chromium zlib that official Node binaries ship compress the same input differently), and only a dependency or uncompressed output would avoid that. The tar stream inside the gzip, and so every SHA-256 in the manifest, is identical on every platform. A committed archive (step 5's demo) is regenerated on one pinned Node in CI, or compared through its decompressed tar.

### 4. What is not in an archive

The content graph only, as with push/pull. Excluded:
- users, sessions, roles and agent keys;
- comments and readers;
- analytics;
- the audit log;
- automations and schedule runs;
- scheduled releases, pending approvals and open edit suggestions (*added 2026-10-26, rollout step 5*);
- deployment secrets and webhook credentials.

The manifest says so, and `export` prints it. People and personal data never leave in a file by accident, which is also why the format needs no encryption of its own (see Alternatives).

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| One JSON file, media inlined as base64 | One format, no container | A third larger; whole file in memory; one bad byte breaks everything | Media can be hundreds of MB |
| A directory (the same layout, unpacked) | No container code; diffable in git | Not one file to send or attach; easy to copy half of it | Can be a later `--dir` option; the tar is the default |
| Zip | Opens on every OS | Needs a zip library or a writer of our own; no streaming read of a gzipped stream | Node has gzip built in, and ustar is small enough to write without a dependency |
| One `bundle.json` (the first draft) | Reuses the bundle as is | The whole site in memory on both sides; one damaged byte invalidates everything | NDJSON parts stream and are checked file by file |
| Built-in encryption (Strapi) | Protects a leaked file | Strapi's AES-128-ECB shows how easily it is done wrong; key handling in the CLI | No secrets or personal data are in the file; pipe through `age` or `gpg` when needed |
| Erase-then-import (Strapi) | Simple | Destroys local work on a wrong file | Bootstrap by default, `--replace` with a snapshot first |
| Commit `.cloudhal/data.db` | No code | SQLite binary in git; schema-version bound; carries users and secrets | Unsafe and not portable |
| Content as code (cloudhal.com's old way) | Reviewable diffs | Not how sites are edited; drifts from the graph | The problem #47 reports |

## Compatibility & migration

- New commands only; push, pull and the `SiteBundle` format are unchanged.
- `cloudhal.site-archive@1`: a later `@2` reader keeps reading `@1`. `import` refuses unknown formats with a message naming the CLI version needed.
- The parts reassemble into `cloudhal.site-bundle@1`, named in the manifest, so a future bundle format bump is read through `importSite`'s own format check.
- Rollout, one PR each:
  1. The streaming tar writer and reader, with tests (round trip, damaged file, wrong hash, path traversal, deterministic bytes).
  2. `export`.
  3. `import` with `--dry-run`.
  4. `--replace`, the `before import` snapshot, and the site id switch. *Amended 2026-10-26:* with `import --revert` as the undo.
  5. Docs and a starter demo archive (regenerated on one pinned Node, or compared through its decompressed tar: invariant 7).

## Security & policy impact

- A local CLI command, so no new scopes. Importing is like `pull`: the file is untrusted input, so it is validated, size-capped (manifest counts against actual entries, per-entry and total byte limits), and tar paths outside the layout of §1 (`manifest.json`, `project.json`, `ledger.ndjson`, `nodes|snapshots|blobs/<4 digits>.ndjson`, `media/<64 hex>`) are rejected (no path traversal, no symlinks or devices).
- Personal data: none of the stores that hold it are exported (§4). Entries may name authors, as published pages do.
- The archive is not signed in v1: it is as trustworthy as where it came from. See Later.

## Later (decided, not in v1)

- **`cloudhal init --from <file.cloudhal>`:** start a project from an archive (templates, the playground's demo). It is `init` plus `import`.
- **`--new-ids` for templates:** import as a copy with new ids, rewriting references (Sanity imports references weak and then strengthens them). Keeping ids is right for a backup and wrong for "use as a starter".
- **Partial export:** `--collection <key>` and `--no-snapshots`.
- **Export from a deployment:** `--from <admin-url>`, through the bundle route push and pull already use. All the headless CMS CLIs export from the remote service directly.
- **Studio "Download site archive":** the same route, from the browser.
- **Signed archives:** for example with Sigstore, like the npm provenance releases carry, so templates can be verified.
- **A `--dir` layout:** the same files, unpacked (Alternatives). *Added 2026-10-26.*
- **Streaming graph rows, and imports larger than one batch:** today the rows are held in memory and the node set is one atomic batch of at most 1000 statements (rollout step 5 amendment). *Added 2026-10-26.*

## Open questions (decided as recommended)

1. `cloudhal init --from`: yes, as a follow-up (see Later).
2. Signing: not in v1.
3. Import as a copy with new ids: not in v1; one archive, one site.
4. Studio download: later, through the existing bundle route.
