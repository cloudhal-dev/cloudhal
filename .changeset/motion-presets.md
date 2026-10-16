---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
"@cloudhal/cli": minor
---

Motion presets (RFC-0024 24a).

- **Contract and catalog.** Surface components take an optional `motion` object (reveal, hover, speed, delay, stagger, replay), and pages an optional `motion` level. The catalog checks the presets, repairs the names models write, and teaches them in the prompt.
- **Renderer.** It writes the presets as `data-ch-*` attributes and loads `/_cloudhal/motion.1.js` only on pages that move. Entrances on the first screen are pure CSS (`@starting-style`).
- **Tokens.** `motionCss()` writes the tokens for each level.
- **Accessibility.** Nothing moves at `none` or for readers who ask for reduced motion. `scrollTo` jumps for them too; the interaction runtime is now `surface.8.js`.
- **`render_page`.** It takes `motion: static | reduce | full` and gains the `reduced-motion` and `motion-cls` checks.
- **Blog theme and new sites.** The blog theme gains a `motion` setting, and `cloudhal init` starts new sites at `standard`.
