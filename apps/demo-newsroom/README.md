# Cloudhal Newsroom (dogfooding demo)

Cloudhal's own newsroom — release notes written from the project's history (`content/`) — published **through Cloudhal itself**: an MCP client (`scripts/editor-agent.ts`) creates and updates the articles with Cloudhal's tools, previews them, and asks to publish. Publishing stops for a person; the question is relayed to your terminal.

All commands run from the repository root. `examples/` is ignored by git and is a workspace folder, so a project created there gets its dependencies from `pnpm install`.

## Locally

```bash
node packages/cli/bin/cloudhal.ts init examples/newsroom --name "Cloudhal Newsroom"
pnpm install
node apps/demo-newsroom/scripts/editor-agent.ts --project examples/newsroom
cd examples/newsroom && node ../../packages/cli/bin/cloudhal.ts dev
```

## On Cloudflare

Needs your own Cloudflare account; wrangler uses your login (`npx wrangler login`) — Cloudhal never sees the credentials.

```bash
pnpm --filter @cloudhal/studio build
cd examples/newsroom && node ../../packages/cli/bin/cloudhal.ts deploy --name cloudhal-newsroom
```

Run `deploy` again at any time: it reuses the D1 database, R2 bucket and secrets, and never pushes over content that changed on the deployment.

`deploy` prints the site and Studio URLs. Open Studio, create the owner account, then **Agents → Create key** with `content:*`, `preview:create` and `site:publish`. Then let the agent publish to production:

```bash
CLOUDHAL_API_KEY=<key> node apps/demo-newsroom/scripts/editor-agent.ts --url https://<studio-host>/mcp
```

Or keep the key in a file git ignores and pass `--key-file examples/newsroom/.cloudhal/deploy/agent-key` (chmod 600).

Every change it makes is a snapshot you can diff and roll back in Studio; the Activity tab shows each call it made and your approval.

`pnpm --filter @cloudhal/demo-newsroom test` runs the agent against an in-memory Cloudhal MCP server (approval, decline, idempotent re-runs).
