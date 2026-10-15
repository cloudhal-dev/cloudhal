---
"@cloudhal/api": minor
"@cloudhal/cli": minor
"@cloudhal/mcp-server": patch
---

The design judge is calibrated (RFC-0021 21c).
- **Anchors and problems first.** Each criterion says what a 1, a 3 and a 5 look like, and the judge lists the problems it sees before it scores (kept with the score). On four reference pages of one brief (empty, bare, plain, strong) it went from 1 / 3 / 4.5 / 4.6 to 1 / 2.33 / 2.6 / 3.6.
- **`cloudhal ai judge-check [--remote] [--judge <model>]`** scores the reference pages and fails when the judge does not rank them in order.
- **`render_page` renders in the light color scheme** on every machine.
