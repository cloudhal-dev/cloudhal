---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Surfaces draw charts (RFC-0022 22c).
- **`Chart`:** bar (grouped or stacked), line, area and donut, bound to rows in the surface's data. It is drawn on the server as SVG in theme colors, with a legend and the numbers as a table.
- **Live charts:** they redraw from inputs through a lazily loaded `/_cloudhal/chart.1.js`. The runtime is now `surface.4.js`; the earlier names keep working.
- **`render_page`** checks for empty charts.
