---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/agent-runtime": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/ui": minor
---

Corrections (RFC-0019 19b).
- **Contract and store.** Entries carry `corrections`. The store stamps their id and time, and refuses to remove or change the kind of one that has been live (`correction_locked`). Only a signed-in person who can publish may reword a live one.
- **Agents.** `add_correction` (MCP) appends a notice. A publish or release that adds one waits for a person even in `auto` mode (auto-check code `correction`).
- **Renderer.** `articleCorrections` and `renderInlineMarkdown` give themes the list. JSON-LD gains `CorrectionComment`s, and the latest correction becomes `dateModified`.
- **Studio and starter.** The blog starter shows "Correction appended" under the byline and the list at the end of the article. Studio's article editor gains a Corrections card (`CorrectionList`).
