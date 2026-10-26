---
"@cloudhal/cli": patch
---

New `cloudhal import <file> [--dry-run]` (RFC-0039, #47) reads a `.cloudhal` file written by `cloudhal export` into the local project, keeping the site's id.

- It reads the file twice. First it verifies every file's size and SHA-256, every row and every node body (each must be the node its snapshot refs name), and checks the archive against the project. A damaged or edited file, invalid content, an archive of another site, a site whose nodes differ, or missing media is therefore refused before anything is written. Then it reads the file again, refusing it if it changed in between, copies the media the project lacks and imports the graph, keeping the archive's published snapshot as `cloudhal pull` does.
- By default a bootstrap import. The archive's site must be `cloudhal.json`'s `siteId` or listed in `sites`, and the project must not hold it yet or hold exactly its nodes; missing snapshots, node bodies and media are added. A site whose nodes differ is refused; `--replace` replaces them (see its own note).
- An archive written with `--no-media` imports only when the project already has its media.
- Taken-down content stays down: the archive's takedowns are recorded and their bytes never written, a local copy of content the archive's ledger took down is deleted (the summary says how many), and an archive carrying content this project has taken down is refused.
- `--dry-run` prints the manifest and what the import would add, change or remove (nodes by kind and title, snapshots, media to copy), writes nothing, and exits 1 when the import would be refused.
- Ctrl-C and SIGTERM stop the import before the graph is written; media already copied stay in the blob store, unreferenced, and the next import reuses them. A storage failure while the graph is written says the import stopped partway; running it again completes it, search index included.
- Opening an existing local store applies pending migrations, as every command does; a project without one gets none from a dry run or a refused import.
