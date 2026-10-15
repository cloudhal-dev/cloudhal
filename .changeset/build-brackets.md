---
"@cloudhal/api": patch
---

Build chat reads long steps more reliably: a step whose closing brackets are out of order (`}}}]]` for `}}]}`) is repaired and reported as a repair, and no longer swallows the lines after it. A step that cannot be read is refused with where it broke and a request to send smaller steps. The prompt says a whole section never goes in one line.
