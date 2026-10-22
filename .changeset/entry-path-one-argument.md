---
"@cloudhal/core-ts": patch
"@cloudhal/astro-renderer": patch
"@cloudhal/cli": patch
---

Fix: sites whose theme was copied from the starter before 0.3.11 rendered empty pages (200 with no body). Their `EntryList` calls the renderer's old one-argument `entryPath(entry)` (and `.map(entryPath)`), which became `entryPath(site, entry)` in 0.3.11. `entryPath` accepts the old call again (deprecated; it ignores collection permalinks — pass the site to get them).
