---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Kinetic type, marquees, counters and loops (RFC-0024 24c).

- **Kinetic type.** `split-words`, `split-chars` and `split-lines` reveal a heading or a short text piece by piece; screen readers read the whole text once.
- **Heading effects.** `highlight`, `gradient-text` and `rotate-words`.
- **New primitives.**
  - `Marquee` scrolls a row by itself.
  - `Counter` counts up to a final number that is already in the page.
- **Loops.** `motion.loop` takes `float`, `pulse`, `gradient-shift` or `spin-slow`.
- **Pause control.** Every surface that loops gets the reader's pause control.
- **`render_page`.** It gains the `flash` check, and `motion-budget` now also counts split texts and loops.
- **Runtime.** The motion module is now `motion.3.js`.
