# Installation

Create a Cloudhal project with your package manager. The project is an Astro site with a local Cloudhal store; it runs offline and deploys to Cloudflare when you are ready.

## Requirements

- **Node.js 24 or later.** Cloudhal's CLI runs TypeScript with Node's built-in type stripping, so older versions refuse to start. Check with `node --version`.
- **A package manager:** npm (comes with Node), pnpm, Yarn or Bun.
- Optional:
  - **Google Chrome or Chromium**, for `cloudhal render` and the agent's `render_page` checks (screenshots and accessibility checks of a page). Without it, those tools say they are unavailable and everything else works.
  - **A Cloudflare account and `wrangler login`**, only to deploy. Wrangler is installed with the project.

## Create a project

Pick your package manager. Each command creates `my-site/` with the blog starter and a seeded local site.

```sh
# npm
npm create cloudhal@latest my-site

# pnpm
pnpm create cloudhal@latest my-site

# Yarn
yarn create cloudhal my-site

# Bun
bun create cloudhal my-site
```

Name the site at the same time with `--name`. npm needs `--` before the scaffolder's own flags:

```sh
npm create cloudhal@latest my-site -- --name "Field Notes"
pnpm create cloudhal@latest my-site --name "Field Notes"
```

Then install the project's dependencies:

```sh
cd my-site
npm install        # or: pnpm install · yarn · bun install
```

The scaffolder prints these steps with the package manager it was run with.

## What you get

| Path | What it is |
|---|---|
| `cloudhal.json` | The project's Cloudhal settings: site id, deployment name, analytics, comments, schedules |
| `src/` | The Astro theme: routes, layouts and `theme.ts`. Edit it like any Astro project |
| `.cloudhal/` | The local store (SQLite and media). Not committed; `cloudhal push` and `pull` move content between it and a deployment |
| `package.json` | Scripts: `dev`, `studio`, `mcp`, `deploy`, `build`, `snapshot` |

The site's content (pages, articles, menus, settings) lives in the store, not in files. Agents and Studio change it; every change is a snapshot you can diff and roll back.

## Running the CLI

The `cloudhal` CLI is a dependency of the project (`@cloudhal/cli`), so you never install it globally. Inside the project, any of these runs it:

| Package manager | Run a command | Run a script |
|---|---|---|
| npm | `npx cloudhal dev` | `npm run dev` |
| pnpm | `pnpm exec cloudhal dev` | `pnpm dev` |
| Yarn | `yarn cloudhal dev` | `yarn dev` |
| Bun | `bunx cloudhal dev` | `bun run dev` |

Outside a project, `npx @cloudhal/cli@latest --help` (or `pnpm dlx @cloudhal/cli@latest --help`) runs the latest CLI without installing it. Most commands need a project, so `cd` into one first.

## pnpm notes

pnpm blocks dependency build scripts and releases younger than a day by default. A new project's `pnpm-workspace.yaml` already allows what Cloudhal needs (projects created before 0.3.4 lack the `minimumReleaseAgeExclude` lines; add them). In an existing pnpm workspace, add:

```yaml
allowBuilds:
  esbuild: true
  better-sqlite3: true
  workerd: true
minimumReleaseAgeExclude:
  - '@cloudhal/*'
  - 'create-cloudhal'
```

`better-sqlite3` is the local store's database driver and needs its build script; `workerd` runs Cloudflare's runtime locally.

## Upgrading

All `@cloudhal/*` packages share one version. Upgrade them together:

```sh
npm install @cloudhal/cli@latest @cloudhal/core-ts@latest @cloudhal/astro-renderer@latest @cloudhal/cloudflare@latest
```

Then run `npx cloudhal deploy` to update a deployment. Release notes are in each package's changelog on npm and GitHub.

## Next

- [Quickstart](/docs/start/quickstart): run the site, open Studio, connect an agent, publish.
- [Connect an agent](/docs/agents): Claude Code, Codex, Cursor, VS Code and other MCP clients.
- [Deploy to Cloudflare with one click](/docs/guides/deploy-button), with nothing installed.
