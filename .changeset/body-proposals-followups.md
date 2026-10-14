---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
---

RFC-0014 phase 4, completed.
- **REST `PATCH …/body`.** Block operations for people:
  - `PATCH /api/sites/:siteId/entries/:entryId/body` (own limits apply);
  - `PATCH /api/sites/:siteId/pages/:pageId/sections/:sectionId/body` (`content:write`).

  Both take `{ rev, ops }` and return `{ rev, changed, added, removed, words }`. They share `edit_body`'s code through `editBody`, which `@cloudhal/mcp-server/body` exports.
- **Choosing operations.** `POST /api/sites/:siteId/proposals/:id/preview` with `{ ops }` returns what accepting only those operations would change now.
  - Open proposals in the list carry `steps`: each operation in words against the current body. These come from core-ts `proposalSteps`, and `ProposalPreview.steps` carries them.
- **Audit.** Accepting or rejecting a proposal records an `edit_body` audit row by the person, naming the proposal and its agent.
- **Approval `changes`.** Tool definitions can describe their effect (`ToolDefinition.changes`, type `ApprovalChanges`).
  - `edit_body` returns its block diff.
  - The approvals list attaches it to pending requests.
- **core-ts:** `parseBodyOps` checks the shape of operations from untyped callers.
