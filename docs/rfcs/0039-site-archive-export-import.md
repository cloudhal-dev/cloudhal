# RFC-0039: Site archives: `cloudhal export` and `cloudhal import`

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-21
- Related:
  - #47 (found while building cloudhal.com: no way to keep or move a site's content without a deployment, so it was written as code).
  - RFC-0004 §4.7 (media bytes travel apart from the bundle, verified by SHA-256), RFC-0010 (snapshot bundles).
  - `SiteBundle` (`cloudhal.site-bundle@1`), `exportSite`, `importSite`, `copyMediaBlobs` in `packages/core-ts/src/sync.ts`: what `cloudhal push` and `pull` send over HTTP today.

## Summary

`cloudhal export` writes one site of a local project to a single file, its content graph, snapshots and media; `cloudhal import` reads it back into a local project, keeping the site's id. The file is a gzipped tar holding the existing `SiteBundle` JSON and the media bytes, so the format adds a container, not a second serialisation. This gives backups, starters and templates as files, moving a site between machines, and demo seeding without a deployment and without content written as code.

## Motivation

- **Who:** a person keeping a backup or moving a site to a new machine; a theme author shipping a demo site; a team seeding a playground or test environment; anyone migrating content out of one project into another.
- **Today:** `push` and `pull` need a deployment, and `.cloudhal/` is git-ignored. cloudhal.com worked around this with a hand-written `content/site.ts` and a seed script: content as code, which contradicts how Cloudhal sites are edited (Studio, agents) and was removed when the repo went public.
- **Identity:** `seedStarterSite` cannot take a site id, so a fresh clone always gets a new `siteId`. Anything keyed by the id (analytics, cache tags, the deployment's site row) then no longer matches.
- **Why now:** the bundle code exists and is tested by push/pull; what is missing is a file container and two commands.

## Proposal

### 1. The file

`<name>.cloudhal` (suggested; any name works): a gzip-compressed POSIX tar (ustar) with, in this order:

```
manifest.json        the archive's own header (below), first so it can be read without unpacking the rest
bundle.json          a SiteBundle, exactly as push/pull send it (cloudhal.site-bundle@1)
media/<sha256>       one file per BundleMedia entry, the raw bytes
```

```ts
interface SiteArchiveManifest {
  format: "cloudhal.site-archive@1";
  siteId: string;
  siteName: string;
  /** `@cloudhal/cli` version that wrote it. */
  createdBy: string;
  createdAt: string; // RFC 3339
  /** What the bundle holds, so `import --dry-run` can show it without parsing bundle.json. */
  counts: { nodes: number; snapshots: number; media: number; mediaBytes: number };
  /** SHA-256 of bundle.json, so a damaged or edited file is refused. */
  bundleSha256: string;
}
```

### 2. Commands

```text
cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]
cloudhal import <file> [--replace] [--dry-run]
```

- **export:** reads the local store with `exportSite` (the project's site, or with `--site <id>` another site listed in `cloudhal.json` `sites`) and its media from the local blob store. Default file: `<site-slug>-<YYYYMMDD>.cloudhal`. `--no-media` writes the graph only; the manifest says so and `import` warns. `--latest-only` keeps only the published and latest snapshots, for templates that should not carry history.
- **import:** checks the manifest and `bundleSha256`, verifies every media file against its name (SHA-256) as it is written to the blob store, then calls `importSite`:
  - into a project with no site, or one whose site is the archive's (same `siteId`): `mode: "bootstrap"`. It refuses diverged nodes, as `pull` does;
  - with `--replace`: `mode: "replace"`; the local nodes become the archive's, and snapshots are added (they are immutable and never removed);
  - into a project whose site has another id: refused unless `--replace`, which then switches `cloudhal.json`'s `siteId` to the archive's. The old site stays in the local store, unlisted; there is no command to delete a local site yet.
- `--dry-run` prints the manifest and what would change (nodes added, changed, removed; snapshots added; media to copy) and writes nothing.

### 3. Invariants

1. The site's id is kept: an imported site is the same site, so a later `push` to its deployment is an update, not a second site.
2. Nothing in the archive runs: it is data validated with the precompiled validators (`assertValidRows`), and gates (`assertGates`) apply as for push.
3. Every media file is verified by SHA-256 before it is used; a missing or wrong file fails the import before any node is written (the bundle's `missing_media` rule).
4. Taken-down content stays taken down: the `purged` ledger travels and the import never restores those bytes.
5. Import writes the graph in one atomic batch (no interactive transactions, AGENTS.md rule 4); a failure leaves the project as it was.
6. Same content, same file: entries are written in a fixed order with fixed timestamps in the tar headers, so exporting an unchanged site twice gives identical bytes (good for git and for diffing).

### 4. What is not in an archive

The content graph only, as with push/pull: no users, sessions, roles or agent keys; no comments or readers; no analytics; no audit log; no automations or schedule runs; no deployment secrets. The manifest says so, and `export` prints it. People and personal data never leave in a file by accident.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| One JSON file, media inlined as base64 | One format, no container | A third larger; whole file in memory; one bad byte breaks everything | Media can be hundreds of MB |
| A directory (`bundle.json` + `media/`) | No container code; diffable in git | Not one file to send or attach; easy to copy half of it | Can be a later `--dir` option; the tar is the default |
| Zip | Opens on every OS | Needs a zip library or a writer of our own; no streaming read of a gzipped stream | Node has gzip built in, and ustar is small enough to write without a dependency |
| Commit `.cloudhal/data.db` | No code | SQLite binary in git; schema-version bound; carries users and secrets | Unsafe and not portable |
| Content as code (cloudhal.com's old way) | Reviewable diffs | Not how sites are edited; drifts from the graph | The problem #47 reports |

## Compatibility & migration

- New commands only; push, pull and the `SiteBundle` format are unchanged.
- `cloudhal.site-archive@1`: a later `@2` reader keeps reading `@1`. `import` refuses unknown formats with a message naming the CLI version needed.
- `bundle.json` is `cloudhal.site-bundle@1`, so a future bundle format bump is read through `importSite`'s own format check.
- Rollout: (a) the tar writer and reader with their tests (round trip, damaged file, wrong hash); (b) `export`; (c) `import` with `--dry-run`; (d) `--replace` and the site id switch; (e) docs and a starter demo archive.

## Security & policy impact

- A local CLI command, so no new scopes. Importing is like `pull`: the file is untrusted input, so it is validated, size-capped (manifest counts against actual entries, per-entry and total byte limits), and tar paths outside `manifest.json`, `bundle.json` and `media/<64 hex>` are rejected (no path traversal, no symlinks or devices).
- Personal data: none of the stores that hold it are exported (§4). Entries may name authors, as published pages do.
- The archive is not signed in v1: it is as trustworthy as where it came from. See open question 2.

## Open questions

1. Should `cloudhal init --from <file.cloudhal>` start a new project from an archive (templates, the playground's demo)? **[default: yes, as a follow-up; it is `init` + `import`]**
2. Sign archives (e.g. Sigstore, like the npm provenance we publish with) so templates can be verified? **[default: not in v1]**
3. Import as a copy with new ids (`--as-new-site`) for templates used many times in one project? Rewriting ids across nodes, snapshots and redirects is a large change. **[default: not in v1; one archive, one site]**
4. Should Studio offer "Download site archive" through the admin API? **[default: later; the API already has the bundle route push/pull use]**
