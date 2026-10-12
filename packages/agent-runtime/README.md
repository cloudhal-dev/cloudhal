# @cloudhal/agent-runtime

What governs agents — no MCP SDK in here (ADR-0011).

- **`PolicyEngine`** — `evaluate(principal, tool, { confirmed })` → `allow | deny | approval-required`. Checks the principal's scopes against the tool's scopes, limits a call to the scopes of the skill the principal declared, and requires approval for tools marked `requiresApproval`, annotated `destructiveHint`, or listed in the skill's `cloudhal.approval`. `defaultScopes(actor)`: humans/system get `*`, agents get read + content + preview (no publish/rollback).
- **`loadSkill(dir)` / `loadSkills(root)`** — SKILL.md frontmatter validated against the `skill-manifest` contract; Cloudhal data in flat `metadata` keys (`cloudhal.schemaVersion`, `cloudhal.requiresCapabilities`, `cloudhal.scopes`, `cloudhal.approval`). Bodies and `references/*.md` are read lazily (progressive disclosure).
- **`AuditLog`** — append-only `audit` table (migration `0003_agent`): who (actor), what (tool, input), decision + reason, skill, outcome, snapshot id, duration.

Scopes: `site:read`, `site:write`, `content:read`, `content:write`, `preview:create`, `site:publish`, `site:rollback`, `*`.
