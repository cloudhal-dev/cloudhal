---
"@cloudhal/cli": patch
---

New `cloudhal export` (RFC-0039, #47) writes one site of the local project to a single `.cloudhal` file. The file is a gzipped tar holding the site's content graph (nodes, snapshots and the node bodies they reference, as NDJSON parts), its media files and its takedown ledger, with every file's SHA-256 listed in the manifest. The flags:

- `--out <file>` names the file, and replaces a file already there once the new one is complete. By default the file is `<site-slug>-<YYYYMMDD>.cloudhal` in the current folder, dated by the newest timestamp among the rows it holds (deleting content alone does not move that date; the next edit or snapshot does). A file already at the default name is replaced only by the same archive; any other (a later edit the same day, other flags, a deletion) is left alone and the export asks for `--out`.
- `--site <id>` exports another site listed in `cloudhal.json` `sites`. `--site`, `--no-media` and `--latest-only` are refused on every other command.
- `--no-media` writes the graph only.
- `--latest-only` keeps only the published and the latest snapshot, and only the media they and the current content need. It is refused while a field operation is unfinished (`cloudhal fields continue|revert`).

A damaged or missing local media file stops the export (run `cloudhal media verify`); so do Ctrl-C and SIGTERM. Either way no file is written and an existing one is left as it was. Exporting an unchanged site again with the same CLI and Node version gives the same bytes. An archive never contains user accounts, sessions, roles, agent keys, comments, readers, analytics, the audit log, scheduled releases, automations, schedule runs, pending approvals, open edit suggestions, deployment secrets or webhook credentials, and the export prints this list. Its history does name who made each change (the user or agent of each snapshot, upload, block edit, review and takedown).
