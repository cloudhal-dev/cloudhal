# Agents and MCP

Cloudhal is built for agents to work on sites, with people in charge. Agents connect over the [Model Context Protocol](https://modelcontextprotocol.io) (MCP), call semantic tools instead of editing files, and work inside a policy engine: each agent has a mode and scopes, risky actions wait for a person, every change is a snapshot, and every call is in the activity log.

## Two ways to connect

| | Local | Remote |
|---|---|---|
| Server | `cloudhal mcp`, started by your client over stdio | `https://<studio-host>/mcp` on a deployment (streamable HTTP) |
| Works on | The project folder it runs in (`.cloudhal/` store) | The deployment's sites |
| Who the agent is | You, the local developer | An agent key created in Studio |
| Authentication | None (a local process) | `Authorization: Bearer <key>` or `x-api-key: <key>` header |
| Approvals | Asked in your MCP client | Asked in your client, or wait in Studio's **Approvals** |
| Set up | [Connect an agent](/docs/agents/clients) | [Remote agents](#remote-agents-on-a-deployment) below |

Both expose the same tools and the same policy. Use local while building a site, remote for agents that work on a live site, including scheduled ones.

## Modes

A mode says how much the agent does on its own. Choose it with `--mode` locally, or per key in Studio.

| Mode | What the agent does on its own |
|---|---|
| `plan` | Reads and previews only |
| `manual` | Nothing: every change waits for you |
| `edits` | Content edits; publish, rollback and deletes wait (the default) |
| `auto` | Also small article-only publishes within the site's publishing window |
| `bypass` | Everything except what always needs a person. Local only; a remote key in `bypass` works as `edits` |

Some actions always wait for a person, in every mode: anything that makes a person's data public, approving reader comments, and structural changes such as merging terms or adding redirects. An agent can ask for a more autonomous mode for a while (`request_elevation`); you grant it in Studio, possibly for less time, and it ends by itself.

## Approvals

When a call needs a person, the server asks your client with MCP elicitation. The question carries a summary of the change, such as the diff of a publish. The call goes through only if you accept it. Clients without elicitation get a `confirmToken`; the agent repeats the identical call with it after you confirm in the conversation.

On a deployment, pending approvals also appear in Studio under **Approvals**, with the same summary.

## What agents can do

The tools work on Cloudhal's site graph: sites, pages and their sections, articles and other entries, taxonomies, menus, media, snapshots and releases.

- **Read:** `list_sites`, `get_site`, `list_pages`, `get_page`, `list_entries`, `get_entry`, `search_site`, the taxonomy and redirect listings, analytics (`get_analytics`, `top_content`, `content_stats`, `broken_links`).
- **Write:** `create_page`, `update_page`, `create_entry`, `update_entry`, `add_correction`, `edit_body` and `patch_draft` for article bodies, taxonomy changes through `propose_term`, media (`upload_asset`, `fetch_asset_url`), menus (`set_menu`), design and chrome (`set_design`, `set_chrome`), translations (`save_translation`). Updates carry the node's current `rev`, so an agent never overwrites a change it has not seen.
- **Check:** `preview_page` returns a private preview link; `render_page` renders a page in Chrome and reports layout, contrast, alt text and heading problems.
- **Publish:** `create_snapshot`, `diff_snapshots`, `publish`, `rollback`, scheduled releases and embargoes.
- **Mode:** `get_mode`, `request_elevation`.

About 100 tools in all; a client lists them with their JSON Schemas. Every mutation creates exactly one snapshot. Errors have stable codes and say what to do next.

## Skills

The server publishes skills as MCP resources: `skill://<name>/SKILL.md` and its references. A skill is a short playbook for a task, such as writing an article or triaging comments. When a client follows a skill it sends `_meta["cloudhal.skill"]`, and the policy engine limits that call to the skill's declared scopes. Add your own with `cloudhal mcp --skills <dir>`.

## Remote agents on a deployment

1. In Studio, open **Agents** and create a key. Choose its mode and scopes; they can never exceed your own role. The secret is shown once.
2. Point your client at `https://<studio-host>/mcp` with the header `Authorization: Bearer <key>` (or `x-api-key: <key>`). See [Connect an agent](/docs/agents/clients#remote-server) for each client's format.
3. The agent's calls run as that key: Studio's **Activity** shows them, **Approvals** collects what waits, and you can change the key's mode or revoke it at any time.

Keep keys narrow. A key that reads reader comments should not also publish: comment text is written by strangers and reaches the agent. The [comments guide](/docs/guides/comments) and the [schedules guide](/docs/guides/schedules) (agent tasks with their own keys and budgets) go further.

## Security

- The local server trusts the person who started it; never expose `cloudhal studio --no-auth` beyond localhost.
- Remote keys are scoped, rate limited, revocable and audited. The `/mcp` endpoint refuses cross-origin browser requests.
- Treat content an agent reads (comments, fetched pages, imported files) as untrusted. Policy limits what any instruction in it can make the agent do.

More: the [threat model](/docs/security/threat-model), [ADR-0011](/docs/adr/0011-agent-layer) (the agent layer) and [ADR-0015](/docs/adr/0015-agent-modes) (modes).
