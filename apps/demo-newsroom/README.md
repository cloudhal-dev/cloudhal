# Cloudhal Newsroom (dogfooding demo)

Cloudhal's own newsroom — release notes written from the project's history (`content/`) — published **through Cloudhal itself**: an MCP client (`scripts/editor-agent.ts`) creates and updates the articles with Cloudhal's tools, previews them, and asks to publish. Publishing stops for a person; the question is relayed to your terminal.

## Locally

```bash
node packages/cli/bin/cloudhal.ts init ../newsroom --name "Cloudhal Newsroom"
node apps/demo-newsroom/scripts/editor-agent.ts --project ../newsroom
cd ../newsroom && node ../cloudhal/packages/cli/bin/cloudhal.ts dev
```

## On Cloudflare

Needs your own Cloudflare account; wrangler uses your login (`npx wrangler login`) — Cloudhal never sees the credentials.

```bash
pnpm --filter @cloudhal/studio build
cd ../newsroom && node ../cloudhal/packages/cli/bin/cloudhal.ts deploy
```

`deploy` prints the site and Studio URLs. Open Studio, create the owner account, then **Agents → Create key** with `content:*`, `preview:create` and `site:publish`. Then let the agent publish to production:

```bash
CLOUDHAL_API_KEY=<key> node apps/demo-newsroom/scripts/editor-agent.ts --url https://<studio-host>/mcp
```

Every change it makes is a snapshot you can diff and roll back in Studio; the Activity tab shows each call it made and your approval.

`pnpm --filter @cloudhal/demo-newsroom test` runs the agent against an in-memory Cloudhal MCP server (approval, decline, idempotent re-runs).
