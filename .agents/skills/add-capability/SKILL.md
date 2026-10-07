---
name: add-capability
description: Scaffold a Cloudhal capability (manifest + MCP tools + policy scopes + optional Studio panel) under capabilities/. Use when adding an integration or a new set of agent tools.
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:agent"
  cloudhal.status: "scaffold-only until Sprint 5 lands the capability SDK"
---

# Add a capability

A capability is what an agent *can do*: a manifest, a set of MCP tools, the scopes they need, optional UI. A skill is *how* to do a job and never grants permission. Keep that boundary.

## Steps (current sprint: structure only; runtime arrives in Sprint 5)

1. Create `capabilities/official/<name>/` (or `capabilities/examples/<name>/` for samples) with:
   - `manifest.json` — name (kebab-case), version, `tools[]` (name, description, `scopes[]`, `annotations` with honest `readOnlyHint`/`destructiveHint`/`idempotentHint`), `secrets[]` (names only), `ui?` (panel entry).
   - `tools/<tool>.ts` — one file per tool; input/output JSON Schemas live next to the handler and must use the same generator-safe subset as `contract-change`.
   - `README.md` — what it does, scopes, approval points, external services.
2. Scopes follow `area:verb` (`content:write`, `preview:create`, `site:publish`). Anything that publishes, deletes or rolls back is `destructiveHint: true` and must be approvable (the publish flow returns `input_required` for approval; see `docs/adr/0004-mcp-server.md`).
3. Secrets are declared, never read from env directly; the runtime injects tenant-scoped values.
4. UI panels (if any) are React components built only from `@cloudhal/ui` (see `studio-ui`).
5. Add tests: tool handlers are pure functions over a fake storage; include a policy test that a call outside declared scopes is rejected.
6. Open the PR with the `capability` issue template filled in.

## References
- `docs/adr/0005-skills-format.md` — capability vs skill boundary
- `docs/adr/0004-mcp-server.md`
