---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
---

Agents translate content (RFC-0033 / ADR-0035, phase D1).

**New MCP tools**
- `get_translation_source` returns the source, the glossary terms it uses, and the current translation with its staleness.
- `save_translation` saves a draft in the target locale, linked to the source's revision. It records the model as provenance and returns the deterministic checks. The first translation marks the source as the group's original.
- `list_translations` lists a translation group.

**Rules**
- A translation a person wrote or reviewed is never overwritten (`denied`).
- Agents never set a review.

**core-ts**
- `checkTranslation` and `checkNames` run the structure, links, numbers, glossary and length checks. Numbers written in other scripts count as the same digits.
- The store refuses to publish a machine translation that has a failing check.

The server instructions describe the workflow.
