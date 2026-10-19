# ADR-0037: Domain strategy: cloudhal.com and cloudhal.dev
- Status: Accepted
- Date: 2026-10-20 (decided by Halil)
- Related: ADR-0007, ADR-0010, ADR-0012, ADR-0020
- Sources: [Cloudflare: create a self-managed OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/) · [HSTS preload list (all `.dev` names are preloaded)](https://hstspreload.org) · [EmDash playground](https://github.com/emdash-cms/emdash/tree/main/demos/playground)

## Context
Cloudhal owns exactly two domains, `cloudhal.com` and `cloudhal.dev`, and will not buy a third. The repo already uses `https://cloudhal.dev/schemas/v1/*` as JSON Schema `$id`, `https://cloudhal.dev/docs`, the bot User-Agent page `https://cloudhal.dev/fetch`, and `security@`, `legal@` and `conduct@cloudhal.com` for mail. As of 2026-10-20 neither domain has DNS records.

Planned: a hosted control plane in the style of Laravel Forge ("Cloud") and a public playground modelled on EmDash's (a per-visitor SQLite Durable Object, one-hour TTL, no login) in a separate repository, `cloudhal-dev/try`. The question is which domain carries what, and where customer sites live.

## Decision
**Host map**

| Host | Purpose |
|---|---|
| `cloudhal.com` | Marketing, pricing, blog |
| `try.cloudhal.com` | Public playground and the Deploy-to-Cloudflare / OAuth flow. Its own Worker, `__Host-` cookies, no `Domain=` |
| `api.cloudhal.com` | The control plane's API and OAuth redirect host |
| `status.cloudhal.com` | Status page |
| `*@cloudhal.com` | All mail: `security@`, `legal@`, `conduct@`, `abuse@`, `support@` |
| `cloudhal.dev` | Open-source home and install |
| `cloudhal.dev/docs` | The single copy of the docs; `cloudhal.com/docs` redirects here |
| `cloudhal.dev/schemas/v1/*` | Permanent JSON Schema `$id` URLs. Never moved or deleted; a new version adds `/v2` |
| `cloudhal.dev/fetch` | Bot User-Agent page |
| `registry.cloudhal.dev` | Index of plugins, capabilities, themes and skills. Read-only metadata; packages stay on npm. Publisher sign-in through GitHub, host-only cookies |


**Customer sites never run on Cloudhal's domains.** Cloud deploys into the customer's own Cloudflare account, and sites use the customer's domains or their own `*.workers.dev`. No Public Suffix List entry and no third domain is needed.

**Rules**
1. One trust boundary per domain: login, payment and control-plane data live on `.com`; public, unauthenticated developer content lives on `.dev`.
2. No customer-controlled content on either domain. The one exception is the playground: ephemeral, no uploads, no publishing, isolated on `try.`.
3. No `Domain=` cookies on either apex; cookies are host-only (`__Host-` where possible).
4. Schema `$id` URLs are permanent.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| A third domain for customer sites | Clean cookie and reputation isolation | A third domain to buy and run; the user keeps juggling domains | Customer sites are not on our domains at all, so there is nothing to isolate |
| Customer sites under `*.cloudhal.dev`, with a PSL entry | Instant URLs, no DNS work for customers | Abuse and phishing land on the developer-trust domain; PSL listing is slow and outside our control; we would own the content | Puts untrusted content on the domain that serves schemas and docs |
| Hosting customer sites on Cloudhal's Cloudflare account | Simplest onboarding | We pay for traffic, carry abuse handling and data responsibility, and become a single point of failure for every site | Cost, abuse and data responsibility; contradicts the self-hosted model |

## Consequences
- Positive: two domains suffice; schema URLs and docs are stable and public; the control plane can be locked down independently; customers keep their data and domains.
- Negative: sites on `*.workers.dev` carry Cloudflare's hostname until the customer adds their own; two zones to keep in order.
- Risks: a schema URL going dark breaks validators that fetch `$id`, so the `/schemas/v1/` content must be served from the repo on every release. `.dev` is HSTS-preloaded, so everything there must serve valid HTTPS.

## Operator checklist (not done by this change; done in Cloudflare)
- [ ] DNS for both zones.
- [ ] Serve `packages/core-contracts/schemas` at `https://cloudhal.dev/schemas/v1/` with `Content-Type: application/schema+json`.
- [ ] SPF, DKIM and DMARC for `cloudhal.com`.
- [ ] `cloudhal.dev` sends no mail: `v=spf1 -all`, DMARC `p=reject`, null MX.
