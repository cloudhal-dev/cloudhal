---
"@cloudhal/mcp-server": patch
"@cloudhal/cli": patch
---

`render_page` and `cloudhal render` gain a `font-fallback` check: text set in a web font with no metric-matched fallback after it in its stack, which moves when the font loads.
