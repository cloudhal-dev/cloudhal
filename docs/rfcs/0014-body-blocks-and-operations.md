# RFC-0014: Body blocks and body operations
- Status: Accepted (2026-10-14, approved by Halil with the defaults of the open questions as recorded in ADR-0028). Phases 1 and 2a shipped before acceptance without a contract change.
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-14
- Related: ADR-0015 (agent modes; "proposals" follow-up), RFC-0004 (`asset:` references), RFC-0008 (three-way release diff), RFC-0012 (HTML sanitizer), DESIGN.md §2y (body editor), the 2026-10-13 editor research (Tiptap, CodeMirror, Lexical, Plate, BlockNote, Milkdown, MDXEditor, ProseMirror compared on license, markdown fidelity, size and Kumo skinning)
- Sources (checked 2026-10-13/14):
  - Tiptap 3 Markdown extension (beta, built on `marked`): https://tiptap.dev/docs/editor/markdown
  - Tiptap pricing and paid add-ons (Tracked Changes, AI Toolkit, Comments): https://tiptap.dev/pricing
  - `marked` lexer tokens and `raw`: https://marked.js.org/using_pro#lexer
  - CommonMark 0.31.2 and GFM 0.29: https://spec.commonmark.org/0.31.2/ · https://github.github.com/gfm/
  - Generic directives proposal: https://talk.commonmark.org/t/generic-directives-plugins-syntax/444
  - MCP sampling (a server-to-client request): https://modelcontextprotocol.io/specification/2025-06-18/client/sampling

## Summary
Bodies stay markdown. Markdown is written by people, agents and `cloudhal push` alike. Cloudhal adds two things:
- a versioned profile, "Cloudhal Markdown v1";
- a block index the store maintains: a stable id, content hash and author per top-level block.

Agents gain `edit_body`: operations on blocks addressed by id. These can apply directly or propose; a person accepts or rejects a proposal block by block. Studio gets a rich editor that keeps the original bytes of every block nobody touched.

## Motivation
- **Editing.** People edit bodies in a monospace textarea.
- **Agents.** Agents can only replace a whole body (`update_entry.body`). A one-word fix sends up to 1 MB and races every other edit on `rev`.
- **Approvals.** A person approving an agent's change sees the word "body" and nothing more.
- **Diffs and provenance.** Snapshot and release diffs say which nodes changed, not what. Nothing records which agent or person wrote a paragraph.
- **Why now.** The theme and UI generator planned next needs typed blocks inside bodies. Those need an address and a syntax first.

## Proposal

### 1. The stored format: markdown, constrained by a profile (option E, **approved**)
`Body.value` and `RichTextSection.body` remain markdown text, the source of truth. We don't store ProseMirror/Tiptap JSON or mdast.

**Profile v1** is CommonMark plus GFM (tables, task lists, strikethrough, autolinks), plus `asset:<id>` links and images (RFC-0004).

Directives cover typed blocks (§6, RFC-0015): `:::name{key="v"}` … `:::` containers and `::name{…}` leaves. Until the registry exists, an unknown directive renders as its text.

The profile leaves these out:
- raw HTML stays escaped, as today;
- MDX, because it compiles to code;
- footnotes, because `marked` doesn't render them;
- frontmatter, which belongs in `fields`.

Golden fixtures go in `packages/core-contracts/fixtures/{valid,invalid}/body-markdown/`. Each fixture fixes the block boundaries and the rendered HTML, so the TypeScript and Rust splitters agree.

### 2. Block splitting (normative)
A body is split into top-level blocks:
- **TypeScript** uses `marked`'s lexer with GFM, plus a tokenizer for directive containers.
- **Rust** uses its own splitter, checked against the same fixtures.

The rules:
1. Each block's `raw` text, with the blank lines after it, joins back into the exact source (verified for `marked` 18).
2. A block's `hash` is `sha256` of its `raw` text with trailing whitespace removed.
3. Blank lines before the first block belong to no block.

### 3. Block index (contract; all fields optional, `schemaVersion` stays 1)
```jsonc
// common.schema.json#/$defs
"BodyBlock": {
  "type": "object", "additionalProperties": false,
  "required": ["id", "hash"],
  "properties": {
    "id":   { "type": "string", "pattern": "^blk_[0-9A-Za-z]{8,24}$" },
    "hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "by":   { "$ref": "#/$defs/Actor" },
    "via":  { "type": "string", "enum": ["studio", "mcp", "api", "import", "ai-command", "proposal"] },
    "at":   { "type": "string", "format": "date-time" }
  }
}
// content-entry.schema.json Body, and section.schema.json RichTextSection, gain:
"profile": { "type": "integer", "enum": [1] },
"blocks":  { "type": "array", "items": { "$ref": "common.schema.json#/$defs/BodyBlock" }, "maxItems": 5000 }
```

**Who writes it.** Only the store writes `blocks`. Every write path re-indexes the body: REST, MCP `update_entry`, `edit_body`, push and import.

**Keeping ids.** Ids carry over through a deterministic alignment with the previous index:
- first, the longest common subsequence of hashes;
- then, by position for blocks whose content changed.

**Provenance.** `by`, `via` and `at` change only when a block's hash changes. Snapshots and diffs include `blocks` for free.

**Markdown only.** HTML bodies get no index.

### 4. Agent operations
New MCP tools: `get_body` and `edit_body`. A REST `PATCH …/body` mirrors `edit_body`.
```ts
get_body({ siteId, target: { entryId } | { pageId, sectionId } })
  → { rev, profile, blocks: { id, hash, type, markdown, by?, via? }[], markdown }

edit_body({ siteId, target, rev, mode: "apply" | "propose", note?, ops: Op[] /* ≤ 50 */ })
type Op =
  | { op: "replace"; block: string; ifHash?: string; markdown: string }
  | { op: "replaceText"; block: string; find: string; replace: string } // find matches exactly once
  | { op: "insert"; after: string | null; markdown: string }
  | { op: "insertBlock"; after: string | null; type: string; props: object; markdown?: string } // RFC-0015
  | { op: "setProps"; block: string; props: object }                                            // RFC-0015
  | { op: "move"; block: string; after: string | null }
  | { op: "delete"; block: string; ifHash?: string };
  → { rev, changed, added, removed, diff, snapshot } | { proposal }
```

Invariants:
1. **One write.** An apply is one CAS write on `rev` (hard rule 4), and it is auto-snapshotted like every agent write.
2. **Rebase.** If `rev` is stale but every block an op targets has the same hash, the server applies the ops to the latest body. Otherwise it returns `conflict` with the current blocks.
3. **Profile check.** The result must still parse under the profile. An op whose markdown splits into a different number of blocks than it says is rejected.
4. **Scopes.** Ops need `content:write`. Proposing needs `content:write` or the new `content:propose`. `update_entry.body` keeps working unchanged.
5. **Approvals.** Approval requests carry a structured block diff (§5), not the word "body".

### 5. Proposals and diffs
**The record.** A proposal is a row, not a graph node until it is accepted:
```
proposals(id, site_id, target, base_rev, base_hashes, ops, actor, via, note,
          status: open | accepted | rejected | partial | stale, created_at, decided_by, decided_at)
```

**In Studio.** The proposal shows as tracked changes on the body: inserted blocks, deleted blocks struck through, and a word diff inside replaced blocks. A person accepts or rejects each op, or all of them.

**Accepting.** Accepting applies the ops through `edit_body`:
- the person is the writer of record;
- the blocks keep the agent as `by`, with `via: "proposal"`;
- the audit log records both.

**Stale ops.** An op whose block hash changed since the proposal is shown as stale and can't be accepted as it is.

**Diffs.** A Worker-safe `bodyDiff(a, b)` in core-ts aligns blocks by id and hash and word-diffs replaced blocks. It serves:
- the snapshot diff dialog;
- the release compare, replacing "N characters";
- approval `changes`;
- a `diff_node` MCP tool.

*Shipped ahead of acceptance (no contract change).*
- `@cloudhal/core-ts/body-blocks` exports `splitMarkdown` (§2) and `bodyDiff`.
- Until block ids exist, `bodyDiff` aligns blocks by their trimmed source with the longest common subsequence. Removed and added blocks that still share at least 35 % of their words are paired as edits.
- Studio's snapshot diff ("Show changes") and release compare render the result.
- The snapshot diff reads both versions from a read-only `GET /api/sites/:siteId/snapshots/:snapshotId/nodes/:nodeId` (`content:read`).

Approval `changes` and `diff_node` wait for acceptance.

### 6. Typed blocks (RFC-0015, outline only)
One registry entry per block type: a JSON Schema for its props, a directive form, an editor form and an Astro component.

The same entry drives:
- the editor's slash menu and node views;
- the renderer;
- MCP (`list_block_types`, `insertBlock`, `setProps`);
- the future generator.

Validators are precompiled, never `eval` (hard rule 6). RFC-0015 defines the registry contract and the `component` section kind.

### 7. Studio editor (phase 1, no contract change; shipped with this draft)
`MarkdownEditor` (`@cloudhal/ui/editor`, DESIGN.md §2y) runs on the MIT parts of Tiptap 3 and loads lazily. It is the client-side half of §2–§3:
- **Minimal-diff save.** Untouched blocks keep their original bytes, and only edited or new blocks are serialized anew. Opening and saving a body changes nothing.
- **Round-trip guard.** A block the editor would change the meaning of is kept read-only as a "source block" and saved as written. This covers raw HTML, link definitions, and anything whose rendered HTML would differ after a trip through the editor.
- **Markdown mode** edits the source.

Phase 1b adds CodeMirror 6 for Markdown mode, a slash menu, a selection toolbar, images from the media library, markdown-aware paste and "Edit as Markdown" on source blocks.

Phase 1c adds a heading outline (an H1 in the body or a skipped level is flagged) and draft previews. These are two additive, read-only REST routes: `POST /api/sites/:siteId/entries/:entryId/preview` and `POST …/pages/:pageId/preview`.
- **Input.** The editor's unsaved fields: title, summary, body and cover for an article; title, SEO and sections for a page.
- **What the server does.** It overlays them on the stored node and renders the result.
- **Output.** `{ html }` for the editor's sandboxed frame.
- **Rules.** The routes need scope `content:read` and write nothing. Mistyped fields and sections that don't validate fall back to the stored value, so a draft that would not save still previews.

### 8. Phases
| Phase | Studio | Contracts | MCP / API |
|---|---|---|---|
| 1. Editor | `MarkdownEditor` (this PR), then CodeMirror and the menus | none | none |
| 2. Diffs | Body diff in snapshot, release and approval views | approval `changes` | `diff_node` |
| 3. Blocks and ops | Block ids, provenance gutter | §3 accepted, `pnpm gen` | `get_body`, `edit_body` apply, rebase |
| 4. Proposals | Tracked changes, accept/reject | proposals table | `mode: "propose"` |
| 5. In-editor AI | AI menu streaming into proposals | `ai:invoke`, budget | `/ai/commands` (after open question 1) |
| 6. Registry | Typed blocks with Kumo forms | RFC-0015 | `list_block_types`, `insertBlock` |
| 7. Generator | Kumo catalog panels (`@cloudflare/kumo/catalog`) | outputs are ordinary changes | generator tools that propose |

**Status by phase (2026-10-14).**
- **Shipped:** phases 1 (editor), 2a (`bodyDiff`, Studio diffs), 3 (the contract, the store's index, `get_body`, `edit_body` in apply mode with rebase, `diff_node`) and 4:
  - `edit_body` with `mode: "propose"` and an optional `note`: the operations are checked against the body and stored, nothing is written. The call class `propose` is allowed in every mode, `plan` included, and needs `content:read` and the new `content:propose` instead of `content:write`. `plan` keys get `content:propose` by default; every write variant (`content:write`, `…:write:own`, `…:draft:own`) implies it.
  - the `body_proposals` table (migration 0019) and `store.proposals` in core-ts: each proposal keeps the hashes of the blocks it targets; accepting pins every operation to them, so a block changed since makes the proposal `stale` (409) instead of overwriting it. A proposal is decided once (`accepted`, `partial`, `rejected`, `stale`), with a compare-and-set on its status.
  - REST `GET /api/sites/:siteId/proposals` (open ones carry the `bodyDiff` against the current body), `POST …/:id/accept` (optionally `{ ops: number[] }`) and `POST …/:id/reject`; deciding needs what updating the node needs.
  - Studio's suggestions above the body editor (DESIGN.md §2y), with a checkbox per operation when there are several: the diff follows the choice (`POST …/proposals/:id/preview`) and Accept applies only those.
  - Decisions are audited as `edit_body` rows by the person, naming the proposal and its agent.
  - Approval `changes`: pending `edit_body` requests carry the block diff they would make now (`ToolDefinition.changes`, computed when Approvals lists them), and Studio shows it under the request.
  - REST `PATCH /api/sites/:siteId/entries/:entryId/body` and `PATCH …/pages/:pageId/sections/:sectionId/body` (`{ rev, ops }`): `edit_body`'s apply mode for people, sharing its code (`editBody` in `@cloudhal/mcp-server/body`). REST refuses API keys, so agents propose through MCP only.
- **Phase 4 is complete.**
- **Phase 5** follows RFC-0016 (accepted, ADR-0029): Workers AI with the model chosen per site. That settles open question 1, as approved by Halil on 2026-10-14.
- **Unindexed bodies:** a body without an index (written before this phase, or over 5,000 blocks) shows content-derived ids (`blk_v…`). The store's first write keeps those ids, so no one-off job is needed.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Markdown as today, no index | No contract change | No block identity, provenance or fine diff | Doesn't solve agent edits or approvals |
| Store ProseMirror/Tiptap JSON | Lossless in the editor | Ties the contract to one editor's schema; agents and Rust must speak it | Worse for agents and the Rust core |
| Store mdast | Generic tree | Outside our schema subset (hard rule 2); verbose | Too generic, a heavy migration |
| Own block/node schema | Best diffs | Rewrites every body; a new format for agents | Migration cost with no gain over the index |
| BlockNote / Plate instead of Tiptap | Block UI, MIT suggestion plugins (Plate) | BlockNote's markdown is officially lossy and its AI is GPL or commercial; Plate is larger and Slate-based | Tiptap shares `marked` with the renderer and skins cleanly with Kumo; we build proposals ourselves |
| Tiptap paid Tracked Changes / AI Toolkit | Ready-made | Paid, alpha/beta, a vendor service and JWT | MIT/Apache-only dependencies (**approved**) |
| Real-time collaboration (Yjs) now | Simultaneous typing | A Durable Object transport, a new failure mode | Block ops plus CAS cover people and agents on different blocks; Yjs later as a transport only (**approved: later**) |

## Compatibility & migration
- **Contracts.** All new fields are optional and `schemaVersion` stays 1.
- **Existing bodies.** They get an index on their next write. Until then, `get_body` shows content-derived ids, which that write keeps. A missing `blocks` means not indexed yet, never "empty".
- **Readers.** Old readers ignore `profile` and `blocks`. Renderers are unchanged until directives arrive (RFC-0015).
- **Rollback.** Stop writing `blocks`. Bodies are untouched throughout, because the index never changes the markdown.
- **Phase 1** changes no stored data. Studio writes the same markdown, byte for byte where nobody edited.

## Security & policy impact
- **Rendering.** Agent and AI output is markdown under the profile, rendered by the existing safe renderer (raw HTML escaped, URLs checked, RFC-0012 for HTML bodies).
- **Proposals.**
  - AI output from in-editor commands or agents is never applied without a person in `manual` mode.
  - Whether `plan` mode may propose is open question 2.
  - Prompt injection through content can at worst produce a proposal.
- **Scopes.** One new scope, `content:propose`. `ai:invoke` and a per-site budget come with phase 5, in their own ADR.
- **Tenant isolation.** Proposals are keyed by site and checked like other node reads.
- **Dependencies.** MIT/Apache only (**approved**): Tiptap's MIT packages, CodeMirror 6, `marked`; no paid add-ons and no private registry in CI.

## Open questions
Accepted with these defaults (ADR-0028):
1. **Where the in-editor AI model call happens.** No default: Cloudhal makes no model call until the owner chooses, and phase 5 waits for that choice. The options stay as listed:
   - the user's own key, which needs secret storage (hard rule 9);
   - Workers AI, which needs no secret, but its Turkish quality is unverified;
   - hand-off to a connected agent as a proposal, which keeps Cloudhal model-free but doesn't stream.

   MCP sampling doesn't fit, because Studio is not an MCP client.
2. **Proposals and modes.** `plan`-mode agents may propose, which is ADR-0015's "plan mode leaving a draft change set for review": a proposal changes nothing until a person accepts it. `edits`-mode body changes keep applying directly, as today.
3. **HTML bodies** stay source-only: edited as text, never converted.
4. **Profile v1** has no footnotes, math or inline directives. They can come in a later profile.
5. **One registry for sections and body blocks**, with a `component` section kind. RFC-0015 designs it.
6. **`Body.value` and `RichTextSection.body` keep their names.** Renaming either would break every reader for no gain; `get_body` gives agents one shape.
