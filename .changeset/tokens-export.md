---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/cli": minor
"@cloudhal/api": minor
---

Design tokens, export and eval (RFC-0023 23e).
- **Export.** `designTokensDtcg` writes a site's tokens as a W3C DTCG 2025.10 file, available as `cloudhal tokens export` and the MCP tool `get_design_tokens`.
- **`render_page`.** It renders a dark site dark, and checks a dark or automatic site's contrast in the other scheme too.
- **Judge.** The design judge's rubric gains `color`.
- **Accent.** It now sits 60° from the seed (150° when that lands on the yellows and olives), and the gradient end avoids them too.
- **Skill.** The site-design skill gains look recipes and a step that sets the look.
