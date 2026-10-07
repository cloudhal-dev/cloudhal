# Governance

## Current model: BDFL + maintainers

Cloudhal is in its founding phase. **Halil (@madraka)** is the project lead (BDFL) with final say on scope, architecture and releases. This is explicitly temporary: the goal is a maintainer team with documented, distributed authority before 1.0.

## Roles

| Role | How you get there | What you can do |
|---|---|---|
| Contributor | Open a PR | Everything in `CONTRIBUTING.md` |
| Maintainer | Sustained, high-quality contributions in one area over ~3 months; nominated by an existing maintainer, approved by the lead | Review and merge in that area (`area:*` label), triage issues |
| Lead | — | Final decisions, releases, security response |

Maintainers are listed in `MAINTAINERS.md` once the first one is added.

## Decision process

- **Small changes**: PR + review. Maintainers may self-merge in their area while the team is small; this tightens as it grows.
- **Significant changes** (anything touching `packages/core-contracts`, the policy model, storage interfaces, public CLI/SDK surfaces, or licensing): an **RFC** in `docs/rfcs/NNNN-title.md`, opened as a PR, discussed for at least 7 days, then accepted or rejected by the lead with a written rationale.
- **Architecture decisions** are recorded as **ADRs** in `docs/adr/` (immutable once accepted; superseded by newer ADRs).

## Open-core commitment

The boundary described in `README.md` is a governance commitment: code in this repository stays Apache-2.0. Relicensing or moving an open component behind the Cloud boundary requires an RFC and is expected never to happen.

## Code of conduct

Everyone participating is bound by `CODE_OF_CONDUCT.md`. Enforcement is handled by the maintainers as described there.
