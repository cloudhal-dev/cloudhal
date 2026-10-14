---
"@cloudhal/storage": minor
"@cloudhal/agent-runtime": minor
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
---

Body proposals (RFC-0014 phase 4, ADR-0028): agents suggest body edits and a person accepts or rejects them.
- **mcp-server:** `edit_body` takes `mode: "propose"` and an optional `note`. The operations are checked against the body and stored as a proposal; nothing is written. Proposing is allowed in every mode, `plan` included, and needs `content:read` and `content:propose` instead of `content:write`. Tool definitions gain `proposeScopes`.
- **agent-runtime:**
  - a new key scope `content:propose`; `content:draft:own` implies it, so every write scope does;
  - `plan` keys get it by default (`scopesForMode("plan")`). Existing plan keys need it added to propose;
  - a new call class `propose`, allowed in every mode;
  - `ToolPolicy.proposeScopes`: the scopes a `propose` call needs in place of `scopes`.
- **storage:** migration `0019_body_proposals` adds the `body_proposals` table.
- **core-ts:** `store.proposals` (`BodyProposals`) files, lists, previews, accepts (all operations or a subset) and rejects proposals.
  - Accepting writes once, with the agent kept as the blocks' author and `via: "proposal"`.
  - A block changed since the proposal was filed makes it `stale`, and accepting it throws `ProposalError("stale")` instead of overwriting.
  - A proposal is decided only once.
- **api:** new routes under `/api/sites/:siteId/proposals`:
  - `GET` lists proposals; open ones carry their `bodyDiff` against the current body, or the problem that keeps them from applying;
  - `POST /:id/accept` (optionally `{ ops }`) and `POST /:id/reject`.

  Deciding needs what updating the node needs: own limits for articles, `content:write` for pages. Stale proposals and ones already decided return 409.
