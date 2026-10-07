# ADR-0005: Skills follow the Agent Skills spec; Cloudhal data lives in metadata
- Status: Accepted (replaces an earlier nested `cloudhal:` frontmatter design)
- Date: 2026-10-07
- Related: `packages/core-contracts/schemas/skill-manifest.schema.json`
- Sources: https://agentskills.io/specification · https://code.claude.com/docs/en/skills · https://www.cursor.com/docs/context/skills · https://modelcontextprotocol.io/extensions/skills/overview · https://agents.md/

## Context
The Agent Skills specification (agentskills.io) defines exactly six frontmatter fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`); `metadata` is a string-to-string map. Claude Code ignores unknown fields, but claude.ai / the Skills API reject them. Codex, Cursor and Claude Code load skills from different directories.

## Decision
Every `SKILL.md` (product skills in `skills/`, repo skills in `.agents/skills/`) uses only the six spec fields; `SkillManifest` in core-contracts enforces this (`additionalProperties: false`). Cloudhal-specific data goes under `metadata` as flat, prefixed string keys: `cloudhal.schemaVersion`, `cloudhal.requiresCapabilities` (comma-separated), `cloudhal.scopes`, `cloudhal.approval`. Repo skills live in `.agents/skills/` with `.claude/skills` symlinked to it. Product skills will additionally be exposed over MCP via the `io.modelcontextprotocol/skills` extension with digest-verified manifests.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Nested `cloudhal:` block | Readable | Hard error on hosted skill upload; not spec-valid | Portability |
| Sidecar `cloudhal.yaml` next to SKILL.md | Rich structure | Second file to keep in sync; invisible to spec tooling | Metadata strings are enough for now |

## Consequences
- Positive: skills upload anywhere; one schema validates them; Skills-over-MCP preserves metadata verbatim.
- Negative: lists are encoded as comma-separated strings; the agent runtime parses them.
- Risks: if the spec later adds a vendor-extension mechanism, migrate keys (schemaVersion makes this mechanical).
