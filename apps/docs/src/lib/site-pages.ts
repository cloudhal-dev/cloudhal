/**
 * cloudhal.dev's own pages, the ones not in the repo's `docs/`: the home page, the docs overview
 * and `/fetch` (RFC-0004 §5.7). Written here, in Markdown, so the loader and the post-build step
 * treat them like every other page.
 */

export interface SitePage {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
  /** Extra Starlight frontmatter (template, hero). */
  readonly data?: Record<string, unknown>;
}

const home: SitePage = {
  id: "index",
  title: "Cloudhal for developers",
  description:
    "Cloudhal is an open-source, agent-native site platform. Install it, read the docs, use the JSON Schemas.",
  data: {
    template: "splash",
    hero: {
      tagline:
        "An open-source site platform. Sites are typed graphs; agents change them through an MCP server behind a policy engine; every change is a snapshot you can diff, preview and roll back.",
      actions: [
        { text: "Read the docs", link: "/docs", icon: "right-arrow" },
        {
          text: "GitHub",
          link: "https://github.com/cloudhal-dev/cloudhal",
          icon: "github",
          variant: "minimal",
        },
      ],
    },
  },
  body: `## Start

\`\`\`sh
npm create cloudhal@latest my-site
cd my-site
npm install
npm run dev
\`\`\`

Then connect your agent. Any MCP client works ([Codex, Cursor, VS Code and more](/docs/agents/clients)):

\`\`\`sh
claude mcp add cloudhal -- npx cloudhal mcp --mode edits
\`\`\`

Or deploy a blog to your Cloudflare account in one click with the [Deploy to Cloudflare button](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudhal-dev/cloudhal-template), or try a private site for an hour at [try.cloudhal.com](https://try.cloudhal.com).

Step by step, with pnpm, Yarn and Bun: the [quickstart](/docs/start/quickstart).

## Reference

- [Docs](/docs): guides, decisions and proposals.
- [JSON Schemas v1](/schemas/v1/index.json): the contracts every Cloudhal implementation shares. Their URLs are permanent.
- [llms.txt](/llms.txt): an index of this site for agents. Every page is also available as Markdown: add \`.md\` to its URL.
- [Cloudhal-Fetch](/fetch): what the fetcher requests from your server.

Cloudhal is open source under Apache-2.0. Product site: [cloudhal.com](https://cloudhal.com).
`,
};

const docsIndex: SitePage = {
  id: "docs",
  title: "Documentation",
  description: "Guides, architecture decisions and proposals for Cloudhal.",
  body: `Cloudhal's docs live in the [repository](https://github.com/cloudhal-dev/cloudhal/tree/main/docs) and change in the same pull request as the code they describe.

## Get going

- [Installation](/docs/start/installation): Node 24, npm, pnpm, Yarn or Bun.
- [Quickstart](/docs/start/quickstart): create a site, open Studio, connect an agent, publish, deploy.
- [Deploy to Cloudflare with one click](/docs/guides/deploy-button), with nothing installed.

## Agents

- [Agents and MCP](/docs/agents): local and remote servers, modes, approvals, skills.
- [Connect an agent](/docs/agents/clients): Claude Code, Codex, Cursor, VS Code, Claude Desktop and more.
- [Docs for agents](/docs/agents/docs-for-agents): Markdown pages, \`llms.txt\` and the docs MCP server.
- [Harden a Cloudflare deployment](/docs/guides/cloudflare-hardening).

## Guides

- [Search](/docs/guides/search), [schedules](/docs/guides/schedules), [comments](/docs/guides/comments)
- [Typed custom fields](/docs/guides/fields): definitions, operations, languages and themes
- [Structured data, expiry and listings](/docs/guides/structured-data): JSON-LD presets, entries that end on a date, listings by field and collection feeds
- [Several sites in one deployment](/docs/guides/multi-site)
- [Site archives](/docs/guides/site-archives): backups, moving a site, templates; \`cloudhal export\` and \`import\`
- [Analytics and privacy](/docs/guides/analytics-privacy)
- [Translations with Weblate](/docs/guides/translations-weblate)

## Reference

- [CLI](/docs/reference/cli), generated from \`cloudhal --help\`.
- [JSON Schemas v1](/schemas/v1/index.json).

## How Cloudhal is built

- [Architecture decisions (ADRs)](/docs/adr): what was decided and why, with sources.
- [Proposals (RFCs)](/docs/rfcs): designs before they are built.
- [Threat model](/docs/security/threat-model) and [code structure](/docs/engineering/code-structure).
- [Contributing](/docs/contributing) and the [Studio design system](/docs/design/design).

## For agents

Every page is available as Markdown: add \`.md\` to its URL. [/llms.txt](/llms.txt) lists all pages and [/llms-full.txt](/llms-full.txt) holds them in one file.
`,
};

const fetchPage: SitePage = {
  id: "fetch",
  title: "Cloudhal-Fetch",
  description:
    "What the Cloudhal-Fetch/1 user agent requests from your server, and how to reach the people running it.",
  body: `You found \`Cloudhal-Fetch/1 (+https://cloudhal.dev/fetch)\` in your logs. It is the media fetcher of Cloudhal, an open-source site platform.

## Who sends it

Cloudhal is self-hosted: every site runs on its owner's own Cloudflare account or server. A request with this user agent comes from **one such site**, when its owner or an agent they approved imports an image or file by URL. The Cloudhal project does not crawl the web and does not run these requests itself.

## What it requests

- A single \`GET\` for the exact URL someone gave it. It does not follow links or crawl.
- No cookies, no \`Authorization\` header, no headers forwarded from the person's browser.
- HTTPS on port 443 only; at most 3 redirects, each checked again.
- Media types only (images, video, audio, documents). Web pages are refused.
- At most 25 MB, within 30 seconds.

## Blocking it

Because each request comes from a different site's infrastructure, block by user agent: refuse requests whose \`User-Agent\` starts with \`Cloudhal-Fetch/\`. The fetcher treats any status other than 200 as a failure and tells the person the import did not work.

## Contact

If a Cloudhal site is misusing the fetcher, write to [security@cloudhal.com](mailto:security@cloudhal.com) with the request time, URL and source address. The rules above are specified in [RFC-0004 §5.7](/docs/rfcs/0004-assets-and-media).
`,
};

export const SITE_PAGES: readonly SitePage[] = [home, docsIndex, fetchPage];
