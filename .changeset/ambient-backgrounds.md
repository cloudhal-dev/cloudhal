---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Ambient backgrounds (RFC-0024 24d).

- **Kinds.** Bands and cards take `ambient`: `aurora`, `gradient-shift`, `grain` or `beams` as CSS layers. Bands can also take `particles` (`dots`, `links`, `stars`, `snow`, `bubbles` or `fireflies`), painted by `/_cloudhal/ambient.1.js`.
- **Guards.** The device-pixel ratio is capped, the particle count is capped, it runs at 30 fps, and it stops off screen, in a hidden tab or when paused. It only runs where motion plays and the device can afford it; everywhere else the background is a still poster.
- **Pause control.** Only one stays visible per page, and it now pauses pseudo-element layers too.
- **Runtime.** The motion module is now `motion.4.js`.
