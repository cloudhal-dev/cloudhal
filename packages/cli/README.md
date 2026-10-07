# @cloudhal/cli

```
cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
```

Everything runs offline: the project's `.cloudhal/` holds `data.db` (SQLite) and `blobs/`. `cloudhal.json` records the site id.

Inside the monorepo the bin runs as TypeScript on Node 24 (type stripping): `node packages/cli/bin/cloudhal.ts init examples/my-site`. Projects created under `examples/` are workspace-linked; elsewhere, `workspace:*` dependencies are rewritten to published versions.

`cloudhal dev` cannot run inside a Vitest worker (Astro disables its dev middleware when `VITEST` is set); the e2e test spawns the bin as a child process.
