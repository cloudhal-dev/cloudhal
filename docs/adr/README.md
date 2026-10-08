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
| [0011](0011-agent-layer.md) | Agent layer: SDK-free policy/audit/skills, MCP wrapper, MRTR approval + token fallback, API keys |
| [0012](0012-cloudflare-deployment.md) | Cloudflare: site + admin Workers, pointer-flip publishing, Workers Cache, signed previews |
| [0013](0013-npm-packaging.md) | npm packaging: sources in the repo, dist in tarballs; CLI ships Studio/starters/skills; create-cloudhal |
| [0014](0014-out-of-band-approvals.md) | Approvals in Studio: single use, bound to the call and the content state; no agent self-approval |
| [0015](0015-agent-modes.md) | Agent modes: plan, manual, edits, auto (low-risk publishes), bypass (local only) |
| [0016](0016-time-boxed-elevation.md) | Time-boxed elevation: a more autonomous mode until a set time, computed per call, audited |
| [0017](0017-taxonomy-and-redirects.md) | Taxonomy and redirects are graph nodes; terms referenced by id; governed rename/merge with automatic 301s (RFC-0002) |
| [0018](0018-roles-and-invites.md) | Staff roles are scope sets; agent keys never exceed their creator; approvals follow roles; invites are one-time links (RFC-0005) |
