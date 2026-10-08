# @cloudhal/cli

```
cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
cloudhal studio [--port <n>] [--no-auth]                API + Studio UI (+ /mcp) for this project
cloudhal mcp [--scopes a,b] [--skills <dir>] [--preview-url <url>]
                                                        MCP server over stdio for this project
cloudhal deploy [--name <base>] [--dry-run]             site + admin Workers on Cloudflare
cloudhal domain [set <hostname>] [--studio <hostname>] | remove [site|studio|all]
cloudhal push [--replace] [--admin-url <url>]           local site → deployment
cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
```

### Deploying to Cloudflare (ADR-0012)

`cloudhal deploy` uses **your** wrangler login (`npx wrangler login`, or `CLOUDFLARE_API_TOKEN`); Cloudhal never reads those credentials. It creates the D1 database and R2 bucket if needed, generates the deployment secrets once into `.cloudhal/deploy/secrets.json` (0600 — keep it out of git), builds and deploys the **site Worker** (Astro on demand, edge-cached) and the **admin Worker** (Studio, API, auth, MCP), and on the first deploy pushes your local site.

**Custom domain.** `cloudhal domain set news.example.com --studio studio.example.com` records the hostnames in `cloudhal.json`; the next `cloudhal deploy` routes them to the Workers as [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) (the zone must be in the same Cloudflare account — Cloudflare creates the DNS record and certificate) and makes the site's one its primary hostname, so preview links and canonical URLs use it. The workers.dev addresses keep working. `cloudhal domain remove` and a deploy undo it.

After that the deployment is the source of truth — agents edit it there. `cloudhal push` refuses to overwrite content that changed remotely; `cloudhal pull` brings it home. `--dry-run` bundles both Workers with the real wrangler without an account.

Publishing and rollback never rebuild anything: the site Worker follows the published snapshot pointer and the admin Worker purges its cache. Preview links (`?cloudhal-preview=…`) show drafts on the real site.

`cloudhal mcp` is what you register in Claude Code / Cursor / any MCP client:

```json
{ "mcpServers": { "cloudhal": { "command": "cloudhal", "args": ["mcp"], "cwd": "/path/to/site" } } }
```

The local developer owns the project, so the default scopes are `*`; publish, rollback and delete still stop for approval inside the client (or hand back a `confirmToken` when the client cannot elicit). `--scopes site:read,content:write` narrows what the client may do. Skills come from `<project>/skills` or the bundled `skills/official`.

Everything runs offline: the project's `.cloudhal/` holds `data.db` (SQLite) and `blobs/`. `cloudhal.json` records the site id.

Inside the monorepo the bin runs as TypeScript on Node 24 (type stripping): `node packages/cli/bin/cloudhal.ts init examples/my-site`. Projects created under `examples/` are workspace-linked; elsewhere, `workspace:*` dependencies are rewritten to published versions.

`cloudhal dev` cannot run inside a Vitest worker (Astro disables its dev middleware when `VITEST` is set); the e2e test spawns the bin as a child process.
