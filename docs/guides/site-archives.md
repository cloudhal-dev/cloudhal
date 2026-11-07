# Site archives: a guide for site owners and operators

`cloudhal export` writes one site of a local project to a single `.cloudhal` file: its content graph, snapshots and media. `cloudhal import` reads it back into a project, keeping the site's id.

Use it to back up a site, to move a site to another machine without a deployment, to keep a site's content in git next to its theme, and to ship a demo site with a theme. An archive is the site's content and its edit history. It is not a copy of the database: the people who use Studio and what readers do stay where they are.

The design and its reasons are in [RFC-0039](../rfcs/0039-site-archive-export-import.md) and [ADR-0041](../adr/0041-site-archives.md); the security analysis is in the [threat model](../security/threat-model.md).

> **Status.** `cloudhal export`, `cloudhal import` with `--dry-run` and `--replace`, and `cloudhal import --revert` work on local projects. Exporting from a deployment, a Studio download, `cloudhal init --from`, `--new-ids` and signed archives come later ([Later](#later)).

## What an archive holds

A `.cloudhal` file is a gzip-compressed tar. Its entries always come in this order:

| Entry | What it holds |
|---|---|
| `manifest.json` | The header: the archive format, the contracts' `schemaVersion`, the bundle format, the site's id and name, the CLI version that wrote it, a date, the counts, and every other file with its SHA-256 and size |
| `project.json` | The project row, when the site has one |
| `nodes/0001.ndjson` … | The site's nodes (site, pages, entries, taxonomies, terms, menus, redirects, media records), one per line, sorted by id; a new part every 8 MiB |
| `snapshots/0001.ndjson` … | The snapshots, by creation time |
| `blobs/0001.ndjson` … | The node bodies the snapshots refer to, as `{hash, body}` |
| `media/<sha256>` | One file per media file, the raw bytes, named by their SHA-256 |
| `ledger.ndjson` | Taken-down content: what was taken down, why, by whom and when; never the bytes |

The rows are those `cloudhal push` and `pull` send (`cloudhal.site-bundle@1`), so an archive adds a container, not a second data model. The starter demo archive, listed with `tar`:

```
$ tar -tzvf starter-blog.cloudhal
-rw-r--r--  0 0      0         984 Jan  1  1970 manifest.json
-rw-r--r--  0 0      0         389 Jan  1  1970 project.json
-rw-r--r--  0 0      0        7388 Jan  1  1970 nodes/0001.ndjson
-rw-r--r--  0 0      0        1690 Jan  1  1970 snapshots/0001.ndjson
-rw-r--r--  0 0      0        5751 Jan  1  1970 blobs/0001.ndjson
```

The start of its manifest (then `files`, each with its `path`, `sha256` and `bytes`):

```json
{
  "format": "cloudhal.site-archive@1",
  "contracts": {
    "schemaVersion": 1
  },
  "bundle": "cloudhal.site-bundle@1",
  "siteId": "site_starter0001",
  "siteName": "Starter Blog",
  "createdBy": "0.6.1",
  "createdAt": "2026-10-26T00:00:00.000Z",
  "counts": {
    "nodes": 9,
    "snapshots": 1,
    "blobs": 9,
    "media": 0,
    "mediaBytes": 0
  },
```

**Never in an archive:** user accounts, sessions, roles, agent keys, comments, readers, analytics, the audit log, scheduled releases (with their pinned versions), automations, schedule runs, pending approvals, agents' open edit suggestions, deployment secrets and webhook credentials. `export` reads none of their tables or files, and prints this list every time. An archive is never `data.db` and never holds `.cloudhal/deploy/`. Reader comments move separately, with [`cloudhal comments export` and `import`](comments.md#moving-comments-cloudhal-comments).

**What is scheduled stays behind.** Releases live outside the content graph, as with `push` and `pull` ([schedules](schedules.md#deployment-notes)). An article scheduled for Monday arrives as it is now, a draft or live, and nothing publishes it on Monday: schedule it again after importing. Embargoes and expiries are part of the content, so they travel and still apply. Decide pending approvals and open suggestions in Studio before exporting; they are not in the file.

**What the history says about people.** The content graph names who made each change, as its contracts require. Snapshots, uploads, block edits, reviews, term proposals and takedowns carry the id of their user or agent, most also a display name. Entries name their authors, and the project row its owner's id. Treat an archive like the published site plus its edit history: give it to people you would show that history to. `--latest-only` drops older snapshots, not the names in the ones it keeps.

## Export: `cloudhal export`

```
cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]
```

- **`--out <file>`**: where to write, relative to the project. A file already there is replaced, but only once the new one is complete. A failed or interrupted export (Ctrl-C, SIGTERM) leaves no file, and an existing one stays as it was.
- **No `--out`**: the file is `<site-slug>-<YYYYMMDD>.cloudhal` in the current folder. The date is that of the newest row the archive holds, never the clock, so an unchanged site gets the same name. A deletion alone does not move the date; the next edit or snapshot does. A file already at that name is replaced only by the same archive; anything else (a later edit the same day, other flags, another CLI version) is refused, and the export asks for `--out`.
- **`--site <id>`**: another site of the project. Only sites listed in `cloudhal.json` `sites` are accepted. One archive holds one site.
- **`--no-media`**: the graph only. The manifest says `mediaOmitted`, and an import then needs the media from elsewhere.
- **`--latest-only`**: only the published and the latest snapshot, the node bodies they refer to, and the media they and the current content need. For templates that should not carry their history. Refused while a field operation is unfinished (`cloudhal fields continue|revert`), because it needs its `before` snapshot.

```
$ cloudhal export --out backups/full.cloudhal
wrote backups/full.cloudhal (4.4 KiB)
site site_3717MDRN27BXNB6BX17V (demo-blog): 10 node(s), 4 snapshot(s), 15 blob(s), 1 media file(s) (80 B)
not in the archive (RFC-0039 §4): user accounts, sessions, roles, agent keys, comments, readers, analytics, the audit log, scheduled releases, automations, schedule runs, pending approvals, open edit suggestions, deployment secrets, webhook credentials
in the archive: who made each change: snapshots, uploads, block edits, reviews and takedowns name their user or agent (by id, most also by display name)
```

With `--latest-only` and `--no-media`, the summary says what was left out (the two last lines above follow, as always):

```
$ cloudhal export --latest-only --out backups/latest.cloudhal
wrote backups/latest.cloudhal (4.1 KiB)
site site_3717MDRN27BXNB6BX17V (demo-blog): 10 node(s), 2 snapshot(s), 12 blob(s), 1 media file(s) (80 B)
history: the published and the latest snapshot only (--latest-only)

$ cloudhal export --no-media --out backups/graph.cloudhal
wrote backups/graph.cloudhal (4.3 KiB)
site site_3717MDRN27BXNB6BX17V (demo-blog): 10 node(s), 4 snapshot(s), 15 blob(s)
media left out (--no-media): an import needs the media from elsewhere
```

A media file whose local copy is missing, or whose bytes no longer match its record, stops the export: run `cloudhal media verify` to find them, or export with `--no-media`. The graph rows are read into memory; the media stream from the blob store.

## Import: `cloudhal import`

```
cloudhal import <file> [--replace] [--dry-run]
cloudhal import --revert <snapshot-id> [--dry-run]
```

The file is untrusted until it is checked, so the import works in two steps:

1. **Verify and plan.** It reads the whole file and checks every file's size and SHA-256, every row and every node body, then compares the archive with the project. Every refusal of the archive or the project comes here, before anything is written.
2. **Write.** When media must be copied, it reads the file again and requires the same manifest, so the content is the one it planned. It copies the media the project lacks, then writes the graph.

### Bootstrap, the default

A bootstrap import brings a site into a project that does not hold it yet, or holds exactly the archive's nodes. The archive's site must be `cloudhal.json`'s `siteId` or listed in `sites`. Missing snapshots, node bodies and media are added; a site whose nodes differ is refused. Nothing local is ever erased first.

Look first with `--dry-run`. It prints the manifest and what the import would add, change or remove, and writes nothing; in a project without a store it creates none. It exits 0, or 1 when the import would be refused. Here, the demo archive in an empty project whose `cloudhal.json` names `site_starter0001`:

```
$ cloudhal import starter-blog.cloudhal --dry-run
verified starter-blog.cloudhal: 5 file(s), 2.9 KiB
archive starter-blog.cloudhal: cloudhal.site-archive@1 (contracts 1), written by @cloudhal/cli 0.6.1 at 2026-10-26T00:00:00.000Z
site site_starter0001 "Starter Blog" (starter-blog): 9 node(s), 1 snapshot(s), 9 node bodies, 0 media file(s) (0 B)
dry run: bootstrap import into site site_starter0001, which is new to this project
project: proj_starter0001 is new to this project
nodes: 9 to add (1 site, 3 taxonomies, 2 terms, 2 pages, 1 entry), 0 to change, 0 to remove
  + site "Starter Blog"
  + taxonomy "Categories"
  + taxonomy "Tags"
  + taxonomy "Authors"
  + term "News"
  + term "Cloudhal"
  + page "Starter Blog" (/)
  + page "About" (/about)
  + entry "Hello, world" (posts/hello-world)
snapshots: 1 to add (snap_starter0001), with 9 node bodies
media: none
nothing written (dry run)
```

Then the import, and the same import again:

```
$ cloudhal import starter-blog.cloudhal
verified starter-blog.cloudhal: 5 file(s), 2.9 KiB
imported starter-blog.cloudhal: site site_starter0001 (starter-blog) is in this project
nodes: 9 written; snapshots: 1 added; node bodies: 9 added

$ cloudhal import starter-blog.cloudhal
verified starter-blog.cloudhal: 5 file(s), 2.9 KiB
nothing to import: this project already holds starter-blog.cloudhal (site site_starter0001, starter-blog)
```

The site keeps the archive's published snapshot, as with `cloudhal pull`. An archive with media also prints `copying 1 media file(s) (80 B)` and `media: 1 file(s) copied (80 B), 0 already here`. An archive written with `--no-media` imports only when the project already has its media.

Ctrl-C or SIGTERM stops the import before the graph is written. Media already copied stay in the blob store, unreferenced, and the next import reuses them. If storage fails while the graph is written, the message says the import stopped partway; run it again to finish it, search index included.

### Replace: `--replace`

`--replace` makes the local site's nodes the archive's, its published snapshot included, as `cloudhal pull --replace` does. Snapshots are only ever added. When it changes a site the project already holds, it saves the current graph first as a snapshot labelled `before import <file>`, and the result as `import <file>`:

```
$ cloudhal import starter-blog.cloudhal --replace
verified starter-blog.cloudhal: 5 file(s), 2.9 KiB
imported starter-blog.cloudhal: site site_starter0001 (starter-blog) is in this project, its nodes replaced by the archive's
nodes: 9 written (9 replaced); snapshots: 0 added; node bodies: 0 added
saved first: snapshot snap_VKERSCJMDWW29T2J955K "before import starter-blog.cloudhal" holds the site as it was (undo: cloudhal import --revert snap_VKERSCJMDWW29T2J955K); snap_4ABNRF7ZP9VX8V769KYB "import starter-blog.cloudhal" holds the result
note: 1 node(s) took the archive's rev, no higher than theirs here; reload Studio tabs open on this site: an edit a tab or agent still holds at that rev saves over them without a conflict
```

- **The published snapshot** becomes the archive's. The summary says so when it moves: `published: snapshot snap_YJZYHFS2C6X3V4KDG1WM, as the archive has it (was: snap_SW31VHYJDHB0EZ5H5N0D)`. A deployment keeps its own: `cloudhal push` never moves production, so publish there in Studio.
- **Revs.** The archive's nodes keep their revs. A Studio tab or agent still holding a node at that rev could save over it without a conflict, so the summary counts those nodes. Reload open Studio tabs after a replace.
- **Refused before anything is written:** open releases of the site (cancel them in Studio; there is no `--cancel-schedules` here), an unfinished field operation, and a hostname another site of the local store serves.
- **No snapshot** is taken for a site that is new to the project or unchanged: there is nothing to undo.

### Undo: `--revert`

`cloudhal import --revert <snapshot-id>` brings the site back to a `before import` snapshot, its published snapshot included. It saves the current graph first as `before revert import <file>`, so a revert can be reverted too. Its revs only move forward: a node edited since comes back at the rev after its current one, so a stale editor gets a conflict.

```
$ cloudhal import --revert snap_VKERSCJMDWW29T2J955K --dry-run
revert to snapshot snap_VKERSCJMDWW29T2J955K "before import starter-blog.cloudhal" (site site_starter0001, 2026-10-26T01:58:37.835Z)
dry run: replace the site's nodes
nodes: 0 to add, 1 to change (1 page), 0 to remove
  ~ page "About me" (/about), rev 0 here, 1 after the revert
saved first: this project's site (9 nodes) as snapshot "before revert import starter-blog.cloudhal", the result as "revert import starter-blog.cloudhal" (undo: cloudhal import --revert <the first one>)
nothing written (dry run)

$ cloudhal import --revert snap_VKERSCJMDWW29T2J955K
reverted to snapshot snap_VKERSCJMDWW29T2J955K "before import starter-blog.cloudhal" (site site_starter0001, 2026-10-26T01:58:37.835Z)
nodes: 9 written (9 replaced)
saved first: snapshot snap_Q2J3YG5VQK2Z6F1004V4 "before revert import starter-blog.cloudhal" holds the site as it was (undo: cloudhal import --revert snap_Q2J3YG5VQK2Z6F1004V4); snap_4CHHT1F20DAY5FT8YH0B "revert import starter-blog.cloudhal" holds the result
```

Studio's rollback cannot undo a replace: it only moves the published pointer to an earlier published snapshot, and a `before import` snapshot is not one.

| | `--dry-run` | `--replace` | `--revert <id>` |
|---|---|---|---|
| Writes | nothing | the archive's nodes, missing snapshots, bodies and media | the snapshot's nodes |
| Snapshot first | shows the one it would take | `before import <file>` | `before revert import <file>` |
| Published snapshot | shows the change | the archive's | the snapshot's |
| Revs | shows the nodes at risk | the archive's | moved forward |
| `cloudhal.json` | shows the switch | switched for another site | never changed |

### Another site: the site id switch

A bootstrap import of another site's archive is refused, and the message names `--replace`:

```
$ cloudhal import starter-blog.cloudhal
cloudhal: cannot import starter-blog.cloudhal: it holds site site_starter0001, and this project's site is site_H3R0HM6VPH17HVBJPQ6C (cloudhal.json siteId); `cloudhal import --replace` imports it and switches cloudhal.json siteId to site_starter0001 (site_H3R0HM6VPH17HVBJPQ6C stays in the local store, unlisted); nothing was imported
```

With `--replace`, the archive's site is imported and `cloudhal.json` is switched to it once the import has landed. Only `siteId` (or the old id's place in `sites`) changes; the rest of the file stays as written. Here, the demo archive in a project fresh from `cloudhal init`:

```
$ cloudhal import starter-blog.cloudhal --replace
verified starter-blog.cloudhal: 5 file(s), 2.9 KiB
imported starter-blog.cloudhal: site site_starter0001 (starter-blog) is in this project
nodes: 9 written; snapshots: 1 added; node bodies: 9 added
cloudhal.json: siteId site_H3R0HM6VPH17HVBJPQ6C → site_starter0001 (undo: write site_H3R0HM6VPH17HVBJPQ6C back in place of site_starter0001 by hand; --revert does not); site site_H3R0HM6VPH17HVBJPQ6C stays in the local store, unlisted and untouched (`cloudhal site delete site_H3R0HM6VPH17HVBJPQ6C --confirm my-blog` deletes it for good)
```

- **The old site** stays in the local store, unlisted and untouched. Writing its id back into `cloudhal.json` by hand undoes the switch; `--revert` restores nodes only.
- **`cloudhal site delete <id> --confirm <slug>`** deletes the old site for good.
- **A deployed project** is warned: its deployment serves the old site, and `cloudhal push` would send the new one there as another site.

## Recipes

### Back up a site

```bash
cloudhal export --out ~/backups/news-2026-10-26.cloudhal
```

Keep backups outside the project folder. To restore into a project whose `cloudhal.json` names the site, run `cloudhal import <file>` when the project has lost the site, or `cloudhal import <file> --replace` to go back over newer local work (undo: `--revert`, with the id it prints). Check either with `--dry-run` first.

A backup holds the content, not what was scheduled or waiting: releases, pending approvals and open suggestions are not in it. After a restore, schedule the releases again.

### Move a site to another machine

1. On the old machine: `cloudhal export --out site.cloudhal`.
2. On the new one: clone or copy the project (the theme and `cloudhal.json`), install its dependencies (`npm install`, `pnpm install`, …), then run `cloudhal import site.cloudhal`.
3. Run `cloudhal dev` or `cloudhal studio` as usual. Import first: until then the new project's store has no site.

An imported site exports back to the same file: the same bytes with the same CLI and Node build. What does not move: users, reader comments (`cloudhal comments`), analytics, scheduled releases, pending approvals, open suggestions and `.cloudhal/deploy/`. Decide the approvals and suggestions in Studio before exporting. Schedule the releases again on the new machine. Cancel them on the old one if it keeps running `cloudhal dev` or `studio`: its scheduler still runs them. `cloudhal push` and `deploy` from the new machine need the deployment token in `.cloudhal/deploy/secrets.json`, which is never in an archive ([deploying to Cloudflare](../../packages/cli/README.md#deploying-to-cloudflare-adr-0012)).

### Keep a site's content in the repository

This replaces content written as code ([#47](https://github.com/cloudhal-dev/cloudhal/issues/47)). The project's `.gitignore` keeps `.cloudhal/` out of git, but not an archive:

```bash
cloudhal export --out content/site.cloudhal   # after editing; commit the file
cloudhal import content/site.cloudhal         # in a fresh clone, before working
```

Export again after every round of edits. An unchanged site gives the same bytes on the same CLI and Node build, so git sees no change. An edited site gives a new binary file: git stores it whole and cannot diff it (look with `cloudhal import <file> --dry-run`).

A clone that already imported an earlier version refuses the plain import once `git pull` brings a newer one (`differs from the archive in <n> node(s)`). There, run `cloudhal import content/site.cloudhal --replace`: `--dry-run` first shows what changes, local work is saved as a `before import` snapshot, and `--revert` undoes it. Each such replace adds two snapshots (`before import` and `import`), which the next export carries. Let one person export at a time: git cannot merge two versions of the file, so the second commit replaces the first person's edits.

[Workers Builds](deploy-button.md) does not read archives: a build without a store seeds the starter site. Content reaches a deployment from a local project, through `cloudhal deploy` (the first one pushes the local site) or `cloudhal push`.

### Templates and starters

A theme can ship an archive of its demo site. Its users run `cloudhal init`, then `cloudhal import demo.cloudhal --replace`, which switches the new project to the demo's site. Export the demo with `--latest-only` so it does not carry its history; the snapshots it keeps still name their author.

Ids are kept, so every project that imports one template holds the same site id. That is right for a backup and wrong for a starter used twice in one installation: two projects made from it and pushed to one installation are the same site there, not two. Importing as a copy with new ids (`--new-ids`) and `cloudhal init --from <file>` come later.

### Try it: the starter demo archive

The repository has a small demo archive, [starter-blog.cloudhal](../../packages/cli/test/fixtures/site-archives/starter-blog.cloudhal): the site `cloudhal init` seeds, published once (`site_starter0001`, no media). It is regenerated with `pnpm demo:archive`, and `pnpm check` fails when it no longer matches what the code exports.

```bash
curl -LO https://github.com/cloudhal-dev/cloudhal/raw/main/packages/cli/test/fixtures/site-archives/starter-blog.cloudhal
npm create cloudhal@latest my-site
cd my-site
npm install
npx cloudhal import ../starter-blog.cloudhal --replace --dry-run   # then without --dry-run
```

## Takedowns

Taken-down content stays down. The ledger travels in the archive; the taken-down bytes never do.

- **Export** leaves out the bytes and says how many: `…, 0 media file(s) (0 B), 1 taken down`.
- **Import** records the archive's takedowns and deletes local copies of that content: `media: 1 taken down, never imported; 1 of them deleted from this project`. A dry run says so first.
- **An archive carrying content this project has taken down is refused:** `the archive carries 1 media file(s) this project has taken down (first <sha256>); an import never brings taken-down content back`.
- **`--revert`** brings the media record back, not its bytes.

## Same content, same file

The writer uses a fixed order, zero timestamps and fixed modes in the tar headers, and dates the manifest by the newest row, never the clock. Exporting an unchanged site twice gives the same bytes with the same CLI and Node build. Another zlib build compresses the same tar differently (Homebrew's Node and the official Node binaries do), so the gzip bytes can differ between machines. The tar inside, and so every SHA-256 in the manifest, is the same everywhere. Compare archives through it. Here, an archive and the export of a project it was imported into:

```
$ gunzip -c re.cloudhal | shasum -a 256
bcf08446a1e2c25f0c9e32c7e6993dbac1989b21ff22b111b4ee800b04da3e29  -
$ gunzip -c content/site.cloudhal | shasum -a 256
bcf08446a1e2c25f0c9e32c7e6993dbac1989b21ff22b111b4ee800b04da3e29  -
$ tar -xOzf content/site.cloudhal manifest.json   # the manifest alone
```

`createdBy`, the CLI version, is part of the manifest, so a new CLI version changes the tar of an unchanged site. The repository's demo archive is checked by its manifest without `createdBy`, for that reason.

## Untrusted files (security notes)

An archive from someone else is untrusted input. `import` runs nothing in it and checks, before anything is written:

- **the layout:** only the paths in the table above, in that order. No `..`, absolute paths, links or devices;
- **every file** against the manifest's SHA-256 and size, and every media file against its own name;
- **every row** against fixed field tables, and every node body against the contracts' precompiled validators: each body must be the node its snapshot refs name, of the archive's site;
- **time gates** (embargoes and expiries) by the same rules as for `cloudhal push`;
- **the format:** a newer archive format, contracts `schemaVersion` or bundle format is refused, naming the CLI version needed;
- **the file itself:** it must not change between the two reads.

The caps:

| What | At most |
|---|---|
| `manifest.json` | 16 MiB |
| `project.json`, `ledger.ndjson`, each `nodes`, `snapshots` or `blobs` part | 16 MiB (the writer starts a new part at 8 MiB) |
| Each media file | 100 MiB, the upload limit |
| The whole archive, decompressed | 32 GiB |
| Entries | 100,000 |
| Parts of each kind | 9,999 |

**Not signed.** An archive is as trustworthy as where it came from; a valid archive can still hold content you did not write. Signed archives come later.

**Not encrypted.** An archive holds no secrets and no personal data beyond the names in its history, but it does hold unpublished drafts. To keep it confidential, encrypt the file after exporting, and decrypt it to a file before importing:

```bash
age -p -o site.cloudhal.age site.cloudhal        # or: gpg --symmetric --output site.cloudhal.gpg site.cloudhal
age -d -o site.cloudhal site.cloudhal.age        # or: gpg --output site.cloudhal --decrypt site.cloudhal.gpg
```

`cloudhal import` takes a file, not standard input: `cloudhal import -` answers `no such file`. A pipe such as `/dev/stdin` fails as soon as the import has media to copy, since it reads the file again (`not a Cloudhal site archive (it is empty)`).

## Limits

- **Local projects only.** Both commands read and write the project's own store. To bring an archive into a deployment, import it locally, then `cloudhal push`.
- **One archive, one site.** A project with several sites exports them one at a time (`--site`).
- **Ids are kept.** There is no import as a copy yet.
- **Memory.** The graph rows are held in memory on both sides; only the media stream. Sites with very many nodes need memory to match.
- **One atomic batch.** The node set is written in one atomic batch of at most 1,000 statements, about one per node, the same limit `push` and `pull` have. A larger site is refused before anything is written: `site <id> has too many nodes (<n>) for one atomic copy`.
- **No partial export.** A collection alone, or a site without its snapshots, comes later.

## Troubleshooting

An error starts with `cloudhal:`. An import refusal reads `cloudhal: cannot import <file>: <reason>; nothing was imported`, and a revert refusal `cloudhal: cannot revert to <id>: <reason>; nothing was reverted`. A dry run prints each refusal of the project as a line `would refuse: <reason>` instead, and exits 1. Here, the demo archive in a project of another site:

```
$ cloudhal import starter-blog.cloudhal --dry-run
verified starter-blog.cloudhal: 5 file(s), 2.9 KiB
archive starter-blog.cloudhal: cloudhal.site-archive@1 (contracts 1), written by @cloudhal/cli 0.6.1 at 2026-10-26T00:00:00.000Z
site site_starter0001 "Starter Blog" (starter-blog): 9 node(s), 1 snapshot(s), 9 node bodies, 0 media file(s) (0 B)
would refuse: it holds site site_starter0001, and this project's site is site_3717MDRN27BXNB6BX17V (cloudhal.json siteId); `cloudhal import --replace` imports it and switches cloudhal.json siteId to site_starter0001 (site_3717MDRN27BXNB6BX17V stays in the local store, unlisted)
nothing written (dry run)
```

A damaged file is refused in a dry run too, with the `cannot import` line. The tables quote the reason.

**Export**

| Message | What to do |
|---|---|
| ``site <id> is not listed in cloudhal.json `sites` (this project's sites: …)`` | `--site` takes only sites listed in `sites`. |
| `site <id> is listed in cloudhal.json but the local store (.cloudhal) has no such site` | The id in `cloudhal.json` is wrong, or the site was never imported here. |
| ``local media <sha256> is missing; run `cloudhal media verify` (or export with --no-media)`` | A media file is gone from `.cloudhal/blobs/`. Run `cloudhal media verify`; restore the file, or export with `--no-media`. |
| `media/<sha256>: the media source has <n> of <m> bytes; the local copy is damaged: …`, or `is longer than <m> bytes`, or `does not match its SHA-256` | The same, for a file cut short, grown or changed. |
| `<name> already exists and is not this archive (…); pass --out <name> to replace it, or --out <file> to keep both` | The default name is taken by another archive. |
| `--out <path> is a directory; name a file` | Give `--out` a file name. |
| `field operation <id> on <collection> has not finished, and --latest-only would drop the snapshot it needs; …` | Finish or revert it (`cloudhal fields continue\|revert <collection> <id>`), or export the full history. |
| `cloudhal import does not take --no-media (only cloudhal export does)` | `--site`, `--no-media` and `--latest-only` belong to `export`. |

**The file**

| Reason | What to do |
|---|---|
| `not a Cloudhal site archive (not gzip)`, or `(manifest.json is not its first entry)` | It is not an archive `cloudhal export` wrote. |
| `the archive is truncated (gzip ends early); the file is damaged or incomplete, export it again` | The file is cut short: copy or download it again. |
| `nodes/0001.ndjson: its SHA-256 does not match manifest.json (the file is damaged or was edited); the file is damaged or incomplete, export it again` | A byte changed. Get an intact copy. |
| `…; this file was not written by cloudhal export` | It holds a path, link or device outside the layout. |
| `…; it is over this CLI's archive limits` | It exceeds a cap above. |
| `this archive was written by a newer Cloudhal (archive format cloudhal.site-archive@2); update @cloudhal/cli to <version> or later` | Update the CLI to the version that wrote it. The same for a newer `contracts schemaVersion` or bundle format. |
| `no such file` | The path is wrong; `-` is not standard input. |
| `the file changed while it was being imported` | Something wrote to the file during the import. Import a copy that nobody writes to. |

**The project**

| Reason | What to do |
|---|---|
| ``it holds site <a>, and this project's site is <b> (cloudhal.json siteId); `cloudhal import --replace` imports it and switches …`` | It is another site's archive: use `--replace` ([the switch](#another-site-the-site-id-switch)), or import it into a project that names it. |
| `this project's site <id> differs from the archive in <n> node(s) (…); bootstrap imports only into a project without the site or holding exactly its nodes; …` | The local site has other content. `--replace --dry-run` shows what would change. |
| `it holds site <id>, which cloudhal.json cannot name (site_ and 6 to 32 letters or digits)` | The archive's site id is not one a project can use. |
| `cloudhal.json cannot be switched in place: it names <old> in more than its siteId and sites values, or writes it escaped; set cloudhal.json siteId to <new> by hand …` | `--replace` edits only those values. Set `siteId` to the archive's site by hand, then import again. |
| `the archive has no media (written with --no-media) and this project lacks <n> of the <m> media file(s) it needs (first <sha256>); copy them into .cloudhal/blobs/media/<siteId>/ or import an archive with media` | Copy the media in, or export again without `--no-media`. |
| `the archive carries <n> media file(s) this project has taken down (first <sha256>); an import never brings taken-down content back` | The archive still holds content taken down here: it was exported before the takedown, or from a copy without it. Import a newer archive. |
| `site <id> has <n> open release(s) (…), and --replace replaces the graph their pinned versions point into; cancel them in Studio …` | Cancel the releases in Studio (or with the MCP tool `cancel_schedule`), then import again. |
| `field operation <id> on <collection> has not finished, and --replace would drop its marker; …` | Run `cloudhal fields continue\|revert <collection> <id>`, then import again. |
| `the archive's site serves <host>, which site <id> of this project's store already serves; …` | Remove the hostname from that site's domains in Studio, or delete that site if it is a leftover (`cloudhal site delete <id> --confirm <slug>`). |
| `site <id> has too many nodes (<n>) for one atomic copy` | See [Limits](#limits). |

**Interruptions and partial writes**

| Message | What it means |
|---|---|
| `export interrupted; no file written, an existing one left as it was` | Ctrl-C or SIGTERM during an export. |
| `import interrupted; nothing was imported` | Ctrl-C or SIGTERM before the graph was written. Media already copied stay and are reused. |
| `…; the import stopped after it began writing, so this project may hold part of it; run it again to finish` | A storage failure while writing. Run the same import again. With `--replace`, the message also names the `before import` snapshot and its `--revert`. |
| `imported <file>, but cloudhal.json changed while importing, so it still names site <old>; …` | The import landed, the switch did not. Run it again, which only switches, or set `siteId` by hand. |

**Revert**

| Reason | What to do |
|---|---|
| `it is not a "before import" snapshot of this project (…)` | `--revert` takes only the ids `--replace` and `--revert` print. |
| `it is a snapshot of site <id>, which cloudhal.json does not list (siteId and sites)` | A site id switch moved the project to another site. List both ids in `sites` (`"sites": ["<siteId>", "<old>"]`), or write the old one back as `siteId`, then revert. |
| `this project lacks or has a damaged copy of <n> media file(s) the snapshot needs (first <sha256>)` | A file in `.cloudhal/blobs/media/<siteId>/` was deleted or changed (`cloudhal media verify` lists it). Copy it back, or import a backup archive of the site as it is now, which copies only the missing media; then revert. |
| `this project has no local store` | Run it in the project folder that took the snapshot. |

## Later

Decided, not built yet ([RFC-0039 › Later](../rfcs/0039-site-archive-export-import.md#later-decided-not-in-v1)):
- `cloudhal init --from <file.cloudhal>`: start a project from an archive;
- `--new-ids`: import as a copy with new ids, for templates;
- partial export: `--collection <key>` and `--no-snapshots`;
- export from a deployment (`--from <admin-url>`) and a Studio "Download site archive";
- signed archives;
- a `--dir` layout (the same files, unpacked);
- graph rows that stream on both sides, and imports larger than one batch.
