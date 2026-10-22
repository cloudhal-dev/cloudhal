# @cloudhal/agent-runtime

What governs agents — no MCP SDK in here (ADR-0011).

- **`PolicyEngine`** — `evaluate(principal, tool, { confirmed })` → `allow | deny | approval-required`. Checks the principal's scopes against the tool's scopes, limits a call to the scopes of the skill the principal declared, and requires approval for tools marked `requiresApproval`, annotated `destructiveHint`, or listed in the skill's `cloudhal.approval`. `defaultScopes(actor)`: humans/system get `*`; agents get reading, content writes, previews and uploads, never publish or rollback (the exact list is in the function).
- **`loadSkill(dir)` / `loadSkills(root)`** — SKILL.md frontmatter validated against the `skill-manifest` contract; Cloudhal data in flat `metadata` keys (`cloudhal.schemaVersion`, `cloudhal.requiresCapabilities`, `cloudhal.scopes`, `cloudhal.approval`). Bodies and `references/*.md` are read lazily (progressive disclosure).
- **`AuditLog`** — append-only `audit` table (migration `0003_agent`): who (actor), what (tool, input), decision + reason, skill, outcome, snapshot id, duration.

**Scopes** (`src/policy.ts`, RFC-0005 §1) are the single list the engine, REST, MCP and Studio use:

- `KEY_SCOPES` — what an agent key may carry (site, content, preview, publish, rollback, assets, analytics, comments, schedules and releases, several with an `:own` variant limited to one's own nodes);
- `PERSON_SCOPES` — held only by people through their role, never stored on a key (members, settings, agents, audit, commenter data, automations, in-editor AI);
- `*` — every scope. `implies(a, b)` follows the lattice (`content:write` → `content:write:own` → `content:draft:own` → `content:propose`, `site:publish` → `releases:publish`, …).

**Roles** (`src/roles.ts`, RFC-0005 §2, ADR-0018): `ROLES` (Owner > Administrator > Editor > Author > Contributor) and `ROLE_SCOPES` map each role to scopes; a key never holds more than its creator's role (`narrow`), and `modeCap` caps its mode (`edits` for Contributors, `auto` otherwise).
