---
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
---

Semantic site search with Cloudflare AI Search (RFC-0029 29e, experimental).
- **core-ts.**
  - `cloudflareAiSearchProvider` mirrors every index update into the AI Search instance's R2 data source. Its hits are checked against the live FTS5 index (`liveHits`), so only published content inside its time gates reaches readers.
  - `hybridProvider` merges FTS5 and AI Search by reciprocal rank.
  - `takeSearchCall` and migration `0024_search_quota` cap semantic calls per deployment and UTC month, by default at the 1,000 Cloudflare includes per account.
  - `searchProviderFromEnv` turns it all on from the Workers' bindings.
- **Workers.** The site Worker, the admin Worker and the scheduler use the provider when the deployment has it, and fall back to FTS5 on failure, on slowness or past the budget.
- **cli.** `cloudhal.json` `search: { provider: "cloudflare-ai-search", instance, bucket?, monthlyLimit? }` binds `AI_SEARCH` and `SEARCH_BUCKET` on both Workers, and `cloudhal deploy` creates the bucket. Guide: `docs/guides/search.md`.
