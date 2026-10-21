# ADR-0039: cloudhal.dev: Starlight over the repo's docs, a link contract checked in CI, docs for agents
- Status: Accepted
- Date: 2026-10-21 (decided by Halil)
- Amendment (2026-10-21, phase 3): the docs stay out of the site MCP server; `cloudhal.dev/mcp` is the only docs MCP. See rule 4.
- Related: RFC-0037, ADR-0037, ADR-0011, RFC-0004
- Sources: [Starlight](https://starlight.astro.build/) · [starlight-llms-txt](https://github.com/delucis/starlight-llms-txt) · [llms.txt](https://llmstxt.org/) · [Cloudflare docs for agents](https://developers.cloudflare.com/docs-for-agents/) · [Workers static assets: redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) and [headers](https://developers.cloudflare.com/workers/static-assets/headers/)

## Context
ADR-0037 makes `cloudhal.dev` the developer domain and the only copy of the docs. Packages, cloudhal.com, the schemas' `$id`s and the fetcher's User-Agent already link there. A stopgap (`apps/docs`, #33) serves the schemas, `/fetch`, `/llms.txt` and redirects `/docs` to GitHub. RFC-0037 proposes the real site.

## Decision
1. **Starlight in `apps/docs`**, reading the monorepo's `docs/` through a content-collection loader. Docs change in the same PR as code. The same `cloudhal-dev` Worker serves it with the schemas and `/fetch`.
2. **Generated reference**: CLI, MCP tools, `cloudhal.json`, schemas and changelog are built from source, never written by hand.
3. **Link contract**: a published URL never 404s (moves get a 301 from `apps/docs/redirects.ts`); `/schemas/v1/*` never moves; user-facing links point at cloudhal.dev, not GitHub paths; errors link to `/e/<code>` pages from one error-code registry in `packages/core-contracts`; CI checks all of it.
4. **Docs for agents**: Markdown per page (`<path>.md` and `<path>/index.md`), `Accept: text/markdown` with `x-markdown-tokens`, `llms.txt` and `llms-full.txt` per site and per section, and a standalone, read-only, unauthenticated MCP at `cloudhal.dev/mcp` (`search_docs`, `read_doc`), rate limited per IP. The site MCP server (`cloudhal mcp`, remote `/mcp`) gets no docs tools (amendment): it is for agents working on sites (content, design, generated UI, comments, schedules), and its how-to knowledge lives in skills, tool descriptions and server instructions. Docs tools there would add tools that narrow-scoped keys never need, a second knowledge source that can contradict the first, and an outbound dependency on cloudhal.dev. Developer agents read the docs from cloudhal.dev; the site server's instructions only name `llms.txt`.
5. **English only, latest release only** while 0.x; versions under `/docs/v<major>/` from 1.0; languages later under `/docs/<lang>/`.
6. **All ADRs and RFCs are published**, each page showing its status.
7. **Delivered in four phases** (RFC-0037 §7): the site; generated reference, error pages, CI checks and previews; agent endpoints; new content and link migration.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| A Cloudhal site (dogfood) | Shows the product | Docs leave the repo and drift; needs a Markdown-from-git import | cloudhal.com already dogfoods |
| Mintlify / GitBook | Fast, polished | Vendor lock-in, cost, not on our Worker | Contradicts open source and self-hosting |
| Docusaurus | Versioning built in | A second front-end stack | Starlight is Astro, like the renderer |
| GitHub only | No work | No search, navigation or Markdown endpoints | The stopgap, not the site |
| Docs tools in the site MCP (Supabase, Sanity) | One server to connect | Irrelevant tools for narrow keys, two knowledge sources, an outbound call from every deployment | Their servers are developer tools; Cloudhal's is content-operational and policy-governed (amendment) |

## Consequences
- **Positive.** One docs source; reference that cannot drift; stable URLs; agents get Markdown, indexes and search.
- **Negative.** A docs build in CI on docs and reference changes; moving a docs file needs a redirect entry; a small Worker script for content negotiation and the MCP endpoint.
- **Risks.** Starlight and Astro majors must move together with the renderer's Astro (one catalog entry); an unauthenticated MCP endpoint needs rate limiting.
