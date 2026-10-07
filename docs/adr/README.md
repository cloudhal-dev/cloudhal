# Architecture Decision Records

One file per decision, numbered, immutable once accepted (write a new ADR to supersede). Template:

```markdown
# ADR-NNNN: Title
- Status: Proposed | Accepted | Superseded by ADR-NNNN
- Date: YYYY-MM-DD
- Related: RFC-…, ADR-…
- Sources: primary links the decision was verified against
## Context
## Decision
## Alternatives considered
| Alternative | Pros | Cons | Why not |
## Consequences (positive / negative / risks)
```

| # | Title |
|---|---|
| [0001](0001-contract-pipeline.md) | JSON Schema is the contract source; TS and Rust are generated |
| [0002](0002-storage-interface.md) | Thin SQL/blob driver interface, batch-only, two backends |
| [0003](0003-studio-architecture.md) | Studio is a Vite React SPA on Kumo; Astro only renders sites |
| [0004](0004-mcp-server.md) | Stateless MCP server (spec 2026-07-28), layered approval |
| [0005](0005-skills-format.md) | Skills follow the Agent Skills spec; Cloudhal data in metadata |
| [0006](0006-toolchain-and-runtime.md) | Node-first toolchain and runtime; Bun supported, not primary |
| [0007](0007-license-and-community.md) | Apache-2.0 open core, DCO, Contributor Covenant 3.0 |
| [0008](0008-runtime-validation-and-d1-testing.md) | Precompiled schema validators; D1 tested through Miniflare |
| [0009](0009-renderer-sources-and-local-dev.md) | Renderer: live in dev, snapshot in builds; starters own routes |
| [0010](0010-auth-better-auth.md) | Better Auth for identity, tenants and MCP authorization |
