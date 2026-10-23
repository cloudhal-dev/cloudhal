# Site search: a guide for site owners and operators

Readers search a Cloudhal site in two ways:
- the **search modal**: the header field, ⌘K / Ctrl+K or `/` open it, and it shows grouped results as the reader types;
- the **`/search` page**, which works without JavaScript.

By default both use an SQLite FTS5 index that lives in your own database: D1 on Cloudflare, SQLite locally. The index is written in the same step as every publish, so it always matches what readers see.

On Cloudflare you can add **semantic search** with [Cloudflare AI Search](https://developers.cloudflare.com/ai-search/). It finds an article about inflation for "rising prices". It is experimental, and off unless you turn it on.

The design and its reasons are in [RFC-0029](../rfcs/0029-search-providers-and-search-ui.md); the index itself is in [RFC-0019 §3](../rfcs/0019-newsroom-authors-corrections-search.md).

## What readers find
- **Published content only.**
  - Found: articles, pages, categories and tags, and authors.
  - Never found: drafts, pages marked `noindex`, embargoed or expired content outside its time window.
- **Custom fields** (RFC-0041) are not searched unless a text or rich-text field is marked *searchable* in its collection's settings. Then its words count as part of the article's text from the next publish on. A translation without its own value uses the original's.
- **Categories, tags and authors** are found only while at least one article readers can see carries them. This is the same rule that decides whether their archive page exists.
- **Matching.** Every word must start a word of the title, summary or text, and title matches come first. Accents and Turkish letters are folded, so "cay" finds "Çay".
- **Language.** Results come in the site's default language.
- **Limits.** Each reader address has a budget: about 30 result pages, or about 60 modal requests, in quick succession, refilled at one token a second. Queries are never logged or sent to analytics. The modal keeps the last five searches in the reader's own browser only.

## Turning on semantic search (Cloudflare AI Search)

Semantic search runs **next to** the FTS5 index, never instead of it.
- **Merged results.** Results from both are merged, so exact title matches stay on top and semantic matches fill in.
- **Checked against what is live.** Every semantic hit is checked against the FTS5 index before a reader sees it. Content AI Search indexed late, or kept after it was unpublished, never shows.
- **Fallback.** If AI Search fails, is slow (over 1.5 s) or the day's budget is spent, FTS5 answers alone.

### 1. Create the AI Search instance (once, by hand)
In the Cloudflare dashboard (AI › AI Search), create an instance:
- **Data source:** an R2 bucket named `<name>-search`, where `<name>` is your deployment's name. You can also pick another name and give it as `bucket` below. If the bucket does not exist yet, create it first, or run `cloudhal deploy` once with the `search` block below: it creates the bucket.
- **Custom metadata fields:** `locale` (text) and `kind` (text). They are needed for filtering. The other three of the five allowed fields stay free.

The instance must exist before the deploy that binds it. Wrangler refuses an `ai_search` binding to a missing instance.

### 2. Tell Cloudhal
Add to `cloudhal.json`:

```json
"search": { "provider": "cloudflare-ai-search", "instance": "newsroom-search" }
```

- `instance`: the AI Search instance's name.
- `bucket`: optional, default `<name>-search`.
- `monthlyLimit`: optional, default **1000**. Semantic searches per UTC month for the whole deployment; after that, FTS5 alone until the month ends (see Costs).

### 3. Deploy and fill the bucket
`cloudhal deploy` creates the bucket and binds both Workers: `AI_SEARCH`, `SEARCH_BUCKET` and the `CLOUDHAL_SEARCH_*` vars.

From then on every publish, rollback, release and import mirrors what changed into the bucket:
- one Markdown file per published node and language, at `sites/<siteId>/<nodeId>/<locale>.md`;
- AI Search indexes the bucket on its own schedule.

To fill the bucket for content published earlier, run `cloudhal search reindex --remote` once.

### Costs and limits
Cloudflare bills AI Search from **2026-11-01**. Every account gets a monthly allowance; Cloudhal's defaults keep a deployment inside it, so a site on **Workers Free** or the **$5 Workers Paid** plan pays nothing for search.

| Included per account and month | Beyond it | What Cloudhal does |
|---|---|---|
| 1,000 semantic (hybrid) queries | $0.75 per 1,000 | Counts its own calls: `monthlyLimit` defaults to 1,000; past it, FTS5 answers until the month ends |
| 5 million ingestion tokens | $0.75 per million | Mirrors only what a publish changed; a full rebuild of a site with a few hundred articles stays well under a million tokens (an estimate, not a measurement) |
| 10 GB-month of storage | $2.00 per GB-month | One small Markdown file per node and language |

Source: [AI Search limits and pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/) (checked 2026-10-18). The page lists the same overage prices for every plan and does not say that Workers Free stops at the allowance, so Cloudhal sets the limit itself rather than relying on the plan.

- **The quota is per Cloudflare account.** Several deployments on one account share the 1,000; give each a part (`"monthlyLimit": 300`).
- **Large sites.** Raise `monthlyLimit` to what you are willing to pay for: 10,000 a month is about $6.75 over the allowance. FTS5 has no such limit; it runs in your own D1 database.
- **Readers never see the limit.** Past it, results simply come from FTS5 alone, without the semantic matches.
- **R2.** The bucket is billed as R2 (with R2's own free allowance; a site this size stays within it).
- **Large first rebuild.** A full rebuild writes one file per node in one request. On Workers Free a site with many hundreds of pages can run past a request's subrequest limit: rebuild with `cloudhal search reindex --remote` on Workers Paid, or let publishes fill the bucket over time.
- **No generated answers.** Readers never see text the model wrote: Cloudhal uses AI Search for retrieval only, so generation is never billed.

### Turning it off
Remove the `search` block and deploy again. The bindings go, and FTS5 answers alone. The bucket and the instance stay until you delete them in the dashboard.

## For agents and Studio
- **Studio.** The ⌘K palette also searches the site's own content, drafts included: articles, pages, categories and tags, media, menu items and redirects. Enter opens the editor; ⌘/Ctrl+Enter opens it in a new tab.
- **Agents.** They use the MCP tool `search_site`. By default it searches what can be edited; with `published: true` it returns what readers find.
