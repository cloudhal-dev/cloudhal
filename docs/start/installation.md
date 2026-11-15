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
| `.cloudhal/` | The local store (SQLite and media). Not committed; `cloudhal push` and `pull` move content between it and a deployment, and `cloudhal export` copies one site into a single file ([site archives](/docs/guides/site-archives)) |
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

### Installing the signed release

`npx cloudhal deploy --release` installs the signed release of the CLI's own version instead of building the project (RFC-0046 §11b). It deploys the exact bytes that `release.yml` built and signed, so your machine runs no Astro or Worker build. Your content, config and secrets still come from the project. It takes no version argument: to install another version, run that version of the CLI (`npx @cloudhal/cli@<version> deploy --release`).

**What it checks, in this order.** Nothing is uploaded, and nothing is written outside `.cloudhal/deploy/`, until all of these pass.

1. **The project.**
   - It must not join another installation (`installation`) or serve several sites (`sites`).
   - It must not run in Cloudflare Workers Builds.
   - The version must have a bundle: `v0.9.0` or newer.
2. **The signed key and yank lists** from cloudhal.dev, on every run. It never falls back to an older copy. It remembers what it has seen in `~/.cloudhal/release-trust.json` and refuses a rolled-back list, a replayed key list or a revoked yank key.
3. **The release** must be published (not a draft) with its bundle files. Set `GH_TOKEN` if GitHub's API rate limit gets in the way.
4. **The theme files** must equal the CLI's own starter:
   - everything under `src/` and `public/`;
   - `astro.config.mjs` and `tsconfig.json`;
   - no `skills/` directory (even an empty one) and no `jsconfig.json`;
   - no PostCSS config (`postcss.config.*`, `.postcssrc*`, or a `postcss` key in `package.json`) from the project up to its workspace root.

   Line endings and `.DS_Store`, `Thumbs.db` and `desktop.ini` are ignored, and so are `README.md`, `.gitignore`, `vite.config.*`, `.env` and `wrangler.jsonc`.

   On a difference, either run `cloudhal deploy` without `--release`, or add `--discard-local-theme` to deploy the official theme anyway. The flag lists every file it does not deploy, and changes nothing on disk.
5. **`cloudhal.json` build keys.** `comments.available` must not be `false`. `media.transform` must be unset or `"none"`, unless the release reads it at runtime. Any key the CLI does not know is refused. `--discard-local-theme` does not cover these.
6. **Wrangler** must be at least the version the release was built with.
7. **The release's signature and every file's digest**, with revoked keys and yanked versions refused.
8. **The build-provenance attestation.** It needs the [GitHub CLI](https://cli.github.com) 2.68 or newer, signed in. `--allow-single-factor` continues on the release key alone when `gh` is missing; a failed attestation is always refused.

**Offline.** `--from <dir>` installs from the five release assets plus `keys.json` and `yanked.json` (each with its `.sig`) in a directory, under the same rules.

**Dry run.** `--release --dry-run` verifies, extracts and writes the configs, then stops before wrangler.

`--release` is available once the signed key list is published (the root ceremony in [Release signing keys](/docs/security/release-signing-keys)). Until then the command refuses and says so.

## Next

- [Quickstart](/docs/start/quickstart): run the site, open Studio, connect an agent, publish.
- [Connect an agent](/docs/agents): Claude Code, Codex, Cursor, VS Code and other MCP clients.
- [Deploy to Cloudflare with one click](/docs/guides/deploy-button), with nothing installed.
