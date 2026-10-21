# Connect an agent

Every MCP client connects to Cloudhal in one of two ways ([which one?](/docs/agents#two-ways-to-connect)):

- **Local server:** the client starts `cloudhal mcp` in your project folder. Nothing to authenticate; the agent works on the project's local store.
- **Remote server:** the client calls `https://<studio-host>/mcp` on a deployment, sending an agent key created in Studio under **Agents** as `Authorization: Bearer <key>` or in the `x-api-key` header. Both work; use whichever your client supports. Bearer needs a deployment on Cloudhal 0.3.4 or later; on older ones use `x-api-key`, or upgrade and run `cloudhal deploy`. Studio shows each client's setup with the key filled in right after you create it.

`cloudhal mcp` serves the project folder it starts in. Configure local servers **per project** (the project-scoped files below), or start the client from the project folder.

## Run it with your package manager

The CLI is a dependency of your project, so the client runs the project's copy. Use the line for your package manager wherever the examples below say `npx cloudhal mcp`:

| Package manager | Command | `command` / `args` in JSON configs |
|---|---|---|
| npm | `npx cloudhal mcp --mode edits` | `"npx"`, `["cloudhal", "mcp", "--mode", "edits"]` |
| pnpm | `pnpm exec cloudhal mcp --mode edits` | `"pnpm"`, `["exec", "cloudhal", "mcp", "--mode", "edits"]` |
| Yarn | `yarn cloudhal mcp --mode edits` | `"yarn"`, `["cloudhal", "mcp", "--mode", "edits"]` |
| Bun | `bunx cloudhal mcp --mode edits` | `"bunx"`, `["cloudhal", "mcp", "--mode", "edits"]` |

Do not use `npx -y @cloudhal/cli mcp` for a local server: it downloads a separate copy of the CLI that may not match your project's version.

`--mode` is one of `plan`, `manual`, `edits` (default), `auto` or `bypass` ([modes](/docs/agents#modes)). `cloudhal mcp --preview-url http://localhost:4321` makes preview links point at your running `cloudhal dev`.

For the remote examples, put the key in an environment variable instead of the file:

```sh
export CLOUDHAL_API_KEY="<the key from Studio>"
```

## Claude Code

Local, from the project folder. `--scope project` writes `.mcp.json`, which you can commit so everyone on the project gets the server:

```sh
claude mcp add --scope project cloudhal -- npx cloudhal mcp --mode edits
```

Remote:

```sh
claude mcp add --transport http cloudhal https://studio.example.com/mcp \
  --header "Authorization: Bearer $CLOUDHAL_API_KEY"
```

Or in `.mcp.json`, with the key read from the environment when Claude Code starts:

```json
{
  "mcpServers": {
    "cloudhal": {
      "type": "http",
      "url": "https://studio.example.com/mcp",
      "headers": { "Authorization": "Bearer ${CLOUDHAL_API_KEY}" }
    }
  }
}
```

Check the connection with `/mcp` inside Claude Code. Approvals appear as questions in the conversation.

## Codex

Local, from the project folder:

```sh
codex mcp add cloudhal -- npx cloudhal mcp --mode edits
```

That writes `~/.codex/config.toml`, which applies to every folder. To keep the server with the project, put it in the project's `.codex/config.toml` instead (Codex reads it in trusted projects):

```toml
[mcp_servers.cloudhal]
command = "npx"
args = ["cloudhal", "mcp", "--mode", "edits"]
```

Remote, with the key taken from the environment and sent as `Authorization: Bearer`:

```sh
codex mcp add cloudhal --url https://studio.example.com/mcp --bearer-token-env-var CLOUDHAL_API_KEY
```

Or in `config.toml`:

```toml
[mcp_servers.cloudhal]
url = "https://studio.example.com/mcp"
bearer_token_env_var = "CLOUDHAL_API_KEY"
```

## Cursor

Local, in the project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cloudhal": {
      "command": "npx",
      "args": ["cloudhal", "mcp", "--mode", "edits"]
    }
  }
}
```

Remote:

```json
{
  "mcpServers": {
    "cloudhal": {
      "url": "https://studio.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:CLOUDHAL_API_KEY}" }
    }
  }
}
```

## VS Code (GitHub Copilot)

Local, in the project's `.vscode/mcp.json`:

```json
{
  "servers": {
    "cloudhal": {
      "type": "stdio",
      "command": "npx",
      "args": ["cloudhal", "mcp", "--mode", "edits"]
    }
  }
}
```

Remote. VS Code asks for the key once and stores it securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "cloudhal-key", "description": "Cloudhal agent key", "password": true }
  ],
  "servers": {
    "cloudhal": {
      "type": "http",
      "url": "https://studio.example.com/mcp",
      "headers": { "Authorization": "Bearer ${input:cloudhal-key}" }
    }
  }
}
```

## Claude Desktop and claude.ai

Use the remote server: **Settings › Connectors › Add custom connector**, the URL `https://studio.example.com/mcp`, and a request header `Authorization` with the value `Bearer <your key>`. Claude connects from Anthropic's cloud, so this needs a deployment; `localhost` is not reachable. For a local project, use Claude Code.

## Windsurf

Remote, in `mcp_config.json` (global, so prefer the remote server):

```json
{
  "mcpServers": {
    "cloudhal": {
      "serverUrl": "https://studio.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:CLOUDHAL_API_KEY}" }
    }
  }
}
```

## Zed

In the project's `.zed/settings.json`:

```json
{
  "context_servers": {
    "cloudhal": {
      "command": "npx",
      "args": ["cloudhal", "mcp", "--mode", "edits"]
    }
  }
}
```

Remote: `{ "url": "https://studio.example.com/mcp", "headers": { "Authorization": "Bearer …" } }` in place of `command` and `args`.

## Gemini CLI

Local, in the project's `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "cloudhal": { "command": "npx", "args": ["cloudhal", "mcp", "--mode", "edits"] }
  }
}
```

Remote (Gemini uses `httpUrl` for streamable HTTP):

```sh
gemini mcp add --transport http -H "Authorization: Bearer $CLOUDHAL_API_KEY" cloudhal https://studio.example.com/mcp
```

## Any other client

- **stdio:** command `npx`, arguments `cloudhal mcp --mode edits`, working directory: your project.
- **Streamable HTTP:** URL `https://<studio-host>/mcp`, header `Authorization: Bearer <key>` (or `x-api-key: <key>`).

A client that cannot send headers can reach the remote server through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) as a local stdio command: `npx -y mcp-remote https://studio.example.com/mcp --header "Authorization:Bearer ${CLOUDHAL_API_KEY}"`.

## Troubleshooting

- **The client lists no tools.** Run the command yourself in the project folder: `npx cloudhal mcp` should start and keep running (it waits for a client on stdin). An error there (Node older than 24, not a Cloudhal project) is what the client sees.
- **The agent edits a different site.** The local server serves the folder it started in. Use a project-scoped config, or start the client from the project.
- **`401 unauthorized` remotely.** The key is missing, revoked, or sent in another header. Cloudhal reads `Authorization: Bearer <key>` and `x-api-key`; on `/mcp` a bearer must be an agent key, not the deployment token.
- **`403 not_a_member`.** The key's owner no longer belongs to the deployment; create a new key.
- **A call says it is waiting for approval.** Accept it in your client, or in Studio under **Approvals** on a deployment.
