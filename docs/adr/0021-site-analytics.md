# ADR-0021: Site analytics — first-party cookie-less script, Workers Analytics Engine via bindings, D1 rollups, `analytics:read`
- Status: Accepted
- Date: 2026-10-09
- Related: RFC-0006 (the design), ADR-0012 (Cloudflare deployment; "no Cloudflare API token handling"; Workers Cache), ADR-0011 / ADR-0015 (MCP, policy, modes), ADR-0018 (roles and scopes), ADR-0002 (batch-only storage)
- Sources: Cloudflare Workers Analytics Engine (limits, pricing, sampling), Analytics SQL API and its Workers binding, Workers Cache, D1 limits (all seen 2026-10-09, listed in RFC-0006); a spike on the maintainer's live account (2026-10-09); research `.internal/research/13-analitik.md` (private)

## Context
Editors and agents cannot see what readers read. Most page views on a deployed site are served from Workers Cache, where the site Worker does not run, so counting in the Worker sees only cache misses. Many deployments run on Workers Free with only a `*.workers.dev` hostname, and Cloudhal keeps no Cloudflare API token (ADR-0012). D1 Free's daily write budget is shared with the CMS and must not hold raw events.

## Decision
Adopt RFC-0006 with the owner's decisions of 2026-10-09:
- **Collection.** A first-party, cookie-less script of about 1 KB, served as a hashed static asset from the site's own origin, posts page views (and sampled Core Web Vitals) to `POST /__cloudhal/e` on the site Worker. CSP stays `'self'`. This ends the principle "sites ship no client scripts of their own": a site ships exactly this one script, and it can be switched off per site. The Worker records redirects, 404, 410 and 5xx itself. The browser never sends a node id; the server resolves the path against the published site.
- **Privacy.** Visits (referrer-based) by default, no personal data. Unique visitors are opt-in: a hash of IP and user agent with a random daily salt that is deleted daily. GPC/DNT: counted, never hashed. Only normalised `utm_source`, `utm_medium` and `utm_campaign` survive from query strings; no IP, user agent, full referrer or city is stored. The contracts `AnalyticsEvent` and `AnalyticsBeacon` enforce this.
- **Storage.** Layer L0 on Cloudflare: raw events in Workers Analytics Engine (one dataset per deployment, `index1 = siteId`), read by the admin Worker through the **Analytics SQL binding without an API token**; an hourly cron rolls finished days into D1 (`analytics_daily`), kept indefinitely by default. Layer L3 locally and on Node: the same model on SQLite behind one Worker-safe interface in `@cloudhal/analytics`. Per-site settings live in D1, not in the site graph (a content rollback must not change privacy settings).
- **Cost guard.** Queries are bounded by time and site, cached for 60 s and kept under a daily budget (default 8,000); Studio warns Free accounts approaching 100,000 requests/day.
- **Access.** New scope `analytics:read` for Author and above and in the default scopes of new agent keys; settings need Administrator. REST routes are declared in `ROUTE_SCOPES`; MCP tools `get_analytics`, `top_content`, `content_stats`, `broken_links` are read-only.
- **Deferred to v1.1 (own ADR):** an optional read-only token for Cloudflare Web Analytics and zone analytics.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Count in the site Worker only | No client script | Misses every cached page view | Numbers would be wrong by an order of magnitude |
| Uncached front ("gateway") Worker | Exact counts, no script | Every view costs two requests; halves Free capacity | Too expensive on Free |
| Cloudflare Web Analytics only | Zero code, vitals | No content ids, no uniques, manual snippet on workers.dev, needs a token to read, ad-blocked | Kept as v1.1 add-on |
| Raw events in D1 | One store | Shares and exhausts D1 Free's daily writes, taking the CMS down | Rollups only |
| Third-party (Plausible, Umami) | Mature | Another service, not agent-native, data leaves the deployment | Against the self-contained deployment |

## Consequences
- **Positive.** Accurate, cookie-less analytics on every plan including 100% free workers.dev deployments, without API tokens; per-article stats that survive slug changes; agents can see what performs.
- **Negative.** Each page view costs one extra Worker request (Free sites serve roughly 20–35% less traffic); a client script on every published page; WAE keeps raw data for 3 months only (rollups cover the long term).
- **Risks.** Beacon spam and inflation (same-origin checks, size caps, bot filtering, per-isolate limits, published-path resolution); the binding's availability and quota accounting on Workers Free are assumptions until the rollout's step 0 closes them (fallback: data is recorded and reading waits for the v1.1 token ADR).
