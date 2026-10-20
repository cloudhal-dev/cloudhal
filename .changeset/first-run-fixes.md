---
"@cloudhal/cli": patch
"create-cloudhal": patch
---

A new project's first five minutes, from dogfooding cloudhal.com:

- Starters name every `@cloudhal/*` package at the exact released version (the published packages now share one version) and pin Astro to the version Cloudhal is tested with, so a project installs one copy. `cloudhal init` run from a source checkout, outside the monorepo, links the packages to that checkout (`link:`, install with pnpm) instead of writing a version that is not on npm.
- The next steps name the package manager that ran the command and go through the project's scripts (`npm run dev`, `pnpm run dev` …); `cloudhal` itself is not on PATH.
- New projects install with pnpm 12 (`pnpm-workspace.yaml` `allowBuilds` for better-sqlite3, esbuild and workerd), bun (`trustedDependencies`) and yarn 2+ (`nodeLinker: node-modules`).
- `cloudhal build` uses `cloudhal.json`'s `domains.site` as the site's address, so canonical links, the sitemap, feeds and `robots.txt` no longer say localhost.
- The blog starter no longer git-ignores `cloudhal.json`: the project's settings travel with it.
