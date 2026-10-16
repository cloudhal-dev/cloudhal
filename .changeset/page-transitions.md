---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
"@cloudhal/api": minor
---

Page transitions, motion tooling and the motion criterion (RFC-0024 24e).

- **Page transitions.** `pageTransition` (`crossfade`, `slide`, `morph`) uses cross-document view transitions. A `motion.morph` key moves an element between two pages.
- **Token export.** The DTCG export gains motion durations, easings and distances.
- **CLI.**
  - `cloudhal render` renders a page with `render_page`'s browser and checks.
  - `cloudhal motion audit` checks each page's motion against its budgets.
- **Studio.** The surface outline shows a component's motion presets.
- **Design judge.** The rubric gains a `motion` criterion.
