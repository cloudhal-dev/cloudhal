# Docs for agents

These docs are published for agents as well as for people. Point your agent at them when it works on a Cloudhal project.

## Markdown pages

Every page is also available as Markdown. Add `.md` to its URL:

```txt
https://cloudhal.dev/docs/start/quickstart      → HTML
https://cloudhal.dev/docs/start/quickstart.md   → Markdown
```

`<page>/index.md` works too. Each Markdown file starts with frontmatter: `title`, `description`, `url` and `source` (the file in the repository). Links in it are absolute, so it reads correctly anywhere.

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

## Searching the docs from the MCP server

Planned ([RFC-0037](/docs/rfcs/0037-cloudhal-dev-docs-site)): `search_docs` and `read_doc` tools in the Cloudhal MCP server, so the agent already connected to your site can look up how to use it, for the version you have installed. Until then, the Markdown pages and `llms.txt` above are the way in.
