# RFC-0037: cloudhal.dev, the developer site: docs from the repo, a link contract, docs for agents

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-21
- Related:
  - ADR-0037 (domains): `cloudhal.dev` is the developer domain; `cloudhal.dev/docs` is the only copy of the docs; `/schemas/v1/*` is permanent.
  - #33 (the stopgap now live: schemas, `/fetch`, `/llms.txt`, `/docs` redirects to GitHub, all from `apps/docs`).
  - RFC-0004 §5.7 (the fetcher page), RFC-0019 and RFC-0029 (site search), ADR-0011 (MCP tools and transports).
  - Prior art: Cloudflare's developer docs ([docs for agents](https://developers.cloudflare.com/docs-for-agents/): `/index.md` per page, `Accept: text/markdown`, `/llms.txt` and `/llms-full.txt` per product), Sanity and Strands (`.md` per page, `llms.txt`), Microsoft Learn's docs MCP server, Astro Starlight with `starlight-llms-txt`.

## Summary
cloudhal.dev becomes an Astro Starlight site in `apps/docs`, built from the Markdown in the monorepo's `docs/` folder and deployed as the `cloudhal-dev` Worker that already serves the schemas. Every URL it publishes is a contract: it never breaks, moves get a redirect, and CI checks every link that Cloudhal's code, packages and sites point at. Every page is also published for agents, as Markdown at `<page>.md` and through content negotiation, indexed in `/llms.txt`, and searchable through a read-only MCP endpoint and a `search_docs` tool in `cloudhal mcp`.

## Motivation
- **Links already point here.** The 13 npm packages' `homepage`, seven links on cloudhal.com, 89 schema `$id`s, the fetcher's User-Agent and the playground Worker's documented `deployUrl` all name cloudhal.dev URLs. Until #33 none of them resolved. Today `/docs/*` lands on GitHub's file view, which is fine for contributors but poor for users: no navigation, no search, no Markdown for agents.
- **Agents read docs before people do.** Cloudhal's users are agents as much as people. Agents need small, structured Markdown, a stable index and a way to search, not HTML pages. Cloudflare, Sanity and Microsoft already serve docs this way; Cloudhal claims to be agent-native and should do no less.
- **The docs must not drift from the code.** Today guides live next to the code and change in the same PR. Any docs site that moves them into a CMS or a separate repo loses that, which is how docs go stale.
- **Why now:** 0.3 is public, the Deploy button and the playground send people to `/docs`, and the reference (CLI flags, MCP tools, `cloudhal.json`) exists only as source code.

## Proposal

### 1. Stack and source
- `apps/docs` is an Astro 7 + Starlight site. Content comes from the monorepo's `docs/` through an Astro content-collection `glob` loader rooted at `../../docs`. Nothing is copied by hand; `docs/` stays the single source.
- The stopgap's `scripts/build.ts` keeps producing `/schemas/v1/*`, `/fetch` and the `_headers`/`_redirects` files. Starlight renders everything else into the same `dist/`.
- Reference pages are **generated** at build time, never written by hand:
  - CLI: from `packages/cli/src/cli/help.ts`;
  - MCP tools: from the server's tool list (name, description, input schema, policy class);
  - `cloudhal.json` and the contracts: from the JSON Schemas;
  - changelog: from the packages' `CHANGELOG.md` (one page; the packages share one version).
- Cloudhal's own product site, cloudhal.com, stays a Cloudhal site. cloudhal.dev does not dogfood Cloudhal, because docs must change in the same PR as code (alternatives below).

### 2. Information architecture
| Path | Content | Source |
|---|---|---|
| `/` | What Cloudhal is, install, links | `apps/docs` |
| `/docs/start/*` | Install, first site, connect an agent, deploy | `docs/start/` (new) |
| `/docs/guides/*` | Task guides (deploy button, search, schedules, comments, multi-site, translations, hardening) | `docs/guides/` |
| `/docs/concepts/*` | Site graph, snapshots, policy and approvals, surfaces, publishing | `docs/concepts/` (new; drawn from the ADRs and RFCs) |
| `/docs/reference/cli`, `/mcp`, `/config`, `/schemas`, `/api` | Generated reference | §1 |
| `/docs/adr/*`, `/docs/rfcs/*` | Decisions and proposals, rendered as they are | `docs/adr/`, `docs/rfcs/` |
| `/changelog` | Release notes | `CHANGELOG.md` |
| `/schemas/v1/*` | Permanent JSON Schemas | `packages/core-contracts/schemas` |
| `/fetch` | The fetcher page | `apps/docs/static` |
| `/llms.txt`, `/llms-full.txt`, `/docs/<section>/llms.txt` | Indexes for agents | generated |
| `/mcp` | Read-only docs MCP endpoint (§4) | Worker |

`/docs/deploy` (used by the playground) stays as a permanent alias of `/docs/start/deploy`.

### 3. The link contract
Invariants:
1. A URL that cloudhal.dev has served with a 200 never returns a 404. A moved page gets a `301` in `apps/docs/redirects.ts`, which the build turns into `_redirects`.
2. `/schemas/v1/*` is never moved or deleted (ADR-0037). A breaking schema change adds `/schemas/v2/`.
3. Code, packages and sites link only to cloudhal.dev URLs, never to GitHub file paths, for anything a user reads: CLI errors and help, Studio help links, package `homepage`, the template's README, cloudhal.com and the playground. GitHub links are for source and issues.
4. CLI and API errors that need an explanation link to `https://cloudhal.dev/e/<code>`, a stable page per error code (like Rust's `E0277` or React's error decoder). The first codes are the ones users have actually hit: `deploy_token_invalid`, `setup_token_missing`, the Workers Builds name override, D1 migration failures.
5. CI checks the contract:
   - every cloudhal.dev URL in the repo (code, READMEs, fixtures excepted) resolves in the built site;
   - every URL in the previous deploy's sitemap still resolves or redirects;
   - internal links in `docs/` resolve.

Who links where:
| From | To |
|---|---|
| cloudhal.com (nav, footer, "Docs") | `cloudhal.dev/docs` |
| npm `homepage` (all packages) | `cloudhal.dev`; `repository` and `bugs` stay on GitHub |
| GitHub README | `cloudhal.dev/docs` for users, `CONTRIBUTING.md` for contributors |
| CLI help and errors | `cloudhal.dev/docs/reference/cli#<command>`, `cloudhal.dev/e/<code>` |
| Studio help icons | `cloudhal.dev/docs/guides/*` |
| try.cloudhal.com | `cloudhal.dev/docs/deploy` and the template |

### 4. Docs for agents
- **Markdown per page.** Every page is also built as Markdown at `<path>.md` (Sanity's convention) and `<path>/index.md` (Cloudflare's). The `.md` keeps frontmatter `title`, `description` and `source` (the file in the repo).
- **Content negotiation.** A small Worker script in front of the assets answers `Accept: text/markdown` on any page with its Markdown, sets `Vary: Accept`, and adds `x-markdown-tokens` (an estimate), as Cloudflare does. Everything else is served by the assets binding unchanged.
- **Indexes.** `/llms.txt` lists every page with its one-line description, grouped by section. `/llms-full.txt` is the whole docs in one file. Each section has its own `llms.txt` and `llms-full.txt`.
- **Docs MCP.** `https://cloudhal.dev/mcp` is a stateless, read-only MCP endpoint with no authentication. It has two tools:
  - `search_docs(query, section?)` returns up to 8 hits with title, URL and snippet, from the Pagefind index or a build-time FTS index;
  - `read_doc(url)` returns one page's Markdown.

  `cloudhal mcp` gains the same two tools, so the agent already connected to a site can look up how to use it. They proxy to cloudhal.dev and are read-only, so policy class `read`.
- **AGENTS.md for users.** `/docs/start/agents` explains how to point an agent at Cloudhal: the MCP server, the docs MCP, the `llms.txt`. The page is written for agents to read.

### 5. Search, versions, languages
- Search: Pagefind (Starlight's default; static, no service). The docs MCP reuses its index.
- Versions: while Cloudhal is 0.x, only the latest release is documented, with an "applies to 0.3.x" note in the header taken from the packages' version. At 1.0, older majors move to `/docs/v1/` and so on.
- Languages: English only (the default language rule). Starlight's i18n and the Weblate setup (`docs/guides/translations-weblate.md`) can add languages later without URL changes, under `/docs/<lang>/`.

### 6. Build and deploy
- CI builds `apps/docs` on every PR that touches `docs/**`, `apps/docs/**`, the schemas, `help.ts` or the MCP tool list, and runs the link checks (§3.5).
- Every PR gets a preview: `wrangler versions upload` with a preview alias, posted as a PR comment.
- A push to `main` deploys `cloudhal-dev`. This needs a Cloudflare API token, limited to Workers Scripts edit on this one Worker, stored as a GitHub Actions secret.
- `cloudhal.dev` sends no mail. DNS gets `v=spf1 -all`, DMARC `p=reject` and a null MX (ADR-0037).

### 7. Phases
1. Starlight in `apps/docs` over the existing `docs/`, with the IA above, Pagefind, `.md` per page, `llms.txt`/`llms-full.txt`, and the redirects that replace today's GitHub 302s.
2. Generated reference (CLI, MCP tools, config, schemas, changelog), `/e/<code>` pages, link checks in CI, deploy from CI with PR previews.
3. Content negotiation Worker, `https://cloudhal.dev/mcp`, `search_docs`/`read_doc` in `cloudhal mcp`.
4. New content: `docs/start/*` and `docs/concepts/*`. Then point the CLI, Studio, cloudhal.com and the template at the new URLs.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| cloudhal.dev as a Cloudhal site (dogfood) | Shows the product; Studio editing | Docs leave the repo, so they stop changing in the same PR as code; needs a "Markdown from git" import feature first | Drift is the main way docs fail. cloudhal.com already dogfoods |
| Mintlify or GitBook (hosted) | Fast, polished, built-in AI features | Vendor lock-in, a paid plan for a custom domain at our size, docs not served from our Worker or our schemas' domain | Contradicts open source and self-hosted |
| Docusaurus | Mature, versioning built in | React and Webpack/Rspack, a second stack next to Astro | Starlight is Astro, which the renderer and starters already use |
| Docs on GitHub only (today's stopgap) | Zero work | No search, no navigation, no Markdown endpoints, no stable URLs we control | Fine for a week, not for users |
| Docs in a separate repo | Clean history | Code and docs change in different PRs | Same drift problem |

## Compatibility & migration
- No contract or `schemaVersion` change. The schema URLs stay as they are.
- Today's `/docs/*` 302s to GitHub become 301s to the new pages, once phase 1 ships. `/docs/deploy` and `/docs/guides/<name>` keep working throughout.
- Moving files inside `docs/` from now on needs a redirect entry; CI enforces it (§3.5).
- Rollback: the Worker's previous version (`wrangler rollback`). The stopgap stays deployable from `scripts/build.ts` alone.

## Security & policy impact
- The docs MCP endpoint is read-only, unauthenticated and stateless. It is rate limited per IP with a Workers rate-limiting binding. It reads only the built docs, never a site.
- `search_docs` and `read_doc` in `cloudhal mcp` are `read` tools. Their output is public docs text; they never send site data to cloudhal.dev, only the query.
- The CI deploy token can edit only the `cloudhal-dev` Worker.
- No cookies, no analytics beyond Cloudflare's aggregate Web Analytics, no third-party scripts.

## Open questions
1. ADRs and RFCs on the public site: render all of them, or only Accepted ones, with drafts staying on GitHub? Recommendation: all, with the status shown in the header.
2. Error codes: one registry in `packages/core-contracts` (shared by TS and Rust), or per package? Recommendation: one registry, since the API, CLI and Studio report the same codes.
3. Should the docs MCP also be offered as an MCP registry entry (`registry.cloudhal.dev`, ADR-0037), or wait until there is a registry? Recommendation: wait.
