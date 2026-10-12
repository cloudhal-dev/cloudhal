# ADR-0022: Reader comments — guest comments held for moderation, D1 outside the graph, first-party proof of work, agents label and hide while people approve
- Status: Accepted
- Date: 2026-10-12
- Related: RFC-0007 (the design), ADR-0012 (Workers Cache, cache tags, purge through the site Worker), ADR-0014 (out-of-band approvals), ADR-0015 (agent modes), ADR-0018 (roles and scopes), ADR-0021 (site analytics: the pattern for visitor-facing, privacy-sensitive features)
- Sources: those listed in RFC-0007 (Cloudflare Workers Cache, purge limits, Turnstile, Rate Limiting, Workers AI, D1 limits and jurisdictions; EmDash, Ghost, WordPress, Substack, Isso, Remark42, ALTCHA; GDPR, DSA, KVKK, Law 5651); research `.internal/research/14-yorumlar.md` (private); a live check on 2026-10-12 that Workers Cache serves `cf-cache-status: HIT` on the deployed workers.dev site

## Context
Sites have no way for readers to respond. Comments are the first free-form visitor text Cloudhal stores and the first that reaches agents, so they bring spam, privacy and prompt-injection risk. Pages are rendered from immutable snapshots and served from the edge cache; D1's Free daily write budget is shared with the CMS; the CSP is `'self'`; agents act through MCP under the policy engine.

## Decision
Adopt RFC-0007 with the owner's decisions of 2026-10-12 and its reviewed defaults:
- **Identity (MVP).** Guest comments: a name and an optional private email; every guest comment is `pending` until a person approves it. Verified readers (email code or magic link through a second Better Auth instance with host-only cookies, Better Auth ≥ 1.7.7) follow in v1.1 as the base for members.
- **Storage.** D1 tables in a new `@cloudhal/comments` package (migration `0016_comments`), keyed by entry id, **outside the snapshot graph**: snapshots are immutable (erasure), and a content rollback must not touch readers' comments. Settings per site, collection and entry live in D1. Comments are off by default; threads close 90 days after first publication.
- **Rendering.** Approved comments are server-rendered into the cached article page and tagged `cloudhal-comments-<nodeId>`; moderation purges that tag through the existing purge path, batched inside the shared purge budget (hides and takedowns first). A plain-HTML form posts to `/__cloudhal/comments`; a small first-party module under `/_cloudhal/` enhances it on open threads only. The script rule becomes "only first-party Cloudhal scripts under `/_cloudhal/`".
- **Anti-spam before any D1 write:** enabled and open thread, same origin, size, schema, honeypot with a fake "pending" answer, first-party **proof of work** (signed stateless challenges, single use; CSP stays `'self'`), rate limits, content rules, a per-site daily cap, bans. Turnstile is opt-in per site and widens the CSP only on comment pages. Workers AI labels are opt-in and advisory.
- **Privacy.** No IP stored, only a hash with a monthly salt; emails encrypted and visible to Editor+ only (person-only `commenters:data`); pending and spam comments deleted after 30 days; erasure anonymises by default and may delete the text, audited; "Report comment" and statement-of-reasons records (DSA Art. 16/17).
- **Agents.** Scopes `comments:read` (default for new keys), `comments:moderate(:own)`, `comments:reply(:own)`. Agents may label and hide (reversible); approving comments, publishing replies and reopening threads wait for a person in every mode; no hard delete or bans over MCP. Comment text reaches agents only as labelled untrusted data with output caps; no tool acts on comment text. Comment approvals bind to the exact comments and their state, not the site-graph hash.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Third-party embed (Disqus, Hyvor) | No work | Tracking, data leaves the deployment, third-party script and iframe | Privacy and CSP |
| GitHub-backed (Giscus, Utterances) | No storage | Readers need GitHub; third-party iframe | Excludes most readers |
| Comments in the snapshot graph | One store, versioned | Erasure impossible in immutable snapshots; rollbacks would rewrite readers' words; publish churn | Wrong lifecycle |
| Client-side rendering only | Simple purge story | No SEO, no JS-less reading, an extra request per view | SSR with tag purge works on our cache |
| Turnstile by default | Strong bot signal | Third-party script/iframe, CSP widening, privacy addendum | Opt-in instead |

## Consequences
- **Positive.** Native, private, cache-friendly comments on every plan; moderation that agents can help with safely; DSA/GDPR/KVKK tooling built in.
- **Negative.** A moderation queue people must work; more D1 writes (~12–15 rows per comment over its life); purge budget shared with publishing; a second first-party script.
- **Risks.** Spam beyond proof of work (rate limits, caps, opt-in Turnstile/AI); prompt injection through comment text (untrusted rendering, caps, no comment-driven tools); purge budget exhaustion (queue, back-off; step-0 verification); the step-0 live checks on a Workers Free account are still open.
