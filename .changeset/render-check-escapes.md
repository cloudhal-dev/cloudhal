---
"@cloudhal/mcp-server": patch
---

render_page's long-line and input-label checks handle whitespace correctly again. A plain template literal ate the backslash, so the in-page script received `/s/` and `/s+/` instead of `/\s/` and `/\s+/`. As a result, long-line counted the letter "s" as blank and every real space and indentation run as text. input-label split `aria-labelledby` on the letter "s" and reported labelled inputs as unlabelled. The check parts are now `String.raw` templates.
