---
"@cloudhal/cli": patch
---

Blog starter: pages send their type pairing's font preloads as a `Link` header too, so a Cloudflare zone with Early Hints on starts loading the fonts with a 103 before the page arrives.
