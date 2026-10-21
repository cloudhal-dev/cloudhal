# Docs for agents

These docs are published for agents as well as for people. Point your agent at them when it works on a Cloudhal project.

## Markdown pages

Every page is also available as Markdown. Add `.md` to its URL:

```txt
https://cloudhal.dev/docs/start/quickstart      → HTML
https://cloudhal.dev/docs/start/quickstart.md   → Markdown
```

`<page>/index.md` works too, and so does asking for the page itself with `Accept: text/markdown` (the answer carries `Vary: Accept` and an `x-markdown-tokens` estimate). Each Markdown file starts with frontmatter: `title`, `description`, `url` and `source` (the file in the repository). Links in it are absolute, so it reads correctly anywhere.

## llms.txt

[`/llms.txt`](/llms.txt) lists every page with a one-line description, grouped by section ([llmstxt.org](https://llmstxt.org)). [`/llms-full.txt`](/llms-full.txt) holds the whole documentation in one file, for tools that index or load everything at once.

Each section has its own pair, smaller to load:

| Section | Index | Full text |
|---|---|---|
| Start | [`/docs/start/llms.txt`](/docs/start/llms.txt) | [`/docs/start/llms-full.txt`](/docs/start/llms-full.txt) |
| Agents and MCP | [`/docs/agents/llms.txt`](/docs/agents/llms.txt) | [`/docs/agents/llms-full.txt`](/docs/agents/llms-full.txt) |
| Reference | [`/docs/reference/llms.txt`](/docs/reference/llms.txt) | [`/docs/reference/llms-full.txt`](/docs/reference/llms-full.txt) |
| Guides | [`/docs/guides/llms.txt`](/docs/guides/llms.txt) | [`/docs/guides/llms-full.txt`](/docs/guides/llms-full.txt) |
| Contributing and internals | [`/docs/contributing/llms.txt`](/docs/contributing/llms.txt) | [`/docs/contributing/llms-full.txt`](/docs/contributing/llms-full.txt) |
| Architecture decisions | [`/docs/adr/llms.txt`](/docs/adr/llms.txt) | [`/docs/adr/llms-full.txt`](/docs/adr/llms-full.txt) |
| Proposals | [`/docs/rfcs/llms.txt`](/docs/rfcs/llms.txt) | [`/docs/rfcs/llms-full.txt`](/docs/rfcs/llms-full.txt) |

## Tell your agent about Cloudhal

Add a few lines to your project's `AGENTS.md` (or `CLAUDE.md`):

```md
This is a Cloudhal site. Content (pages, articles, menus, settings) lives in Cloudhal's store,
not in files: change it through the `cloudhal` MCP server's tools, never by editing `.cloudhal/`.
The theme is the Astro code in `src/`.
Docs: https://cloudhal.dev/llms.txt (every page also as Markdown: add .md to its URL).
```

## The JSON Schemas

Cloudhal's contracts are JSON Schemas at permanent URLs: [`/schemas/v1/index.json`](/schemas/v1/index.json) lists them. Every node an MCP tool returns follows one of them.

## Searching the docs: the docs MCP

`https://cloudhal.dev/mcp` is a public MCP server for the docs: read-only, no sign-in, no key. It has two tools:

- `search_docs` with `query` (and optionally `section`: `start`, `agents`, `reference`, `guides`, `contributing`, `adr` or `rfcs`) returns up to 8 pages with title, URL and a snippet;
- `read_doc` with `url` (a `https://cloudhal.dev/…` URL or a path such as `/docs/agents/clients`) returns that page's Markdown.

It is **separate from Cloudhal's own MCP server** ([`cloudhal mcp`](/docs/agents/clients), or `/mcp` on a deployment), which works on your sites and has no docs tools. Connect the docs MCP to the agent that writes your theme or integrates Cloudhal; an agent that only edits content does not need it. The answers are public docs text, and the only thing sent to cloudhal.dev is the query. Requests are rate limited per IP address.

Claude Code:

```sh
claude mcp add --transport http cloudhal-docs https://cloudhal.dev/mcp
```

Codex:

```sh
codex mcp add cloudhal-docs --url https://cloudhal.dev/mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.cloudhal-docs]
url = "https://cloudhal.dev/mcp"
```

Cursor, in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cloudhal-docs": { "url": "https://cloudhal.dev/mcp" }
  }
}
```

VS Code (GitHub Copilot), in `.vscode/mcp.json`:

```json
{
  "servers": {
    "cloudhal-docs": { "type": "http", "url": "https://cloudhal.dev/mcp" }
  }
}
```

Claude Desktop and claude.ai: **Settings › Connectors › Add custom connector** with the URL `https://cloudhal.dev/mcp` and no authentication. Other clients take the same URL as a Streamable HTTP server without headers.
