---
"@cloudhal/cli": patch
---

`render_page`'s local Chrome is force-killed when it ignores the stop signal, so it never outlives the CLI.
