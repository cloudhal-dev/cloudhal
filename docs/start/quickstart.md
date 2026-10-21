# Quickstart

From an empty folder to a published site with an agent, in about ten minutes. You need Node.js 24 or later; see [Installation](/docs/start/installation) for pnpm, Yarn and Bun.

## 1. Create the project

```sh
npm create cloudhal@latest my-site
cd my-site
npm install
```

You get the blog starter with a seeded local site: a home page, an about page, a few articles and a menu.

## 2. Preview the site

```sh
npm run dev
```

Open <http://localhost:4321>. This is the live preview: drafts are visible, and it updates as content changes. Everything runs offline on the project's local store in `.cloudhal/`.

## 3. Open Studio

In a second terminal:

```sh
npm run studio
```

Open <http://localhost:8787>. The first account you create becomes the Owner, and sign-up then closes. Studio is where people edit content, review what agents changed, approve publishes and roll back.

## 4. Connect an agent

Cloudhal's MCP server gives agents semantic tools (`create_entry`, `update_page`, `preview_page`, `publish`, …) behind a policy engine. With Claude Code, from the project folder:

```sh
claude mcp add cloudhal -- npx cloudhal mcp --mode edits
```

With Codex:

```sh
codex mcp add cloudhal -- npx cloudhal mcp --mode edits
```

Cursor, VS Code, Claude Desktop, Windsurf, Zed and Gemini CLI are in [Connect an agent](/docs/agents/clients). Start the client in the project folder: `cloudhal mcp` serves the project it runs in.

`--mode edits` lets the agent change content on its own while publishing, rollback and deletes wait for you. The other [modes](/docs/agents#modes) range from read-only (`plan`) to `auto`.

## 5. Ask for something

Try:

> Write a launch post about our new product, show me a preview, then publish it.

The agent creates a draft, calls `preview_page` and gives you a preview link. Every change it makes is a snapshot. When it calls `publish`, your client asks you to approve it, with a summary of what changes. Nothing goes live until you accept.

Watch it happen in Studio: **Activity** shows every call, **Snapshots** shows the history, and any snapshot can be diffed or rolled back.

## 6. Deploy to Cloudflare

```sh
npx wrangler login
npm run deploy
```

`cloudhal deploy` creates two Workers (the site, and the admin Worker with Studio, the API and the remote MCP endpoint), a D1 database and an R2 bucket, pushes your local site, and prints a one-time link to create the deployment's Owner account. To use your own domain:

```sh
npx cloudhal domain set news.example.com
npm run deploy
```

The zone must be in the same Cloudflare account. No Node project? [Deploy with one click](/docs/guides/deploy-button) from the template instead.

## 7. Connect agents to the deployment

On a deployment, agents use the remote MCP endpoint at `https://<studio-host>/mcp` with a key you create in Studio under **Agents**. Each key has a mode and scopes. See [remote agents](/docs/agents#remote-agents-on-a-deployment).

## Next

- [How agents work with Cloudhal](/docs/agents): modes, approvals, skills and the tool list.
- [CLI reference](/docs/reference/cli).
- Guides: [search](/docs/guides/search), [schedules](/docs/guides/schedules), [comments](/docs/guides/comments), [several sites](/docs/guides/multi-site).
