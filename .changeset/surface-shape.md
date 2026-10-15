---
"@cloudhal/core-ts": patch
"@cloudhal/api": patch
---

Surface checks found in the design eval:
- **A single child id is read as a list.** A component whose `children` is one id string is repaired to a list; any other non-list is reported instead of failing the check.
- **Missing ids are named.** Components without an id are reported as "every component needs an id".
- **Patches keep the page's shape.** `patchPage` refuses a patch that removes `/sections` or replaces the title with a non-string.
