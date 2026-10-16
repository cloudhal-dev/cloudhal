---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Scroll effects and scroll stories (RFC-0024 24b).

- **Scroll effects.** `motion.scroll` takes `parallax`, `fade-through`, `scale-through`, `rotate-through` or `pan`, with `depth`. They use scroll-driven CSS, with a progress fallback in the motion module.
- **New primitives:**
  - `Scrolly` and `Step` tell a scroll story: the step being read is written to a data binding, so a chart, stat or image changes as the reader scrolls.
  - `ScrollProgress` shows how far the reader is through the page or a section.
- **`render_page`.** It gains `frames` (screenshots at evenly spaced scroll positions) and the `motion-budget` check.
- **Runtimes.** The interaction runtime is now `surface.9.js` and the motion module `motion.2.js`; earlier names are aliases.
