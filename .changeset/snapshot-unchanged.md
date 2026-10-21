---
"@cloudhal/cli": patch
---

`cloudhal snapshot --publish` makes no new snapshot when nothing changed since the live one; it says "nothing changed since <snapshot>" instead (#51).
