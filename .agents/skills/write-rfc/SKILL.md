---
name: write-rfc
description: Write a Cloudhal RFC in docs/rfcs for a significant change (contracts, policy model, storage interface, public CLI/SDK surface, licensing). Use before implementing anything that changes an interface other packages or users depend on.
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "governance"
---

# Write an RFC

RFCs are numbered Markdown files, opened as PRs, discussed ≥7 days, then accepted/rejected by the lead (GOVERNANCE.md). Accepted RFCs usually produce one or more ADRs.

## Steps

1. Pick the next number: `ls docs/rfcs` → `NNNN-kebab-title.md`.
2. Use this structure (keep each section tight; the whole RFC should be readable in 10 minutes):
   ```markdown
   # RFC-NNNN: Title
   - Status: Draft | Accepted | Rejected | Superseded by RFC-NNNN
   - Author(s), Date, Related: ADR-…, issues
   ## Summary (3 sentences)
   ## Motivation (problem, who is affected, why now)
   ## Proposal (the design; schemas/interfaces as code blocks; invariants as a numbered list)
   ## Alternatives considered (table: option / pros / cons / why not)
   ## Compatibility & migration (schemaVersion impact, data migration, rollout, rollback)
   ## Security & policy impact (new scopes? approval points? tenant isolation?)
   ## Open questions
   ```
3. If the RFC changes contracts, include the exact schema diff and new fixtures; run `contract-change` on a branch to make sure generators accept it.
4. Open the PR with label `rfc`; link it from the related issue; post in Discussions if it affects contributors broadly.
5. On acceptance: set Status, write the ADR(s) in `docs/adr/` (template in `docs/adr/README.md`), then implement.

## Anti-patterns
- An RFC that is really a task list — if there is no design decision, it is an issue.
- Skipping alternatives — one option considered means the problem was not understood.
