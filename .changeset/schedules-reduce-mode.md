---
"@cloudhal/mcp-server": patch
---

RFC-0008 §7.6: an agent's gate-only embargo (`set_embargo` on live content) still carries its key's approval (`kind: "auto"`, which the contract requires for an approval without a person), but the release now also records the mode the agent really worked in as `metadata["cloudhal.mode"]` next to `metadata["cloudhal.reduce"] = "1"`, so Studio can label it as a reduction in that mode ("Hidden by an agent in EDITS mode") rather than as an automatic `auto`-mode publish. `RELEASE_META.mode` names the key.
