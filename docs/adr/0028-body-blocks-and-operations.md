# ADR-0028: Body blocks and body operations
- Status: Accepted
- Date: 2026-10-14
- Related: RFC-0014 (the design), ADR-0015 (agent modes; the proposals follow-up), ADR-0026 (HTML bodies), PRs #27–#30 (phases 1 and 2a)
- Sources: `marked` lexer tokens and `raw` — https://marked.js.org/using_pro#lexer · CommonMark 0.31.2 — https://spec.commonmark.org/0.31.2/ · GFM — https://github.github.com/gfm/ · Tiptap Markdown (MIT, beta) — https://tiptap.dev/docs/editor/markdown · MCP sampling — https://modelcontextprotocol.io/specification/2025-06-18/client/sampling (checked 2026-10-13/14)

## Context
- **People.** Bodies were edited in a monospace textarea. Studio now has a rich editor that keeps markdown canonical (phase 1).
- **Agents** can only replace a whole body (`update_entry.body`). A one-word fix sends the full body and races every concurrent edit on `rev`.
- **Approvals and history.** Approvals name only "body". Nothing records who wrote which part of a body. The planned theme and UI generator needs addressable blocks inside bodies.

## Decision
Adopt RFC-0014. The owner accepted it on 2026-10-14 with the defaults below.
- **Markdown stays canonical**, under the "Cloudhal Markdown" profile v1:
  - CommonMark + GFM + `asset:`, plus directives for typed blocks (RFC-0015);
  - raw HTML stays escaped; no MDX, footnotes, math or inline directives in v1.
- **Block index.**
  - `Body` and `RichTextSection` gain optional `profile` (`1`) and `blocks: BodyBlock[]` (`{id, hash, by?, via?, at?}`). Neither is required, and `schemaVersion` stays 1.
  - **Only the store writes `blocks`.** On every write it splits the markdown with `marked`'s lexer (RFC-0014 §2) and hashes each block's trimmed source with SHA-256.
  - It carries ids over from the previous index: unchanged blocks are matched by longest common subsequence of hashes, edited blocks by position between those matches.
  - `by`/`via`/`at` change only when a block's hash changes.
  - Whatever `blocks` a client sends is replaced. HTML bodies get no index.
- **Agent operations.** `get_body` and `edit_body` (`replace`, `replaceText`, `insert`, `move`, `delete`; `insertBlock` and `setProps` once RFC-0015 lands) work as follows:
  - one CAS write per call, at most 50 ops;
  - a stale `rev` rebases when every targeted block's hash is unchanged;
  - every write is auto-snapshotted like any other agent write.

  `diff_node` returns `bodyDiff` between two versions. Approval requests carry structured `changes`.
- **Proposals.** `mode: "propose"` stores the operations in a proposals table. A person accepts or rejects them op by op. Accepting applies them as the person, with `via: "proposal"` and the agent kept as `by`. Ops whose blocks changed in the meantime are marked stale. Proposing needs `content:propose` (with `content:read`), which every write scope implies and `plan` keys get by default.
- **Defaults for the open questions:**
  1. **In-editor AI:** no model call until the owner chooses a provider. Phase 5 waits for that choice.
  2. **Modes:** `plan` may propose. `edits` keeps applying body changes directly.
  3. **HTML bodies:** stay source-only.
  4. **Profile extras** (footnotes, math, inline directives) come later.
  5. **Registry:** one registry for sections and body blocks, with a `component` section kind (RFC-0015).
  6. **Field names:** `Body.value` and `RichTextSection.body` keep their names.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Store Tiptap/ProseMirror JSON | Lossless in the editor | Ties the contract to one editor's schema; agents and the Rust core must speak it | Worse for agents and for Rust |
| Store mdast | Generic tree | Outside the schema subset (hard rule 2); verbose | Too generic; heavy migration |
| Own block schema replacing markdown | Finest diffs | Rewrites every body; a new format for agents and people | Migration cost with no gain over an index |
| Paid Tiptap Tracked Changes / AI Toolkit | Ready-made | Paid, alpha/beta, a vendor service | MIT/Apache-only dependencies |
| Yjs collaboration now | Simultaneous typing | A Durable Object transport and a new failure mode | Block ops plus CAS cover people and agents on different blocks; Yjs later, as a transport only |

## Consequences
- **Positive:**
  - Agents can change one paragraph without racing a whole body.
  - Approvals, snapshots and releases show what the text says.
  - Every block records who last wrote it.
  - The generator gets addressable blocks, while bodies stay plain markdown that people, `cloudhal push` and other tools can read and write.
- **Negative:**
  - Every content write splits and hashes its body. The cost is linear in body size and bounded by the 1 MB cap; a body over 5,000 blocks keeps no index.
  - The node JSON grows by about 100 bytes per block.
- **Risks:**
  - The Rust core needs its own splitter. The shared fixtures in `fixtures/*/body-markdown` keep the two in step.
  - `@tiptap/markdown` is beta. It is pinned, and the editor's round-trip guard covers what it gets wrong.
