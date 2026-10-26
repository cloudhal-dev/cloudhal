# ADR-0041: Site archives: a streaming `.cloudhal` tar of NDJSON parts and media, ids kept, graph only
- Status: Accepted
- Date: 2026-10-22 (decided by Halil)
- Amendment (2026-10-25, RFC-0039 rollout step 1): deterministic bytes hold for the same Node/zlib build; the tar stream and the manifest's SHA-256s on every platform. See rule 6.
- Amendment (2026-10-26, RFC-0039 rollout step 4): `--replace` takes the archive's published snapshot (a deployment keeps its own on `push`) and is undone with `cloudhal import --revert <snapshot-id>`, which restores the `before import` snapshot. See decision 4.
- Amendment (2026-10-26, RFC-0039 rollout step 5): the committed demo archive is checked through its manifest without `createdBy`. The graph rows are held in memory, and import writes the node set in one batch of at most 1000 statements, as `push` and `pull`; only the container and the media stream. This corrects the risk below that says memory stays flat. Both are in RFC-0039's Later. Decision 5's list also leaves out scheduled releases, pending approvals and open edit suggestions, which live outside the graph like automations.
- Related: RFC-0039, RFC-0004, RFC-0010, ADR-0002, #47
- Sources: [Sanity datasets](https://www.sanity.io/docs/cli-reference/dataset) · [Strapi data management](https://docs.strapi.io/cms/data-management/export) · [Contentful CLI export](https://github.com/contentful/contentful-cli/tree/main/docs/space/export) · [Ghost migration](https://docs.ghost.org/migration/ghost) · [WordPress export](https://wordpress.org/documentation/article/tools-export-screen/)

## Context
A site's content can only leave a project through a deployment (`push`, `pull`), so cloudhal.com kept its content as code (#47). The `SiteBundle` format and `importSite` already exist and are tested. The CMSs compared stream large exports (Sanity's tar.gz of NDJSON, Strapi's JSONL parts) and check assets. Strapi erases the target on import and encrypts with AES-128-ECB.

## Decision
1. **`cloudhal export` / `cloudhal import`** with a `.cloudhal` file: a gzip-compressed ustar holding `manifest.json`, `project.json`, `nodes|snapshots|blobs/NNNN.ndjson` parts of at most 8 MB, `media/<sha256>` and `ledger.ndjson`. Read in order, the parts are exactly a `cloudhal.site-bundle@1`.
2. **The manifest** names the archive format, the contracts' `schemaVersion`, the bundle format, the counts, and every file's SHA-256 and size. A newer format or schema version is refused; an older one is migrated forward.
3. **Ids are kept.** An imported site is the same site.
4. **Import modes:**
   - bootstrap (default): adds what is missing and refuses differing nodes;
   - `--replace`: first saves the current graph as a `before import` snapshot, so the import can be undone (amended: with `cloudhal import --revert <snapshot-id>`, a site id switch by writing the old `siteId` back; the published snapshot becomes the archive's);
   - `--dry-run`: shows the difference and writes nothing.

   Never erase-then-import.
5. **Graph only.** No users, sessions, roles, agent keys, comments, readers, analytics, audit log, automations, secrets or webhook credentials. That is why there is no built-in encryption; people can pipe the file through `age` or `gpg`.
6. **Deterministic bytes:** a fixed order, zero timestamps and fixed modes, so an unchanged site exports identically (amended: byte for byte with the same Node/zlib build, since gzip output differs between zlib builds; the tar stream inside, and every SHA-256 in the manifest, on every platform).
7. **Untrusted input:** the layout is a closed list of paths (no traversal, links or devices); sizes are capped; rows go through the precompiled validators and gates, as for `push`.
8. **Later, already decided:** `init --from`, `--new-ids` for templates, partial export, `--from <admin-url>`, Studio download, and signed archives.

## Consequences
- Positive:
  - Backups, demos and starters become files.
  - Moving a site needs no deployment.
  - Nothing in the format needs a second data model.
- Negative:
  - A tar reader and writer of our own (small, no dependency).
  - The format is versioned and must be read forever.
- Risks:
  - A file is as trustworthy as its source until archives are signed.
  - Large media sets make big files; `--no-media` and the parts limit keep memory flat, not size small (amended: flat for the media; the graph rows are held in memory).
