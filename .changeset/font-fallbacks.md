---
"@cloudhal/cli": patch
---

Blog starter: no more text jumping when the web fonts load. Font files move to `/fonts/v1/` and are cached for a year (`public/_headers`), so reloads draw text in its font from the first paint, and each web font gets a metric-matched fallback face (`font-fallbacks.css`), so a first visit swaps fonts without moving the text.
