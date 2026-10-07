# ADR-0007: Apache-2.0 open core, DCO, Contributor Covenant 3.0
- Status: Accepted
- Date: 2026-10-07
- Sources: https://www.apache.org/licenses/LICENSE-2.0 · https://www.contributor-covenant.org/version/3/0/code_of_conduct/ · https://developercertificate.org/ · https://github.com/apps/dco · https://spring.io/trademarks · https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository

## Context
An open-source launch needs the license, contribution terms and conduct policy settled before the first external PR; changing them later breaks trust. The project's moat is Cloud operations and the registry, not the code.

## Decision
- **License:** Apache-2.0 for the whole monorepo (patent grant eases enterprise adoption). Trademark protected separately via `TRADEMARK.md`.
- **Open-core boundary** declared in `README.md` and `GOVERNANCE.md`: open = core, graph, policy, CLI, Studio, renderer, Cloudflare adapter, SDK, starters, official skills/capabilities; closed = billing, multi-tenant control plane, managed registry. Relicensing requires an RFC and is expected never to happen.
- **Contribution terms:** DCO (`git commit -s`), enforced by the GitHub DCO app; no CLA.
- **Conduct:** Contributor Covenant **3.0** with a project-specific reporting section.
- **Security:** `SECURITY.md` + GitHub private vulnerability reporting, with response-time commitments.
- **Governance:** BDFL (Halil) + area maintainers; RFC process for significant changes; ADRs for architecture.
- **Names:** GitHub org `cloudhal-dev` (`cloudhal` is a 2020 user account), npm scope `@cloudhal`, crates `cloudhal-*`, domains `cloudhal.com` (owned), `cloudhal.app` and `cloudhal.dev` (to register).

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| AGPL-3.0 | Deters hosted competitors | Slows adoption, scares enterprises, hurts the capability ecosystem | Moat is elsewhere |
| MIT | Simplest | No patent grant | Agent/AI space makes the patent clause worth it |
| CLA | Enables future relicensing | Friction; signals relicensing intent | DCO is enough and more trusted |

## Consequences
- Positive: predictable terms; low-friction contributions; enterprise-safe.
- Negative: Apache-2.0 cannot stop a hosted fork; brand + operations must carry the business.
- Risks: trademark registration must actually be filed; until then `TRADEMARK.md` is policy, not law.
