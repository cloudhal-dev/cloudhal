---
name: add-capability
description: Add a Cloudhal capability (MCP tools + policy scopes + optional REST routes and Studio panel) in packages/mcp-server, packages/agent-runtime and apps/studio. Use when adding an integration or a new set of agent tools.
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:agent"
  cloudhal.status: "active"
---

# Add a capability

A capability is what an agent *can do*: MCP tools, the scopes they need, optional UI. A skill is *how* to do a job and never grants permission. Keep that boundary.

There is no separate capability package or manifest today (`capabilities/` is still planned). A capability is added in the packages below; a significant one gets an RFC first (`write-rfc`).

## Steps

1. **Tools.** Add a module `packages/mcp-server/src/<area>-tools.ts` exporting `<area>Tools(): ToolDefinition[]` (see `common.ts`), or extend an existing one, and list it in `defineTools()` in `src/tools.ts`. The order there is what agents see; update `test/tool-order.test.ts`. Each tool has JSON Schema input/output (built from the contract schemas where they exist; same generator-safe subset as `contract-change`), honest `annotations` (`readOnlyHint`/`destructiveHint`/`idempotentHint`), its `scopes`, and a handler over `SiteGraphStore` or the package's store. Errors are `ToolError`s with stable codes and the next step in the text.
2. **Scopes.** Reuse an existing scope where it fits. A new one goes in `packages/agent-runtime/src/policy.ts`: `KEY_SCOPES` if a key may carry it, `PERSON_SCOPES` if only people hold it, plus its implications (`IMPLIES`), then in the roles' sets in `src/roles.ts` and, if agents should have it by default, `defaultScopes`. Scope names follow `area:verb` (`content:write`, `site:publish`), with an `:own` variant when it is limited to one's own nodes.
3. **Approval.** Anything that publishes, deletes or rolls back is `destructiveHint: true` or `requiresApproval: true`, so the policy engine returns `approval-required` and the server asks a person (`input_required`; ADR-0014, ADR-0015 for modes).
4. **REST and Studio** (if people need it too). Routes in `packages/api` (shared suite in `src/testing.ts`), the typed client in `apps/studio/src/lib/api/<area>.ts`, and a screen or settings section built only from `@cloudhal/ui` (load `studio-ui` and `kumo-design`). Add the tool's label to Studio's `tools` messages so Activity and Approvals name it.
5. **Secrets** are never committed (AGENTS.md rule 9); they come from the deployment's bindings and environment (`cloudhal deploy`), with test values in `.env.example`.
6. **Tests.** A test file in `packages/mcp-server/test/` that runs the tools through `runTool` (policy → audit → handler) on a fake or sqlite store, including a call outside the declared scopes being denied and an approval-gated call stopping for approval.
7. **Docs.** Run `node scripts/mcp-tools-doc.ts` to regenerate the tool reference in `packages/mcp-server/README.md` (`pnpm check` fails when it is stale). If agents need a playbook for the job, add a skill under `skills/official/`.

## References
- `docs/adr/0005-skills-format.md` — capability vs skill boundary
- `docs/adr/0011-agent-layer.md`, `packages/mcp-server/README.md`
- `packages/agent-runtime/README.md` — scopes and roles
