---
"@cloudhal/core-ts": patch
---

`checkSurface` refuses a child link that would close a loop (`"a" already holds "b"; children cannot loop`). Before, two components holding each other in a surface that also had an overlay or a carousel made the check loop forever, so a malformed surface from an agent could hang the request.
